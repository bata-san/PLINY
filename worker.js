// ===============================================
// Cloudflare Worker用 PLINY バックエンド (マルチユーザー版)
// ===============================================

// JWTライブラリの代わりのシンプルなヘルパー関数
const jwt = {
  sign: async (payload, secret) => {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const signature = await crypto.subtle.sign(
      { name: 'HMAC', hash: 'SHA-256' },
      await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    );
    const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
  },
  verify: async (token, secret) => {
    try {
      const [header, payload, signature] = token.split('.');
      const isValid = await crypto.subtle.verify(
        { name: 'HMAC', hash: 'SHA-256' },
        await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']),
        Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
        new TextEncoder().encode(`${header}.${payload}`)
      );
      if (!isValid) throw new Error('Invalid signature');
      return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    } catch (e) {
      throw new Error('Invalid token');
    }
  }
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// パスワードハッシュ化・検証関数
async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const encodedPassword = new TextEncoder().encode(password);
    const key = await crypto.subtle.importKey('raw', encodedPassword, { name: 'PBKDF2' }, false, ['deriveBits']);
    const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
    return `${btoa(String.fromCharCode(...salt))}:${btoa(String.fromCharCode(...new Uint8Array(hash)))}`;
}

async function verifyPassword(password, storedHash) {
    try {
        const [saltB64, hashB64] = storedHash.split(':');
        if (!saltB64 || !hashB64) return false;
        const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
        const encodedPassword = new TextEncoder().encode(password);
        const key = await crypto.subtle.importKey('raw', encodedPassword, { name: 'PBKDF2' }, false, ['deriveBits']);
        const derivedHash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
        return await crypto.subtle.timingSafeEqual(new Uint8Array(derivedHash), Uint8Array.from(atob(hashB64), c => c.charCodeAt(0)));
    } catch (e) {
        return false;
    }
}

// 認証ミドルウェア
async function authMiddleware(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { error: 'Authorization header is missing or invalid', status: 401 };
    }
    const token = authHeader.split(' ')[1];
    try {
        const payload = await jwt.verify(token, env.JWT_SECRET);
        return { userId: payload.sub };
    } catch (e) {
        return { error: 'Invalid or expired token', status: 401 };
    }
}

// データ操作（ユーザーIDに紐づく）
async function getUserData(env, userId) {
    const dataKey = `data:${userId}`;
    const data = await env.PLINY_KV.get(dataKey, 'json');
    return data || { tasks: [], labels: [], version: 1 };
}

async function saveUserData(env, userId, tasks, labels, expectedVersion) {
    const dataKey = `data:${userId}`;
    const currentData = await getUserData(env, userId);
    
    if (expectedVersion && currentData.version !== expectedVersion) {
        throw new Error('CONFLICT');
    }

    const newVersion = (currentData.version || 0) + 1;
    await env.PLINY_KV.put(dataKey, JSON.stringify({
        tasks, labels, version: newVersion, timestamp: new Date().toISOString()
    }));
    return { success: true, version: newVersion };
}

// レスポンス生成ヘルパー
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

// --- AI関連のロジック ---
// Levenshtein距離計算（曖昧検索用）
function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(null));
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
        }
    }
    return matrix[a.length][b.length];
}

function findClosestMatch(query, items, key = 'text') {
    if (!query || !items || items.length === 0) return null;
    let bestMatch = null, minDistance = Infinity;
    items.forEach(item => {
        const distance = levenshteinDistance(query.toLowerCase(), item[key].toLowerCase());
        if (distance < minDistance) {
            minDistance = distance;
            bestMatch = item;
        }
    });
    // 一致度の閾値を設定（あまりにも違うものはヒットさせない）
    const threshold = Math.max(5, query.length / 2);
    return minDistance <= threshold ? bestMatch : null;
}

// AIの応答（アクション）を処理してデータを更新
function processAiActions(actions, currentTasks, currentLabels) {
    let tasks = JSON.parse(JSON.stringify(currentTasks));
    let labels = JSON.parse(JSON.stringify(currentLabels));
    const normalizeTask = (task) => { // 簡易正規化
      const today = new Date().toISOString().split('T')[0];
      return { id: `task-${Date.now()}-${Math.random()}`, text: task.text || "無題", startDate: task.startDate || today, endDate: task.endDate || task.startDate || today, completed: false, labelIds: task.labelIds || [], parentId: task.parentId || null, isCollapsed: true };
    };

    actions.forEach(action => {
        try {
            switch (action.action) {
                case 'addTask':
                    const parentTask = action.parentTaskText ? findClosestMatch(action.parentTaskText, tasks, 'text') : null;
                    const label = action.labelName ? findClosestMatch(action.labelName, labels, 'name') : null;
                    const newTask = normalizeTask({ text: action.text, startDate: action.startDate, endDate: action.endDate, parentId: parentTask ? parentTask.id : null, labelIds: label ? [label.id] : [] });
                    tasks.push(newTask);
                    if (parentTask) parentTask.isCollapsed = false;
                    break;
                case 'updateTask':
                    const taskToUpdate = findClosestMatch(action.taskText, tasks, 'text');
                    if (taskToUpdate) {
                        if (action.newText) taskToUpdate.text = action.newText;
                        if (action.completed !== undefined) taskToUpdate.completed = action.completed;
                    }
                    break;
                case 'deleteTask':
                    const taskToDelete = findClosestMatch(action.taskText, tasks, 'text');
                    if (taskToDelete) tasks = tasks.filter(t => t.id !== taskToDelete.id);
                    break;
                case 'addLabel':
                    labels.push({ id: `label-${Date.now()}`, name: action.name, color: action.color || 'transparent', priority: (labels.length > 0 ? Math.max(...labels.map(l => l.priority || 0)) : 0) + 1 });
                    break;
            }
        } catch(e) { console.error("AI action processing error:", e); }
    });
    return { tasks, labels };
}

// AIプロンプトを生成
function buildAiPrompt(userInput, tasks, labels) {
    const today = new Date().toISOString().split('T')[0];
    const tasksContext = JSON.stringify(tasks.slice(0, 20).map(t => ({ id: t.id, text: t.text, completed: t.completed })), null, 2); // 簡略化
    const labelsContext = JSON.stringify(labels.map(l => ({ id: l.id, name: l.name })), null, 2);

    return `あなたはタスク管理アシスタントです。ユーザーの指示を解釈し、操作コマンドのJSON配列を出力します。

# 現在の状態
- 今日: ${today}
- タスク: ${tasksContext}
- ラベル: ${labelsContext}

# 操作コマンド
- addTask: { text, startDate?, endDate?, labelName?, parentTaskText? }
- updateTask: { taskText, newText?, completed? }
- deleteTask: { taskText }
- addLabel: { name, color? }

# 指示
以下の指示を解釈し、JSON配列を出力してください。日付はYYYY-MM-DD形式で。
ユーザー指示: "${userInput}"`;
}


export default {
    async fetch(request, env, ctx) {
        if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
        const url = new URL(request.url);

        try {
            // --- 認証エンドポイント ---
            if (url.pathname.startsWith('/api/auth')) {
                if (url.pathname === '/api/auth/register' && request.method === 'POST') {
                    const { email, password } = await request.json();
                    if (!email || !password || password.length < 8) return jsonResponse({ error: 'メールアドレス、または8文字以上のパスワードが必要です。' }, 400);
                    if (await env.PLINY_KV.get(`auth:${email}`)) return jsonResponse({ error: 'このメールアドレスは既に使用されています。' }, 409);
                    
                    const userId = `user-${crypto.randomUUID()}`;
                    await env.PLINY_KV.put(`auth:${email}`, JSON.stringify({ id: userId, password: await hashPassword(password) }));
                    return jsonResponse({ success: true, message: 'ユーザー登録が完了しました。' }, 201);
                }
                if (url.pathname === '/api/auth/login' && request.method === 'POST') {
                    const { email, password } = await request.json();
                    const userData = await env.PLINY_KV.get(`auth:${email}`, 'json');
                    if (!userData || !(await verifyPassword(password, userData.password))) return jsonResponse({ error: 'メールアドレスまたはパスワードが正しくありません。' }, 401);
                    
                    const token = await jwt.sign({ sub: userData.id, email }, env.JWT_SECRET);
                    return jsonResponse({ token, email });
                }
            }

            // --- 以下、認証必須 ---
            const authResult = await authMiddleware(request, env);
            if (authResult.error) return jsonResponse({ error: authResult.error }, authResult.status);
            const { userId } = authResult;

            // データ取得
            if (url.pathname === '/api/data' && request.method === 'GET') {
                return jsonResponse(await getUserData(env, userId));
            }

            // データ保存
            if (url.pathname === '/api/data' && request.method === 'PUT') {
                const { tasks, labels, expectedVersion } = await request.json();
                try {
                    return jsonResponse(await saveUserData(env, userId, tasks, labels, expectedVersion));
                } catch (error) {
                    if (error.message === 'CONFLICT') return jsonResponse({ error: 'データの競合が検出されました。' }, 409);
                    throw error;
                }
            }
            
            // AIアシスタント
            if (url.pathname === '/api/ai' && request.method === 'POST') {
                const { prompt, context } = await request.json();
                if (!prompt || !context) return jsonResponse({ error: 'Invalid AI prompt' }, 400);

                // ここで実際のLLM API (e.g., Gemini) を呼び出す
                // ダミー実装: 指示からアクションを簡易的にパース
                let actions = [];
                if (prompt.includes("追加して")) {
                    actions.push({ action: 'addTask', text: prompt.replace('追加して','').trim() });
                } else if (prompt.includes("完了して")) {
                    actions.push({ action: 'updateTask', taskText: prompt.replace('完了して','').trim(), completed: true });
                } else {
                     return jsonResponse({ error: "AIが指示を理解できませんでした。" }, 400);
                }
                
                // AIの応答を処理し、更新されたデータを返す
                const { tasks, labels } = processAiActions(actions, context.tasks, context.labels);
                return jsonResponse({ tasks, labels });
            }

            return jsonResponse({ error: 'Not Found' }, 404);
        } catch (error) {
            console.error('Worker error:', error);
            return jsonResponse({ error: 'Internal Server Error', details: error.message }, 500);
        }
    }
};