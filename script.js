// ===============================================
// 相棒、この２つを書き換えてくれ！
// ===============================================
const API_KEY = '685bfb988561e97a502b9056'; 
const BIN_ID = '$2a$10$l.shMPQkZut9GF8QmO5kjuUe5EuHpRA4sATqrlfXG.lNjF1n0clg.';
// ===============================================

const API_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

const taskForm = document.getElementById('task-form');
const taskInput = document.getElementById('task-input');
const taskList = document.getElementById('task-list');

let tasks = [];

// JSONBINからミッションリストを読み込む関数
const loadTasks = async () => {
    try {
        const response = await fetch(`${API_URL}/latest`, { //最新版を取得
            headers: {
                'X-Master-Key': API_KEY
            }
        });
        if (!response.ok) {
            // もしBinが空っぽなら、新しい空の配列で初期化するぜ！
            if (response.status === 404) {
                console.log("アジトはまだ空だ。初期化する！");
                return;
            }
            throw new Error(`サーバからの応答がヤバい: ${response.status}`);
        }
        const data = await response.json();
        tasks = data.record.tasks || [];
        renderTasks();
    } catch (error) {
        console.error("ミッションリストの読み込みに失敗！:", error);
        alert("アジトとの通信に失敗した！コンソールを確認してくれ！");
    }
};

// JSONBINにミッションリストを保存する関数
const saveTasks = async () => {
    try {
        const response = await fetch(API_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': API_KEY
            },
            body: JSON.stringify({ tasks: tasks })
        });
        if (!response.ok) {
            throw new Error(`サーバへの保存に失敗: ${response.status}`);
        }
        console.log("アジトのデータを更新した！");
    } catch (error) {
        console.error("ミッションリストの保存に失敗！:", error);
        alert("アジトへのデータ保存に失敗した！");
    }
};

// 画面にミッションを表示する関数
const renderTasks = () => {
    taskList.innerHTML = '';
    tasks.forEach((taskText, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${taskText}</span>
            <button class="delete-btn" data-index="${index}">完了</button>
        `;
        taskList.appendChild(li);
    });
};

// 新しいミッションを追加したときの処理
taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newTask = taskInput.value.trim();
    if (newTask) {
        tasks.push(newTask);
        renderTasks();
        await saveTasks();
        taskInput.value = '';
    }
});

// ミッションを完了（削除）したときの処理
taskList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('delete-btn')) {
        const index = e.target.dataset.index;
        tasks.splice(index, 1);
        renderTasks();
        await saveTasks();
    }
});

// ページが読み込まれたら、まずアジトからデータを読み込む！
loadTasks();