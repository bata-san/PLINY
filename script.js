// (ファイルの先頭部分は変更なし)
// ===============================================
// 相棒、この３つを書き換えてくれ！
// ルートBでいくなら、3つ全部必要だ！
// ===============================================
const MASTER_KEY = '$2a$10$l.shMPQkZut9GF8QmO5kjuUe5EuHpRA4sATqrlfXG.lNjF1n0clg.';
const ACCESS_KEY = '$2a$10$h10RX1N2om3YrLjEs313gOKLSH5XN2ov/qECHWf/qoh5ex4Sz3JpG';
const BIN_ID = '685bfb988561e97a502b9056';
const GEMINI_API_KEY = 'AIzaSyD4GPZ85iVlKjbmd-j3DKfbPooGpqlaZtM';
// ===============================================

const API_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const PRESET_COLORS = ['#007bff', '#6610f2', '#6f42c1', '#d63384', '#dc3545', '#fd7e14', '#ffc107', '#198754', '#20c997', '#0dcaf0', '#6e6e73', '#343a40'];

// --- DOM要素の取得 ---
const taskForm = document.getElementById('task-form');
const taskInput = document.getElementById('task-input');
const taskDueDateInput = document.getElementById('task-due-date');
const taskListContainer = document.getElementById('task-list-container');
const calendarContainer = document.getElementById('calendar-container');
const showListBtn = document.getElementById('show-list-btn');
const showCalendarBtn = document.getElementById('show-calendar-btn');
const listView = document.getElementById('list-view');
const calendarView = document.getElementById('calendar-view');
const geminiPrompt = document.getElementById('gemini-prompt');
const geminiTriggerBtn = document.getElementById('gemini-trigger-btn');
const labelEditorList = document.getElementById('label-editor-list');
const labelAddContainer = document.getElementById('label-add-container');
const labelEditorToggle = document.getElementById('label-editor-toggle');
const aiToggleBtn = document.getElementById('ai-toggle-btn');
const labelModal = document.getElementById('label-editor-modal');
const modalTaskText = document.getElementById('modal-task-text');
const modalLabelsContainer = document.getElementById('modal-labels-container');
const modalSaveBtn = document.getElementById('modal-save-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalCloseBtn = document.querySelector('.modal-close-btn');

let tasks = [];
let labels = [];
let calendar;

// --- 初期化処理 ---
const init = () => {
    flatpickr(taskDueDateInput, { mode: "range", dateFormat: "Y-m-d", altInput: true, altFormat: "Y年m月d日", locale: "ja" });
    initializeCalendar();
    addEventListeners();
    loadData();
};

const initializeCalendar = () => {
    calendar = new FullCalendar.Calendar(calendarContainer, {
        initialView: window.innerWidth < 768 ? 'listWeek' : 'dayGridMonth',
        locale: 'ja',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listWeek' },
        height: '100%',
        events: [],
        windowResize: () => { if (window.innerWidth < 768 && calendarView.style.display !== 'none') showListBtn.click(); },
        editable: true,
        eventDrop: async (info) => {
            const task = tasks.find(t => t.id === info.event.id);
            if (!task) { info.revert(); return; }
            const newStartDate = info.event.start.toISOString().split('T')[0];
            let newEndDate;
            if (info.event.end) {
                const inclusiveEndDate = new Date(info.event.end);
                inclusiveEndDate.setDate(inclusiveEndDate.getDate() - 1);
                newEndDate = inclusiveEndDate.toISOString().split('T')[0] === newStartDate ? newStartDate : inclusiveEndDate.toISOString().split('T')[0];
            } else { newEndDate = newStartDate; }
            task.startDate = newStartDate;
            task.endDate = newEndDate;
            await saveData();
            renderTaskList();
        }
    });
    calendar.render();
};

// --- データ連携 (JSONBIN) ---
const loadData = async () => {
    try {
        const response = await fetch(`${API_URL}/latest`, { headers: { 'X-Access-Key': ACCESS_KEY } });
        if (!response.ok) {
            if (response.status === 404) {
                const defaultData = { tasks: [], labels: [ { id: 1, name: "重要", color: "#dc3545", priority: 1 } ] };
                await saveData(defaultData.tasks, defaultData.labels);
                tasks = defaultData.tasks;
                labels = defaultData.labels;
                renderAll();
                return;
            }
            throw new Error(`サーバーエラー: ${response.status}`);
        }
        const data = await response.json();
        const record = data.record || {};
        tasks = Array.isArray(record.tasks) ? record.tasks : [];
        labels = Array.isArray(record.labels) ? record.labels : [];
        renderAll();
    } catch (error) { console.error("読み込み失敗:", error); alert("データの読み込みに失敗しました。"); }
};

const saveData = async (tasksToSave = tasks, labelsToSave = labels) => {
    try {
        const response = await fetch(API_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': MASTER_KEY, 'X-Bin-Versioning': 'false' },
            body: JSON.stringify({ tasks: tasksToSave, labels: labelsToSave })
        });
        if (!response.ok) throw new Error(`保存失敗: ${response.status}`);
        console.log("アジトのデータを更新した！");
    } catch (error) { console.error("保存失敗:", error); alert("データの保存に失敗しました。"); }
};

// --- 描画処理 ---
const renderAll = () => {
    renderTaskList();
    renderCalendar();
    renderLabelEditor();
};

const renderTaskList = () => {
    taskListContainer.innerHTML = '';
    [...tasks].sort((a, b) => new Date(a.startDate) - new Date(b.startDate)).forEach(task => {
        const card = document.createElement('div');
        card.className = `task-card ${task.completed ? 'completed' : ''}`;
        card.dataset.id = task.id;
        const highestPrioLabel = getHighestPriorityLabel(task);
        if (highestPrioLabel && !task.completed) card.style.borderLeftColor = highestPrioLabel.color;
        const dateString = task.startDate === task.endDate ? task.startDate : `${task.startDate} ~ ${task.endDate}`;
        const labelsHtml = (task.labelIds || []).map(labelId => labels.find(l => l.id === labelId)).filter(Boolean).map(label => `<span class="task-label-badge" style="background-color: ${label.color}">${label.name}</span>`).join('');
        card.innerHTML = `<div class="task-header"><p class="task-text">${task.text.replace(/</g, "<").replace(/>/g, ">")}</p><div class="task-labels">${labelsHtml}</div></div><div class="task-footer"><span class="task-due-date">期間: ${dateString}</span><div class="task-actions"><button class="edit-labels-btn">ラベル</button><button class="complete-btn">${task.completed ? '未完了に戻す' : '完了'}</button><button class="delete-btn">削除</button></div></div>`;
        taskListContainer.appendChild(card);
    });
};

const renderCalendar = () => {
    if (!calendar) return;
    const events = tasks.map(task => {
        if (!task.startDate || new Date(task.startDate).toString() === 'Invalid Date') return null;
        const endDate = new Date(task.endDate || task.startDate);
        endDate.setDate(endDate.getDate() + 1);
        if (isNaN(endDate.getTime())) return null;
        const highestPrioLabel = getHighestPriorityLabel(task);
        const eventColor = task.completed ? '#a0a0a0' : (highestPrioLabel ? highestPrioLabel.color : '#007aff');
        return { id: task.id, title: task.text, start: task.startDate, end: endDate.toISOString().split('T')[0], allDay: true, backgroundColor: eventColor, borderColor: eventColor, classNames: task.completed ? ['completed-event'] : [] };
    }).filter(Boolean);
    calendar.getEventSources().forEach(source => source.remove());
    calendar.addEventSource(events);
};

const getPriorityText = (priority) => ({1: '高', 2: '中', 3: '低'})[priority] || '未設定';

const renderLabelEditor = () => {
    labelEditorList.innerHTML = '';
    labels.sort((a, b) => a.priority - b.priority).forEach(label => labelEditorList.appendChild(createLabelItem(label)));
    
    labelAddContainer.innerHTML = '';
    const addTrigger = document.createElement('div');
    addTrigger.className = 'add-new-label-trigger';
    addTrigger.textContent = '＋ 新しいラベルを追加';
    addTrigger.dataset.action = 'add';
    labelAddContainer.appendChild(addTrigger);
};

// ▼▼▼ 修正箇所 ▼▼▼
const createLabelItem = (label) => {
    const isNew = !label.id;
    const item = document.createElement('div');
    item.className = 'label-item';
    if (isNew) {
        item.classList.add('editing');
        item.dataset.id = 'new';
    } else {
        item.dataset.id = label.id;
    }

    const priorityOptions = [1,2,3].map(p => `<option value="${p}" ${label.priority === p ? 'selected' : ''}>${getPriorityText(p)}</option>`).join('');
    
    // SVG Icons
    const ICONS = {
        edit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
        delete: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
        save: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
        cancel: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
    };

    item.innerHTML = `
        <div class="label-item-color-swatch" style="background-color: ${label.color || PRESET_COLORS[0]};">
             <div class="color-palette-dropdown"></div>
        </div>
        <div class="label-item-content">
            <div class="label-item-display">
                <span class="label-name-display">${label.name}</span>
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
        </div>
    `;
    const swatch = item.querySelector('.label-item-color-swatch');
    const palette = item.querySelector('.color-palette-dropdown');
    renderColorPalette(palette, (color) => { swatch.style.backgroundColor = color; });
    return item;
};
// ▲▲▲ 修正箇所 ▲▲▲

const renderColorPalette = (paletteContainer, onColorSelect) => {
    paletteContainer.innerHTML = '';
    PRESET_COLORS.forEach(color => {
        const colorBox = document.createElement('div');
        colorBox.className = 'color-box';
        colorBox.style.backgroundColor = color;
        colorBox.addEventListener('click', (e) => {
            e.stopPropagation();
            onColorSelect(color);
            paletteContainer.classList.remove('active');
        });
        paletteContainer.appendChild(colorBox);
    });
};

// --- ヘルパー関数 ---
const getHighestPriorityLabel = (task) => {
    if (!task.labelIds || task.labelIds.length === 0) return null;
    return task.labelIds.map(id => labels.find(l => l.id === id)).filter(Boolean).sort((a, b) => a.priority - b.priority)[0];
};

const openLabelModal = (taskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    modalTaskText.textContent = task.text;
    labelModal.dataset.taskId = taskId;
    modalLabelsContainer.innerHTML = '';
    [...labels].sort((a,b) => a.priority - b.priority).forEach(label => {
        const isChecked = task.labelIds && task.labelIds.includes(label.id);
        const item = document.createElement('div');
        item.className = 'label-checkbox-item';
        item.innerHTML = `<input type="checkbox" id="label-check-${label.id}" value="${label.id}" ${isChecked ? 'checked' : ''}><label for="label-check-${label.id}"><div class="label-item-color" style="background-color:${label.color}"></div><span>${label.name} (優先度: ${getPriorityText(label.priority)})</span></label>`;
        modalLabelsContainer.appendChild(item);
    });
    labelModal.style.display = 'flex';
};

const closeLabelModal = () => { labelModal.style.display = 'none'; };

// --- イベントリスナー ---
const addEventListeners = () => {
    taskForm.addEventListener('submit', async (e) => { e.preventDefault(); const text = taskInput.value.trim(); const dates = taskDueDateInput._flatpickr.selectedDates; if (text && dates.length > 0) { const startDate = dates[0].toISOString().split('T')[0]; const endDate = dates.length > 1 ? dates[1].toISOString().split('T')[0] : startDate; tasks.push({ id: Date.now().toString(), text, startDate, endDate, completed: false, labelIds: [] }); taskForm.reset(); taskDueDateInput._flatpickr.clear(); renderAll(); await saveData(); } });
    taskListContainer.addEventListener('click', async (e) => { const card = e.target.closest('.task-card'); if (!card) return; const taskId = card.dataset.id; const taskIndex = tasks.findIndex(t => t.id === taskId); if (taskIndex === -1) return; let needsSave = false; if (e.target.classList.contains('complete-btn')) { tasks[taskIndex].completed = !tasks[taskIndex].completed; needsSave = true; } else if (e.target.classList.contains('delete-btn')) { tasks.splice(taskIndex, 1); needsSave = true; } else if (e.target.classList.contains('edit-labels-btn')) { openLabelModal(taskId); } if (needsSave) { renderAll(); await saveData(); } });
    showListBtn.addEventListener('click', () => { listView.style.display = 'block'; calendarView.style.display = 'none'; showListBtn.classList.add('active'); showCalendarBtn.classList.remove('active'); });
    showCalendarBtn.addEventListener('click', () => { listView.style.display = 'none'; calendarView.style.display = 'block'; showListBtn.classList.remove('active'); showCalendarBtn.classList.add('active'); calendar.render(); });
    [labelEditorToggle, aiToggleBtn].forEach(btn => { btn.addEventListener('click', () => { btn.classList.toggle('active'); btn.nextElementSibling.style.display = btn.nextElementSibling.style.display === 'none' ? 'block' : 'none'; }); });

    const handleLabelAction = async (item, action) => {
        if (action === 'add') {
            if (document.querySelector('.label-item[data-id="new"]')) return;
            labelEditorList.prepend(createLabelItem({ priority: 2, name: '', color: PRESET_COLORS[0] }));
            return;
        }
        if (!item) return;
        const id = item.dataset.id === 'new' ? 'new' : parseInt(item.dataset.id, 10);
        switch (action) {
            case 'edit': item.classList.add('editing'); break;
            case 'cancel': (id === 'new') ? item.remove() : renderLabelEditor(); break;
            case 'save':
                const name = item.querySelector('.label-name-input').value.trim();
                if (!name) { alert("ラベル名は必須です。"); item.querySelector('.label-name-input').focus(); return; }
                const priority = parseInt(item.querySelector('.label-prio-select').value, 10);
                const color = item.querySelector('.label-item-color-swatch').style.backgroundColor;
                if (id === 'new') { labels.push({ id: Date.now(), name, priority, color }); }
                else { const label = labels.find(l => l.id === id); if (label) Object.assign(label, { name, priority, color }); }
                await saveData();
                renderAll();
                break;
            case 'delete':
                const labelToDelete = labels.find(l => l.id === id);
                if (labelToDelete && confirm(`ラベル「${labelToDelete.name}」を削除しますか？`)) {
                    labels = labels.filter(l => l.id !== id);
                    tasks.forEach(task => { if (task.labelIds) task.labelIds = task.labelIds.filter(labelId => labelId !== id); });
                    await saveData();
                    renderAll();
                }
                break;
        }
    };
    
    labelAddContainer.addEventListener('click', (e) => { const trigger = e.target.closest('[data-action="add"]'); if (trigger) handleLabelAction(null, 'add'); });
    labelEditorList.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action]');
        const item = e.target.closest('.label-item');
        if (button && item) { e.stopPropagation(); handleLabelAction(item, button.dataset.action); return; }
        const swatch = e.target.closest('.label-item-color-swatch');
        if (swatch && item.classList.contains('editing')) {
            const palette = swatch.querySelector('.color-palette-dropdown');
            document.querySelectorAll('.color-palette-dropdown.active').forEach(p => p !== palette && p.classList.remove('active'));
            palette.classList.toggle('active');
        }
    });
    
    // (以降のイベントリスナーは変更なし)
    modalSaveBtn.addEventListener('click', async () => { const taskId = labelModal.dataset.taskId; const task = tasks.find(t => t.id === taskId); if (task) { task.labelIds = Array.from(modalLabelsContainer.querySelectorAll('input:checked')).map(input => parseInt(input.value, 10)); renderAll(); await saveData(); } closeLabelModal(); });
    modalCancelBtn.addEventListener('click', closeLabelModal);
    modalCloseBtn.addEventListener('click', closeLabelModal);
    geminiTriggerBtn.addEventListener('click', async () => { const promptText = geminiPrompt.value.trim(); if (!promptText || !GEMINI_API_KEY) { alert("プロンプトを入力するか、GeminiのAPIキーを設定してください。"); return; } geminiTriggerBtn.disabled = true; geminiTriggerBtn.querySelector('.default-text').style.display = 'none'; geminiTriggerBtn.querySelector('.loading-indicator').style.display = 'flex'; try { const fullPrompt = `あなたはタスク管理アシスタントです。以下の文章からタスクを抽出し、JSON形式の配列で出力してください。各タスクオブジェクトには "text", "startDate", "endDate" のキーを含めてください。endDateが指定されていない、または1日のタスクの場合は、startDateと同じ日付にしてください。日付は必ず "YYYY-MM-DD" 形式で出力してください。「来週」「明日」などの相対的な日付は、今日の日付（${new Date().toISOString().split('T')[0]}）を基準に計算してください。出力は \`\`\`json ... \`\`\` の形式で囲んでください。\n\n---\n\n${promptText}`; const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] }) }); if (!response.ok) throw new Error(`Gemini APIエラー: ${response.status} ${await response.text()}`); const data = await response.json(); let jsonString = data.candidates[0].content.parts[0].text; const jsonMatch = jsonString.match(/```json([\s\S]*?)```/); jsonString = jsonMatch ? jsonMatch[1].trim() : jsonString.substring(jsonString.indexOf('['), jsonString.lastIndexOf(']') + 1); const newTasks = JSON.parse(jsonString); newTasks.forEach(task => { if(task.text && task.startDate) { const startDate = task.startDate; const endDate = task.endDate || startDate; tasks.push({ id: Date.now().toString() + Math.random(), text: task.text, startDate, endDate, completed: false, labelIds: [] }); }}); renderAll(); await saveData(); geminiPrompt.value = ''; } catch (error) { console.error("Gemini処理エラー:", error); alert("タスクの自動生成に失敗しました。コンソールでエラー内容を確認してください。"); } finally { geminiTriggerBtn.disabled = false; geminiTriggerBtn.querySelector('.default-text').style.display = 'inline'; geminiTriggerBtn.querySelector('.loading-indicator').style.display = 'none'; } });
};

// --- 起動 ---
init();