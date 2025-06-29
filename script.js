// ===============================================
// 定数
// ===============================================
const MASTER_KEY = '$2a$10$l.shMPQkZut9GF8QmO5kjuUe5EuHpRA4sATqrlfXG.lNjF1n0clg.';
const ACCESS_KEY = '$2a$10$h10RX1N2om3YrLjEs313gOKLSH5XN2ov/qECHWf/qoh5ex4Sz3JpG';
const BIN_ID = '685bfb988561e97a502b9056';
const GEMINI_API_KEY = 'AIzaSyD4GPZ85iVlKjbmd-j3DKfbPooGpqlaZtM';
const API_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const PRESET_COLORS = ['#007aff', '#ff9500', '#34c759', '#ff3b30', '#af52de', '#5856d6', '#ff2d55', '#ffcc00', '#8e8e93'];
const ICONS = {
    delete: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
    label: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    undo: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 8C9.85 8 7.45 8.99 5.6 10.6L2 7V16H11L7.38 12.38C8.77 11.22 10.54 10.5 12.5 10.5C16.04 10.5 19.05 12.81 20.1 16L22.47 15.22C20.98 10.93 17.06 8 12.5 8Z"/></svg>`,
    redo: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8C6.94 8 3.02 10.93 1.53 15.22L3.9 16C4.95 12.81 7.96 10.5 11.5 10.5C13.46 10.5 15.23 11.22 16.62 12.38L13 16H22V7L18.4 10.6Z"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
};

// ===============================================
// 状態管理
// ===============================================
let tasks = [];
let labels = [];
let calendar;
let undoStack = [];
let redoStack = [];
let currentBinVersion = null; // JSONBIN.ioのバージョン管理用

// ===============================================
// 初期化処理
// ===============================================
document.addEventListener('DOMContentLoaded', () => {
    flatpickr(document.getElementById('task-due-date'), {
        mode: "range",
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "Y年m月d日",
        locale: "ja"
    });
    initializeCalendar();
    initializeIcons();
    bindGlobalEvents();
    loadData();
});

function initializeIcons() {
    document.getElementById('undo-btn').innerHTML = ICONS.undo;
    document.getElementById('redo-btn').innerHTML = ICONS.redo;
}

function initializeCalendar() {
    calendar = new FullCalendar.Calendar(document.getElementById('calendar-container'), {
        initialView: window.innerWidth < 768 ? 'listWeek' : 'dayGridMonth',
        locale: 'ja',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listWeek' },
        height: '100%',
        events: [],
        editable: true, // ドラッグ＆ドロップを有効化
        eventDrop: handleEventDrop // ドロップ時のハンドラ
    });
    calendar.render();
}

// ===============================================
// データ管理 (JSONBIN)
// ===============================================
async function loadData() {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    try {
        const res = await fetch(`${API_URL}/latest`, { headers: { 'X-Access-Key': ACCESS_KEY } });
        if (!res.ok) {
            if (res.status === 404) { 
                tasks = []; 
                labels = [
                    { id: 'default-1', name: '優先度: 高', color: '#ff3b30', priority: 1 },
                    { id: 'default-2', name: '優先度: 中', color: '#ff9500', priority: 2 },
                    { id: 'default-3', name: '優先度: 低', color: '#34c759', priority: 3 }
                ]; 
                // 初期データ保存時にはバージョンチェックをスキップ
                await saveData(tasks, labels, true); 
                renderAll(); 
                return; 
            }
            throw new Error(`サーバーエラー: ${res.status}`);
        }
        currentBinVersion = res.headers.get('X-Bin-Meta-Version');
        const data = await res.json();
        tasks = Array.isArray(data.record?.tasks) ? data.record.tasks.map(normalizeTask) : [];
        labels = Array.isArray(data.record?.labels) ? data.record.labels : [];
        renderAll();
    } catch (e) {
        alert("データの読み込みに失敗しました。"); console.error(e);
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

async function saveData(tasksToSave = tasks, labelsToSave = labels, isInitialSave = false) {
    const headers = {
        'Content-Type': 'application/json',
        'X-Master-Key': MASTER_KEY,
        'X-Bin-Versioning': 'false'
    };

    // 初回保存時以外はIf-Matchヘッダーを追加
    if (!isInitialSave && currentBinVersion) {
        headers['If-Match'] = currentBinVersion;
    }

    try {
        const res = await fetch(API_URL, {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify({ tasks: tasksToSave, labels: labelsToSave })
        });

        if (res.status === 412) { // Precondition Failed
            alert("データの競合が発生しました。他の端末でデータが更新された可能性があります。最新のデータを読み込み直します。");
            await loadData(); // 最新のデータを再読み込み
            return; // 保存処理を中断
        } else if (!res.ok) {
            throw new Error(`保存失敗: ${res.status}`);
        }

        // 保存成功後、新しいバージョンを更新
        currentBinVersion = res.headers.get('X-Bin-Meta-Version');

    } catch (e) {
        alert("データの保存に失敗しました。UIをリロードします。"); 
        console.error(e);
        window.location.reload();
    }
}

// ===============================================
// 描画処理
// ===============================================
function renderAll() {
    renderTaskList();
    renderCalendar();
    renderLabelEditor();
    renderAddTaskLabelSelector();
    updateUndoRedoButtons();
    bindAccordionEvents();
}

function renderTaskList() {
    const container = document.getElementById('task-list-container');
    container.innerHTML = '';
    const map = new Map(tasks.map(t => [t.id, { ...t, children: [] }]));
    const roots = [];
    map.forEach(task => {
        if (task.parentId && map.has(task.parentId)) { map.get(task.parentId).children.push(task); } 
        else { roots.push(task); }
    });

    function draw(node, parent, level, visited = new Set()) {
        if (visited.has(node.id)) return;
        visited.add(node.id);

        const hasChildren = node.children.length > 0;
        const isCollapsed = node.isCollapsed ?? true;
        const highestPrioLabel = getHighestPriorityLabel(node);
        const labelColor = highestPrioLabel ? highestPrioLabel.color : '';

        const el = document.createElement('div');
        el.className = 'task-node';
        el.style.setProperty('--level', level);

        let cardClass = 'task-card';
        if (node.completed) cardClass += ' completed';
        if (labelColor) cardClass += ' has-label-color';
        let cardAttrs = `data-task-id="${node.id}" draggable="true" style="--label-color: ${labelColor};"`;

        el.innerHTML = `
            <div class="${cardClass}" ${cardAttrs}>
                <div class="task-card-main">
                    <div class="task-toggle${hasChildren ? '' : ' hidden'}${isCollapsed ? '' : ' collapsed'}" data-action="toggle">
                        ${ICONS.chevron}
                    </div>
                    <div class="task-content-wrapper">
                        <span class="task-text">${(node.text || '').replace(/</g, "&lt;")}</span>
                        <div class="task-meta">
                            <div class="task-labels">${(node.labelIds || []).map(id => labels.find(l => l.id.toString() === id.toString())).filter(Boolean).sort((a,b) => a.priority - b.priority).map(l => `<span class="task-label-badge">${l.name}</span>`).join('')}</div>
                            <span class="task-due-date">${formatDueDate(node.startDate, node.endDate)}</span>
                        </div>
                    </div>
                </div>
                <div class="task-actions">
                    <button data-action="edit-labels" title="ラベルを編集">${ICONS.label}</button>
                    <button data-action="complete" title="${node.completed ? '未完了' : '完了'}">${ICONS.check}</button>
                    <button data-action="delete" title="削除">${ICONS.delete}</button>
                </div>
            </div>`;
        parent.appendChild(el);

        if (hasChildren && !isCollapsed) {
            node.children.sort((a, b) => new Date(a.startDate) - new Date(b.startDate)).forEach(child => draw(child, parent, level + 1, visited));
        }
    }
    roots.sort((a, b) => new Date(a.startDate) - new Date(b.startDate)).forEach(root => draw(root, container, 1));
}

function renderCalendar() {
    if (!calendar) return;
    const events = tasks.map(task => {
        if (!task.startDate) return null;
        const exclusiveEnd = new Date(task.endDate || task.startDate);
        exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
        const highestPrioLabel = getHighestPriorityLabel(task);
        const eventColor = task.completed ? '#adb5bd' : (highestPrioLabel ? highestPrioLabel.color : 'var(--primary)');
        return {
            id: task.id, title: task.text, start: task.startDate,
            end: exclusiveEnd.toISOString().split('T')[0], allDay: true,
            backgroundColor: eventColor, borderColor: eventColor,
            classNames: task.completed ? ['completed-event'] : []
        };
    }).filter(Boolean);
    calendar.getEventSources().forEach(source => source.remove());
    calendar.addEventSource(events);
}

function renderLabelEditor() {
    renderLabelList();
    renderLabelAddForm();
}

function renderLabelList() {
    const listContainer = document.getElementById('label-editor-list');
    listContainer.innerHTML = '';
    labels.sort((a, b) => (a.priority || 99) - (b.priority || 99)).forEach(label => {
        const item = document.createElement('div');
        item.className = 'label-editor-item';
        item.dataset.id = label.id;

        const colorPreview = document.createElement('div');
        colorPreview.className = 'label-color-preview';
        colorPreview.style.backgroundColor = label.color === 'transparent' ? 'var(--bg-app)' : label.color;
        if (label.color === 'transparent') {
            colorPreview.style.backgroundImage = 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)';
            colorPreview.style.backgroundSize = '10px 10px';
            colorPreview.style.backgroundPosition = '0 0, 5px 5px';
        }
        colorPreview.addEventListener('click', (e) => {
            e.stopPropagation();
            showColorPalette(colorPreview, label);
        });

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'label-name-input';
        nameInput.value = label.name;
        nameInput.addEventListener('blur', () => {
            if (nameInput.value.trim() !== label.name) {
                pushToUndoStack();
                label.name = nameInput.value.trim();
                saveDataAndRender();
            }
        });

        const priorityControl = createPriorityControl(label);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'label-editor-controls delete-label-btn';
        deleteBtn.innerHTML = ICONS.delete;
        deleteBtn.title = 'ラベルを削除';
        deleteBtn.addEventListener('click', () => {
            if (confirm(`「${label.name}」ラベルを削除しますか？`)) {
                pushToUndoStack();
                labels = labels.filter(l => l.id !== label.id);
                tasks.forEach(t => {
                    t.labelIds = t.labelIds.filter(id => id !== label.id);
                });
                saveDataAndRender();
            }
        });
        
        item.appendChild(colorPreview);
        item.appendChild(nameInput);
        item.appendChild(priorityControl);
        item.appendChild(deleteBtn);
        listContainer.appendChild(item);
    });
}

function createPriorityControl(label) {
    const control = document.createElement('div');
    control.className = 'priority-control';
    [ {p:1, t:'高'}, {p:2, t:'中'}, {p:3, t:'低'} ].forEach(prio => {
        const btn = document.createElement('button');
        btn.textContent = prio.t;
        btn.className = (label.priority === prio.p) ? 'active' : '';
        btn.addEventListener('click', () => {
            pushToUndoStack();
            label.priority = prio.p;
            saveDataAndRender();
        });
        control.appendChild(btn);
    });
    return control;
}

function renderLabelAddForm() {
    const addContainer = document.getElementById('label-add-container');
    addContainer.innerHTML = '';

    const form = document.createElement('form');
    form.id = 'new-label-form';
    
    const inputRow = document.createElement('div');
    inputRow.className = 'form-row';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'new-label-name';
    nameInput.placeholder = '新しいラベル名';
    nameInput.required = true;

    const addBtn = document.createElement('button');
    addBtn.type = 'submit';
    addBtn.id = 'add-new-label-btn';
    addBtn.innerHTML = ICONS.plus;

    inputRow.appendChild(nameInput);
    inputRow.appendChild(addBtn);
    
    form.appendChild(inputRow);
    addContainer.appendChild(form);

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const newName = nameInput.value.trim();
        if (newName) {
            pushToUndoStack();
            const newLabel = {
                id: `label-${Date.now()}`,
                name: newName,
                color: 'transparent',
                priority: (labels.length > 0 ? Math.max(...labels.map(l => l.priority || 0)) : 0) + 1
            };
            labels.push(newLabel);
            saveDataAndRender();
            nameInput.value = '';
        }
    });
}

function renderAddTaskLabelSelector() {
    const container = document.getElementById('add-task-label-selector');
    container.innerHTML = '';
    labels.forEach(label => {
        const item = document.createElement('label');
        item.className = 'label-checkbox-item';
        item.dataset.labelId = label.id;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = label.id;

        const colorDot = document.createElement('div');
        colorDot.className = 'label-color-dot';
        colorDot.style.backgroundColor = label.color;

        const name = document.createElement('span');
        name.textContent = label.name;

        item.appendChild(checkbox);
        item.appendChild(colorDot);
        item.appendChild(name);
        container.appendChild(item);

        item.addEventListener('click', (e) => {
            e.preventDefault();
            item.classList.toggle('selected');
            checkbox.checked = !checkbox.checked;
        });
    });
}

// ===============================================
// UIコンポーネント (ポップオーバー)
// ===============================================
function showColorPalette(anchorElement, label) {
    closeAllPopovers();
    const palette = document.createElement('div');
    palette.className = 'popover color-palette';
    
    PRESET_COLORS.forEach(color => {
        const colorBox = document.createElement('div');
        colorBox.className = 'color-box';
        colorBox.style.backgroundColor = color === 'transparent' ? 'var(--bg-app)' : color;
        if (color === 'transparent') {
            colorBox.style.backgroundImage = 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)';
            colorBox.style.backgroundSize = '10px 10px';
            colorBox.style.backgroundPosition = '0 0, 5px 5px';
        }
        if (color === label.color) {
            colorBox.classList.add('selected');
        }
        colorBox.addEventListener('click', () => {
            pushToUndoStack();
            label.color = color;
            saveDataAndRender();
            closeAllPopovers();
        });
        palette.appendChild(colorBox);
    });

    document.body.appendChild(palette);
    positionPopover(anchorElement, palette);
    palette.style.display = 'grid';
}

function showLabelSelectPopover(anchorElement, task) {
    closeAllPopovers();
    const popover = document.createElement('div');
    popover.className = 'popover label-select-popover';

    popover.innerHTML = '<h3>ラベルを選択</h3>';

    const list = document.createElement('div');
    list.className = 'label-select-list';

    labels.forEach(label => {
        const item = document.createElement('label');
        item.className = 'label-select-item';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = label.id;
        checkbox.checked = task.labelIds.includes(label.id);

        checkbox.addEventListener('change', () => {
            pushToUndoStack();
            if (checkbox.checked) {
                task.labelIds.push(label.id);
            } else {
                task.labelIds = task.labelIds.filter(id => id !== label.id);
            }
            saveDataAndRender();
        });

        const colorDot = document.createElement('div');
        colorDot.className = 'label-color-dot';
        colorDot.style.backgroundColor = label.color;

        const name = document.createElement('span');
        name.className = 'label-name';
        name.textContent = label.name;

        item.appendChild(checkbox);
        item.appendChild(colorDot);
        item.appendChild(name);
        list.appendChild(item);
    });

    popover.appendChild(list);
    document.body.appendChild(popover);
    positionPopover(anchorElement, popover);
    popover.style.display = 'block';
}

function positionPopover(anchor, popover) {
    const anchorRect = anchor.getBoundingClientRect();
    const parent = document.getElementById('app-container');
    const parentRect = parent.getBoundingClientRect();
    
    popover.style.visibility = 'hidden';
    popover.style.display = 'block';
    const popoverRect = popover.getBoundingClientRect();

    let left = anchorRect.left;
    let top = anchorRect.bottom + 8;

    if (left + popoverRect.width > parentRect.right - 8) {
        left = parentRect.right - popoverRect.width - 8;
    }
    if (left < parentRect.left + 8) {
        left = parentRect.left + 8;
    }
    if (top + popoverRect.height > parentRect.bottom - 8) {
        top = anchorRect.top - popoverRect.height - 8;
    }
     if (top < parentRect.top + 8) {
        top = parentRect.top + 8;
    }

    popover.style.position = 'absolute';
    popover.style.left = `${left + window.scrollX}px`;
    popover.style.top = `${top + window.scrollY}px`;
    popover.style.visibility = '';
}

function closeAllPopovers() {
    document.querySelectorAll('.popover').forEach(p => p.remove());
}

// ===============================================
// ヘルパー関数
// ===============================================
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

function formatDueDate(start, end) {
    if (!start) return '';
    try {
        const startDate = new Date(start + 'T00:00:00');
        if (!end || start === end) return startDate.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
        const endDate = new Date(end + 'T00:00:00');
        return `${startDate.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} → ${endDate.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}`;
    } catch (e) { return start; }
}

function getHighestPriorityLabel(task) {
    if (!task.labelIds || task.labelIds.length === 0) return null;
    return task.labelIds.map(id => labels.find(l => l.id.toString() === id.toString())).filter(Boolean).sort((a, b) => a.priority - b.priority)[0];
}

async function saveDataAndRender() {
    renderAll();
    await saveData();
}

// ===============================================
// イベントハンドラ
// ===============================================
function bindGlobalEvents() {
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.popover') && !e.target.closest('[data-action="edit-labels"]')) {
            closeAllPopovers();
        }
    });

    document.getElementById('task-form').addEventListener('submit', async e => {
        e.preventDefault();
        const taskInput = document.getElementById('task-input');
        const taskDueDate = document.getElementById('task-due-date');
        const text = taskInput.value.trim();
        const dates = taskDueDate._flatpickr.selectedDates;
        const selectedLabelIds = Array.from(document.querySelectorAll('#add-task-label-selector .label-checkbox-item.selected input')).map(input => input.value);

        if (!text || dates.length === 0) return;
        
        pushToUndoStack();
        
        const newTask = normalizeTask({
            id: Date.now().toString(),
            text,
            startDate: dates[0].toISOString().split('T')[0],
            endDate: (dates[1] || dates[0]).toISOString().split('T')[0],
            labelIds: selectedLabelIds
        });
        tasks.push(newTask);
        
        await saveDataAndRender();
        
        taskInput.value = '';
        taskDueDate._flatpickr.clear();
        document.querySelectorAll('#add-task-label-selector .label-checkbox-item.selected').forEach(item => item.classList.remove('selected'));
    });

    document.getElementById('task-list-container').addEventListener('click', async e => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        const card = target.closest('.task-card');
        if (!card) return;
        const taskId = card.dataset.taskId;
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        let needsSave = false, needsRender = true;
        pushToUndoStack();

        switch (action) {
            case 'toggle': 
                task.isCollapsed = !task.isCollapsed; 
                break;
            case 'complete': 
                task.completed = !task.completed; 
                needsSave = true; 
                break;
            case 'edit-labels': 
                e.stopPropagation();
                showLabelSelectPopover(target, task); 
                needsRender = false; 
                break;
            case 'delete':
                const getDescendants = id => tasks.filter(t => t.parentId === id).flatMap(c => [c.id, ...getDescendants(c.id)]);
                const descendantIds = getDescendants(taskId);
                if (confirm(`このタスクと${descendantIds.length}個の子タスクを削除しますか？`)) {
                    tasks = tasks.filter(t => ![taskId, ...descendantIds].includes(t.id));
                    needsSave = true;
                } else { 
                    needsRender = false; 
                }
                break;
        }
        if (needsRender) renderAll();
        if (needsSave) await saveData();
    });

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
        if (draggedElement) draggedElement.classList.remove('dragging');
        draggedElement = null;
    });
    document.getElementById('task-list-container').addEventListener('dragover', e => { e.preventDefault(); });
    document.getElementById('task-list-container').addEventListener('drop', async e => {
        e.preventDefault();
        const targetCard = e.target.closest('.task-card');
        if (!targetCard || !draggedElement) return;
        const draggedId = e.dataTransfer.getData('text/plain');
        const targetId = targetCard.dataset.taskId;
        if (draggedId === targetId) return;
        const draggedTask = tasks.find(t => t.id === draggedId);
        let p = targetId; while (p) { if (p === draggedId) { alert('自分の子孫には移動できません。'); return; } p = tasks.find(t => t.id === p)?.parentId; }
        pushToUndoStack();
        draggedTask.parentId = targetId;
        const targetTask = tasks.find(t => t.id === targetId);
        if (targetTask) targetTask.isCollapsed = false;
        await saveDataAndRender();
    });

    document.getElementById('show-list-btn').addEventListener('click', () => switchView('list'));
    document.getElementById('show-calendar-btn').addEventListener('click', () => switchView('calendar'));
    
    document.getElementById('undo-btn').addEventListener('click', handleUndo);
    document.getElementById('redo-btn').addEventListener('click', handleRedo);

    document.getElementById('gemini-trigger-btn').addEventListener('click', handleAiInteraction);
    
    window.addEventListener('resize', () => {
        if (calendar) {
            calendar.changeView(window.innerWidth < 768 ? 'listWeek' : 'dayGridMonth');
            calendar.updateSize();
        }
    });
}

function bindAccordionEvents() {
    document.querySelectorAll('.accordion-toggle').forEach(btn => {
        // イベントリスナーが重複しないように、一度削除してから再設定する
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', function () { 
            this.classList.toggle('active');
            const content = this.nextElementSibling;
            if (content.style.display === 'flex') {
                content.style.display = 'none';
            } else {
                content.style.display = 'flex';
            }
        });
    });
}

function switchView(view) {
    const listView = document.getElementById('list-view');
    const calendarView = document.getElementById('calendar-view');
    const listBtn = document.getElementById('show-list-btn');
    const calendarBtn = document.getElementById('show-calendar-btn');
    const viewTitle = document.getElementById('view-title');

    if (view === 'list') {
        listView.style.display = 'block';
        calendarView.style.display = 'none';
        listBtn.classList.add('active');
        calendarBtn.classList.remove('active');
        viewTitle.textContent = 'タスクリスト';
    } else {
        listView.style.display = 'none';
        calendarView.style.display = 'flex';
        listBtn.classList.remove('active');
        calendarBtn.classList.add('active');
        viewTitle.textContent = 'カレンダー';
        calendar.updateSize();
    }
}

async function handleEventDrop({ event, revert }) {
    const taskId = event.id;
    const task = tasks.find(t => t.id.toString() === taskId.toString());

    if (task) {
        pushToUndoStack();
        const newStartDate = event.start.toISOString().split('T')[0];
        // FullCalendarのall-dayイベントのendはexclusiveなので、1日引く
        const newEndDate = event.end ? new Date(event.end.getTime() - 86400000).toISOString().split('T')[0] : newStartDate;
        
        task.startDate = newStartDate;
        task.endDate = newEndDate;
        
        await saveDataAndRender();
    } else {
        revert();
    }
}

// ===============================================
// Undo/Redo 機能
// ===============================================
function updateUndoRedoButtons() {
    document.getElementById('undo-btn').disabled = undoStack.length === 0;
    document.getElementById('redo-btn').disabled = redoStack.length === 0;
}

function pushToUndoStack() {
    undoStack.push(JSON.parse(JSON.stringify({ tasks, labels })));
    redoStack = []; // Redoスタックはクリア
    updateUndoRedoButtons();
}

async function handleUndo() {
    if (undoStack.length === 0) return;
    redoStack.push(JSON.parse(JSON.stringify({ tasks, labels })));
    const prevState = undoStack.pop();
    tasks = prevState.tasks; 
    labels = prevState.labels;
    await saveDataAndRender();
}

async function handleRedo() {
    if (redoStack.length === 0) return;
    undoStack.push(JSON.parse(JSON.stringify({ tasks, labels })));
    const nextState = redoStack.pop();
    tasks = nextState.tasks; 
    labels = nextState.labels;
    await saveDataAndRender();
}

// ===============================================
// AIアシスタント機能
// ===============================================
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

async function handleAiInteraction() {
    const geminiPrompt = document.getElementById('gemini-prompt');
    const promptText = geminiPrompt.value.trim();
    if (!promptText || !GEMINI_API_KEY) {
        alert("プロンプトを入力してください。");
        return;
    }

    const geminiBtn = document.getElementById('gemini-trigger-btn');
    geminiBtn.disabled = true;
    geminiBtn.querySelector('.default-text').style.display = 'none';
    geminiBtn.querySelector('.loading-indicator').style.display = 'flex';

    try {
        const fullPrompt = buildAiPrompt(promptText);
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] })
        });

        if (!response.ok) throw new Error(`Gemini APIエラー: ${response.status} ${await response.text()}`);
        
        const data = await response.json();
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
             throw new Error('無効なAPIレスポンスです。');
        }
        
        let jsonString = data.candidates[0].content.parts[0].text;
        // --- 修正版: コードブロックのパース処理 ---
        let actions = [];
        // ```json ... ``` もしくは ``` ... ``` のどちらにも対応
        let jsonMatch = jsonString.match(/```json\s*([\s\S]*?)```/i);
        if (!jsonMatch) {
            jsonMatch = jsonString.match(/```\s*([\s\S]*?)```/i);
        }
        if (jsonMatch) {
            try {
                actions = JSON.parse(jsonMatch[1].trim());
            } catch (e) {
                actions = [];
            }
        } else {
            try {
                actions = JSON.parse(jsonString);
            } catch (e) {
                actions = [];
            }
        }
        // ...以降は actions を使う
        if (actions.length > 0) {
            pushToUndoStack();
            processAiActions(actions);
            await saveDataAndRender();
            geminiPrompt.value = '';
        } else {
            alert("AIは実行可能なアクションを見つけられませんでした。");
        }

    } catch (error) {
        alert("AIアシスタントの処理中にエラーが発生しました。");
        console.error(error);
    } finally {
        geminiBtn.disabled = false;
        geminiBtn.querySelector('.default-text').style.display = 'inline';
        geminiBtn.querySelector('.loading-indicator').style.display = 'none';
    }
}

function buildAiPrompt(userInput) {
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
1.  **addTask**: 新しいタスクを追加する。
    - **text**: タスクの内容 (必須)
    - **startDate**: 開始日 (YYYY-MM-DD形式)。指定がなければ今日の日付を推測する。
    - **endDate**: 終了日 (YYYY-MM-DD形式)。指定がなければstartDateと同じ。
    - **labelName**: 既存のラベル名。一致するラベルをタスクに割り当てる。
    - **parentTaskText**: 親タスクのテキスト。指定された場合、そのタスクの子タスクとして作成する。
2.  **updateTask**: 既存のタスクを更新する。
    - **taskText**: 更新対象のタスクのテキスト (必須)。部分一致や曖昧な表現でもOK。
    - **newText**: 新しいタスクのテキスト。
    - **newStartDate**: 新しい開始日。
    - **newEndDate**: 新しい終了日。
    - **completed**: タスクを完了にするか (true/false)。
    - **addLabelName**: タスクに追加する既存のラベル名。
    - **removeLabelName**: タスクから削除する既存のラベル名。
3.  **deleteTask**: 既存のタスクを削除する。
    - **taskText**: 削除対象のタスクのテキスト (必須)。
4.  **addLabel**: 新しいラベルを作成する。
    - **name**: ラベル名 (必須)。
    - **color**: 色 (例: 'red', '#ff0000')。指定がなければ'transparent'。
    - **priority**: 優先度 (1:高, 2:中, 3:低)。指定がなければ既存の最大優先度+1。
5.  **updateLabel**: 既存のラベルを更新する。
    - **labelName**: 更新対象のラベル名 (必須)。
    - **newName**: 新しいラベル名。
    - **newColor**: 新しい色。
    - **newPriority**: 新しい優先度。
6.  **deleteLabel**: 既存のラベルを削除する。
    - **labelName**: 削除対象のラベル名 (必須)。

# 指示
以下のユーザーの指示を解釈し、上記で定義された形式のJSON配列を出力してください。
- 日付の解釈: 「明日」「来週の月曜日」などの相対的な表現は、今日(${today})を基準に解釈してください。
- タスク/ラベルの特定: ユーザーの指定が曖昧な場合は、現在のリストから最も類似しているものを推測してください。
- 応答形式: 必ず \`\`\`json ... \`\`\` のコードブロックで囲んでください。

---
ユーザーの指示: "${userInput}"
---
`;
}

function processAiActions(actions) {
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