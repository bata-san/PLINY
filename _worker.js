// ===============================================
// Cloudflare Worker (Pages連携 最終完成版)
// バグ修正 ＆ 自己診断機能付き
// ===============================================

// --- ヘルパー関数群 (変更なし) ---
const jwt = {
  sign: async (payload, secret) => {
    const header = { alg: "HS256", typ: "JWT" };
    const encodedHeader = btoa(JSON.stringify(header))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const encodedPayload = btoa(JSON.stringify(payload))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const signature = await crypto.subtle.sign(
      { name: "HMAC", hash: "SHA-256" },
      await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      ),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    );
    const encodedSignature = btoa(
      String.fromCharCode(...new Uint8Array(signature))
    )
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
  },
  verify: async (token, secret) => {
    try {
      const [header, payload, signature] = token.split(".");
      const isValid = await crypto.subtle.verify(
        { name: "HMAC", hash: "SHA-256" },
        await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(secret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["verify"]
        ),
        Uint8Array.from(
          atob(signature.replace(/-/g, "+").replace(/_/g, "/")),
          (c) => c.charCodeAt(0)
        ),
        new TextEncoder().encode(`${header}.${payload}`)
      );
      if (!isValid) throw new Error("Invalid signature");
      return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    } catch (e) {
      throw new Error("Invalid token");
    }
  },
};
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encodedPassword = new TextEncoder().encode(password);
  const key = await crypto.subtle.importKey(
    "raw",
    encodedPassword,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  return `${btoa(String.fromCharCode(...salt))}:${btoa(
    String.fromCharCode(...new Uint8Array(hash))
  )}`;
}
async function verifyPassword(password, storedHash) {
  try {
    const [saltB64, hashB64] = storedHash.split(":");
    if (!saltB64 || !hashB64) return false;
    const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
    const encodedPassword = new TextEncoder().encode(password);
    const key = await crypto.subtle.importKey(
      "raw",
      encodedPassword,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const derivedHash = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      key,
      256
    );
    return await crypto.subtle.timingSafeEqual(
      new Uint8Array(derivedHash),
      Uint8Array.from(atob(hashB64), (c) => c.charCodeAt(0))
    );
  } catch (e) {
    return false;
  }
}
async function authMiddleware(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { error: "Authorization header is missing or invalid", status: 401 };
  }
  const token = authHeader.split(" ")[1];
  try {
    const payload = await jwt.verify(token, env.JWT_SECRET);
    return { userId: payload.sub, token };
  } catch (e) {
    return { error: "Invalid or expired token", status: 401 };
  }
}
async function getUserData(env, userId) {
  const dataKey = `data:${userId}`;
  const data = await env.PLINY_KV.get(dataKey, "json");
  return data || { tasks: [], labels: [], version: 0 };
}
async function getGoogleTokens(env, userId) {
  const tokenKey = `google_token:${userId}`;
  return await env.PLINY_KV.get(tokenKey, "json");
}
async function saveGoogleTokens(env, userId, tokens) {
  const tokenKey = `google_token:${userId}`;
  await env.PLINY_KV.put(tokenKey, JSON.stringify(tokens));
}
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
async function getValidAccessToken(env, userId) {
  let tokens = await getGoogleTokens(env, userId);
  if (!tokens || !tokens.refresh_token)
    throw new Error(
      "Googleアカウントと連携されていません。再度連携してください。"
    );
  if (!tokens.expires_at || tokens.expires_at < Date.now() + 300000) {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: tokens.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    if (!tokenResponse.ok) {
      console.error(
        "Failed to refresh access token",
        await tokenResponse.text()
      );
      await env.PLINY_KV.delete(`google_token:${userId}`);
      throw new Error(
        "Google認証トークンのリフレッシュに失敗しました。連携が解除された可能性があります。再度連携してください。"
      );
    }
    const newTokens = await tokenResponse.json();
    tokens.access_token = newTokens.access_token;
    tokens.expires_at = Date.now() + newTokens.expires_in * 1000;
    await saveGoogleTokens(env, userId, tokens);
  }
  return tokens.access_token;
}
async function googleApiRequest(accessToken, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const error = await response.json();
    console.error("Google API Error:", error.error);
    throw new Error(
      error.error.message || "Google APIリクエストに失敗しました。"
    );
  }
  return response.status === 204 ? null : response.json();
}
function plinyTaskToGoogleEvent(task) {
  const endDate = new Date(task.endDate);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  return {
    summary: task.text,
    start: { date: task.startDate },
    end: { date: endDate.toISOString().split("T")[0] },
    extendedProperties: { private: { plinyTaskId: task.id } },
    transparency: task.completed ? "transparent" : "opaque",
    description: `PLINYから同期されたタスクです。\nタスクID: ${task.id}`,
  };
}
function googleEventToPlinyTask(event, existingTask = {}) {
  const endDate = new Date(event.end.date);
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  return {
    id: event.extendedProperties.private.plinyTaskId,
    text: event.summary || "(無題)",
    startDate: event.start.date,
    endDate: endDate.toISOString().split("T")[0],
    completed: event.transparency === "transparent",
    labelIds: existingTask.labelIds || [],
    parentId: existingTask.parentId || null,
    isCollapsed: existingTask.isCollapsed ?? true,
    googleEventId: event.id,
    googleSyncTimestamp: new Date().toISOString(),
  };
}

// ===============================================
// APIリクエストを処理するコアロジック
// ===============================================
async function handleApiRequest(request, env) {
  const url = new URL(request.url);

  // --- 自己診断エンドポイント ---
  if (url.pathname === "/api/debug") {
    const diagnostics = {
      kvBinding: typeof env.PLINY_KV !== "undefined",
      jwtSecret: typeof env.JWT_SECRET !== "undefined",
      googleClientId: typeof env.GOOGLE_CLIENT_ID !== "undefined",
      googleClientSecret: typeof env.GOOGLE_CLIENT_SECRET !== "undefined",
    };
    return jsonResponse({ diagnostics });
  }

  if (url.pathname.startsWith("/api/auth")) {
    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      const { email, password } = await request.json();
      if (!email || !password || password.length < 8)
        return jsonResponse(
          { error: "メールアドレス、または8文字以上のパスワードが必要です。" },
          400
        );
      if (await env.PLINY_KV.get(`auth:${email}`))
        return jsonResponse(
          { error: "このメールアドレスは既に使用されています。" },
          409
        );
      const userId = `user-${crypto.randomUUID()}`;
      await env.PLINY_KV.put(
        `auth:${email}`,
        JSON.stringify({ id: userId, password: await hashPassword(password) })
      );
      return jsonResponse(
        { success: true, message: "ユーザー登録が完了しました。" },
        201
      );
    }
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const { email, password } = await request.json();
      const userData = await env.PLINY_KV.get(`auth:${email}`, "json");
      if (!userData || !(await verifyPassword(password, userData.password)))
        return jsonResponse(
          { error: "メールアドレスまたはパスワードが正しくありません。" },
          401
        );
      const token = await jwt.sign({ sub: userData.id, email }, env.JWT_SECRET);
      return jsonResponse({ token, email });
    }
    if (
      url.pathname === "/api/auth/google/redirect-url" &&
      request.method === "GET"
    ) {
      const authResult = await authMiddleware(request, env);
      if (authResult.error) return jsonResponse(authResult, authResult.status);
      const googleUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      googleUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
      googleUrl.searchParams.set(
        "redirect_uri",
        `${env.ROOT_URL}/api/auth/google/callback`
      );
      googleUrl.searchParams.set("response_type", "code");
      googleUrl.searchParams.set(
        "scope",
        "https://www.googleapis.com/auth/calendar"
      );
      googleUrl.searchParams.set("access_type", "offline");
      googleUrl.searchParams.set("prompt", "consent");
      googleUrl.searchParams.set("state", authResult.token);
      return jsonResponse({ url: googleUrl.toString() });
    }
    if (
      url.pathname === "/api/auth/google/callback" &&
      request.method === "GET"
    ) {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !state)
        return jsonResponse(
          { error: "Authorization code or state is missing." },
          400
        );
      try {
        const payload = await jwt.verify(state, env.JWT_SECRET);
        const userId = payload.sub;
        const tokenResponse = await fetch(
          "https://oauth2.googleapis.com/token",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code,
              client_id: env.GOOGLE_CLIENT_ID,
              client_secret: env.GOOGLE_CLIENT_SECRET,
              redirect_uri: `${env.ROOT_URL}/api/auth/google/callback`,
              grant_type: "authorization_code",
            }),
          }
        );
        if (!tokenResponse.ok)
          throw new Error("Failed to exchange code for token.");
        const tokens = await tokenResponse.json();
        tokens.expires_at = Date.now() + tokens.expires_in * 1000;
        await saveGoogleTokens(env, userId, tokens);
        return Response.redirect(
          `${env.ROOT_URL}?google_auth_success=true`,
          302
        );
      } catch (e) {
        console.error("Google auth callback error:", e);
        return jsonResponse(
          { error: "Invalid state or token exchange failed." },
          400
        );
      }
    }
  }
  const authResult = await authMiddleware(request, env);
  if (authResult.error) return jsonResponse(authResult, authResult.status);
  const { userId } = authResult;
  if (
    url.pathname === "/api/auth/google/disconnect" &&
    request.method === "POST"
  ) {
    await env.PLINY_KV.delete(`google_token:${userId}`);
    return jsonResponse({
      success: true,
      message: "Google Calendar integration disconnected.",
    });
  }
  if (url.pathname === "/api/data" && request.method === "GET") {
    const data = await getUserData(env, userId);
    const tokens = await getGoogleTokens(env, userId);
    data.isGoogleConnected = !!(tokens && tokens.refresh_token);
    return jsonResponse(data);
  }
  if (
    url.pathname === "/api/data" &&
    (request.method === "PUT" || request.method === "PATCH")
  ) {
    const body = await request.json();
    const { expectedVersion } = body;
    const data = await getUserData(env, userId);
    const {
      tasks: currentTasks,
      labels: currentLabels,
      version: currentVersion,
    } = data;
    if (expectedVersion != null && currentVersion !== expectedVersion) {
      return jsonResponse({ error: "データの競合が検出されました。" }, 409);
    }
    let newTasks, newLabels;
    if (request.method === "PATCH") {
      const patch = body;
      const taskMap = new Map(currentTasks.map((t) => [t.id, t]));
      const labelMap = new Map(currentLabels.map((l) => [l.id, l]));
      patch.tasks?.deleted?.forEach((id) => taskMap.delete(id));
      patch.labels?.deleted?.forEach((id) => labelMap.delete(id));
      patch.tasks?.updated?.forEach((task) => taskMap.set(task.id, task));
      patch.labels?.updated?.forEach((label) => labelMap.set(label.id, label));
      patch.tasks?.created?.forEach((task) => taskMap.set(task.id, task));
      patch.labels?.created?.forEach((label) => labelMap.set(label.id, label));
      newTasks = Array.from(taskMap.values());
      newLabels = Array.from(labelMap.values());
    } else {
      newTasks = body.tasks;
      newLabels = body.labels;
    }
    const newVersion = (currentVersion || 0) + 1;
    await env.PLINY_KV.put(
      `data:${userId}`,
      JSON.stringify({
        tasks: newTasks,
        labels: newLabels,
        version: newVersion,
      })
    );
    return jsonResponse({ success: true, version: newVersion });
  }
  if (url.pathname === "/api/sync/google" && request.method === "POST") {
    const accessToken = await getValidAccessToken(env, userId);
    const data = await getUserData(env, userId);
    let { tasks, labels, version } = data;
    const calendarId = "primary";
    const eventListResponse = await googleApiRequest(
      accessToken,
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?privateExtendedProperty=plinyTaskId`
    );
    const googleEvents = eventListResponse.items || [];
    const googleEventMap = new Map(
      googleEvents.map((e) => [e.extendedProperties.private.plinyTaskId, e])
    );
    const plinyTaskMap = new Map(tasks.map((t) => [t.id, t]));
    let hasChanges = false;
    for (const event of googleEvents) {
      const plinyTaskId = event.extendedProperties.private.plinyTaskId;
      const plinyTask = plinyTaskMap.get(plinyTaskId);
      if (event.status === "cancelled") {
        if (plinyTask) {
          plinyTaskMap.delete(plinyTaskId);
          hasChanges = true;
        }
        continue;
      }
      const eventUpdated = new Date(event.updated);
      if (!plinyTask) {
        plinyTaskMap.set(plinyTaskId, googleEventToPlinyTask(event));
        hasChanges = true;
      } else {
        const plinyUpdated = plinyTask.googleSyncTimestamp
          ? new Date(plinyTask.googleSyncTimestamp)
          : new Date(0);
        if (eventUpdated > plinyUpdated) {
          plinyTaskMap.set(
            plinyTaskId,
            googleEventToPlinyTask(event, plinyTask)
          );
          hasChanges = true;
        }
      }
    }
    for (const task of plinyTaskMap.values()) {
      const googleEvent = googleEventMap.get(task.id);
      if (!googleEvent) {
        const newEvent = await googleApiRequest(
          accessToken,
          `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
          { method: "POST", body: JSON.stringify(plinyTaskToGoogleEvent(task)) }
        );
        task.googleEventId = newEvent.id;
        hasChanges = true;
      } else {
        const plinyUpdated = task.googleSyncTimestamp
          ? new Date(task.googleSyncTimestamp)
          : new Date(0);
        const eventUpdated = new Date(googleEvent.updated);
        if (plinyUpdated > eventUpdated) {
          await googleApiRequest(
            accessToken,
            `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${googleEvent.id}`,
            {
              method: "PUT",
              body: JSON.stringify(plinyTaskToGoogleEvent(task)),
            }
          );
        }
      }
      task.googleSyncTimestamp = new Date().toISOString();
    }
    for (const task of tasks) {
      if (!plinyTaskMap.has(task.id) && task.googleEventId) {
        await googleApiRequest(
          accessToken,
          `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${task.googleEventId}`,
          { method: "DELETE" }
        ).catch((e) => console.warn(e));
        hasChanges = true;
      }
    }
    const finalTasks = Array.from(plinyTaskMap.values());
    const newVersion = version + (hasChanges ? 1 : 0);
    await env.PLINY_KV.put(
      `data:${userId}`,
      JSON.stringify({ tasks: finalTasks, labels, version: newVersion })
    );
    return jsonResponse({
      tasks: finalTasks,
      labels,
      version: newVersion,
      isGoogleConnected: true,
      message: "Sync completed successfully",
    });
  }

  return jsonResponse({ error: "API endpoint not found" }, 404);
}

// ===============================================
// メインのエントリーポイント
// ===============================================
export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // APIリクエスト（/api/で始まる）の場合、APIハンドラに処理を渡します
  if (url.pathname.startsWith("/api/")) {
    // ★★★ バグ修正点2: APIロジック全体をtry...catchで囲む ★★★
    try {
      return await handleApiRequest(request, env);
    } catch (error) {
      console.error("Unhandled API error:", error);
      return jsonResponse(
        { error: "An internal server error occurred.", details: error.message },
        500
      );
    }
  }

  // APIリクエストでなければ、Pagesの静的ファイル配信に処理を渡します
  // ★★★ バグ修正点1: `next()` の呼び出しに `await` を追加 ★★★
  return await next();
}
