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
            // データ取得エンドポイント
            if (url.pathname === '/api/data' && request.method === 'GET') {
                const data = await loadDataFromKV(env);
                return new Response(JSON.stringify(data), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // データ保存エンドポイント
            if (url.pathname === '/api/data' && request.method === 'PUT') {
                const { tasks, labels, expectedVersion } = await request.json();
                
                try {
                    const result = await saveDataToKV(env, tasks, labels, expectedVersion);
                    return new Response(JSON.stringify(result), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                } catch (error) {
                    if (error.message === 'CONFLICT') {
                        return new Response(JSON.stringify({ error: 'CONFLICT' }), {
                            status: 409,
                            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                        });
                    }
                    throw error;
                }
            }

            // AIアシスタントエンドポイント
            if (url.pathname === '/api/ai' && request.method === 'POST') {
                const { prompt } = await request.json();
                const { tasks, labels } = await loadDataFromKV(env);
                
                const fullPrompt = buildAiPrompt(prompt, tasks, labels);
                
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${env.GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] })
                });

                if (!response.ok) {
                    throw new Error(`Gemini APIエラー: ${response.status}`);
                }
                
                const data = await response.json();
                let jsonString = data.candidates[0].content.parts[0].text;
                
                let actions = [];
                let jsonMatch = jsonString.match(/```json\s*([\s\S]*?)```/i) || jsonString.match(/```\s*([\s\S]*?)```/i);
                if (jsonMatch) {
                    try {
                        actions = JSON.parse(jsonMatch[1].trim());
                    } catch (e) {
                        actions = [];
                    }
                }

                if (actions.length > 0) {
                    processAiActions(actions, tasks, labels);
                    await saveDataToKV(env, tasks, labels);
                }

                return new Response(JSON.stringify({ actions, tasks, labels }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // KVデータ直接取得エンドポイント（デバッグ用）
            if (url.pathname === '/api/kv/raw' && request.method === 'GET') {
                const rawData = await env.PLINY_KV.get(DATA_KEY);
                return new Response(rawData || '{}', {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // KVデータ直接設定エンドポイント（デバッグ用）
            if (url.pathname === '/api/kv/raw' && request.method === 'PUT') {
                const rawData = await request.text();
                
                // JSONとして有効かチェック
                try {
                    JSON.parse(rawData);
                } catch (error) {
                    return new Response(JSON.stringify({ error: '無効なJSON形式です' }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
                
                await env.PLINY_KV.put(DATA_KEY, rawData);
                return new Response(JSON.stringify({ success: true, message: 'データが保存されました' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // JSONBinからのデータインポートエンドポイント
            if (url.pathname === '/api/import/jsonbin' && request.method === 'POST') {
                const { jsonbinUrl, mergeWithExisting = false } = await request.json();
                
                if (!jsonbinUrl) {
                    return new Response(JSON.stringify({ error: 'JSONBin URLが必要です' }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
                
                try {
                    // JSONBinからデータを取得
                    const response = await fetch(jsonbinUrl);
                    if (!response.ok) {
                        throw new Error(`JSONBinからのデータ取得に失敗: ${response.status}`);
                    }
                    
                    const jsonbinData = await response.json();
                    
                    let importedTasks = [];
                    let importedLabels = [];
                    
                    // JSONBinのデータ形式を解析
                    if (jsonbinData.tasks && Array.isArray(jsonbinData.tasks)) {
                        importedTasks = jsonbinData.tasks.map(normalizeTask);
                    }
                    
                    if (jsonbinData.labels && Array.isArray(jsonbinData.labels)) {
                        importedLabels = jsonbinData.labels;
                    }
                    
                    let finalTasks = importedTasks;
                    let finalLabels = importedLabels;
                    
                    if (mergeWithExisting) {
                        // 既存データとマージ
                        const existingData = await loadDataFromKV(env);
                        
                        // タスクをマージ（IDの重複を避ける)
                        const existingTaskIds = new Set(existingData.tasks.map(t => t.id));
                        const newTasks = importedTasks.filter(t => !existingTaskIds.has(t.id));
                        finalTasks = [...existingData.tasks, ...newTasks];
                        
                        // ラベルをマージ（名前の重複を避ける）
                        const existingLabelNames = new Set(existingData.labels.map(l => l.name));
                        const newLabels = importedLabels.filter(l => !existingLabelNames.has(l.name));
                        finalLabels = [...existingData.labels, ...newLabels];
                    }
                    
                    // KVに保存
                    const result = await saveDataToKV(env, finalTasks, finalLabels);
                    
                    return new Response(JSON.stringify({
                        success: true,
                        message: 'JSONBinからのインポートが完了しました',
                        imported: {
                            tasks: importedTasks.length,
                            labels: importedLabels.length
                        },
                        final: {
                            tasks: finalTasks.length,
                            labels: finalLabels.length
                        },
                        version: result.version
                    }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                    
                } catch (error) {
                    return new Response(JSON.stringify({ 
                        error: `インポートエラー: ${error.message}` 
                    }), {
                        status: 500,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            }

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
