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
const modalCloseBtn = labelModal.querySelector('.modal-close-btn');
const parentModal = document.getElementById('parent-selector-modal');
const parentModalTaskText = document.getElementById('parent-modal-task-text');
const parentTaskSelect = document.getElementById('parent-task-select');
const parentModalSaveBtn = document.getElementById('parent-modal-save-btn');
const parentModalCancelBtn = document.getElementById('parent-modal-cancel-btn');
const parentModalCloseBtn = parentModal.querySelector('.modal-close-btn');

let tasks = [];
let labels = [];
let calendar;

// --- ヘルパー関数 (グローバルスコープ) ---
const getPriorityText = (priority) => ({1: '高', 2: '中', 3: '低'})[priority] || '未設定';
const getHighestPriorityLabel = (task) => { if (!task.labelIds || task.labelIds.length === 0) return null; return task.labelIds.map(id => labels.find(l => l.id === id)).filter(Boolean).sort((a, b) => a.priority - b.priority)[0]; };
const getDescendants = (id) => { let descendants = []; const children = tasks.filter(t => t.parentId === id); children.forEach(child => { descendants.push(child.id); descendants = descendants.concat(getDescendants(child.id)); }); return descendants; };

// --- 初期化処理 ---
const init = () => { flatpickr(taskDueDateInput, { mode: "range", dateFormat: "Y-m-d", altInput: true, altFormat: "Y年m月d日", locale: "ja" }); initializeCalendar(); addEventListeners(); loadData(); };

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
            const taskId = info.event.id; const delta = info.delta; const mainTask = tasks.find(t => t.id === taskId);
            if (!mainTask) { info.revert(); return; }
            const moveDate = (dateStr, delta) => { const d = new Date(dateStr); d.setDate(d.getDate() + (delta.days || 0)); d.setMonth(d.getMonth() + (delta.months || 0)); d.setFullYear(d.getFullYear() + (delta.years || 0)); return d.toISOString().split('T')[0]; };
            mainTask.startDate = moveDate(mainTask.startDate, delta);
            mainTask.endDate = moveDate(mainTask.endDate, delta);
            const children = tasks.filter(t => t.parentId === taskId);
            children.forEach(child => { child.startDate = moveDate(child.startDate, delta); child.endDate = moveDate(child.endDate, delta); });
            await saveData(); renderAll();
        }
    });
    calendar.render();
};

// --- データ連携 (JSONBIN) ---
const loadData = async () => { try { const response = await fetch(`${API_URL}/latest`, { headers: { 'X-Access-Key': ACCESS_KEY } }); if (!response.ok) { if (response.status === 404) { const defaultData = { tasks: [], labels: [ { id: 1, name: "重要", color: "#dc3545", priority: 1 } ] }; await saveData(defaultData.tasks, defaultData.labels); tasks = defaultData.tasks; labels = defaultData.labels; renderAll(); return; } throw new Error(`サーバーエラー: ${response.status}`); } const data = await response.json(); const record = data.record || {}; tasks = Array.isArray(record.tasks) ? record.tasks : []; labels = Array.isArray(record.labels) ? record.labels : []; renderAll(); } catch (error) { console.error("読み込み失敗:", error); alert("データの読み込みに失敗しました。"); } };
const saveData = async (tasksToSave = tasks, labelsToSave = labels) => { try { const response = await fetch(API_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': MASTER_KEY, 'X-Bin-Versioning': 'false' }, body: JSON.stringify({ tasks: tasksToSave, labels: labelsToSave }) }); if (!response.ok) throw new Error(`保存失敗: ${response.status}`); console.log("アジトのデータを更新した！"); } catch (error) { console.error("保存失敗:", error); alert("データの保存に失敗しました。"); } };

// --- 描画処理 ---
const renderAll = () => { renderTaskList(); renderCalendar(); renderLabelEditor(); };
const renderTaskList = () => { taskListContainer.innerHTML = ''; const tasksByParent = tasks.reduce((acc, task) => { const parentId = task.parentId || 'root'; if (!acc[parentId]) acc[parentId] = []; acc[parentId].push(task); return acc; }, {}); const renderTaskRecursive = (parentId, level = 0) => { const childTasks = (tasksByParent[parentId] || []).sort((a,b) => new Date(a.startDate) - new Date(b.startDate)); childTasks.forEach(task => { const card = document.createElement('div'); card.className = `task-card ${task.completed ? 'completed' : ''}`; card.dataset.id = task.id; if (level > 0) card.classList.add('is-child'); const highestPrioLabel = getHighestPriorityLabel(task); if (highestPrioLabel && !task.completed) card.style.borderLeftColor = highestPrioLabel.color; const dateString = task.startDate === task.endDate ? task.startDate : `${task.startDate} ~ ${task.endDate}`; const labelsHtml = (task.labelIds || []).map(labelId => labels.find(l => l.id === labelId)).filter(Boolean).map(label => `<span class="task-label-badge" style="background-color: ${label.color}">${label.name}</span>`).join(''); card.innerHTML = `<div class="task-header"><p class="task-text">${task.text.replace(/</g, "<").replace(/>/g, ">")}</p><div class="task-labels">${labelsHtml}</div></div><div class="task-footer"><span class="task-due-date">期間: ${dateString}</span><div class="task-actions"><button class="set-parent-btn" data-action="set-parent">親子設定</button><button class="edit-labels-btn" data-action="edit-labels">ラベル</button><button class="complete-btn" data-action="complete">${task.completed ? '未完了' : '完了'}</button><button class="delete-btn" data-action="delete">削除</button></div></div>`; taskListContainer.appendChild(card); renderTaskRecursive(task.id, level + 1); }); }; renderTaskRecursive('root'); };
const renderCalendar = () => { if (!calendar) return; const events = tasks.map(task => { if (!task.startDate || new Date(task.startDate).toString() === 'Invalid Date') return null; const endDate = new Date(task.endDate || task.startDate); endDate.setDate(endDate.getDate() + 1); if (isNaN(endDate.getTime())) return null; const highestPrioLabel = getHighestPriorityLabel(task); const eventColor = task.completed ? '#a0a0a0' : (highestPrioLabel ? highestPrioLabel.color : '#007aff'); return { id: task.id, title: task.text, start: task.startDate, end: endDate.toISOString().split('T')[0], allDay: true, backgroundColor: eventColor, borderColor: eventColor, classNames: task.completed ? ['completed-event'] : [] }; }).filter(Boolean); calendar.getEventSources().forEach(source => source.remove()); calendar.addEventSource(events); };
const renderLabelEditor = () => { if (!labelEditorList || !labelAddContainer) return; labelEditorList.innerHTML = ''; labels.sort((a, b) => a.priority - b.priority).forEach(label => labelEditorList.appendChild(createLabelItem(label))); labelAddContainer.innerHTML = ''; const addTrigger = document.createElement('div'); addTrigger.className = 'add-new-label-trigger'; addTrigger.textContent = '＋ 新しいラベルを追加'; addTrigger.dataset.action = 'add'; labelAddContainer.appendChild(addTrigger); };
const createLabelItem = (label) => { const isNew = !label.id; const item = document.createElement('div'); item.className = 'label-item'; if (isNew) { item.classList.add('editing'); item.dataset.id = 'new'; } else { item.dataset.id = label.id; } const priorityOptions = [1,2,3].map(p => `<option value="${p}" ${label.priority === p ? 'selected' : ''}>${getPriorityText(p)}</option>`).join(''); const ICONS = { edit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`, delete: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`, save: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`, cancel: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>` }; item.innerHTML = `<div class="label-item-color-swatch" style="background-color: ${label.color || PRESET_COLORS[0]};"><div class="color-palette-dropdown"></div></div><div class="label-item-content"><div class="label-item-display"><span class="label-name-display">${label.name}</span><span class="label-prio-display">優先度: ${getPriorityText(label.priority)}</span></div><div class="label-item-editor"><input type="text" class="label-name-input" value="${label.name || ''}" placeholder="ラベル名"><select class="label-prio-select">${priorityOptions}</select></div></div><div class="label-item-actions action-edit-delete"><button class="edit-label-btn" data-action="edit" title="編集">${ICONS.edit}</button><button class="delete-label-btn" data-action="delete" title="削除">${ICONS.delete}</button></div><div class="label-item-actions action-save-cancel"><button class="save-label-btn" data-action="save" title="保存">${ICONS.save}</button><button class="cancel-label-btn" data-action="cancel" title="キャンセル">${ICONS.cancel}</button></div>`; const swatch = item.querySelector('.label-item-color-swatch'); const palette = item.querySelector('.color-palette-dropdown'); renderColorPalette(palette, (color) => { swatch.style.backgroundColor = color; }); return item; };
const renderColorPalette = (paletteContainer, onColorSelect) => { paletteContainer.innerHTML = ''; PRESET_COLORS.forEach(color => { const colorBox = document.createElement('div'); colorBox.className = 'color-box'; colorBox.style.backgroundColor = color; colorBox.addEventListener('click', (e) => { e.stopPropagation(); onColorSelect(color); paletteContainer.classList.remove('active'); }); paletteContainer.appendChild(colorBox); }); };
const openLabelModal = (taskId) => { const task = tasks.find(t => t.id === taskId); if (!task) return; modalTaskText.textContent = task.text; labelModal.dataset.taskId = taskId; modalLabelsContainer.innerHTML = ''; [...labels].sort((a,b) => a.priority - b.priority).forEach(label => { const isChecked = task.labelIds && task.labelIds.includes(label.id); const item = document.createElement('div'); item.className = 'label-checkbox-item'; item.innerHTML = `<input type="checkbox" id="label-check-${label.id}" value="${label.id}" ${isChecked ? 'checked' : ''}><label for="label-check-${label.id}"><div class="label-item-color" style="background-color:${label.color}"></div><span>${label.name} (優先度: ${getPriorityText(label.priority)})</span></label>`; modalLabelsContainer.appendChild(item); }); labelModal.style.display = 'flex'; };
const closeLabelModal = () => { labelModal.style.display = 'none'; };
const openParentModal = (taskId) => { const currentTask = tasks.find(t => t.id === taskId); if (!currentTask) return; parentModalTaskText.textContent = currentTask.text; parentModal.dataset.taskId = taskId; parentTaskSelect.innerHTML = ''; const forbiddenIds = [taskId, ...getDescendants(taskId)]; const potentialParents = tasks.filter(t => !forbiddenIds.includes(t.id)); parentTaskSelect.appendChild(new Option('（親なし）', 'null')); potentialParents.forEach(p => { const option = new Option(p.text, p.id); if (currentTask.parentId === p.id) option.selected = true; parentTaskSelect.appendChild(option); }); parentModal.style.display = 'flex'; };
const closeParentModal = () => { parentModal.style.display = 'none'; };

// --- イベントリスナー ---
const addEventListeners = () => {
    if(taskForm) taskForm.addEventListener('submit', async (e) => { e.preventDefault(); const text = taskInput.value.trim(); const dates = taskDueDateInput._flatpickr.selectedDates; if (text && dates.length > 0) { const startDate = dates[0].toISOString().split('T')[0]; const endDate = dates.length > 1 ? dates[1].toISOString().split('T')[0] : startDate; tasks.push({ id: Date.now().toString(), text, startDate, endDate, completed: false, labelIds: [], parentId: null }); taskForm.reset(); taskDueDateInput._flatpickr.clear(); renderAll(); await saveData(); } });
    if(taskListContainer) taskListContainer.addEventListener('click', async (e) => { const button = e.target.closest('button[data-action]'); if (!button) return; const card = e.target.closest('.task-card'); const taskId = card ? card.dataset.id : null; if (!taskId) return; const action = button.dataset.action; const taskIndex = tasks.findIndex(t => t.id === taskId); if (taskIndex === -1) return; let needsSave = false; switch (action) { case 'set-parent': openParentModal(taskId); break; case 'edit-labels': openLabelModal(taskId); break; case 'complete': tasks[taskIndex].completed = !tasks[taskIndex].completed; needsSave = true; break; case 'delete': const childrenCount = getDescendants(taskId).length; const confirmMsg = childrenCount > 0 ? `タスク「${tasks[taskIndex].text}」とその子タスク（${childrenCount}件）をすべて削除しますか？` : `タスク「${tasks[taskIndex].text}」を削除しますか？`; if (confirm(confirmMsg)) { const idsToDelete = [taskId, ...getDescendants(taskId)]; tasks = tasks.filter(t => !idsToDelete.includes(t.id)); needsSave = true; } break; } if (needsSave) { renderAll(); await saveData(); } });
    if(showListBtn) showListBtn.addEventListener('click', () => { listView.style.display = 'block'; calendarView.style.display = 'none'; showListBtn.classList.add('active'); showCalendarBtn.classList.remove('active'); });
    if(showCalendarBtn) showCalendarBtn.addEventListener('click', () => { listView.style.display = 'none'; calendarView.style.display = 'block'; showListBtn.classList.remove('active'); showCalendarBtn.classList.add('active'); calendar.render(); });
    [labelEditorToggle, aiToggleBtn].forEach(btn => { if (btn) { btn.addEventListener('click', () => { btn.classList.toggle('active'); const content = btn.nextElementSibling; if (content) { content.style.display = content.style.display === 'none' ? 'block' : 'none'; } }); } });
    const handleLabelAction = async (item, action) => { if (action === 'add') { if (document.querySelector('.label-item[data-id="new"]')) return; labelEditorList.prepend(createLabelItem({ priority: 2, name: '', color: PRESET_COLORS[0] })); return; } if (!item) return; const id = item.dataset.id === 'new' ? 'new' : parseInt(item.dataset.id, 10); switch (action) { case 'edit': item.classList.add('editing'); break; case 'cancel': (id === 'new') ? item.remove() : renderLabelEditor(); break; case 'save': const name = item.querySelector('.label-name-input').value.trim(); if (!name) { alert("ラベル名は必須です。"); item.querySelector('.label-name-input').focus(); return; } const priority = parseInt(item.querySelector('.label-prio-select').value, 10); const color = item.querySelector('.label-item-color-swatch').style.backgroundColor; if (id === 'new') { labels.push({ id: Date.now(), name, priority, color }); } else { const label = labels.find(l => l.id === id); if (label) Object.assign(label, { name, priority, color }); } await saveData(); renderAll(); break; case 'delete': const labelToDelete = labels.find(l => l.id === id); if (labelToDelete && confirm(`ラベル「${labelToDelete.name}」を削除しますか？`)) { labels = labels.filter(l => l.id !== id); tasks.forEach(task => { if (task.labelIds) task.labelIds = task.labelIds.filter(labelId => labelId !== id); }); await saveData(); renderAll(); } break; } };
    if (labelAddContainer) labelAddContainer.addEventListener('click', (e) => { const trigger = e.target.closest('[data-action="add"]'); if (trigger) handleLabelAction(null, 'add'); });
    if (labelEditorList) labelEditorList.addEventListener('click', (e) => { const button = e.target.closest('button[data-action]'); const item = e.target.closest('.label-item'); if (button && item) { e.stopPropagation(); handleLabelAction(item, button.dataset.action); return; } const swatch = e.target.closest('.label-item-color-swatch'); if (swatch && item.classList.contains('editing')) { const palette = swatch.querySelector('.color-palette-dropdown'); document.querySelectorAll('.color-palette-dropdown.active').forEach(p => p !== palette && p.classList.remove('active')); palette.classList.toggle('active'); } });
    if (modalSaveBtn) modalSaveBtn.addEventListener('click', async () => { const taskId = labelModal.dataset.taskId; const task = tasks.find(t => t.id === taskId); if (task) { task.labelIds = Array.from(modalLabelsContainer.querySelectorAll('input:checked')).map(input => parseInt(input.value, 10)); renderAll(); await saveData(); } closeLabelModal(); });
    if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeLabelModal);
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeLabelModal);
    if (parentModalSaveBtn) parentModalSaveBtn.addEventListener('click', async () => { const taskId = parentModal.dataset.taskId; const task = tasks.find(t => t.id === taskId); if (task) { const newParentId = parentTaskSelect.value === 'null' ? null : parentTaskSelect.value; task.parentId = newParentId; await saveData(); renderAll(); } closeParentModal(); });
    if (parentModalCancelBtn) parentModalCancelBtn.addEventListener('click', closeParentModal);
    if (parentModalCloseBtn) parentModalCloseBtn.addEventListener('click', closeParentModal);
    
    // ▼▼▼ 修正箇所: AIタスク生成ロジックを全面的に強化 ▼▼▼
    if (geminiTriggerBtn) geminiTriggerBtn.addEventListener('click', async () => {
        const promptText = geminiPrompt.value.trim();
        if (!promptText || !GEMINI_API_KEY) { alert("プロンプトを入力するか、GeminiのAPIキーを設定してください。"); return; }
        geminiTriggerBtn.disabled = true;
        geminiTriggerBtn.querySelector('.default-text').style.display = 'none';
        geminiTriggerBtn.querySelector('.loading-indicator').style.display = 'flex';
        try {
            const fullPrompt = `あなたは優秀なプロジェクトマネージャーです。以下の文章からタスクを抽出し、親子関係や依存関係を考慮して階層化し、適切な期間にスケジューリングしてください。

# 出力フォーマット
必ず以下のキーを持つJSONオブジェクトの配列を、\`\`\`json ... \`\`\` の中に記述して出力してください。

- "tempId": (string) このタスクの一時的なIDです。必ずユニークな文字列にしてください (例: "t1", "t2")。
- "text": (string) タスクの内容です。
- "startDate": (string) "YYYY-MM-DD"形式の開始日です。
- "endDate": (string) "YYYY-MM-DD"形式の終了日です。
- "parentId": (string or null) 親タスクの"tempId"です。親がない場合はnullにしてください。

# ルール
1.  **階層化**: 大きな目標やタスクを親とし、それを達成するための具体的なステップを子タスクとしてください。
2.  **スケジューリング**:
    - 全体の期間が指示されている場合は、その期間内にタスクが収まるように各タスクの開始日と終了日を割り振ってください。
    - タスクは論理的な順序で並べてください（例：デザイン→実装→テスト）。
    - 週末（土日）は作業日として割り振るのを避けてください。ただし、緊急性が高い場合や期間が短い場合はこの限りではありません。
    - 今日の日付は ${new Date().toISOString().split('T')[0]} です。「明日」「来週」などの相対的な日付はこの日付を基準に計算してください。
3.  **日付**: endDateが指定されていないタスクは、startDateと同じ日に設定してください。

# ユーザーの入力
${promptText}`;
            
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] }) });
            if (!response.ok) throw new Error(`Gemini APIエラー: ${response.status} ${await response.text()}`);
            const data = await response.json();
            let jsonString = data.candidates[0].content.parts[0].text;
            const jsonMatch = jsonString.match(/```json([\s\S]*?)```/);
            jsonString = jsonMatch ? jsonMatch[1].trim() : jsonString.substring(jsonString.indexOf('['), jsonString.lastIndexOf(']') + 1);

            const aiTasks = JSON.parse(jsonString);

            // tempIdと新しい本物のIDのマッピングを作成
            const idMap = {};
            aiTasks.forEach(task => {
                if (task.tempId) {
                    idMap[task.tempId] = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                }
            });

            // マッピングを元に親子関係を解決し、新しいタスクを生成
            const newTasks = aiTasks.map(task => ({
                id: idMap[task.tempId],
                text: task.text,
                startDate: task.startDate,
                endDate: task.endDate || task.startDate,
                parentId: task.parentId ? idMap[task.parentId] : null, // parentIdも本物のIDに変換
                completed: false,
                labelIds: []
            }));

            tasks.push(...newTasks);
            
            renderAll();
            await saveData();
            geminiPrompt.value = '';

        } catch (error) { console.error("Gemini処理エラー:", error); alert("タスクの自動生成に失敗しました。コンソールでエラー内容を確認してください。");
        } finally {
            geminiTriggerBtn.disabled = false;
            geminiTriggerBtn.querySelector('.default-text').style.display = 'inline';
            geminiTriggerBtn.querySelector('.loading-indicator').style.display = 'none';
        }
    });
    // ▲▲▲ 修正箇所 ▲▲▲
};

// --- 起動 ---
init();