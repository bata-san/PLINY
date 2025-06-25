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
const aiToggleBtn = document.getElementById('ai-toggle-btn');
const aiContent = document.getElementById('ai-content');

let tasks = [];
let calendar;

// --- 初期化処理 ---

// flatpickrを期間選択モードに！
flatpickr(taskDueDateInput, {
    mode: "range", // これで期間選択が可能になる！
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "Y年m月d日",
    locale: "ja"
});

// FullCalendarの初期化
const initializeCalendar = () => {
    calendar = new FullCalendar.Calendar(calendarContainer, {
        initialView: window.innerWidth < 768 ? 'listWeek' : 'dayGridMonth',
        locale: 'ja',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek'
        },
        height: '100%', // コンテナの高さに合わせる
        events: [],
        windowResize: function(arg) {
            if (window.innerWidth < 768) {
                // If calendar is visible, switch to list view
                if (calendarView.style.display !== 'none') {
                    showListBtn.click();
                }
            } 
        }
    });
    calendar.render();
};

// --- データ連携 (JSONBIN) ---

const loadTasks = async () => {
    try {
        const response = await fetch(`${API_URL}/latest`, { headers: { 'X-Access-Key': ACCESS_KEY } });
        if (!response.ok) {
            if (response.status === 404) { await saveTasks([]); return; }
            throw new Error(`サーバーエラー: ${response.status}`);
        }
        const data = await response.json();
        tasks = data.record.tasks || [];
        renderAll();
    } catch (error) {
        console.error("読み込み失敗:", error);
        alert("データの読み込みに失敗しました。");
    }
};

const saveTasks = async (tasksToSave = tasks) => {
    try {
        const response = await fetch(API_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': MASTER_KEY,
                'X-Bin-Versioning': 'false'
            },
            body: JSON.stringify({ tasks: tasksToSave })
        });
        if (!response.ok) throw new Error(`保存失敗: ${response.status}`);
        console.log("アジトのデータを更新した！");
    } catch (error) {
        console.error("保存失敗:", error);
        alert("データの保存に失敗しました。");
    }
};

// --- 描画処理 ---

const renderAll = () => {
    renderTaskList();
    renderCalendar();
};

const renderTaskList = () => {
    taskListContainer.innerHTML = '';
    const sortedTasks = [...tasks].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    sortedTasks.forEach(task => {
        const card = document.createElement('div');
        card.className = `task-card ${task.completed ? 'completed' : ''}`;
        card.dataset.id = task.id;
        
        const dateString = task.startDate === task.endDate 
            ? task.startDate 
            : `${task.startDate} ~ ${task.endDate}`;

        card.innerHTML = `
            <p class="task-text">${task.text.replace(/</g, "<")}</p>
            <div class="task-footer">
                <span class="task-due-date">期間: ${dateString}</span>
                <div class="task-actions">
                    <button class="complete-btn">${task.completed ? '未完了' : '完了'}</button>
                    <button class="delete-btn">削除</button>
                </div>
            </div>`;
        taskListContainer.appendChild(card);
    });
};

const renderCalendar = () => {
    if (!calendar) return;
    const events = tasks.map(task => {
        // startDateが不正な場合はカレンダーに表示しない
        if (!task.startDate || new Date(task.startDate).toString() === 'Invalid Date') {
            return null;
        }

        // endDateが不正、または存在しない場合はstartDateを使用
        let endDateValue = task.endDate;
        if (!endDateValue || new Date(endDateValue).toString() === 'Invalid Date') {
            endDateValue = task.startDate;
        }

        const endDate = new Date(endDateValue);
        endDate.setDate(endDate.getDate() + 1); // FullCalendarの仕様上、終了日を1日後に設定

        // 最終チェック
        if (isNaN(endDate.getTime())) {
            return null;
        }

        return {
            id: task.id,
            title: task.text,
            start: task.startDate,
            end: endDate.toISOString().split('T')[0],
            allDay: true,
            backgroundColor: task.completed ? '#6e6e73' : '#007aff',
            borderColor: task.completed ? '#6e6e73' : '#007aff',
            classNames: task.completed ? ['completed-event'] : []
        };
    }).filter(Boolean); // nullを除外

    calendar.getEventSources().forEach(source => source.remove());
    calendar.addEventSource(events);
};


// --- イベントリスナー ---

taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = taskInput.value.trim();
    const dates = taskDueDateInput._flatpickr.selectedDates;
    if (text && dates.length > 0) {
        const startDate = dates[0].toISOString().split('T')[0];
        const endDate = dates.length > 1 ? dates[1].toISOString().split('T')[0] : startDate;
        tasks.push({ id: Date.now().toString(), text, startDate, endDate, completed: false });
        renderAll();
        await saveTasks();
        taskForm.reset();
        taskDueDateInput._flatpickr.clear();
    }
});

taskListContainer.addEventListener('click', async (e) => {
    const card = e.target.closest('.task-card');
    if (!card) return;
    const taskId = card.dataset.id;
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;

    if (e.target.classList.contains('complete-btn')) {
        tasks[taskIndex].completed = !tasks[taskIndex].completed;
    } else if (e.target.classList.contains('delete-btn')) {
        tasks.splice(taskIndex, 1);
    }
    renderAll();
    await saveTasks();
});

showListBtn.addEventListener('click', () => {
    listView.style.display = 'block';
    calendarView.style.display = 'none';
    showListBtn.classList.add('active');
    showCalendarBtn.classList.remove('active');
});

showCalendarBtn.addEventListener('click', () => {
    listView.style.display = 'none';
    calendarView.style.display = 'block';
    showListBtn.classList.remove('active');
    showCalendarBtn.classList.add('active');
    calendar.render();
});

aiToggleBtn.addEventListener('click', () => {
    const isHidden = aiContent.style.display === 'none';
    aiContent.style.display = isHidden ? 'block' : 'none';
});

geminiTriggerBtn.addEventListener('click', async () => {
    const promptText = geminiPrompt.value.trim();
    if (!promptText || !GEMINI_API_KEY) {
        alert("プロンプトを入力するか、GeminiのAPIキーを設定してください。");
        return;
    }

    geminiTriggerBtn.disabled = true;
    geminiTriggerBtn.querySelector('.default-text').style.display = 'none';
    geminiTriggerBtn.querySelector('.loading-indicator').style.display = 'flex';

    try {
        const fullPrompt = `以下の文章からタスクを抽出し、JSON形式の配列で出力してください。各タスクにはtext, startDate, endDateのキーを含めてください。endDateが指定されていない場合はstartDateと同じ日付にしてください。日付はYYYY-MM-DD形式で。今日の日付は${new Date().toISOString().split('T')[0]}です。

---

${promptText}`;        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] })
        });
        if (!response.ok) throw new Error(`Gemini APIエラー: ${response.status}`);
        
        const data = await response.json();
        let jsonString = data.candidates[0].content.parts[0].text;
        
        // Geminiからの応答に含まれる可能性のあるマークダウンや余分なテキストを削除
        const jsonMatch = jsonString.match(/```json([\s\S]*?)```/);
        if (jsonMatch && jsonMatch[1]) {
            jsonString = jsonMatch[1];
        } else {
            // JSONが直接返された場合も考慮
            const arrayStart = jsonString.indexOf('[');
            const arrayEnd = jsonString.lastIndexOf(']');
            if (arrayStart !== -1 && arrayEnd !== -1) {
                jsonString = jsonString.substring(arrayStart, arrayEnd + 1);
            }
        }

        try {
            const newTasks = JSON.parse(jsonString);

            newTasks.forEach(task => {
                const startDate = task.startDate;
                const endDate = task.endDate || startDate; // endDateがなければstartDateを使う
                tasks.push({ id: Date.now().toString() + Math.random(), text: task.text, startDate, endDate, completed: false });
            });
        } catch (e) {
            console.error("JSONの解析に失敗しました:", e);
            console.error("Geminiからの生の応答:", data.candidates[0].content.parts[0].text);
            throw new Error("Geminiからの応答の形式が正しくありません。");
        }
        
        renderAll();
        await saveTasks();
        geminiPrompt.value = '';

    } catch (error) {
        console.error("Gemini処理エラー:", error);
        alert("タスクの自動生成に失敗しました。コンソールでエラー内容を確認してください。");
    } finally {
        geminiTriggerBtn.disabled = false;
        geminiTriggerBtn.querySelector('.default-text').style.display = 'inline';
        geminiTriggerBtn.querySelector('.loading-indicator').style.display = 'none';
    }
});


// --- 起動 ---
initializeCalendar();
loadTasks();