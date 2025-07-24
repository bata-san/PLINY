// ===============================================
// Cloudflare Worker用 PLINY バックエンド (KV版) - マルチユーザー対応
// ===============================================

const DATA_KEY_PREFIX = 'pliny_user_';
const USERS_KEY = 'pliny_users';
const SECRET_KEY = 'pliny-auth-secret-2024'; // 本番環境では環境変数を使用

// ===============================================
// CORS ヘッダー設定
// ===============================================
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Email',
};

// ===============================================
// ユーティリティ関数
// ===============================================
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + SECRET_KEY);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function generateToken(userId, email) {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({
        userId: userId,
        email: email,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24時間
    }));
    
    const encoder = new TextEncoder();
    const data = encoder.encode(`${header}.${payload}`);
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(SECRET_KEY),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, data);
    const signatureArray = Array.from(new Uint8Array(signature));
    const signatureBase64 = btoa(String.fromCharCode(...signatureArray));
    
    return `${header}.${payload}.${signatureBase64}`;
}

async function verifyToken(token) {
    try {
        const [header, payload, signature] = token.split('.');
        if (!header || !payload || !signature) return null;
        
        const encoder = new TextEncoder();
        const data = encoder.encode(`${header}.${payload}`);
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(SECRET_KEY),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );
        
        const signatureBuffer = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
        const isValid = await crypto.subtle.verify('HMAC', key, signatureBuffer, data);
        
        if (!isValid) return null;
        
        const decodedPayload = JSON.parse(atob(payload));
        if (decodedPayload.exp < Math.floor(Date.now() / 1000)) return null;
        
        return decodedPayload;
    } catch (error) {
        return null;
    }
}

// ===============================================
// ユーザー管理関数
// ===============================================
async function getUsers(env) {
    try {
        const usersData = await env.PLINY_KV.get(USERS_KEY);
        return usersData ? JSON.parse(usersData) : {};
    } catch (error) {
        console.error('ユーザーデータ取得エラー:', error);
        return {};
    }
}

async function registerUser(env, { name, email, password }) {
    if (!name || !email || !password) {
        throw new Error('名前、メールアドレス、パスワードをすべて入力してください');
    }

    if (!isValidEmail(email)) {
        throw new Error('有効なメールアドレスを入力してください');
    }

    if (password.length < 6) {
        throw new Error('パスワードは6文字以上で入力してください');
    }

    const users = await getUsers(env);
    
    if (users[email]) {
        throw new Error('このメールアドレスは既に登録されています');
    }

    const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const hashedPassword = await hashPassword(password);
    
    users[email] = {
        id: userId,
        name: name,
        email: email,
        password: hashedPassword,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
    };

    await env.PLINY_KV.put(USERS_KEY, JSON.stringify(users));
    
    // 初期データを作成
    const initialData = {
        tasks: [],
        labels: [
            { id: 'default-1', name: '優先度: 高', color: '#ff3b30', priority: 1 },
            { id: 'default-2', name: '優先度: 中', color: '#ff9500', priority: 2 },
            { id: 'default-3', name: '優先度: 低', color: '#34c759', priority: 3 }
        ],
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    await env.PLINY_KV.put(getUserDataKey(email), JSON.stringify(initialData));

    // トークンを生成
    const token = await generateToken(userId, email);
    
    return {
        id: userId,
        name: name,
        email: email,
        token: token
    };
}

async function loginUser(env, { email, password }) {
    if (!email || !password) {
        throw new Error('メールアドレスとパスワードを入力してください');
    }

    const users = await getUsers(env);
    const user = users[email];
    
    if (!user) {
        throw new Error('メールアドレスまたはパスワードが正しくありません');
    }

    const hashedPassword = await hashPassword(password);
    if (user.password !== hashedPassword) {
        throw new Error('メールアドレスまたはパスワードが正しくありません');
    }

    // 最終ログイン時刻を更新
    user.lastLoginAt = new Date().toISOString();
    users[email] = user;
    await env.PLINY_KV.put(USERS_KEY, JSON.stringify(users));

    // トークンを生成
    const token = await generateToken(user.id, email);
    
    return {
        id: user.id,
        name: user.name,
        email: email,
        token: token
    };
}

function getUserDataKey(email) {
    return `${DATA_KEY_PREFIX}${email}`;
}

async function authenticateRequest(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('認証が必要です');
    }
    
    const token = authHeader.substring(7);
    const payload = await verifyToken(token);
    if (!payload) {
        throw new Error('無効なトークンです');
    }
    
    return payload;
}

// ===============================================
// データ管理関数
// ===============================================
async function loadUserDataFromKV(env, userEmail) {
    if (!userEmail) {
        throw new Error('ユーザーメールアドレスが必要です');
    }

    try {
        const data = await env.PLINY_KV.get(getUserDataKey(userEmail), 'json');
        
        if (!data) {
            return {
                tasks: [],
                labels: [
                    { id: 'default-1', name: '優先度: 高', color: '#ff3b30', priority: 1 },
                    { id: 'default-2', name: '優先度: 中', color: '#ff9500', priority: 2 },
                    { id: 'default-3', name: '優先度: 低', color: '#34c759', priority: 3 }
                ],
                version: 1
            };
        }
        
        return {
            tasks: Array.isArray(data.tasks) ? data.tasks : [],
            labels: Array.isArray(data.labels) ? data.labels : [],
            version: data.version || 1
        };
    } catch (error) {
        console.error('ユーザーデータ読み込みエラー:', error);
        throw new Error('データの読み込みに失敗しました');
    }
}

async function saveUserDataToKV(env, userEmail, { tasks, labels, expectedVersion }) {
    if (!userEmail) {
        throw new Error('ユーザーメールアドレスが必要です');
    }

    if (!Array.isArray(tasks) || !Array.isArray(labels)) {
        throw new Error('タスクとラベルは配列である必要があります');
    }

    try {
        // 現在のデータを取得してバージョンチェック
        const currentData = await loadUserDataFromKV(env, userEmail);
        
        if (expectedVersion && currentData.version !== expectedVersion) {
            throw new Error('データの競合が検出されました');
        }

        const newVersion = (currentData.version || 1) + 1;
        const dataToSave = {
            tasks: tasks,
            labels: labels,
            version: newVersion,
            updatedAt: new Date().toISOString(),
            createdAt: currentData.createdAt || new Date().toISOString()
        };

        await env.PLINY_KV.put(getUserDataKey(userEmail), JSON.stringify(dataToSave));
        
        return { version: newVersion, success: true };
    } catch (error) {
        console.error('ユーザーデータ保存エラー:', error);
        if (error.message === 'データの競合が検出されました') {
            throw error;
        }
        throw new Error('データの保存に失敗しました');
    }
}

// ===============================================
// メインハンドラー
// ===============================================
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // アカウント登録エンドポイント
            if (url.pathname === '/api/auth/register' && request.method === 'POST') {
                const requestData = await request.json();
                
                try {
                    const user = await registerUser(env, requestData);
                    return new Response(JSON.stringify(user), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                } catch (error) {
                    return new Response(JSON.stringify({ error: error.message }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            }

            // ログインエンドポイント
            if (url.pathname === '/api/auth/login' && request.method === 'POST') {
                const requestData = await request.json();
                
                try {
                    const user = await loginUser(env, requestData);
                    return new Response(JSON.stringify(user), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                } catch (error) {
                    return new Response(JSON.stringify({ error: error.message }), {
                        status: 401,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            }

            // ログアウトエンドポイント（トークンの無効化は今回は実装しない）
            if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // ユーザーデータ取得エンドポイント
            if (url.pathname === '/api/data' && request.method === 'GET') {
                try {
                    const userPayload = await authenticateRequest(request, env);
                    const data = await loadUserDataFromKV(env, userPayload.email);
                    return new Response(JSON.stringify(data), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                } catch (error) {
                    return new Response(JSON.stringify({ error: error.message }), {
                        status: 401,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            }

            // ユーザーデータ保存エンドポイント
            if (url.pathname === '/api/data' && request.method === 'PUT') {
                try {
                    const userPayload = await authenticateRequest(request, env);
                    const { tasks, labels, expectedVersion } = await request.json();
                    
                    const result = await saveUserDataToKV(env, userPayload.email, { 
                        tasks, 
                        labels, 
                        expectedVersion 
                    });
                    
                    return new Response(JSON.stringify(result), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                } catch (error) {
                    const status = error.message === 'データの競合が検出されました' ? 409 : 
                                  error.message.includes('認証') ? 401 : 400;
                    return new Response(JSON.stringify({ error: error.message }), {
                        status,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            }

            // 404 - Not Found
            return new Response('Not Found', { status: 404, headers: corsHeaders });

        } catch (error) {
            console.error('Worker error:', error);
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
};
