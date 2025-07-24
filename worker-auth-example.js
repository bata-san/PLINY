// ===============================================
// Cloudflare Worker - アカウント制度付きAPI
// ===============================================

// JWT署名用の秘密キー（環境変数で設定）
const JWT_SECRET = 'your-jwt-secret-key-here'; // 実際の運用では環境変数で設定

// パスワードハッシュ化用のライブラリ
// Cloudflare Workersでは Web Crypto API を使用
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

async function verifyPassword(password, hash) {
    const hashedInput = await hashPassword(password);
    return hashedInput === hash;
}

// JWT作成と検証
async function createJWT(payload) {
    const header = {
        alg: 'HS256',
        typ: 'JWT'
    };
    
    const encodedHeader = btoa(JSON.stringify(header));
    const encodedPayload = btoa(JSON.stringify(payload));
    
    const signature = await signData(`${encodedHeader}.${encodedPayload}`, JWT_SECRET);
    
    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

async function verifyJWT(token) {
    try {
        const [header, payload, signature] = token.split('.');
        
        const expectedSignature = await signData(`${header}.${payload}`, JWT_SECRET);
        
        if (signature !== expectedSignature) {
            return null;
        }
        
        const decodedPayload = JSON.parse(atob(payload));
        
        // トークンの有効期限チェック
        if (decodedPayload.exp && Date.now() / 1000 > decodedPayload.exp) {
            return null;
        }
        
        return decodedPayload;
    } catch (error) {
        return null;
    }
}

async function signData(data, secret) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// メイン処理
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        
        // CORS設定
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
        };
        
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }
        
        try {
            // 認証エンドポイント
            if (path === '/api/auth/register') {
                return await handleRegister(request, env, corsHeaders);
            }
            
            if (path === '/api/auth/login') {
                return await handleLogin(request, env, corsHeaders);
            }
            
            if (path === '/api/auth/logout') {
                return await handleLogout(request, env, corsHeaders);
            }
            
            // 認証が必要なエンドポイント
            const authResult = await authenticateRequest(request);
            if (!authResult.success) {
                return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                    status: 401,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            
            const userEmail = authResult.user.email;
            
            // データエンドポイント（ユーザー固有）
            if (path === '/api/data') {
                if (request.method === 'GET') {
                    return await getUserData(userEmail, env, corsHeaders);
                } else if (request.method === 'PUT') {
                    return await saveUserData(request, userEmail, env, corsHeaders);
                }
            }
            
            // その他のエンドポイント...
            
            return new Response('Not found', { status: 404, headers: corsHeaders });
            
        } catch (error) {
            console.error('Error:', error);
            return new Response(JSON.stringify({ error: 'Internal server error' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
};

// 認証関連の処理
async function handleRegister(request, env, corsHeaders) {
    const { name, email, password } = await request.json();
    
    if (!name || !email || !password) {
        return new Response(JSON.stringify({ error: 'すべての項目を入力してください' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
    
    if (password.length < 6) {
        return new Response(JSON.stringify({ error: 'パスワードは6文字以上で入力してください' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
    
    // メールアドレスの重複チェック
    const existingUser = await env.PLINY_KV.get(`user:${email}`, 'json');
    if (existingUser) {
        return new Response(JSON.stringify({ error: 'このメールアドレスは既に登録されています' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
    
    // パスワードをハッシュ化
    const hashedPassword = await hashPassword(password);
    
    // ユーザー情報を保存
    const user = {
        id: crypto.randomUUID(),
        name,
        email,
        password: hashedPassword,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    await env.PLINY_KV.put(`user:${email}`, JSON.stringify(user));
    
    // 初期データを作成
    const initialData = {
        tasks: [],
        labels: [],
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    await env.PLINY_KV.put(`data:${email}`, JSON.stringify(initialData));
    
    // JWTトークンを生成
    const token = await createJWT({
        userId: user.id,
        email: user.email,
        name: user.name,
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7日間有効
    });
    
    return new Response(JSON.stringify({
        token,
        email: user.email,
        name: user.name
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

async function handleLogin(request, env, corsHeaders) {
    const { email, password } = await request.json();
    
    if (!email || !password) {
        return new Response(JSON.stringify({ error: 'メールアドレスとパスワードを入力してください' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
    
    // ユーザー情報を取得
    const user = await env.PLINY_KV.get(`user:${email}`, 'json');
    if (!user) {
        return new Response(JSON.stringify({ error: 'メールアドレスまたはパスワードが正しくありません' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
    
    // パスワードを検証
    const isPasswordValid = await verifyPassword(password, user.password);
    if (!isPasswordValid) {
        return new Response(JSON.stringify({ error: 'メールアドレスまたはパスワードが正しくありません' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
    
    // JWTトークンを生成
    const token = await createJWT({
        userId: user.id,
        email: user.email,
        name: user.name,
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7日間有効
    });
    
    return new Response(JSON.stringify({
        token,
        email: user.email,
        name: user.name
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

async function handleLogout(request, env, corsHeaders) {
    // JWTはステートレスなので、クライアント側でトークンを削除するだけで十分
    // 必要に応じてトークンのブラックリスト機能を実装
    return new Response(JSON.stringify({ message: 'ログアウトしました' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

async function authenticateRequest(request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { success: false };
    }
    
    const token = authHeader.substring(7);
    const payload = await verifyJWT(token);
    
    if (!payload) {
        return { success: false };
    }
    
    return {
        success: true,
        user: {
            id: payload.userId,
            email: payload.email,
            name: payload.name
        }
    };
}

// データ操作（ユーザー固有）
async function getUserData(userEmail, env, corsHeaders) {
    const data = await env.PLINY_KV.get(`data:${userEmail}`, 'json');
    
    if (!data) {
        // 初期データを作成
        const initialData = {
            tasks: [],
            labels: [],
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        await env.PLINY_KV.put(`data:${userEmail}`, JSON.stringify(initialData));
        
        return new Response(JSON.stringify(initialData), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
    
    return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

async function saveUserData(request, userEmail, env, corsHeaders) {
    const { tasks, labels, expectedVersion } = await request.json();
    
    // 現在のデータを取得してバージョンチェック
    const currentData = await env.PLINY_KV.get(`data:${userEmail}`, 'json');
    
    if (currentData && expectedVersion && currentData.version !== expectedVersion) {
        return new Response(JSON.stringify({ error: 'Data version conflict' }), {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
    
    const newVersion = (currentData?.version || 0) + 1;
    const updatedData = {
        tasks: tasks || [],
        labels: labels || [],
        version: newVersion,
        createdAt: currentData?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    await env.PLINY_KV.put(`data:${userEmail}`, JSON.stringify(updatedData));
    
    return new Response(JSON.stringify({ 
        message: 'Data saved successfully',
        version: newVersion
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
