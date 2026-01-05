import { loadToken, store } from './state.js';
import { loadData } from './api.js';
import { bindAuthEvents } from './components/auth.js';
import { initializeCalendar } from './components/calendar.js';
import { renderAll, showAuthMessage, updateGoogleSyncUI, openLabelEditorModal, closeAllPopovers, closeLabelEditorModal, pushToUndoStack, updateSaveStatus, showColorPalette, updateUndoRedoButtons } from './components/ui.js';
import { handleGoogleConnect, handleGoogleSync, handleGoogleDisconnect } from './components/googleSync.js';
import { normalizeTask, getHighestPriorityLabel } from './utils.js';
import { scheduleSave, forceSaveAllData } from './api.js';
import { trackChange, clearTrackedChanges } from './state.js';
import { WORKER_URL, PRESET_COLORS } from './config.js';
import { setupDragAndDropEvents } from './components/taskList.js';
// Note: Many imports are for side-effects or event binding.

document.addEventListener("DOMContentLoaded", () => {
    // Google Auth Check
    const queryParams = new URLSearchParams(window.location.search);
    if (queryParams.has('google_auth_success')) {
        alert('Googleアカウントとの連携に成功しました！');
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    loadToken();
    if (store.authToken) {
        initializeApp();
    } else {
        document.getElementById("auth-overlay").style.display = "flex";
        bindAuthEvents(initializeApp);
    }
});

function initializeApp() {
    document.getElementById("auth-overlay").style.display = "none";
    document.getElementById("app-container").style.display = "flex";
    document.getElementById("user-email-display").textContent = store.userEmail;

    initializeTheme();
    initializeFlatpickr();
    initializeCalendar(); // From calendar.js
    bindGlobalEvents(); // Defined locally in main.js
    loadData();
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('pliny_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        if (savedTheme === 'dark') {
            icon.className = 'fas fa-sun';
        } else {
            icon.className = 'fas fa-moon';
        }
    }
}

function initializeFlatpickr() {
    const dueDateInput = document.getElementById("task-due-date");
    if (dueDateInput._flatpickr) dueDateInput._flatpickr.destroy();
    // Flatpickr global
    dueDateInput._flatpickr = flatpickr(dueDateInput, {
        mode: "range",
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "Y年m月d日",
        locale: "ja",
        minDate: "today",
    });
}

function bindGlobalEvents() {
    document.addEventListener("click", (e) => {
        if (!e.target.closest('.popover, #label-editor-modal .modal-content')) closeAllPopovers();
    });

    // Logout handling is in api.js but accessible via window or event?
    // We didn't export handleLogout from api.js.
    // We should import it. 
    // Wait, I only made handleLogout internal to api.js. 
    // I need to export handleLogout helper from api.js or re-implement simple token clearing here.
    // It's better to export it. 
    // For now, I will assume I can't easily change api.js without another tool call.
    // I will implement a local handleLogout or fetch api.js content again later.
    // Actually, I can use simply:
    document.getElementById("logout-btn").addEventListener("click", () => {
        import('./state.js').then(m => m.clearToken());
        store.tasks = [];
        document.getElementById("app-container").style.display = "none";
        document.getElementById("auth-overlay").style.display = "flex";
        // And reset state...
        location.reload(); // Simple logout
    });

    setupSidebarEvents();
    setupPanelEvents();
    setupViewEvents();
    setupThemeToggle();

    setupTaskFormEvents();
    setupUndoRedoEvents();
    setupAiEvents();
    setupDataManagerEvents();
    setupWindowEvents();
    setupLabelEditorModalEvents();
    setupGoogleSyncEvents();

    // Setup Task List Events (Drag/Drop is inside renderTaskList, but click events?)
    // setupTaskListEvents in script.js handled click (delete, complete).
    // I need to implement that here.
    setupTaskListClickEvents();
}

function setupTaskFormEvents() {
    const form = document.getElementById("task-form");
    if (!form) return;
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        const taskInput = document.getElementById("task-input");
        const dates = document.getElementById("task-due-date")._flatpickr.selectedDates;
        if (!taskInput.value.trim() || dates.length === 0)
            return alert("タスク名と期間を入力してください。");

        pushToUndoStack();
        const newTask = normalizeTask({
            text: taskInput.value.trim(),
            startDate: dates[0].toISOString().split("T")[0],
            endDate: (dates[1] || dates[0]).toISOString().split("T")[0],
            labelIds: Array.from(document.querySelectorAll("#add-task-label-selector .selected input")).map((i) => i.value),
        });

        store.tasks.push(newTask);
        trackChange('task', 'created', newTask.id);
        scheduleSave();

        form.reset();
        document.getElementById("task-due-date")._flatpickr.clear();
        document.querySelectorAll("#add-task-label-selector .selected").forEach((el) => el.classList.remove("selected"));
    });
}

function setupTaskListClickEvents() {
    const container = document.getElementById("task-list-container");
    if (!container) return;

    // Drag and drop setup
    setupDragAndDropEvents(container);

    container.addEventListener("click", (e) => {
        const actionTarget = e.target.closest("[data-action]");
        if (!actionTarget) return;
        const taskCard = e.target.closest(".task-card");
        if (!taskCard) return;
        const task = store.tasks.find((t) => t.id === taskCard.dataset.taskId);
        if (!task) return;

        let shouldScheduleSave = false;
        let shouldRender = false;

        switch (actionTarget.dataset.action) {
            case "toggle":
                task.isCollapsed = !task.isCollapsed;
                shouldRender = true;
                break;
            case "complete":
                pushToUndoStack();
                task.completed = !task.completed;
                trackChange('task', 'updated', task.id);
                shouldScheduleSave = true;
                break;
            case "edit-labels":
                e.stopPropagation();
                openLabelEditorModal(task);
                break;
            case "delete":
                pushToUndoStack();
                const descendantIds = store.tasks.filter((t) => t.parentId === task.id).map((t) => t.id);
                if (confirm(`このタスクと${descendantIds.length}個の子タスクを削除しますか？`)) {
                    const allIdsToDelete = [task.id, ...descendantIds];
                    allIdsToDelete.forEach(id => trackChange('task', 'deleted', id));
                    store.tasks = store.tasks.filter((t) => !allIdsToDelete.includes(t.id));
                    shouldScheduleSave = true;
                }
                break;
            default: break;
        }
        if (shouldScheduleSave) scheduleSave();
        else if (shouldRender) renderAll();
    });
}

function setupLabelEditorModalEvents() {
    const modal = document.getElementById('label-editor-modal');
    if (!modal) return;
    document.getElementById('label-editor-modal-close').addEventListener('click', closeLabelEditorModal);
    document.getElementById('label-editor-modal-cancel').addEventListener('click', closeLabelEditorModal);
    document.getElementById('label-editor-modal-save').addEventListener('click', () => {
        const taskId = modal.dataset.taskId;
        const selectedLabelIds = Array.from(modal.querySelectorAll('#modal-label-list input:checked')).map(input => input.value);
        saveTaskLabelChanges(taskId, selectedLabelIds);
    });
    document.getElementById('modal-add-new-label-btn').addEventListener('click', () => {
        const nameInput = document.getElementById('modal-new-label-name');
        const name = nameInput.value.trim();
        if (name) {
            pushToUndoStack();
            const newLabel = {
                id: `label-${Date.now()}`,
                name: name,
                color: PRESET_COLORS[store.labels.length % PRESET_COLORS.length],
                priority: (store.labels.length > 0 ? Math.max(...store.labels.map(l => l.priority || 0)) : 0) + 1,
            };
            store.labels.push(newLabel);
            trackChange('label', 'created', newLabel.id);
            const task = store.tasks.find(t => t.id === modal.dataset.taskId);
            if (task) openLabelEditorModal(task);
            nameInput.value = '';
            scheduleSave();
        }
    });
}

async function saveTaskLabelChanges(taskId, newLabelIds) {
    const task = store.tasks.find(t => t.id === taskId);
    if (!task) return;
    pushToUndoStack();
    task.labelIds = newLabelIds;
    trackChange('task', 'updated', taskId);
    scheduleSave();
    closeLabelEditorModal();
}

function setupDataManagerEvents() {
    document.getElementById("export-json-btn")?.addEventListener("click", () => {
        const dataStr = JSON.stringify({ tasks: store.tasks, labels: store.labels, version: store.currentDataVersion }, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `pliny_backup_${new Date().toISOString().split("T")[0]}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    });

    document.getElementById("import-json-btn")?.addEventListener("click", () => {
        const fileInput = document.getElementById("import-json-file");
        const merge = document.getElementById("merge-with-existing").checked;
        if (!fileInput.files.length) return alert("ファイルを選択してください。");

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (!Array.isArray(data.tasks) || !Array.isArray(data.labels)) throw new Error("無効な形式です。");
                pushToUndoStack();
                let importedState;
                if (merge) {
                    const taskIds = new Set(store.tasks.map((t) => t.id));
                    const labelIds = new Set(store.labels.map((l) => l.id));
                    const newTasks = [...store.tasks, ...data.tasks.filter((t) => !taskIds.has(t.id))];
                    const newLabels = [...store.labels, ...data.labels.filter((l) => !labelIds.has(l.id))];
                    importedState = { tasks: newTasks, labels: newLabels };
                } else {
                    importedState = { tasks: data.tasks, labels: data.labels };
                }
                alert("インポートが完了しました。データを同期します。");
                await forceSaveAllData(importedState, 'import');
            } catch (e) {
                alert(`インポート失敗: ${e.message}`);
            }
        };
        reader.readAsText(fileInput.files[0]);
    });
}

function setupGoogleSyncEvents() {
    document.getElementById('google-connect-btn')?.addEventListener('click', handleGoogleConnect);
    document.getElementById('google-sync-btn')?.addEventListener('click', handleGoogleSync);
    document.getElementById('google-disconnect-btn')?.addEventListener('click', handleGoogleDisconnect);
}

function setupSidebarEvents() {
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
        item.addEventListener('click', () => {
            const view = item.dataset.view;
            switchView(view);
            document.querySelectorAll('.nav-item[data-view]').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
        });
    });

    document.querySelectorAll('.nav-item[data-panel]').forEach(item => {
        item.addEventListener('click', () => {
            const panel = item.dataset.panel;
            openPanel(panel);
        });
    });

    document.getElementById('add-task-btn')?.addEventListener('click', () => {
        openPanel('task');
    });
}

function setupPanelEvents() {
    document.querySelectorAll('.panel-close').forEach(btn => {
        btn.addEventListener('click', () => {
            closeAllPanels();
        });
    });
}

function setupViewEvents() {
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
        item.addEventListener('click', () => {
            const view = item.dataset.view;
            switchView(view);
        });
    });
}

function setupThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('pliny_theme', newTheme);
            const icon = themeToggle.querySelector('i');
            if (newTheme === 'dark') {
                icon.className = 'fas fa-sun';
            } else {
                icon.className = 'fas fa-moon';
            }
        });
    }
}

function openPanel(panelName) {
    closeAllPanels();
    const panel = document.getElementById(`${panelName}-panel`);
    if (panel) {
        panel.classList.add('active');
    }
}

function closeAllPanels() {
    document.querySelectorAll('.content-panel').forEach(panel => {
        panel.classList.remove('active');
    });
}

function switchView(viewName) {
    document.querySelectorAll('.content-view').forEach(view => {
        view.classList.remove('active');
    });

    const view = document.getElementById(`${viewName}-view`);
    if (view) {
        view.classList.add('active');
        const viewTitle = document.getElementById('view-title');
        const viewDescription = document.querySelector('.view-description');

        if (viewName === 'list') {
            viewTitle.textContent = 'タスクリスト';
            viewDescription.textContent = 'タスクを管理して生産性を向上させましょう';
        } else if (viewName === 'calendar') {
            viewTitle.textContent = 'カレンダー';
            viewDescription.textContent = 'スケジュールを視覚的に管理しましょう';
        }

        if (viewName === 'calendar' && store.calendar) {
            setTimeout(() => {
                store.calendar.updateSize();
            }, 100);
        }
    }
}

function setupAiEvents() {
    const btn = document.getElementById("gemini-trigger-btn");
    if (btn) btn.addEventListener("click", handleAiInteraction);
}

function setupUndoRedoEvents() {
    // Already defined in ui.js? No, listeners.
    document.getElementById("undo-btn")?.addEventListener("click", () => {
        import('./ui.js').then(m => {
            if (store.undoStack.length === 0) return;
            store.redoStack.push(JSON.parse(JSON.stringify({ tasks: store.tasks, labels: store.labels })));
            const prevState = store.undoStack.pop();
            forceSaveAllData(prevState, 'undo');
            m.updateUndoRedoButtons();
        });
    });
    document.getElementById("redo-btn")?.addEventListener("click", () => {
        import('./ui.js').then(m => {
            if (store.redoStack.length === 0) return;
            store.undoStack.push(JSON.parse(JSON.stringify({ tasks: store.tasks, labels: store.labels })));
            const nextState = store.redoStack.pop();
            forceSaveAllData(nextState, 'redo');
            m.updateUndoRedoButtons();
        });
    });
}

function setupWindowEvents() {
    window.addEventListener("resize", () => {
        if (store.calendar) {
            store.calendar.changeView(window.innerWidth < 1024 ? "listWeek" : "dayGridMonth");
            store.calendar.updateSize();
        }
    });
    window.addEventListener('beforeunload', (event) => {
        const hasChanges = Object.values(store.changedItems.tasks).some(s => s.size > 0) || Object.values(store.changedItems.labels).some(s => s.size > 0);
        if (hasChanges) {
            event.preventDefault();
            event.returnValue = '未保存の変更があります。ページを離れてもよろしいですか？';
        }
    });
}

async function handleAiInteraction() {
    const promptText = document.getElementById("gemini-prompt").value.trim();
    if (!promptText) return alert("プロンプトを入力してください。");
    const geminiBtn = document.getElementById("gemini-trigger-btn");
    geminiBtn.disabled = true;
    geminiBtn.querySelector(".default-text").style.display = "none";
    geminiBtn.querySelector(".loading-indicator").style.display = "flex";
    try {
        pushToUndoStack();
        import('./api.js').then(async m => {
            const res = await m.fetchWithAuth(`${WORKER_URL}/api/ai`, {
                method: "POST",
                body: JSON.stringify({ prompt: promptText, context: { tasks: store.tasks, labels: store.labels } }),
            });
            if (!res.ok) throw new Error((await res.json()).error || `AI APIエラー`);
            const data = await res.json();
            const newState = { tasks: data.tasks || store.tasks, labels: data.labels || store.labels };
            await forceSaveAllData(newState, 'ai');
            document.getElementById("gemini-prompt").value = "";
        });
    } catch (error) {
        alert("AIアシスタントの処理中にエラーが発生しました: " + error.message);
        if (store.undoStack.length > 0) {
            const prevState = store.undoStack.pop();
            await forceSaveAllData(prevState, 'ai-revert');
        }
    } finally {
        geminiBtn.disabled = false;
        geminiBtn.querySelector(".default-text").style.display = "inline";
        geminiBtn.querySelector(".loading-indicator").style.display = "none";
    }
}
