// ===============================================
// Cloudflare Worker用 PLINY バックエンド (KV版)
// ===============================================

const DATA_KEY = 'pliny_data';

// ===============================================
// CORS ヘッダー設定
// ===============================================
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ===============================================
// ヘルパー関数
// ===============================================
function normalizeTask(task) {
    if (!task || typeof task !== 'object') {
        throw new Error('無効なタスクオブジェクト');
    }

    const today = new Date().toISOString().split('T')[0];
    
    const validateDate = (dateStr, fallback = today) => {
        if (!dateStr) return fallback;
        const date = new Date(dateStr + 'T00:00:00');
        return isNaN(date.getTime()) ? fallback : dateStr;
    };

    const startDate = validateDate(task.startDate, today);
    const endDate = validateDate(task.endDate, startDate);

    return {
        id: task.id || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: typeof task.text === 'string' ? task.text.trim() || '(無題のタスク)' : '(無題のタスク)',
        startDate: startDate,
        endDate: endDate >= startDate ? endDate : startDate,
        completed: Boolean(task.completed),
        labelIds: Array.isArray(task.labelIds) ? task.labelIds.filter(id => id != null) : [],
        parentId: task.parentId || null,
        isCollapsed: task.isCollapsed ?? true
    };
}

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
    let bestMatch = null;
    let minDistance = Infinity;
    items.forEach(item => {
        const distance = levenshteinDistance(query.toLowerCase(), item[key].toLowerCase());
        if (distance < minDistance) {
            minDistance = distance;
            bestMatch = item;
        }
    });
    const threshold = Math.max(5, query.length / 2);
    return minDistance <= threshold ? bestMatch : null;
}

// ===============================================
// データ操作関数
// ===============================================
async function loadDataFromKV(env) {
    try {
        const data = await env.PLINY_KV.get(DATA_KEY, 'json');
        
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
        
        const tasks = Array.isArray(data.tasks) ? data.tasks.map(normalizeTask) : [];
        const labels = Array.isArray(data.labels) ? data.labels : [];
        
        return { tasks, labels, version: data.version || 1 };
    } catch (error) {
        console.error('KVからのデータ読み込みエラー:', error);
        throw new Error(`データ読み込みエラー: ${error.message}`);
    }
}

async function saveDataToKV(env, tasks, labels, expectedVersion = null) {
    const normalizedTasks = tasks.map(task => {
        try {
            return normalizeTask(task);
        } catch (error) {
            console.warn('タスクの正規化に失敗:', task, error);
            return null;
        }
    }).filter(Boolean);

    const validatedLabels = labels.filter(label => {
        return label && typeof label.id !== 'undefined' && typeof label.name === 'string';
    });

    // バージョン管理（楽観的ロック）
    const currentData = await loadDataFromKV(env);
    const newVersion = (currentData.version || 1) + 1;
    
    if (expectedVersion && currentData.version !== expectedVersion) {
        throw new Error('CONFLICT');
    }

    const dataToSave = {
        tasks: normalizedTasks,
        labels: validatedLabels,
        version: newVersion,
        timestamp: new Date().toISOString()
    };

    await env.PLINY_KV.put(DATA_KEY, JSON.stringify(dataToSave));
    
    return { success: true, version: newVersion };
}

// ===============================================
// AIアシスタント関数
// ===============================================
function buildAiPrompt(userInput, tasks, labels) {
    const today = new Date().toISOString().split('T')[0];
    const tasksContext = JSON.stringify(tasks.map(t => ({ id: t.id, text: t.text, completed: t.completed, parentId: t.parentId })), null, 2);
    const labelsContext = JSON.stringify(labels.map(l => ({ id: l.id, name: l.name, color: l.color, priority: l.priority })), null, 2);

    return `あなたは高機能なタスク管理アシスタント「PLINY」です。ユーザーの自然言語による指示を解釈し、一連の操作コマンドをJSON配列として出力してください。

# 現在の状態
- 今日: ${today}
- タスクリスト:
${tasksContext}
- ラベルリスト:
${labelsContext}

# あなたが実行できる操作 (action)
1. **addTask**: 新しいタスクを追加する。
2. **updateTask**: 既存のタスクを更新する。
3. **deleteTask**: 既存のタスクを削除する。
4. **addLabel**: 新しいラベルを作成する。
5. **updateLabel**: 既存のラベルを更新する。
6. **deleteLabel**: 既存のラベルを削除する。

# 指示
以下のユーザーの指示を解釈し、上記で定義された形式のJSON配列を出力してください。
必ず \`\`\`json ... \`\`\` のコードブロックで囲んでください。

---
ユーザーの指示: "${userInput}"
---
`;
}

function processAiActions(actions, tasks, labels) {
    actions.forEach(action => {
        try {
            switch (action.action) {
                case 'addTask':
                    const parentTask = action.parentTaskText ? findClosestMatch(action.parentTaskText, tasks, 'text') : null;
                    const label = action.labelName ? findClosestMatch(action.labelName, labels, 'name') : null;
                    const newTask = normalizeTask({
                        text: action.text,
                        startDate: action.startDate,
                        endDate: action.endDate,
                        parentId: parentTask ? parentTask.id : null,
                        labelIds: label ? [label.id] : []
                    });
                    tasks.push(newTask);
                    if (parentTask) parentTask.isCollapsed = false;
                    break;

                case 'updateTask':
                    const taskToUpdate = findClosestMatch(action.taskText, tasks, 'text');
                    if (taskToUpdate) {
                        if (action.newText) taskToUpdate.text = action.newText;
                        if (action.newStartDate) taskToUpdate.startDate = action.newStartDate;
                        if (action.newEndDate) taskToUpdate.endDate = action.newEndDate;
                        if (action.completed !== undefined) taskToUpdate.completed = action.completed;
                        if (action.addLabelName) {
                            const labelToAdd = findClosestMatch(action.addLabelName, labels, 'name');
                            if (labelToAdd && !taskToUpdate.labelIds.includes(labelToAdd.id)) {
                                taskToUpdate.labelIds.push(labelToAdd.id);
                            }
                        }
                        if (action.removeLabelName) {
                            const labelToRemove = findClosestMatch(action.removeLabelName, labels, 'name');
                            if (labelToRemove) {
                                taskToUpdate.labelIds = taskToUpdate.labelIds.filter(id => id !== labelToRemove.id);
                            }
                        }
                    }
                    break;

                case 'deleteTask':
                    const taskToDelete = findClosestMatch(action.taskText, tasks, 'text');
                    if (taskToDelete) {
                        const getDescendants = id => tasks.filter(t => t.parentId === id).flatMap(c => [c.id, ...getDescendants(c.id)]);
                        const descendantIds = getDescendants(taskToDelete.id);
                        tasks = tasks.filter(t => ![taskToDelete.id, ...descendantIds].includes(t.id));
                    }
                    break;

                case 'addLabel':
                    const newLabel = {
                        id: `label-${Date.now()}`,
                        name: action.name,
                        color: action.color || 'transparent',
                        priority: action.priority || (labels.length > 0 ? Math.max(...labels.map(l => l.priority || 0)) : 0) + 1
                    };
                    labels.push(newLabel);
                    break;

                case 'updateLabel':
                    const labelToUpdate = findClosestMatch(action.labelName, labels, 'name');
                    if (labelToUpdate) {
                        if (action.newName) labelToUpdate.name = action.newName;
                        if (action.newColor) labelToUpdate.color = action.newColor;
                        if (action.newPriority) labelToUpdate.priority = action.newPriority;
                    }
                    break;

                case 'deleteLabel':
                    const labelToDelete = findClosestMatch(action.labelName, labels, 'name');
                    if (labelToDelete) {
                        labels = labels.filter(l => l.id !== labelToDelete.id);
                        tasks.forEach(t => {
                            t.labelIds = t.labelIds.filter(id => id !== labelToDelete.id);
                        });
                    }
                    break;
            }
        } catch (e) {
            console.error(`アクションの処理に失敗しました: ${action.action}`, e);
        }
    });
}


// --- ユーザー管理用ユーティリティ ---
function hashPassword(password) {
    // シンプルなSHA-256（本番はbcrypt-wasm等推奨）
    const encoder = new TextEncoder();
    return crypto.subtle.digest('SHA-256', encoder.encode(password)).then(buf => {
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    });
}

function base64urlEncode(str) {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createJWT(payload, secret) {
    // HS256 JWT（簡易版）
    const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64urlEncode(JSON.stringify(payload));
    const signature = base64urlEncode(
        Array.from(new Uint8Array(
            crypto.subtle.digestSync ? crypto.subtle.digestSync('SHA-256', new TextEncoder().encode(header + '.' + body + secret))
            : new Uint8Array(32) // digestSync未対応環境用
        )).map(b => String.fromCharCode(b)).join('')
    );
    return `${header}.${body}.${signature}`;
}

function verifyJWT(token, secret) {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;
    const expectedSig = base64urlEncode(
        Array.from(new Uint8Array(
            crypto.subtle.digestSync ? crypto.subtle.digestSync('SHA-256', new TextEncoder().encode(header + '.' + body + secret))
            : new Uint8Array(32)
        )).map(b => String.fromCharCode(b)).join('')
    );
    if (signature !== expectedSig) return null;
    try {
        return JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    } catch {
        return null;
    }
}

const USER_PREFIX = 'user:';
const JWT_SECRET = 'pliny_jwt_secret'; // 本番はenv変数推奨

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }
        try {
            // --- ユーザー登録 ---
            if (url.pathname === '/api/register' && request.method === 'POST') {
                const { email, password } = await request.json();
                if (!email || !password) {
                    return new Response(JSON.stringify({ error: 'メールとパスワード必須' }), { status: 400, headers: corsHeaders });
                }
                const userKey = USER_PREFIX + email;
                const existing = await env.PLINY_KV.get(userKey, 'json');
                if (existing) {
                    return new Response(JSON.stringify({ error: '既に登録済み' }), { status: 409, headers: corsHeaders });
                }
                const hash = await hashPassword(password);
                const userData = { email, passwordHash: hash, json: {} };
                await env.PLINY_KV.put(userKey, JSON.stringify(userData));
                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            // --- ログイン ---
            if (url.pathname === '/api/login' && request.method === 'POST') {
                const { email, password } = await request.json();
                if (!email || !password) {
                    return new Response(JSON.stringify({ error: 'メールとパスワード必須' }), { status: 400, headers: corsHeaders });
                }
                const userKey = USER_PREFIX + email;
                const user = await env.PLINY_KV.get(userKey, 'json');
                if (!user) {
                    return new Response(JSON.stringify({ error: '未登録' }), { status: 404, headers: corsHeaders });
                }
                const hash = await hashPassword(password);
                if (user.passwordHash !== hash) {
                    return new Response(JSON.stringify({ error: 'パスワード不一致' }), { status: 401, headers: corsHeaders });
                }
                // JWT発行
                const jwt = createJWT({ email, iat: Date.now() }, JWT_SECRET);
                return new Response(JSON.stringify({ success: true, token: jwt }), { headers: corsHeaders });
            }

            // --- ユーザーデータ取得 ---
            if (url.pathname === '/api/userdata' && request.method === 'GET') {
                const auth = request.headers.get('Authorization');
                if (!auth || !auth.startsWith('Bearer ')) {
                    return new Response(JSON.stringify({ error: '認証必須' }), { status: 401, headers: corsHeaders });
                }
                const token = auth.slice(7);
                const payload = verifyJWT(token, JWT_SECRET);
                if (!payload || !payload.email) {
                    return new Response(JSON.stringify({ error: '認証失敗' }), { status: 401, headers: corsHeaders });
                }
                const userKey = USER_PREFIX + payload.email;
                const user = await env.PLINY_KV.get(userKey, 'json');
                if (!user) {
                    return new Response(JSON.stringify({ error: '未登録' }), { status: 404, headers: corsHeaders });
                }
                return new Response(JSON.stringify({ json: user.json || {} }), { headers: corsHeaders });
            }

            // --- ユーザーデータ保存 ---
            if (url.pathname === '/api/userdata' && request.method === 'PUT') {
                const auth = request.headers.get('Authorization');
                if (!auth || !auth.startsWith('Bearer ')) {
                    return new Response(JSON.stringify({ error: '認証必須' }), { status: 401, headers: corsHeaders });
                }
                const token = auth.slice(7);
                const payload = verifyJWT(token, JWT_SECRET);
                if (!payload || !payload.email) {
                    return new Response(JSON.stringify({ error: '認証失敗' }), { status: 401, headers: corsHeaders });
                }
                const userKey = USER_PREFIX + payload.email;
                const user = await env.PLINY_KV.get(userKey, 'json');
                if (!user) {
                    return new Response(JSON.stringify({ error: '未登録' }), { status: 404, headers: corsHeaders });
                }
                const { json } = await request.json();
                user.json = json;
                await env.PLINY_KV.put(userKey, JSON.stringify(user));
                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            // ...existing code...
            // 既存API（/api/data, /api/ai, /api/kv/raw, /api/import/jsonbin）
            // ...existing code...
            if (url.pathname === '/api/data' && request.method === 'GET') {
                const data = await loadDataFromKV(env);
                return new Response(JSON.stringify(data), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            // ...existing code...
            // 既存APIはそのまま
            // ...existing code...
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
