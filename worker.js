// ===============================================
// Cloudflare Worker用 PLINY バックエンド
// ===============================================

const MASTER_KEY = '$2a$10$l.shMPQkZut9GF8QmO5kjuUe5EuHpRA4sATqrlfXG.lNjF1n0clg.';
const ACCESS_KEY = '$2a$10$h10RX1N2om3YrLjEs313gOKLSH5XN2ov/qECHWf/qoh5ex4Sz3JpG';
const BIN_ID = '685bfb988561e97a502b9056';
const GEMINI_API_KEY = 'AIzaSyD4GPZ85iVlKjbmd-j3DKfbPooGpqlaZtM';
const API_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

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
async function loadDataFromBin() {
    const response = await fetch(`${API_URL}/latest`, {
        headers: { 'X-Access-Key': ACCESS_KEY }
    });
    
    if (!response.ok) {
        if (response.status === 404) {
            return {
                tasks: [],
                labels: [
                    { id: 'default-1', name: '優先度: 高', color: '#ff3b30', priority: 1 },
                    { id: 'default-2', name: '優先度: 中', color: '#ff9500', priority: 2 },
                    { id: 'default-3', name: '優先度: 低', color: '#34c759', priority: 3 }
                ]
            };
        }
        throw new Error(`データ読み込みエラー: ${response.status}`);
    }
    
    const data = await response.json();
    const tasks = Array.isArray(data.record?.tasks) ? data.record.tasks.map(normalizeTask) : [];
    const labels = Array.isArray(data.record?.labels) ? data.record.labels : [];
    
    return { tasks, labels };
}

async function saveDataToBin(tasks, labels) {
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

    const response = await fetch(API_URL, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': MASTER_KEY,
            'X-Bin-Versioning': 'false'
        },
        body: JSON.stringify({
            tasks: normalizedTasks,
            labels: validatedLabels,
            timestamp: new Date().toISOString()
        })
    });

    if (!response.ok) {
        throw new Error(`データ保存エラー: ${response.status}`);
    }

    return await response.json();
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
                        // ...existing label logic...
                    }
                    break;

                // ...existing cases...
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
                const data = await loadDataFromBin();
                return new Response(JSON.stringify(data), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // データ保存エンドポイント
            if (url.pathname === '/api/data' && request.method === 'PUT') {
                const { tasks, labels } = await request.json();
                await saveDataToBin(tasks, labels);
                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // AIアシスタントエンドポイント
            if (url.pathname === '/api/ai' && request.method === 'POST') {
                const { prompt } = await request.json();
                const { tasks, labels } = await loadDataFromBin();
                
                const fullPrompt = buildAiPrompt(prompt, tasks, labels);
                
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
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
                    await saveDataToBin(tasks, labels);
                }

                return new Response(JSON.stringify({ actions, tasks, labels }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
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
