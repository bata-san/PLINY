// ===============================================
// 定数
// ===============================================
const MASTER_KEY = '$2a$10$l.shMPQkZut9GF8QmO5kjuUe5EuHpRA4sATqrlfXG.lNjF1n0clg.';
const ACCESS_KEY = '$2a$10$h10RX1N2om3YrLjEs313gOKLSH5XN2ov/qECHWf/qoh5ex4Sz3JpG';
const BIN_ID = '685bfb988561e97a502b9056';
const GEMINI_API_KEY = 'AIzaSyD4GPZ85iVlKjbmd-j3DKfbPooGpqlaZtM';

const API_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

// ===============================================
// DOM要素の宣言 (DOMContentLoadedで初期化)
// ===============================================
let taskForm, taskInput, taskDueDateInput, taskListContainer, calendarContainer;
let showListBtn, showCalendarBtn, listView, calendarView;
let geminiPrompt, geminiTriggerBtn, aiToggleBtn, aiContent;
let labelCheckboxesContainer, newLabelNameInput, newLabelColorInput, addNewLabelBtn;
let labelEditorModal, modalTaskText, modalLabelsContainer, modalSaveBtn, modalCloseBtn;

// ===============================================
// グローバル変数
// ===============================================
let tasks = [];
let labels = {
    "仕事": "#5B92E5",
    "プライベート": "#63B7AF",
    "健康": "#6FCF97",
    "学習": "#F2C94C",
    "アイデア": "#BB6BD9",
    "緊急": "#F76D6D",
    "その他": "#BDBDBD"
};
let calendar;
let currentlyEditingTaskId = null;


// ===============================================
// 初期化処理
// ===============================================

document.addEventListener('DOMContentLoaded', () => {
    // DOM要素の取得と割り当て
    taskForm = document.getElementById('task-form');
    taskInput = document.getElementById('task-input');
    taskDueDateInput = document.getElementById('task-due-date');
    taskListContainer = document.getElementById('task-list-container');
    calendarContainer = document.getElementById('calendar-container');
    showListBtn = document.getElementById('show-list-btn');
    showCalendarBtn = document.getElementById('show-calendar-btn');
    listView = document.getElementById('list-view');
    calendarView = document.getElementById('calendar-view');
    geminiPrompt = document.getElementById('gemini-prompt');
    geminiTriggerBtn = document.getElementById('gemini-trigger-btn');
    aiToggleBtn = document.getElementById('ai-toggle-btn');
    aiContent = document.getElementById('ai-content');
    labelCheckboxesContainer = document.getElementById('label-checkboxes-container');
    newLabelNameInput = document.getElementById('new-label-name');
    newLabelColorInput = document.getElementById('new-label-color');
    addNewLabelBtn = document.getElementById('add-new-label-btn');
    labelEditorModal = document.getElementById('label-editor-modal');
    modalTaskText = document.getElementById('modal-task-text');
    modalLabelsContainer = document.getElementById('modal-labels-container');
    modalSaveBtn = document.getElementById('modal-save-btn');
    modalCloseBtn = document.getElementById('modal-close-btn');

    initializeCalendar();
    loadData();
    initializeFlatpickr();
    
    // イベントリスナーの設定
    taskForm.addEventListener('submit', handleTaskFormSubmit);
    taskListContainer.addEventListener('click', handleTaskListClick);
    addNewLabelBtn.addEventListener('click', handleAddNewLabel);
    showListBtn.addEventListener('click', () => switchView('list'));
    showCalendarBtn.addEventListener('click', () => switchView('calendar'));
    aiToggleBtn.addEventListener('click', () => {
        if (aiContent) aiContent.style.display = aiContent.style.display === 'none' ? 'block' : 'none';
    });
    geminiTriggerBtn.addEventListener('click', handleGeminiTrigger);
    modalCloseBtn.addEventListener('click', closeLabelEditorModal);
    modalSaveBtn.addEventListener('click', handleModalSave);
    labelEditorModal.addEventListener('click', (e) => {
        if (e.target === labelEditorModal) closeLabelEditorModal();
    });
});

const initializeFlatpickr = () => {
    if (!taskDueDateInput) return;

    flatpickr(taskDueDateInput, {
        mode: "range",
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "Y年m月d日",
        locale: "ja"
    });
};

const initializeCalendar = () => {
    if (!calendarContainer) return;

    calendar = new FullCalendar.Calendar(calendarContainer, {
        initialView: window.innerWidth < 768 ? 'listWeek' : 'dayGridMonth',
        locale: 'ja',
        timeZone: 'UTC',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek'
        },
        height: '100%',
        events: [],
        editable: true,
        eventDrop: handleEventDrop,
        eventClick: handleEventClick,
        windowResize: () => {
            if (window.innerWidth < 768 && calendarView && calendarView.style.display !== 'none') {
                showListBtn && showListBtn.click();
            }
        }
    });
    calendar.render();
};

// ===============================================
// データ管理 (JSONBIN)
// ===============================================

const loadData = async () => {
    try {
        const response = await fetch(`${API_URL}/latest`, { headers: { 'X-Access-Key': ACCESS_KEY } });
        if (response.status === 404) {
            saveData();
            return;
        }
        if (!response.ok) throw new Error(`サーバーエラー: ${response.status}`);
        
        const data = await response.json();
        tasks = data.record.tasks || [];
        labels = data.record.labels || labels;
        renderAll();
    } catch (error) {
        console.error("読み込み失敗:", error);
        alert("データの読み込みに失敗しました。");
    }
};

const saveData = () => {
    fetch(API_URL, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': MASTER_KEY,
            'X-Bin-Versioning': 'false'
        },
        body: JSON.stringify({ tasks, labels })
    }).then(response => {
        if (!response.ok) throw new Error(`保存失敗: ${response.status}`);
        console.log("アジトのデータを更新した！");
    }).catch(error => {
        console.error("保存失敗:", error);
    });
};

// ===============================================
// 描画処理
// ===============================================

const renderAll = () => {
    if (labelCheckboxesContainer) {
        renderLabelCheckboxes(labelCheckboxesContainer, []);
    }
    renderTaskList();
    renderCalendar();
};

const renderLabelCheckboxes = (container, selectedLabels = []) => {
    container.innerHTML = '';
    Object.keys(labels).forEach(labelName => {
        const color = labels[labelName];
        const id = `${container.id}-${labelName.replace(/\s/g, '-')}`;
        const isChecked = selectedLabels.includes(labelName);

        const div = document.createElement('div');
        div.className = 'label-checkbox-item';
        div.innerHTML = `
            <input type="checkbox" id="${id}" name="task-label" value="${labelName}" ${isChecked ? 'checked' : ''}>
            <label for="${id}" style="--label-color: ${color};">${labelName}</label>
        `;
        container.appendChild(div);
    });
};

const renderTaskList = () => {
    if (!taskListContainer) return;

    taskListContainer.innerHTML = '';
    const sortedTasks = [...tasks].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    sortedTasks.forEach(task => {
        const card = document.createElement('div');
        card.className = `task-card ${task.completed ? 'completed' : ''}`;
        card.dataset.id = task.id;

        const dateString = task.startDate === task.endDate
            ? task.startDate
            : `${task.startDate} ~ ${task.endDate}`;

        const labelsHtml = (task.labels || []).map(labelName => {
            const color = labels[labelName] || '#BDBDBD';
            return `<span class="task-label" style="background-color: ${color};">${labelName}</span>`;
        }).join('');

        card.innerHTML = `
            <p class="task-text">${task.text.replace(/</g, "&lt;")}</p>
            <div class="task-labels-container">${labelsHtml}</div>
            <div class="task-footer">
                <span class="task-due-date">期間: ${dateString}</span>
                <div class="task-actions">
                    <button class="edit-labels-btn">ラベル編集</button>
                    <button class="complete-btn">${task.completed ? '未完了' : '完了'}</button>
                    <button class="delete-btn">削除</button>
                </div>
            </div>
        `;
        taskListContainer.appendChild(card);
    });
};

const renderCalendar = () => {
    if (!calendarContainer || !calendar) return;

    const events = tasks.map(task => {
        if (!task.startDate || new Date(task.startDate).toString() === 'Invalid Date') return null;

        let endDateValue = task.endDate || task.startDate;
        const endDate = new Date(endDateValue);
        endDate.setDate(endDate.getDate() + 1); // FullCalendarの仕様に合わせて終了日を+1日する
        if (isNaN(endDate.getTime())) return null;

        const firstLabelName = (task.labels && task.labels.length > 0) ? task.labels[0] : null;
        const eventColor = firstLabelName ? labels[firstLabelName] : '#BDBDBD';

        return {
            id: task.id,
            title: task.text,
            start: task.startDate,
            end: endDate.toISOString().split('T')[0],
            allDay: true,
            backgroundColor: task.completed ? '#6e6e73' : eventColor,
            borderColor: task.completed ? '#6e6e73' : eventColor,
            classNames: task.completed ? ['completed-event'] : [],
        };
    }).filter(Boolean);

    calendar.getEventSources().forEach(source => source.remove());
    calendar.addEventSource(events);
};

// ===============================================
// イベントハンドラ
// ===============================================

const handleEventDrop = (info) => {
    const task = tasks.find(t => t.id === info.event.id);
    if (task) {
        const oldStartDate = new Date(task.startDate + 'T00:00:00Z');
        const oldEndDate = new Date(task.endDate + 'T00:00:00Z');
        const duration = oldEndDate.getTime() - oldStartDate.getTime();

        const newStartDate = info.event.start;
        const newEndDate = new Date(newStartDate.getTime() + duration);

        task.startDate = newStartDate.toISOString().split('T')[0];
        task.endDate = newEndDate.toISOString().split('T')[0];
        
        renderAll();
        saveData();
    }
};

const handleEventClick = (info) => {
    const task = tasks.find(t => t.id === info.event.id);
    if (task) openLabelEditorModal(task);
};

const handleTaskFormSubmit = (e) => {
    e.preventDefault();
    if (!taskInput || !taskDueDateInput || !labelCheckboxesContainer) return; // グローバル変数を使用

    const text = taskInput.value.trim();
    const dates = taskDueDateInput._flatpickr.selectedDates;
    const selectedLabels = Array.from(labelCheckboxesContainer.querySelectorAll('input[name="task-label"]:checked')).map(cb => cb.value);

    if (text && dates.length > 0) {
        const startDate = dates[0].toISOString().split('T')[0];
        const endDate = dates.length > 1 ? dates[1].toISOString().split('T')[0] : startDate;

        tasks.push({
            id: Date.now().toString(),
            text,
            startDate,
            endDate,
            completed: false,
            labels: selectedLabels
        });
        renderAll();
        saveData();
        taskForm.reset();
        taskDueDateInput._flatpickr.clear();
    }
};

const handleTaskListClick = (e) => {
    const card = e.target.closest('.task-card');
    if (!card) return;
    const taskId = card.dataset.id;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    if (e.target.matches('.edit-labels-btn')) {
        openLabelEditorModal(task);
    } else if (e.target.matches('.complete-btn')) {
        task.completed = !task.completed;
        renderAll();
        saveData();
    } else if (e.target.matches('.delete-btn')) {
        tasks = tasks.filter(t => t.id !== taskId);
        renderAll();
        saveData();
    }
};

const handleAddNewLabel = () => {
    if (!newLabelNameInput || !newLabelColorInput || !labelCheckboxesContainer) return; // グローバル変数を使用

    const newName = newLabelNameInput.value.trim();
    const newColor = newLabelColorInput.value;
    if (newName && !labels[newName]) {
        labels[newName] = newColor;
        renderLabelCheckboxes(labelCheckboxesContainer); // 削除モードの状態を渡す
        saveData();
        newLabelNameInput.value = '';
        newLabelColorInput.value = '#828282';
    } else if (labels[newName]) {
        alert('そのラベル名は既に使用されています。');
    }
};





const switchView = (view) => {
    if (!listView || !calendarView || !showListBtn || !showCalendarBtn) return; // グローバル変数を使用

    listView.style.display = view === 'list' ? 'block' : 'none';
    calendarView.style.display = view === 'calendar' ? 'block' : 'none';
    showListBtn.classList.toggle('active', view === 'list');
    showCalendarBtn.classList.toggle('active', view === 'calendar');
    if (view === 'calendar') calendar.render();
};

// ===============================================
// ラベル編集モーダル関連
// ===============================================

const openLabelEditorModal = (task) => {
    if (!labelEditorModal || !modalTaskText || !modalLabelsContainer) return; // グローバル変数を使用

    currentlyEditingTaskId = task.id;
    modalTaskText.textContent = task.text;
    renderLabelCheckboxes(modalLabelsContainer, task.labels || []);
    labelEditorModal.style.display = 'flex';
};

const closeLabelEditorModal = () => {
    if (!labelEditorModal) return; // グローバル変数を使用

    currentlyEditingTaskId = null;
    labelEditorModal.style.display = 'none';
};

const handleModalSave = () => {
    if (!currentlyEditingTaskId) return;
    const task = tasks.find(t => t.id === currentlyEditingTaskId);
    if (task) {
        if (!modalLabelsContainer) return; // グローバル変数を使用

        const selectedLabels = Array.from(modalLabelsContainer.querySelectorAll('input[name="task-label"]:checked')).map(cb => cb.value);
        task.labels = selectedLabels;
        renderAll();
        saveData();
    }
    closeLabelEditorModal();
};

// ===============================================
// AI関連
// ===============================================

const handleGeminiTrigger = async () => {
    if (!geminiPrompt || !geminiTriggerBtn || !aiContent) return; // グローバル変数を使用

    const promptText = geminiPrompt.value.trim();
    if (!promptText || !GEMINI_API_KEY) {
        alert("プロンプトを入力するか、GeminiのAPIキーを設定してください。");
        return;
    }

    geminiTriggerBtn.disabled = true;
    const defaultTextSpan = geminiTriggerBtn.querySelector('.default-text');
    const loadingIndicatorDiv = geminiTriggerBtn.querySelector('.loading-indicator');

    if (defaultTextSpan) defaultTextSpan.style.display = 'none';
    if (loadingIndicatorDiv) loadingIndicatorDiv.style.display = 'flex';

    try {
        const labelExamples = Object.keys(labels).join(', ');
        const fullPrompt = `以下の文章からタスクを抽出し、JSON形式の配列で出力してください。\n- 各タスクには "text", "startDate", "endDate", "labels" のキーを含めてください。\n- "labels" はタスクに関連するキーワードを配列として含めてください。既存のラベル（${labelExamples}）があればそれらを優先的に使用し、なければ新しいラベルを生成してください。\n- "endDate" が指定されていない場合は "startDate" と同じ日付にしてください。\n- 日付はYYYY-MM-DD形式で。\n\n---\n\n${promptText}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] })
        });
        if (!response.ok) throw new Error(`Gemini APIエラー: ${response.status}`);

        const data = await response.json();
        let jsonString = data.candidates[0].content.parts[0].text;
        const jsonMatch = jsonString.match(/```json([\s\S]*?)```/);
        if (jsonMatch && jsonMatch[1]) {
            jsonString = jsonMatch[1];
        }

        const newTasks = JSON.parse(jsonString);
        newTasks.forEach(task => {
            (task.labels || []).forEach(labelName => {
                if (!labels[labelName]) {
                    labels[labelName] = `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`;
                }
            });
            tasks.push({
                id: Date.now().toString() + Math.random(),
                text: task.text,
                startDate: task.startDate,
                endDate: task.endDate || task.startDate,
                completed: false,
                labels: task.labels || []
            });
        });

        renderAll();
        saveData();
        geminiPrompt.value = '';

    } catch (error) {
        console.error("Gemini処理エラー:", error);
        alert("タスクの自動生成に失敗しました。コンソールでエラー内容を確認してください。");
    } finally {
        geminiTriggerBtn.disabled = false;
        if (defaultTextSpan) defaultTextSpan.style.display = 'inline';
        if (loadingIndicatorDiv) loadingIndicatorDiv.style.display = 'none';
    }
};