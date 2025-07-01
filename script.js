// ===============================================
// 定数
// ===============================================
const WORKER_URL = 'https://pliny-worker.youguitest.workers.dev'; // ローカル開発時は localhost、デプロイ後は実際のWorker URLに変更
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
let currentDataVersion = null; // バージョン管理用

// ===============================================
// 初期化処理
// ===============================================
document.addEventListener('DOMContentLoaded', () => {
    // flatpickrを確実に初期化
    initializeFlatpickr();
    initializeCalendar();
    initializeIcons();
    bindGlobalEvents();
    loadData();
});

function initializeFlatpickr() {
    const dueDateInput = document.getElementById('task-due-date');
    if (!dueDateInput) {
        console.error('task-due-date要素が見つかりません');
        return;
    }

    // 既存のflatpickrインスタンスを破棄
    if (dueDateInput._flatpickr) {
        dueDateInput._flatpickr.destroy();
    }

    // 新しいflatpickrインスタンスを作成
    dueDateInput._flatpickr = flatpickr(dueDateInput, {
        mode: "range",
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "Y年m月d日",
        locale: "ja",
        minDate: "today",
        allowInput: false,
        clickOpens: true,
        onChange: function(selectedDates, dateStr, instance) {
            console.log('日付が選択されました:', selectedDates);
        }
    });

    console.log('flatpickr初期化完了:', dueDateInput._flatpickr);
}

function initializeIcons() {
    document.getElementById('undo-btn').innerHTML = ICONS.undo;
    document.getElementById('redo-btn').innerHTML = ICONS.redo;
}

function initializeCalendar() {
    const calendarContainer = document.getElementById('calendar-container');
    if (!calendarContainer) {
        console.error('calendar-container要素が見つかりません');
        return;
    }

    calendar = new FullCalendar.Calendar(calendarContainer, {
        initialView: window.innerWidth < 768 ? 'listWeek' : 'dayGridMonth',
        locale: 'ja',
        headerToolbar: { 
            left: 'prev,next today', 
            center: 'title', 
            right: 'dayGridMonth,timeGridWeek,listWeek' 
        },
        height: '100%',
        events: [],
        editable: true,
        eventDrop: handleEventDrop,
        eventResize: handleEventResize,
        eventDurationEditable: true,
        eventStartEditable: true,
        dragScroll: true,
        eventDisplay: 'block',
        dayMaxEvents: false,
        // 期間イベントの移動を適切に処理するための設定
        selectMirror: true,
        dayMaxEventRows: false,
        // 重要: イベントの移動時に期間を保持するための設定
        eventConstraint: {
            start: '1900-01-01',
            end: '2100-12-31'
        },
        // ドラッグ中の視覚的フィードバックを改善
        eventOverlap: true,
        selectOverlap: true
    });
    
    calendar.render();
    console.log('カレンダー初期化完了');
}

async function loadData() {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    try {
        const res = await fetch(`${WORKER_URL}/api/data`);
        if (!res.ok) {
            throw new Error(`サーバーエラー: ${res.status}`);
        }
        
        const data = await res.json();
        currentDataVersion = data.version;
        tasks = Array.isArray(data.tasks) ? data.tasks.map(normalizeTask) : [];
        labels = Array.isArray(data.labels) ? data.labels : [];
        renderAll();
    } catch (e) {
        alert("データの読み込みに失敗しました。"); 
        console.error(e);
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

async function saveData(tasksToSave = tasks, labelsToSave = labels, isInitialSave = false) {
    if (!Array.isArray(tasksToSave) || !Array.isArray(labelsToSave)) {
        console.error('saveData: 無効なデータ形式');
        return;
    }

    const normalizedTasks = tasksToSave.map(task => {
        try {
            return normalizeTask(task);
        } catch (error) {
            console.warn('タスクの正規化に失敗:', task, error);
            return null;
        }
    }).filter(Boolean);

    const validatedLabels = labelsToSave.filter(label => {
        return label && typeof label.id !== 'undefined' && typeof label.name === 'string';
    });

    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
        try {
            const requestBody = {
                tasks: normalizedTasks,
                labels: validatedLabels
            };

            if (!isInitialSave && currentDataVersion) {
                requestBody.expectedVersion = currentDataVersion;
            }

            const res = await fetch(`${WORKER_URL}/api/data`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (res.status === 409) {
                console.warn('データの競合が検出されました');
                if (confirm("データの競合が発生しました。他の端末でデータが更新された可能性があります。最新のデータを読み込み直しますか？")) {
                    await loadData();
                }
                return;
            } else if (!res.ok) {
                throw new Error(`保存失敗: ${res.status} ${res.statusText}`);
            }

            const result = await res.json();
            currentDataVersion = result.version;
            console.log('データ保存成功');
            return;

        } catch (error) {
            retryCount++;
            console.error(`保存試行 ${retryCount}/${maxRetries} 失敗:`, error);
            
            if (retryCount >= maxRetries) {
                console.error('最大リトライ回数に達しました');
                if (confirm("データの保存に失敗しました。ページをリロードしますか？")) {
                    window.location.reload();
                }
                break;
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        }
    }
}

// ===============================================
// 描画処理
// ===============================================
function renderAll() {
    try {
        // レンダリング前の状態チェック
        if (!Array.isArray(tasks)) {
            console.error('tasksが配列ではありません');
            tasks = [];
        }
        if (!Array.isArray(labels)) {
            console.error('labelsが配列ではありません');
            labels = [];
        }

        renderTaskList();
        renderCalendar();
        renderLabelEditor();
        renderAddTaskLabelSelector();
        updateUndoRedoButtons();
        bindAccordionEvents();
        
        console.log('全コンポーネントのレンダリング完了');
    } catch (error) {
        console.error('レンダリング中にエラーが発生:', error);
        // 部分的なレンダリングを試行
        try {
            renderTaskList();
        } catch (e) {
            console.error('タスクリストのレンダリングに失敗:', e);
        }
        try {
            renderLabelEditor();
        } catch (e) {
            console.error('ラベルエディタのレンダリングに失敗:', e);
        }
    }
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
    if (!calendar) {
        console.warn('カレンダーが初期化されていません');
        return;
    }

    try {
        // 既存のイベントソースをクリア
        calendar.getEventSources().forEach(source => {
            source.remove();
        });

        // タスクをカレンダーイベントに変換
        const events = tasks.map(task => {
            if (!task.startDate) {
                console.warn('開始日がないタスクをスキップ:', task);
                return null;
            }

            // より正確な日付処理 - タイムゾーンの問題を回避
            const startDate = task.startDate;
            const endDate = task.endDate || task.startDate;
            
            // FullCalendarのallDayイベントでは、終了日は排他的（exclusive）
            // つまり、endDateに1日追加する必要がある
            const exclusiveEndDate = new Date(endDate + 'T00:00:00');
            exclusiveEndDate.setDate(exclusiveEndDate.getDate() + 1);
            const exclusiveEndDateStr = exclusiveEndDate.toISOString().split('T')[0];

            const highestPrioLabel = getHighestPriorityLabel(task);
            const eventColor = task.completed ? '#adb5bd' : (highestPrioLabel ? highestPrioLabel.color : '#007aff');

            const calendarEvent = {
                id: task.id,
                title: task.text,
                start: startDate, // YYYY-MM-DD形式のまま
                end: exclusiveEndDateStr, // YYYY-MM-DD形式
                allDay: true,
                backgroundColor: eventColor,
                borderColor: eventColor,
                classNames: task.completed ? ['completed-event'] : [],
                extendedProps: {
                    originalTask: task,
                    originalStartDate: startDate,
                    originalEndDate: endDate
                }
            };

            console.log('カレンダーイベント作成:', {
                taskId: task.id,
                taskStart: startDate,
                taskEnd: endDate,
                eventStart: calendarEvent.start,
                eventEnd: calendarEvent.end
            });

            return calendarEvent;
        }).filter(Boolean);

        console.log('カレンダーイベント作成完了:', events.length + '件');

        // 新しいイベントソースを追加
        calendar.addEventSource(events);

    } catch (error) {
        console.error('カレンダーレンダリングエラー:', error);
    }
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
    if (!task || typeof task !== 'object') {
        throw new Error('無効なタスクオブジェクト');
    }

    const today = new Date().toISOString().split('T')[0];
    
    // 日付の妥当性チェック
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
        endDate: endDate >= startDate ? endDate : startDate, // 終了日が開始日より前の場合は修正
        completed: Boolean(task.completed),
        labelIds: Array.isArray(task.labelIds) ? task.labelIds.filter(id => id != null) : [],
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
    // 1. グローバルクリックイベント
    document.addEventListener('click', (e) => {
        try {
            if (!e.target.closest('.popover') && !e.target.closest('[data-action="edit-labels"]')) {
                closeAllPopovers();
            }
        } catch (error) {
            console.error('クリックイベント処理エラー:', error);
        }
    });

    // 2. タスクフォームのイベントハンドラー（重複を防ぐため一度だけ設定）
    setupTaskFormEvents();

    // 3. その他のイベントハンドラー
    setupTaskListEvents();
    setupViewSwitcherEvents();
    setupUndoRedoEvents();
    setupAiEvents();
    setupDataManagerEvents();
    setupWindowEvents();
}

function setupTaskFormEvents() {
    const taskForm = document.getElementById('task-form');
    if (!taskForm) {
        console.error('task-form要素が見つかりません');
        return;
    }

    // フォームを複製せずに、既存のイベントリスナーのみクリア
    // 新しいアプローチ: 既存のsubmitイベントリスナーをremoveEventListenerで削除
    const existingHandler = taskForm.onsubmit;
    if (existingHandler) {
        taskForm.removeEventListener('submit', existingHandler);
    }

    // flatpickrを再初期化（要素を複製しないため、既存のインスタンスをそのまま利用）
    initializeFlatpickr();

    // フォーム送信イベント
    const formSubmitHandler = async (e) => {
        e.preventDefault();
        
        try {
            const taskInput = document.getElementById('task-input');
            const taskDueDate = document.getElementById('task-due-date');
            
            if (!taskInput || !taskDueDate) {
                throw new Error('必要な入力要素が見つかりません');
            }

            const text = taskInput.value.trim();
            if (!text) {
                alert('タスク名を入力してください。');
                return;
            }

            // flatpickrインスタンスの確認
            if (!taskDueDate._flatpickr) {
                console.log('flatpickrを再初期化します');
                initializeFlatpickr();
                if (!taskDueDate._flatpickr) {
                    throw new Error('日付選択器が初期化できませんでした');
                }
            }

            const dates = taskDueDate._flatpickr.selectedDates;
            if (dates.length === 0) {
                alert('期間を選択してください。');
                return;
            }

            const selectedLabelIds = Array.from(document.querySelectorAll('#add-task-label-selector .label-checkbox-item.selected input'))
                .map(input => input.value)
                .filter(Boolean);

            console.log('タスク作成開始:', { text, dates, selectedLabelIds });

            pushToUndoStack();
            
            // 日付をタイムゾーンを考慮して正確に変換
            const formatDate = (date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            const newTask = normalizeTask({
                id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                text,
                startDate: formatDate(dates[0]),
                endDate: formatDate(dates[1] || dates[0]),
                labelIds: selectedLabelIds
            });
            
            tasks.push(newTask);
            await saveDataAndRender();
            
            // フォームのクリア
            taskInput.value = '';
            taskDueDate._flatpickr.clear();
            document.querySelectorAll('#add-task-label-selector .label-checkbox-item.selected')
                .forEach(item => item.classList.remove('selected'));

            console.log('タスク作成完了:', newTask);
                
        } catch (error) {
            console.error('タスク追加エラー:', error);
            alert('タスクの追加に失敗しました。再度お試しください。');
        }
    };

    // 新しいイベントリスナーを追加
    taskForm.addEventListener('submit', formSubmitHandler);
}

function setupTaskListEvents() {
    const taskListContainer = document.getElementById('task-list-container');
    if (!taskListContainer) return;

    // 既存のイベントリスナーを削除
    const newContainer = taskListContainer.cloneNode(true);
    taskListContainer.parentNode.replaceChild(newContainer, taskListContainer);

    // クリックイベント
    newContainer.addEventListener('click', async (e) => {
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

        try {
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

        } catch (error) {
            console.error('タスクアクション処理エラー:', error);
            alert('操作に失敗しました。再度お試しください。');
        }
    });

    // ドラッグ&ドロップイベント
    setupDragAndDropEvents(newContainer);
}

function setupDragAndDropEvents(container) {
    let draggedElement = null;
    
    container.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.task-card');
        if (card) {
            draggedElement = card;
            e.dataTransfer.setData('text/plain', card.dataset.taskId);
            setTimeout(() => card.classList.add('dragging'), 0);
        }
    });
    
    container.addEventListener('dragend', () => {
        if (draggedElement) {
            draggedElement.classList.remove('dragging');
            draggedElement = null;
        }
    });
    
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    
    container.addEventListener('drop', async (e) => {
        e.preventDefault();
        const targetCard = e.target.closest('.task-card');
        if (!targetCard || !draggedElement) return;
        
        const draggedId = e.dataTransfer.getData('text/plain');
        const targetId = targetCard.dataset.taskId;
        if (draggedId === targetId) return;
        
        const draggedTask = tasks.find(t => t.id === draggedId);
        if (!draggedTask) return;

        // 循環参照チェック
        let p = targetId;
        while (p) {
            if (p === draggedId) {
                alert('自分の子孫には移動できません。');
                return;
            }
            p = tasks.find(t => t.id === p)?.parentId;
        }
        
        try {
            pushToUndoStack();
            draggedTask.parentId = targetId;
            
            const targetTask = tasks.find(t => t.id === targetId);
            if (targetTask) targetTask.isCollapsed = false;
            
            await saveDataAndRender();
        } catch (error) {
            console.error('ドラッグ&ドロップエラー:', error);
            alert('移動に失敗しました。');
        }
    });
}

function setupViewSwitcherEvents() {
    document.getElementById('show-list-btn')?.addEventListener('click', () => switchView('list'));
    document.getElementById('show-calendar-btn')?.addEventListener('click', () => switchView('calendar'));
}

function setupUndoRedoEvents() {
    document.getElementById('undo-btn')?.addEventListener('click', handleUndo);
    document.getElementById('redo-btn')?.addEventListener('click', handleRedo);
}

function setupDataManagerEvents() {
    // 生JSONデータの表示
    document.getElementById('load-raw-data-btn')?.addEventListener('click', async () => {
        try {
            const response = await fetch(`${WORKER_URL}/api/kv/raw`);
            if (!response.ok) {
                throw new Error(`データ取得エラー: ${response.status}`);
            }
            const rawData = await response.text();
            
            const editor = document.getElementById('raw-data-editor');
            const buttons = document.getElementById('raw-data-buttons');
            
            editor.value = JSON.stringify(JSON.parse(rawData || '{}'), null, 2);
            editor.style.display = 'block';
            buttons.style.display = 'flex';
        } catch (error) {
            alert(`データの取得に失敗しました: ${error.message}`);
        }
    });

    // 生JSONデータの保存
    document.getElementById('save-raw-data-btn')?.addEventListener('click', async () => {
        try {
            const editor = document.getElementById('raw-data-editor');
            const rawData = editor.value;
            
            // JSONの妥当性をチェック
            JSON.parse(rawData);
            
            const response = await fetch(`${WORKER_URL}/api/kv/raw`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: rawData
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || `保存エラー: ${response.status}`);
            }
            
            alert('データが正常に保存されました');
            
            // エディターを隠して、データを再読み込み
            editor.style.display = 'none';
            document.getElementById('raw-data-buttons').style.display = 'none';
            await loadData();
        } catch (error) {
            alert(`データの保存に失敗しました: ${error.message}`);
        }
    });

    // 生JSONデータ編集のキャンセル
    document.getElementById('cancel-raw-edit-btn')?.addEventListener('click', () => {
        const editor = document.getElementById('raw-data-editor');
        const buttons = document.getElementById('raw-data-buttons');
        
        editor.style.display = 'none';
        buttons.style.display = 'none';
        editor.value = '';
    });

    // JSONBinからのインポート
    document.getElementById('import-jsonbin-btn')?.addEventListener('click', async () => {
        try {
            const urlInput = document.getElementById('jsonbin-url');
            const mergeCheckbox = document.getElementById('merge-with-existing');
            
            const jsonbinUrl = urlInput.value.trim();
            if (!jsonbinUrl) {
                alert('JSONBin URLを入力してください');
                return;
            }
            
            const response = await fetch(`${WORKER_URL}/api/import/jsonbin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonbinUrl: jsonbinUrl,
                    mergeWithExisting: mergeCheckbox.checked
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || `インポートエラー: ${response.status}`);
            }
            
            const result = await response.json();
            alert(`インポートが完了しました！\n\nインポート数:\n- タスク: ${result.imported.tasks}個\n- ラベル: ${result.imported.labels}個\n\n最終データ数:\n- タスク: ${result.final.tasks}個\n- ラベル: ${result.final.labels}個`);
            
            // フォームをクリア
            urlInput.value = '';
            mergeCheckbox.checked = false;
            
            // データを再読み込み
            await loadData();
        } catch (error) {
            alert(`インポートに失敗しました: ${error.message}`);
        }
    });
}

function setupAiEvents() {
    document.getElementById('gemini-trigger-btn')?.addEventListener('click', handleAiInteraction);
}

function setupWindowEvents() {
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
    console.log('イベントドロップ開始:', { 
        eventId: event.id, 
        start: event.start, 
        end: event.end,
        startString: event.startStr,
        endString: event.endStr
    });

    const taskId = event.id;
    const task = tasks.find(t => t.id.toString() === taskId.toString());

    if (!task) {
        console.warn(`タスクが見つかりません: ${taskId}`);
        revert();
        return;
    }

    try {
        pushToUndoStack();
        
        // 元のタスクの期間を計算
        const originalStart = new Date(task.startDate + 'T00:00:00');
        const originalEnd = new Date(task.endDate + 'T00:00:00');
        const originalDuration = Math.floor((originalEnd - originalStart) / (1000 * 60 * 60 * 24)); // 日数
        
        // 新しい開始日を取得（タイムゾーンを考慮）
        let newStartDate;
        if (event.startStr) {
            newStartDate = event.startStr;
        } else {
            const startDate = new Date(event.start);
            newStartDate = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
        }

        // 新しい終了日を計算 - 元の期間を保持
        const newStart = new Date(newStartDate + 'T00:00:00');
        const newEnd = new Date(newStart.getTime());
        newEnd.setDate(newEnd.getDate() + originalDuration);
        const newEndDate = `${newEnd.getFullYear()}-${String(newEnd.getMonth() + 1).padStart(2, '0')}-${String(newEnd.getDate()).padStart(2, '0')}`;

        console.log('日付変更の詳細:', {
            taskId,
            originalStart: task.startDate,
            originalEnd: task.endDate,
            originalDuration: originalDuration,
            newStartDate: newStartDate,
            newEndDate: newEndDate,
            preservedDuration: Math.floor((new Date(newEndDate + 'T00:00:00') - new Date(newStartDate + 'T00:00:00')) / (1000 * 60 * 60 * 24))
        });

        task.startDate = newStartDate;
        task.endDate = newEndDate;

        await saveDataAndRender();
        
        console.log('タスクの日程変更完了');

    } catch (error) {
        console.error('タスクの日程変更中にエラーが発生:', error);
        revert();
        alert('タスクの日程変更に失敗しました。再度お試しください。');
    }
}

async function handleEventResize({ event, revert }) {
    console.log('イベントリサイズ開始:', { 
        eventId: event.id, 
        start: event.start, 
        end: event.end,
        startString: event.startStr,
        endString: event.endStr
    });

    const taskId = event.id;
    const task = tasks.find(t => t.id.toString() === taskId.toString());

    if (!task) {
        console.warn(`タスクが見つかりません: ${taskId}`);
        revert();
        return;
    }

    try {
        pushToUndoStack();
        
        // 開始日と終了日の計算（タイムゾーンを考慮）
        let newStartDate, newEndDate;
        
        if (event.startStr) {
            newStartDate = event.startStr;
        } else {
            const startDate = new Date(event.start);
            newStartDate = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
        }

        if (event.endStr) {
            // endStrが存在する場合はそれを使用（FullCalendarの排他的終了日を調整）
            const endDate = new Date(event.endStr + 'T00:00:00');
            endDate.setDate(endDate.getDate() - 1);
            newEndDate = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
        } else if (event.end) {
            // event.endを使用する場合
            const endDate = new Date(event.end);
            endDate.setDate(endDate.getDate() - 1); // FullCalendarの排他的終了日を調整
            newEndDate = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
        } else {
            newEndDate = newStartDate;
        }

        // 日付の妥当性チェック
        if (newEndDate < newStartDate) {
            newEndDate = newStartDate;
        }

        console.log('リサイズの詳細:', {
            taskId,
            originalStart: task.startDate,
            originalEnd: task.endDate,
            newStart: newStartDate,
            newEnd: newEndDate
        });

        task.startDate = newStartDate;
        task.endDate = newEndDate;

        await saveDataAndRender();
        
        console.log('タスクのリサイズ完了');

    } catch (error) {
        console.error('タスクのリサイズ中にエラーが発生:', error);
        revert();
        alert('タスクのリサイズに失敗しました。再度お試しください。');
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
    if (!promptText) {
        alert("プロンプトを入力してください。");
        return;
    }

    const geminiBtn = document.getElementById('gemini-trigger-btn');
    geminiBtn.disabled = true;
    geminiBtn.querySelector('.default-text').style.display = 'none';
    geminiBtn.querySelector('.loading-indicator').style.display = 'flex';

    try {
        const response = await fetch(`${WORKER_URL}/api/ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: promptText })
        });

        if (!response.ok) {
            throw new Error(`AI APIエラー: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.actions && data.actions.length > 0) {
            pushToUndoStack();
            tasks = data.tasks;
            labels = data.labels;
            renderAll();
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