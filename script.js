// ===============================================
// 定数
const MASTER_KEY = '$2a$10$l.shMPQkZut9GF8QmO5kjuUe5EuHpRA4sATqrlfXG.lNjF1n0clg.';
const ACCESS_KEY = '$2a$10$h10RX1N2om3YrLjEs313gOKLSH5XN2ov/qECHWf/qoh5ex4Sz3JpG';
const BIN_ID = '685bfb988561e97a502b9056';
const GEMINI_API_KEY = 'AIzaSyD4GPZ85iVlKjbmd-j3DKfbPooGpqlaZtM';
const API_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const PRESET_COLORS = ['#0d6efd', '#6f42c1', '#d63384', '#dc3545', '#fd7e14', '#ffc107', '#198754', '#20c997', '#0dcaf0', '#6c757d', '#343a40'];
const ICONS = {
    edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
    delete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
    save: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    cancel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    label: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
    undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>`};

// 状態
let tasks = [];
let labels = [];
let calendar;
let undoStack = [];
let redoStack = [];

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    flatpickr(document.getElementById('task-due-date'), {
        mode: "range",
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "Y年m月d日",
        locale: "ja"
    });
    initializeCalendar();
    bindGlobalEvents();
    loadData();
});

// カレンダー初期化
function initializeCalendar() {
    calendar = new FullCalendar.Calendar(document.getElementById('calendar-container'), {
        initialView: window.innerWidth < 768 ? 'listWeek' : 'dayGridMonth',
        locale: 'ja',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listWeek' },
        height: '100%',
        events: [],
        editable: true,
        eventDrop: async (info) => {
            pushToUndoStack();
            const task = tasks.find(t => t.id === info.event.id);
            if (!task) { info.revert(); return; }
            const origStart = new Date(task.startDate + 'T00:00:00Z');
            const origEnd = new Date(task.endDate + 'T00:00:00Z');
            const duration = origEnd.getTime() - origStart.getTime();
            task.startDate = info.event.startStr;
            const newEnd = new Date(info.event.start);
            newEnd.setTime(newEnd.getTime() + duration);
            task.endDate = newEnd.toISOString().split('T')[0];
            renderAll();
            await saveData();
        }
    });
    calendar.render();
}

// データロード
async function loadData() {
    try {
        const res = await fetch(`${API_URL}/latest`, { headers: { 'X-Access-Key': ACCESS_KEY } });
        if (!res.ok) {
            if (res.status === 404) {
                tasks = []; labels = [];
                await saveData();
                renderAll();
                return;
            }
            throw new Error(`サーバーエラー: ${res.status}`);
        }
        const data = await res.json();
        tasks = Array.isArray(data.record?.tasks) ? data.record.tasks.map(normalizeTask) : [];
        labels = Array.isArray(data.record?.labels) ? data.record.labels : [];
        renderAll();
    } catch (e) {
        alert("データの読み込みに失敗しました。");
        console.error(e);
    }
}

// データ保存
async function saveData(tasksToSave = tasks, labelsToSave = labels) {
    try {
        const res = await fetch(API_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': MASTER_KEY,
                'X-Bin-Versioning': 'false'
            },
            body: JSON.stringify({ tasks: tasksToSave, labels: labelsToSave })
        });
        if (!res.ok) throw new Error(`保存失敗: ${res.status}`);
    } catch (e) {
        alert("データの保存に失敗しました。UIをリロードします。");
        window.location.reload();
    }
}

// タスク正規化
function normalizeTask(task) {
    return {
        id: task.id || `id-${Date.now()}-${Math.random()}`,
        text: task.text || '(無題のタスク)',
        startDate: task.startDate || new Date().toISOString().split('T')[0],
        endDate: task.endDate || task.startDate || new Date().toISOString().split('T')[0],
        completed: !!task.completed,
        labelIds: Array.isArray(task.labelIds) ? task.labelIds : [],
        parentId: task.parentId || null,
        isCollapsed: task.isCollapsed ?? true
    };
}

// 全体描画
function renderAll() {
    renderTaskList();
    renderCalendar();
    renderLabelEditor();
    updateUndoRedoButtons();
    bindAccordionEvents();
}

// タスクリスト描画
function renderTaskList() {
    const container = document.getElementById('task-list-container');
    container.innerHTML = '';
    // ツリー構造構築
    const map = new Map(tasks.map(t => [t.id, { ...t, children: [] }]));
    for (const t of map.values()) {
        if (t.parentId && map.has(t.parentId) && t.parentId !== t.id) {
            // 循環参照防止
            let p = t.parentId, cycle = false;
            while (p) {
                if (p === t.id) { cycle = true; break; }
                p = map.get(p)?.parentId;
            }
            if (!cycle) map.get(t.parentId).children.push(t);
            else t.parentId = null;
        } else {
            t.parentId = null;
        }
    }
    // ルートのみ
    const roots = Array.from(map.values()).filter(t => !t.parentId);
    // 再帰描画
    function draw(node, parent, level, visited = new Set()) {
        if (visited.has(node.id)) return;
        visited.add(node.id);
        const hasChildren = node.children.length > 0;
        const isCollapsed = node.isCollapsed ?? true;
        const el = document.createElement('div');
        el.className = 'task-node';
        el.setAttribute('data-level', level);
        el.style.setProperty('--level', level);
        el.style.paddingLeft = `calc(${level} * var(--indent-width))`;
        el.innerHTML = `
            <div class="task-toggle${hasChildren ? '' : ' hidden'}${isCollapsed ? ' collapsed' : ''}" data-action="toggle">
                ${ICONS.chevron}
            </div>
            <div class="task-card${node.completed ? ' completed' : ''}" data-task-id="${node.id}" draggable="true">
                <div class="task-content">
                    <span class="task-text">${(node.text || '').replace(/</g, "&lt;")}</span>
                    <div class="task-labels">${(node.labelIds || []).map(id => labels.find(l => l.id === id)).filter(Boolean).map(l => `<span class="task-label-badge" style="background-color: ${l.color}">${l.name}</span>`).join('')}</div>
                    <span class="task-due-date">${node.startDate || ''}</span>
                </div>
                <div class="task-actions">
                    <button data-action="add-child" title="子タスクを追加">${ICONS.plus}</button>
                    <button data-action="edit-labels" title="ラベルを編集">${ICONS.label}</button>
                    <button data-action="complete" title="${node.completed ? '未完了' : '完了'}">${node.completed ? ICONS.undo : ICONS.check}</button>
                    <button data-action="delete" title="削除">${ICONS.delete}</button>
                </div>
            </div>`;
        parent.appendChild(el);
        if (hasChildren && !isCollapsed) {
            node.children
                .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
                .forEach(child => draw(child, parent, level + 1, visited));
        }
    }
    roots.sort((a, b) => new Date(a.startDate) - new Date(b.startDate)).forEach(root => draw(root, container, 1));
}

// カレンダー描画
function renderCalendar() {
    if (!calendar) return;
    const events = tasks.map(task => {
        if (!task.startDate) return null;
        const inclusiveEndDate = task.endDate || task.startDate;
        const exclusiveEnd = new Date(inclusiveEndDate);
        exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
        const highestPrioLabel = getHighestPriorityLabel(task);
        const eventColor = task.completed ? '#adb5bd' : (highestPrioLabel ? highestPrioLabel.color : '#0d6efd');
        return {
            id: task.id,
            title: task.text,
            start: task.startDate,
            end: exclusiveEnd.toISOString().split('T')[0],
            allDay: true,
            backgroundColor: eventColor,
            borderColor: eventColor,
            classNames: task.completed ? ['completed-event'] : []
        };
    }).filter(Boolean);
    calendar.getEventSources().forEach(source => source.remove());
    calendar.addEventSource(events);
}

// ラベルエディタ描画
function renderLabelEditor() {
    const list = document.getElementById('label-editor-list');
    list.innerHTML = '';
    labels.sort((a, b) => a.priority - b.priority).forEach(label => list.appendChild(createLabelItem(label)));
    const addContainer = document.getElementById('label-add-container');
    addContainer.innerHTML = '';
    const addTrigger = document.createElement('div');
    addTrigger.className = 'add-new-label-trigger';
    addTrigger.textContent = '＋ 新しいラベルを追加';
    addTrigger.dataset.action = 'add';
    addContainer.appendChild(addTrigger);
}

// ラベルアイテム生成
function createLabelItem(label) {
    const isNew = !label.id;
    const item = document.createElement('div');
    item.className = 'label-item';
    if (isNew) { item.classList.add('editing'); item.dataset.id = 'new'; }
    else { item.dataset.id = label.id; }
    const priorityOptions = [1, 2, 3].map(p => `<option value="${p}" ${label.priority === p ? 'selected' : ''}>${getPriorityText(p)}</option>`).join('');
    item.innerHTML = `
        <div class="label-item-color-swatch" style="background-color: ${label.color || PRESET_COLORS[0]};"><div class="color-palette-dropdown"></div></div>
        <div class="label-item-content">
            <div class="label-item-display">
                <span class="label-name-display">${label.name || ''}</span>
                <span class="label-prio-display">優先度: ${getPriorityText(label.priority)}</span>
            </div>
            <div class="label-item-editor">
                <input type="text" class="label-name-input" value="${label.name || ''}" placeholder="ラベル名">
                <select class="label-prio-select">${priorityOptions}</select>
            </div>
        </div>
        <div class="label-item-actions action-edit-delete">
            <button class="edit-label-btn" data-action="edit" title="編集">${ICONS.edit}</button>
            <button class="delete-label-btn" data-action="delete" title="削除">${ICONS.delete}</button>
        </div>
        <div class="label-item-actions action-save-cancel">
            <button class="save-label-btn" data-action="save" title="保存">${ICONS.save}</button>
            <button class="cancel-label-btn" data-action="cancel" title="キャンセル">${ICONS.cancel}</button>
        </div>`;
    const swatch = item.querySelector('.label-item-color-swatch');
    const palette = item.querySelector('.color-palette-dropdown');
    renderColorPalette(palette, color => { swatch.style.backgroundColor = color; });
    return item;
}

// カラーパレット描画
function renderColorPalette(paletteContainer, onColorSelect) {
    paletteContainer.innerHTML = '';
    PRESET_COLORS.forEach(color => {
        const colorBox = document.createElement('div');
        colorBox.className = 'color-box';
        colorBox.style.backgroundColor = color;
        colorBox.addEventListener('click', e => {
            e.stopPropagation();
            onColorSelect(color);
            paletteContainer.classList.remove('active');
        });
        paletteContainer.appendChild(colorBox);
    });
}

// ラベル優先度テキスト
function getPriorityText(priority) {
    return { 1: '高', 2: '中', 3: '低' }[priority] || '未設定';
}

// ラベルのうち最も優先度が高いもの
function getHighestPriorityLabel(task) {
    if (!task.labelIds || task.labelIds.length === 0) return null;
    return task.labelIds.map(id => labels.find(l => l.id === id)).filter(Boolean).sort((a, b) => a.priority - b.priority)[0];
}

// アコーディオンイベント
function bindAccordionEvents() {
    document.querySelectorAll('.accordion-toggle').forEach(btn => {
        btn.removeEventListener('click', btn._accordionHandler);
        btn._accordionHandler = function () {
            document.querySelectorAll('.accordion-toggle').forEach(otherBtn => {
                if (otherBtn !== btn) otherBtn.classList.remove('active');
            });
            btn.classList.toggle('active');
        };
        btn.addEventListener('click', btn._accordionHandler);
        btn.classList.remove('active');
    });
}

// undo/redoボタン
function updateUndoRedoButtons() {
    document.getElementById('undo-btn').disabled = undoStack.length === 0;
    document.getElementById('redo-btn').disabled = redoStack.length === 0;
}
function pushToUndoStack() {
    undoStack.push(JSON.parse(JSON.stringify({ tasks, labels })));
    redoStack = [];
    updateUndoRedoButtons();
}

// グローバルイベント
function bindGlobalEvents() {
    // タスク追加
    document.getElementById('task-form').addEventListener('submit', async e => {
        e.preventDefault();
        const taskInput = document.getElementById('task-input');
        const taskDueDate = document.getElementById('task-due-date');
        const text = taskInput.value.trim();
        const dates = taskDueDate._flatpickr.selectedDates;
        if (!text || dates.length === 0) return;
        const startDate = dates[0].toISOString().split('T')[0];
        const endDate = dates.length > 1 ? dates[1].toISOString().split('T')[0] : startDate;
        pushToUndoStack();
        tasks.push({
            id: Date.now().toString(),
            text,
            startDate,
            endDate,
            completed: false,
            labelIds: [],
            parentId: null,
            isCollapsed: true
        });
        renderAll();
        taskInput.value = '';
        taskDueDate._flatpickr.clear();
        await saveData();
    });

    // タスク操作
    document.getElementById('task-list-container').addEventListener('click', async e => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        const taskNode = target.closest('.task-node');
        if (!taskNode) return;
        const card = taskNode.querySelector('.task-card');
        if (!card) return;
        const taskId = card.dataset.taskId;
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        let needsSave = false, needsRender = true;
        switch (action) {
            case 'toggle':
                task.isCollapsed = !(task.isCollapsed ?? true);
                break;
            case 'add-child':
                pushToUndoStack();
                tasks.push({
                    id: Date.now().toString(),
                    text: '新しい子タスク',
                    startDate: task.startDate,
                    endDate: task.endDate,
                    completed: false,
                    labelIds: [],
                    parentId: taskId,
                    isCollapsed: true
                });
                task.isCollapsed = false;
                needsSave = true;
                break;
            case 'edit-labels':
                openLabelModal(taskId);
                needsRender = false;
                break;
            case 'complete':
                pushToUndoStack();
                task.completed = !task.completed;
                needsSave = true;
                break;
            case 'delete':
                const getDescendants = id => tasks.filter(t => t.parentId === id).flatMap(c => [c.id, ...getDescendants(c.id)]);
                const descendantIds = getDescendants(taskId);
                if (confirm(`このタスクと${descendantIds.length}個の子タスクを削除しますか？`)) {
                    pushToUndoStack();
                    const idsToDelete = [taskId, ...descendantIds];
                    tasks = tasks.filter(t => !idsToDelete.includes(t.id));
                    needsSave = true;
                } else {
                    needsRender = false;
                }
                break;
        }
        if (needsRender) renderAll();
        if (needsSave) await saveData();
    });

    // ドラッグ&ドロップ
    let draggedElement = null;
    document.getElementById('task-list-container').addEventListener('dragstart', e => {
        const card = e.target.closest('.task-card');
        if (card) {
            draggedElement = card;
            e.dataTransfer.setData('text/plain', card.dataset.taskId);
            setTimeout(() => card.classList.add('dragging'), 0);
        }
    });
    document.getElementById('task-list-container').addEventListener('dragend', () => {
        if (draggedElement) {
            draggedElement.classList.remove('dragging');
            draggedElement = null;
        }
    });
    document.getElementById('task-list-container').addEventListener('dragover', e => {
        e.preventDefault();
        const targetCard = e.target.closest('.task-card');
        if (targetCard && targetCard !== draggedElement) {
            targetCard.classList.add('drag-over');
        }
    });
    document.getElementById('task-list-container').addEventListener('dragleave', e => {
        const targetCard = e.target.closest('.task-card');
        if (targetCard) {
            targetCard.classList.remove('drag-over');
        }
    });
    document.getElementById('task-list-container').addEventListener('drop', async e => {
        e.preventDefault();
        const targetCard = e.target.closest('.task-card');
        if (targetCard) targetCard.classList.remove('drag-over');
        if (!targetCard || !draggedElement) return;
        const draggedId = e.dataTransfer.getData('text/plain');
        const targetId = targetCard.dataset.taskId;
        if (draggedId === targetId) return;
        const draggedTask = tasks.find(t => t.id === draggedId);
        let currentParentId = targetId;
        while (currentParentId) {
            if (currentParentId === draggedId) {
                alert('自分の子孫にタスクを移動することはできません。');
                return;
            }
            const parentTask = tasks.find(t => t.id === currentParentId);
            currentParentId = parentTask ? parentTask.parentId : null;
        }
        pushToUndoStack();
        draggedTask.parentId = targetId;
        const targetTask = tasks.find(t => t.id === targetId);
        if (targetTask) targetTask.isCollapsed = false;
        renderAll();
        await saveData();
    });

    // ビュー切り替え
    document.getElementById('show-list-btn').addEventListener('click', () => {
        document.getElementById('list-view').style.display = 'block';
        document.getElementById('calendar-view').style.display = 'none';
        document.getElementById('show-list-btn').classList.add('active');
        document.getElementById('show-calendar-btn').classList.remove('active');
    });
    document.getElementById('show-calendar-btn').addEventListener('click', () => {
        document.getElementById('list-view').style.display = 'none';
        document.getElementById('calendar-view').style.display = 'block';
        document.getElementById('show-list-btn').classList.remove('active');
        document.getElementById('show-calendar-btn').classList.add('active');
        calendar.render();
    });

    // ラベルエディタ
    document.getElementById('label-add-container').addEventListener('click', e => {
        const trigger = e.target.closest('[data-action="add"]');
        if (trigger) handleLabelAction(null, 'add');
    });
    document.getElementById('label-editor-list').addEventListener('click', e => {
        const button = e.target.closest('button[data-action]');
        const item = e.target.closest('.label-item');
        if (button && item) {
            e.stopPropagation();
            handleLabelAction(item, button.dataset.action);
            return;
        }
        const swatch = e.target.closest('.label-item-color-swatch');
        if (swatch && item.classList.contains('editing')) {
            const palette = swatch.querySelector('.color-palette-dropdown');
            document.querySelectorAll('.color-palette-dropdown.active').forEach(p => p !== palette && p.classList.remove('active'));
            palette.classList.toggle('active');
        }
    });

    // ラベル保存/キャンセル
    document.getElementById('modal-save-btn').addEventListener('click', async () => {
        pushToUndoStack();
        const modal = document.getElementById('label-editor-modal');
        const taskId = modal.dataset.taskId;
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            const container = document.getElementById('modal-labels-container');
            task.labelIds = Array.from(container.querySelectorAll('input:checked')).map(input => parseInt(input.value, 10));
            renderAll();
            await saveData();
        }
        closeLabelModal();
    });
    document.getElementById('modal-cancel-btn').addEventListener('click', closeLabelModal);
    document.querySelector('#label-editor-modal .modal-close-btn').addEventListener('click', closeLabelModal);

    // undo/redo
    document.getElementById('undo-btn').addEventListener('click', async () => {
        if (undoStack.length === 0) return;
        redoStack.push(JSON.parse(JSON.stringify({ tasks, labels })));
        const prevState = undoStack.pop();
        tasks = prevState.tasks;
        labels = prevState.labels;
        renderAll();
        await saveData();
    });
    document.getElementById('redo-btn').addEventListener('click', async () => {
        if (redoStack.length === 0) return;
        undoStack.push(JSON.parse(JSON.stringify({ tasks, labels })));
        const nextState = redoStack.pop();
        tasks = nextState.tasks;
        labels = nextState.labels;
        renderAll();
        await saveData();
    });

    // AI生成
    document.getElementById('gemini-trigger-btn').addEventListener('click', async () => {
        const geminiPrompt = document.getElementById('gemini-prompt');
        const promptText = geminiPrompt.value.trim();
        if (!promptText || !GEMINI_API_KEY) {
            alert("プロンプトを入力するか、GeminiのAPIキーを設定してください。");
            return;
        }
        const geminiBtn = document.getElementById('gemini-trigger-btn');
        geminiBtn.disabled = true;
        geminiBtn.querySelector('.default-text').style.display = 'none';
        geminiBtn.querySelector('.loading-indicator').style.display = 'flex';
        try {
            const fullPrompt = `あなたはタスク管理アシスタントです。以下の文章からタスクを抽出し、JSON形式の配列で出力してください。各タスクオブジェクトには "text", "startDate", "endDate" のキーを含めてください。endDateが指定されていない、または1日のタスクの場合は、startDateと同じ日付にしてください。日付は必ず "YYYY-MM-DD" 形式で出力してください。「来週」「明日」などの相対的な日付は、今日の日付（${new Date().toISOString().split('T')[0]}）を基準に計算してください。出力は \`\`\`json ... \`\`\` の形式で囲んでください。\n\n---\n\n${promptText}`;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] })
            });
            if (!response.ok) throw new Error(`Gemini APIエラー: ${response.status} ${await response.text()}`);
            const data = await response.json();
            let jsonString = data.candidates[0].content.parts[0].text;
            const jsonMatch = jsonString.match(/```json([\s\S]*?)```/);
            jsonString = jsonMatch ? jsonMatch[1].trim() : jsonString.substring(jsonString.indexOf('[') + 1, jsonString.lastIndexOf(']'));
            const newTasks = JSON.parse(jsonString);
            pushToUndoStack();
            newTasks.forEach(task => {
                if (task.text && task.startDate) {
                    const startDate = task.startDate;
                    const endDate = task.endDate || startDate;
                    tasks.push({
                        id: Date.now().toString() + Math.random(),
                        text: task.text,
                        startDate,
                        endDate,
                        completed: false,
                        labelIds: [],
                        parentId: null,
                        isCollapsed: true
                    });
                }
            });
            renderAll();
            await saveData();
            geminiPrompt.value = '';
        } catch (error) {
            alert("タスクの自動生成に失敗しました。");
            console.error(error);
        } finally {
            geminiBtn.disabled = false;
            geminiBtn.querySelector('.default-text').style.display = 'inline';
            geminiBtn.querySelector('.loading-indicator').style.display = 'none';
        }
    });
}

// ラベル編集モーダル
function openLabelModal(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const modal = document.getElementById('label-editor-modal');
    document.getElementById('modal-task-text').textContent = task.text;
    modal.dataset.taskId = taskId;
    const container = document.getElementById('modal-labels-container');
    container.innerHTML = '';
    [...labels].sort((a, b) => a.priority - b.priority).forEach(label => {
        const isChecked = task.labelIds && task.labelIds.includes(label.id);
        const item = document.createElement('div');
        item.className = 'label-checkbox-item';
        item.innerHTML = `<input type="checkbox" id="label-check-${label.id}" value="${label.id}" ${isChecked ? 'checked' : ''}><label for="label-check-${label.id}"><div class="label-item-color" style="background-color:${label.color}"></div><span>${label.name} (優先度: ${getPriorityText(label.priority)})</span></label>`;
        container.appendChild(item);
    });
    modal.style.display = 'flex';
}
function closeLabelModal() {
    document.getElementById('label-editor-modal').style.display = 'none';
}

// ラベル操作
async function handleLabelAction(item, action) {
    if (action === 'add') {
        if (document.querySelector('.label-item[data-id="new"]')) return;
        document.getElementById('label-editor-list').prepend(createLabelItem({ priority: 2, name: '', color: PRESET_COLORS[0] }));
        return;
    }
    if (!item) return;
    const id = item.dataset.id === 'new' ? 'new' : parseInt(item.dataset.id, 10);
    switch (action) {
        case 'edit':
            item.classList.add('editing');
            break;
        case 'cancel':
            (id === 'new') ? item.remove() : renderLabelEditor();
            break;
        case 'save':
            pushToUndoStack();
            const name = item.querySelector('.label-name-input').value.trim();
            if (!name) {
                alert("ラベル名は必須です。");
                item.querySelector('.label-name-input').focus();
                return;
            }
            const priority = parseInt(item.querySelector('.label-prio-select').value, 10);
            const color = item.querySelector('.label-item-color-swatch').style.backgroundColor;
            if (id === 'new') {
                labels.push({ id: Date.now(), name, priority, color });
            } else {
                const label = labels.find(l => l.id === id);
                if (label) Object.assign(label, { name, priority, color });
            }
            renderAll();
            await saveData();
            break;
        case 'delete':
            pushToUndoStack();
            const labelToDelete = labels.find(l => l.id === id);
            if (labelToDelete && confirm(`ラベル「${labelToDelete.name}」を削除しますか？`)) {
                labels = labels.filter(l => l.id !== id);
                tasks.forEach(task => {
                    if (task.labelIds) task.labelIds = task.labelIds.filter(labelId => labelId !== id);
                });
                renderAll();
                await saveData();
            }
            break;
    }
}