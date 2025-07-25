// ===============================================
// 定数
// ===============================================
const WORKER_URL = "https://pliny-worker.youguitest.workers.dev"; // あなたのWorkerのURLに書き換えてください
const PRESET_COLORS = [
  "#007aff",
  "#ff9500",
  "#34c759",
  "#ff3b30",
  "#af52de",
  "#5856d6",
  "#ff2d55",
  "#ffcc00",
  "#8e8e93",
];
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
let currentDataVersion = null;
let authToken = null;
let userEmail = null;

let saveDataDebounceTimer = null;
let changedItems = {
  tasks: { created: new Set(), updated: new Set(), deleted: new Set() },
  labels: { created: new Set(), updated: new Set(), deleted: new Set() },
};

// ===============================================
// 認証関連
// ===============================================
function saveToken(token, email) {
  localStorage.setItem("pliny_auth_token", token);
  localStorage.setItem("pliny_user_email", email);
  authToken = token;
  userEmail = email;
}

function loadToken() {
  authToken = localStorage.getItem("pliny_auth_token");
  userEmail = localStorage.getItem("pliny_user_email");
}

function clearToken() {
  localStorage.removeItem("pliny_auth_token");
  localStorage.removeItem("pliny_user_email");
  authToken = null;
  userEmail = null;
}

function showAuthMessage(message, type = "error") {
  const messageArea = document.getElementById("auth-message-area");
  messageArea.textContent = message;
  messageArea.className = `auth-message ${type}`;
  messageArea.style.display = message ? "block" : "none";
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  try {
    const res = await fetch(`${WORKER_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "ログインに失敗しました。");

    saveToken(data.token, data.email);
    initializeApp();
  } catch (err) {
    showAuthMessage(err.message);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const email = document.getElementById("register-email").value;
  const password = document.getElementById("register-password").value;

  try {
    const res = await fetch(`${WORKER_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "登録に失敗しました。");

    showAuthMessage(data.message, "success");
    document.getElementById("register-form").style.display = "none";
    document.getElementById("login-form").style.display = "block";
    document.getElementById("login-email").value = email;
  } catch (err) {
    showAuthMessage(err.message);
  }
}

function handleLogout() {
  clearToken();
  tasks = [];
  labels = [];
  undoStack = [];
  redoStack = [];
  currentDataVersion = null;
  clearTrackedChanges();
  clearTimeout(saveDataDebounceTimer);
  document.getElementById("app-container").style.display = "none";
  document.getElementById("auth-overlay").style.display = "flex";
}

async function fetchWithAuth(url, options = {}) {
  const headers = { ...options.headers, "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    handleLogout();
    throw new Error("認証が切れました。再度ログインしてください。");
  }
  return res;
}

// ===============================================
// 初期化処理
// ===============================================
document.addEventListener("DOMContentLoaded", () => {
  loadToken();
  if (authToken) {
    initializeApp();
  } else {
    document.getElementById("auth-overlay").style.display = "flex";
    bindAuthEvents();
  }
});

function bindAuthEvents() {
  document.getElementById("login-form").addEventListener("submit", handleLogin);
  document.getElementById("register-form").addEventListener("submit", handleRegister);
  document.getElementById("show-register-form").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("login-form").style.display = "none";
    document.getElementById("register-form").style.display = "block";
    showAuthMessage("");
  });
  document.getElementById("show-login-form").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("register-form").style.display = "none";
    document.getElementById("login-form").style.display = "block";
    showAuthMessage("");
  });
}

function initializeApp() {
  document.getElementById("auth-overlay").style.display = "none";
  document.getElementById("app-container").style.display = "flex";
  document.getElementById("user-email-display").textContent = userEmail;

  initializeFlatpickr();
  initializeCalendar();
  initializeIcons();
  bindGlobalEvents();
  loadData();
}

function initializeFlatpickr() {
  const dueDateInput = document.getElementById("task-due-date");
  if (dueDateInput._flatpickr) dueDateInput._flatpickr.destroy();
  dueDateInput._flatpickr = flatpickr(dueDateInput, {
    mode: "range",
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "Y年m月d日",
    locale: "ja",
    minDate: "today",
  });
}

function initializeIcons() {
  document.getElementById("undo-btn").innerHTML = ICONS.undo;
  document.getElementById("redo-btn").innerHTML = ICONS.redo;
}

function initializeCalendar() {
  const calendarContainer = document.getElementById("calendar-container");
  if (!calendarContainer) return;
  if (calendar) calendar.destroy();
  calendar = new FullCalendar.Calendar(calendarContainer, {
    initialView: "dayGridMonth",
    locale: "ja",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,listWeek",
    },
    height: "100%",
    editable: true,
    eventDrop: handleEventDrop,
    eventResize: handleEventResize,
  });
  calendar.render();
}

async function loadData() {
  document.getElementById("loading-overlay").style.display = "flex";
  try {
    const res = await fetchWithAuth(`${WORKER_URL}/api/data`);
    if (!res.ok) throw new Error((await res.json()).error || "サーバーエラー");
    const data = await res.json();
    currentDataVersion = data.version;
    tasks = Array.isArray(data.tasks) ? data.tasks.map(normalizeTask) : [];
    labels = Array.isArray(data.labels) ? data.labels : [];
    clearTrackedChanges();
    renderAll();
  } catch (e) {
    alert("データの読み込みに失敗しました: " + e.message);
  } finally {
    document.getElementById("loading-overlay").style.display = "none";
  }
}

// ===============================================
// データ保存ロジック (差分更新 + デバウンス)
// ===============================================

function updateSaveStatus(status, message = "") {
  const indicator = document.getElementById("save-status-indicator");
  if (!indicator) return;
  const statusMap = {
    saved: "すべての変更を保存しました",
    saving: "保存中...",
    unsaved: "未保存の変更があります",
    error: "保存に失敗しました",
  };
  indicator.textContent = message || statusMap[status] || "";
  indicator.style.opacity = status === "unsaved" || status === "saving" ? "1" : "0";
  if (status === 'saved') {
    indicator.style.opacity = '1';
    setTimeout(() => {
        if(indicator.textContent === statusMap.saved) {
             indicator.style.opacity = '0';
        }
    }, 2000);
  }
}

function trackChange(type, action, id) {
  const target = type === 'task' ? changedItems.tasks : changedItems.labels;
  if (target.deleted.has(id)) return;
  if (action === 'updated' && target.created.has(id)) return;
  if (action === 'deleted' && target.created.has(id)) {
      target.created.delete(id);
      return;
  }
  if (action === 'deleted' && target.updated.has(id)) {
      target.updated.delete(id);
  }
  target[action].add(id);
}

function clearTrackedChanges() {
  changedItems = {
    tasks: { created: new Set(), updated: new Set(), deleted: new Set() },
    labels: { created: new Set(), updated: new Set(), deleted: new Set() },
  };
}

async function sendChangesToServer() {
  const hasTaskChanges = Object.values(changedItems.tasks).some(set => set.size > 0);
  const hasLabelChanges = Object.values(changedItems.labels).some(set => set.size > 0);
  if (!hasTaskChanges && !hasLabelChanges) {
    updateSaveStatus('saved');
    return;
  }
  
  updateSaveStatus('saving');
  const patch = {
    tasks: {
      created: Array.from(changedItems.tasks.created).map(id => tasks.find(t => t.id === id)).filter(Boolean),
      updated: Array.from(changedItems.tasks.updated).map(id => tasks.find(t => t.id === id)).filter(Boolean),
      deleted: Array.from(changedItems.tasks.deleted),
    },
    labels: {
      created: Array.from(changedItems.labels.created).map(id => labels.find(l => l.id === id)).filter(Boolean),
      updated: Array.from(changedItems.labels.updated).map(id => labels.find(l => l.id === id)).filter(Boolean),
      deleted: Array.from(changedItems.labels.deleted),
    },
    expectedVersion: currentDataVersion,
  };

  try {
    const res = await fetchWithAuth(`${WORKER_URL}/api/data`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (res.status === 409) {
        // この一般的な競合はモーダルで表示
        document.getElementById("conflict-modal").style.display = "flex";
        document.getElementById("conflict-modal-ok-btn").onclick = () => {
            document.getElementById("conflict-modal").style.display = "none";
            loadData();
        };
        return;
    }
    if (!res.ok) throw new Error((await res.json()).error || "保存失敗");
    const result = await res.json();
    currentDataVersion = result.version;
    clearTrackedChanges();
    updateSaveStatus('saved');
  } catch (error) {
    updateSaveStatus('error');
    alert(`データの保存に失敗しました: ${error.message}`);
  }
}

function scheduleSave() {
  renderAll();
  updateSaveStatus('unsaved');
  clearTimeout(saveDataDebounceTimer);
  saveDataDebounceTimer = setTimeout(sendChangesToServer, 2000);
}

async function forceSaveAllData(state) {
    clearTimeout(saveDataDebounceTimer);
    updateSaveStatus('saving', 'データを同期中...');
    try {
        const res = await fetchWithAuth(`${WORKER_URL}/api/data`, {
            method: 'PUT',
            body: JSON.stringify({
                tasks: state.tasks.map(normalizeTask).filter(Boolean),
                labels: state.labels,
                expectedVersion: currentDataVersion,
            }),
        });
        if (res.status === 409) {
            document.getElementById("conflict-modal").style.display = "flex";
            document.getElementById("conflict-modal-ok-btn").onclick = () => {
                document.getElementById("conflict-modal").style.display = "none";
                loadData();
            };
            return;
        }
        if (!res.ok) throw new Error((await res.json()).error || "同期に失敗しました");
        const result = await res.json();
        currentDataVersion = result.version;
        tasks = state.tasks;
        labels = state.labels;
        clearTrackedChanges();
        renderAll();
        updateSaveStatus('saved');
    } catch (error) {
        alert(`データの同期に失敗しました: ${error.message}`);
        updateSaveStatus('error');
    }
}

// ===============================================
// 描画処理
// ===============================================
function renderAll() {
  if (!Array.isArray(tasks)) tasks = [];
  if (!Array.isArray(labels)) labels = [];
  renderTaskList();
  renderCalendar();
  renderLabelEditor();
  renderAddTaskLabelSelector();
  updateUndoRedoButtons();
}

function renderTaskList() {
  const container = document.getElementById("task-list-container");
  if (!container) return;
  container.innerHTML = "";
  const map = new Map(tasks.map((t) => [t.id, { ...t, children: [] }]));
  const roots = [];
  map.forEach((task) => {
    if (task.parentId && map.has(task.parentId)) {
      map.get(task.parentId).children.push(task);
    } else {
      roots.push(task);
    }
  });

  function draw(node, parent, level) {
    const isCollapsed = node.isCollapsed ?? true;
    const hasChildren = node.children.length > 0;
    const highestPrioLabel = getHighestPriorityLabel(node);
    const labelColor = highestPrioLabel ? highestPrioLabel.color : "transparent";

    const el = document.createElement("div");
    el.className = "task-node";
    el.style.setProperty("--level", level);
    el.innerHTML = `
        <div class="task-card ${node.completed ? "completed" : ""} ${labelColor !== "transparent" ? "has-label-color" : ""}" data-task-id="${node.id}" draggable="true" style="--label-color: ${labelColor};">
            <div class="task-card-main">
                <div class="task-toggle ${hasChildren ? "" : "hidden"} ${isCollapsed ? "" : "collapsed"}" data-action="toggle">${ICONS.chevron}</div>
                <div class="task-content-wrapper">
                    <span class="task-text">${(node.text || "").replace(/</g, "<")}</span>
                    <div class="task-meta">
                        <div class="task-labels">${(node.labelIds || [])
                          .map((id) => labels.find((l) => l.id.toString() === id.toString()))
                          .filter(Boolean)
                          .sort((a, b) => (a.priority || 99) - (b.priority || 99))
                          .map((l) => `<span class="task-label-badge">${l.name}</span>`)
                          .join("")}</div>
                        <span class="task-due-date">${formatDueDate(node.startDate, node.endDate)}</span>
                    </div>
                </div>
            </div>
            <div class="task-actions">
                <button data-action="edit-labels" title="ラベルを編集">${ICONS.label}</button>
                <button data-action="complete" title="${node.completed ? "未完了" : "完了"}">${ICONS.check}</button>
                <button data-action="delete" title="削除">${ICONS.delete}</button>
            </div>
        </div>`;
    parent.appendChild(el);
    if (hasChildren && !isCollapsed) {
      node.children
        .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
        .forEach((child) => draw(child, parent, level + 1));
    }
  }
  roots
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
    .forEach((root) => draw(root, container, 1));
}

function renderCalendar() {
  if (!calendar) return;
  calendar.getEventSources().forEach((source) => source.remove());
  const events = tasks
    .map((task) => {
      if (!task.startDate) return null;
      const exclusiveEndDate = new Date(task.endDate + "T00:00:00Z");
      exclusiveEndDate.setUTCDate(exclusiveEndDate.getUTCDate() + 1);
      const highestPrioLabel = getHighestPriorityLabel(task);
      const eventColor = task.completed ? "#adb5bd" : highestPrioLabel?.color || "#007aff";
      return {
        id: task.id,
        title: task.text,
        start: task.startDate,
        end: exclusiveEndDate.toISOString().split("T")[0],
        allDay: true,
        backgroundColor: eventColor,
        borderColor: eventColor,
      };
    })
    .filter(Boolean);
  calendar.addEventSource(events);
}

function renderLabelEditor() {
  renderLabelList();
  renderLabelAddForm();
}

function renderLabelList() {
  const listContainer = document.getElementById("label-editor-list");
  if (!listContainer) return;
  listContainer.innerHTML = "";
  labels
    .sort((a, b) => (a.priority || 99) - (b.priority || 99))
    .forEach((label) => {
      const item = document.createElement("div");
      item.className = "label-editor-item";
      item.dataset.id = label.id;
      item.innerHTML = `
            <div class="label-color-preview" style="background-color: ${label.color}"></div>
            <input type="text" class="label-name-input" value="${label.name}">
            <div class="priority-control-container"></div>
            <button class="label-editor-controls delete-label-btn" title="ラベルを削除">${ICONS.delete}</button>`;

      item.querySelector(".label-color-preview").onclick = (e) => {
        e.stopPropagation();
        showColorPalette(e.target, label);
      };
      item.querySelector(".label-name-input").onblur = (e) => {
        if (e.target.value.trim() !== label.name) {
          pushToUndoStack();
          label.name = e.target.value.trim();
          trackChange('label', 'updated', label.id);
          scheduleSave();
        }
      };
      item.querySelector(".delete-label-btn").onclick = () => {
        if (confirm(`「${label.name}」を削除しますか？`)) {
          pushToUndoStack();
          trackChange('label', 'deleted', label.id);
          labels = labels.filter((l) => l.id !== label.id);
          tasks.forEach((t) => {
              if (t.labelIds.includes(label.id)) {
                  t.labelIds = t.labelIds.filter((id) => id !== label.id);
                  trackChange('task', 'updated', t.id);
              }
          });
          scheduleSave();
        }
      };
      item.querySelector(".priority-control-container").appendChild(createPriorityControl(label));
      listContainer.appendChild(item);
    });
}

function createPriorityControl(label) {
  const control = document.createElement("div");
  control.className = "priority-control";
  [{ p: 1, t: "高" }, { p: 2, t: "中" }, { p: 3, t: "低" }].forEach((prio) => {
    const btn = document.createElement("button");
    btn.textContent = prio.t;
    btn.className = label.priority === prio.p ? "active" : "";
    btn.onclick = () => {
      pushToUndoStack();
      label.priority = prio.p;
      trackChange('label', 'updated', label.id);
      scheduleSave();
    };
    control.appendChild(btn);
  });
  return control;
}

function renderLabelAddForm() {
  const addContainer = document.getElementById("label-add-container");
  if (!addContainer) return;
  addContainer.innerHTML = `<form id="new-label-form"><div class="form-row"><input type="text" id="new-label-name" placeholder="新しいラベル名" required><button type="submit" id="add-new-label-btn">${ICONS.plus}</button></div></form>`;
  document.getElementById("new-label-form").onsubmit = (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("new-label-name");
    if (nameInput.value.trim()) {
      pushToUndoStack();
      const newLabel = {
        id: `label-${Date.now()}`,
        name: nameInput.value.trim(),
        color: PRESET_COLORS[labels.length % PRESET_COLORS.length],
        priority: (labels.length > 0 ? Math.max(...labels.map((l) => l.priority || 0)) : 0) + 1,
      };
      labels.push(newLabel);
      trackChange('label', 'created', newLabel.id);
      scheduleSave();
      nameInput.value = "";
    }
  };
}

function renderAddTaskLabelSelector() {
  const container = document.getElementById("add-task-label-selector");
  if (!container) return;
  container.innerHTML = "";
  labels.forEach((label) => {
    const item = document.createElement("label");
    item.className = "label-checkbox-item";
    item.innerHTML = `<input type="checkbox" value="${label.id}"><div class="label-color-dot" style="background-color:${label.color}"></div><span>${label.name}</span>`;
    item.onclick = (e) => {
      e.preventDefault();
      item.classList.toggle("selected");
      const checkbox = item.querySelector("input");
      checkbox.checked = !checkbox.checked;
    };
    container.appendChild(item);
  });
}

// ===============================================
// UIコンポーネント
// ===============================================
function showColorPalette(anchor, label) {
  closeAllPopovers();
  const palette = document.createElement("div");
  palette.className = "popover color-palette";
  PRESET_COLORS.forEach((color) => {
    const colorBox = document.createElement("div");
    colorBox.className = "color-box";
    colorBox.style.backgroundColor = color;
    if (color === label.color) colorBox.classList.add("selected");
    colorBox.onclick = () => {
      pushToUndoStack();
      label.color = color;
      trackChange('label', 'updated', label.id);
      scheduleSave();
      closeAllPopovers();
    };
    palette.appendChild(colorBox);
  });
  document.body.appendChild(palette);
  positionPopover(anchor, palette);
  palette.style.display = "grid";
}

function positionPopover(anchor, popover) {
  const anchorRect = anchor.getBoundingClientRect();
  popover.style.position = "absolute";
  popover.style.left = `${anchorRect.left}px`;
  popover.style.top = `${anchorRect.bottom + 8}px`;
  popover.style.zIndex = 1001;
}

function closeAllPopovers() {
  document.querySelectorAll(".popover").forEach((p) => p.remove());
}

// ===============================================
// ★★★ ラベル編集モーダル関連 (新規・修正) ★★★
// ===============================================
/**
 * ラベル編集モーダルを開く
 * @param {object} taskToEdit - 編集対象のタスクオブジェクト
 */
function openLabelEditorModal(taskToEdit) {
    const modal = document.getElementById('label-editor-modal');
    if (!modal) return;

    modal.dataset.taskId = taskToEdit.id;
    document.getElementById('modal-task-name').textContent = taskToEdit.text;

    const listContainer = document.getElementById('modal-label-list');
    listContainer.innerHTML = '';
    labels
        .sort((a, b) => (a.priority || 99) - (b.priority || 99))
        .forEach(label => {
            const isChecked = taskToEdit.labelIds.includes(label.id);
            const item = document.createElement('label');
            item.className = 'modal-label-item';
            item.innerHTML = `
                <input type="checkbox" value="${label.id}" ${isChecked ? 'checked' : ''}>
                <span class="label-color-dot" style="background-color: ${label.color};"></span>
                <span class="label-name">${label.name}</span>
            `;
            listContainer.appendChild(item);
        });
    
    modal.style.display = 'flex';
}

function closeLabelEditorModal() {
    const modal = document.getElementById('label-editor-modal');
    if (modal) modal.style.display = 'none';
}

/**
 * タスクのラベル変更を保存（自動リトライ付き）
 * @param {string} taskId - 対象タスクのID
 * @param {string[]} newLabelIds - 新しいラベルIDの配列
 * @param {number} retryCount - リトライ回数（内部使用）
 */
async function saveTaskLabelChanges(taskId, newLabelIds, retryCount = 0) {
    if (retryCount > 2) { // 3回失敗したら諦める
        alert("サーバーとの同期に繰り返し失敗しました。ページをリロードしてください。");
        updateSaveStatus('error');
        return;
    }
    
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    pushToUndoStack();
    task.labelIds = newLabelIds;
    trackChange('task', 'updated', taskId);

    // デバウンスをキャンセルして即時保存
    clearTimeout(saveDataDebounceTimer);
    updateSaveStatus('saving');
    
    const patch = {
        tasks: { updated: [task] },
        labels: {},
        expectedVersion: currentDataVersion,
    };

    try {
        const res = await fetchWithAuth(`${WORKER_URL}/api/data`, {
            method: "PATCH",
            body: JSON.stringify(patch),
        });

        if (res.status === 409) {
            // ★★★ 競合発生！自動リトライ処理 ★★★
            console.warn("Conflict detected. Retrying label update...");
            // 1. 最新データを取得
            const latestDataRes = await fetchWithAuth(`${WORKER_URL}/api/data`);
            const latestData = await latestDataRes.json();
            // 2. ローカルデータを更新
            tasks = latestData.tasks.map(normalizeTask);
            labels = latestData.labels;
            currentDataVersion = latestData.version;
            // 3. 変更を再適用してリトライ
            await saveTaskLabelChanges(taskId, newLabelIds, retryCount + 1);
            return; // リトライに任せるのでここで終了
        }

        if (!res.ok) throw new Error((await res.json()).error || "保存失敗");

        const result = await res.json();
        currentDataVersion = result.version;
        clearTrackedChanges(); // 今回の変更は保存されたのでクリア
        renderAll(); // UIを最新の状態に
        updateSaveStatus('saved');
        closeLabelEditorModal();

    } catch (error) {
        updateSaveStatus('error');
        alert(`ラベルの保存に失敗しました: ${error.message}`);
    }
}


// ===============================================
// ヘルパー関数
// ===============================================
function normalizeTask(task) {
  if (!task) return null;
  const today = new Date().toISOString().split("T")[0];
  const startDate = task.startDate || today;
  return {
    id: task.id || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    text: task.text || "(無題)",
    startDate,
    endDate: task.endDate || startDate,
    completed: !!task.completed,
    labelIds: Array.isArray(task.labelIds) ? task.labelIds : [],
    parentId: task.parentId || null,
    isCollapsed: task.isCollapsed ?? true,
  };
}

function formatDueDate(start, end) {
  if (!start) return "";
  try {
    const startDate = new Date(start + "T00:00:00");
    if (!end || start === end)
      return startDate.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
    const endDate = new Date(end + "T00:00:00");
    return `${startDate.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })} → ${endDate.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}`;
  } catch (e) {
    return "無効な日付";
  }
}

function getHighestPriorityLabel(task) {
  if (!task.labelIds || task.labelIds.length === 0) return null;
  return task.labelIds
    .map((id) => labels.find((l) => l.id.toString() === id.toString()))
    .filter(Boolean)
    .sort((a, b) => (a.priority || 99) - (b.priority || 99))[0];
}

// ===============================================
// イベントハンドラ
// ===============================================
function bindGlobalEvents() {
  document.addEventListener("click", (e) => {
    if (!e.target.closest('.popover, #label-editor-modal .modal-content')) closeAllPopovers();
  });
  document.getElementById("logout-btn").addEventListener("click", handleLogout);

  bindAccordionEvents();
  setupTaskFormEvents();
  setupTaskListEvents();
  setupViewSwitcherEvents();
  setupUndoRedoEvents();
  setupAiEvents();
  setupDataManagerEvents();
  setupWindowEvents();
  // ★★★ ラベル編集モーダルのイベントをバインド
  setupLabelEditorModalEvents();
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

    tasks.push(newTask);
    trackChange('task', 'created', newTask.id);
    scheduleSave();

    form.reset();
    document.getElementById("task-due-date")._flatpickr.clear();
    document.querySelectorAll("#add-task-label-selector .selected").forEach((el) => el.classList.remove("selected"));
  });
}

function setupTaskListEvents() {
  const container = document.getElementById("task-list-container");
  if (!container) return;
  container.addEventListener("click", (e) => {
    const actionTarget = e.target.closest("[data-action]");
    if (!actionTarget) return;
    const taskCard = e.target.closest(".task-card");
    if (!taskCard) return;
    const task = tasks.find((t) => t.id === taskCard.dataset.taskId);
    if (!task) return;

    let shouldScheduleSave = false;

    switch (actionTarget.dataset.action) {
      case "toggle":
        task.isCollapsed = !task.isCollapsed;
        trackChange('task', 'updated', task.id);
        shouldScheduleSave = true;
        break;
      case "complete":
        pushToUndoStack();
        task.completed = !task.completed;
        trackChange('task', 'updated', task.id);
        shouldScheduleSave = true;
        break;
      case "edit-labels":
        e.stopPropagation();
        openLabelEditorModal(task); // ★★★ ここを変更
        break;
      case "delete":
        pushToUndoStack();
        const descendantIds = tasks.filter((t) => t.parentId === task.id).map((t) => t.id);
        if (confirm(`このタスクと${descendantIds.length}個の子タスクを削除しますか？`)) {
          const allIdsToDelete = [task.id, ...descendantIds];
          allIdsToDelete.forEach(id => trackChange('task', 'deleted', id));
          tasks = tasks.filter((t) => !allIdsToDelete.includes(t.id));
          shouldScheduleSave = true;
        }
        break;
      default: break;
    }
    if (shouldScheduleSave) scheduleSave();
    else renderAll();
  });
  setupDragAndDropEvents(container);
}

// ★★★ ラベル編集モーダルのイベントリスナーをセットアップ
function setupLabelEditorModalEvents() {
    const modal = document.getElementById('label-editor-modal');
    if(!modal) return;

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
                color: PRESET_COLORS[labels.length % PRESET_COLORS.length],
                priority: (labels.length > 0 ? Math.max(...labels.map(l => l.priority || 0)) : 0) + 1,
            };
            labels.push(newLabel);
            trackChange('label', 'created', newLabel.id);
            
            // モーダル内のリストを再描画して、新しいラベルを即座に表示・選択可能にする
            const task = tasks.find(t => t.id === modal.dataset.taskId);
            if (task) openLabelEditorModal(task);
            
            nameInput.value = '';
            scheduleSave(); // 新規ラベルを保存
        }
    });
}

function setupDragAndDropEvents(container) {
  let draggedElement = null;
  container.addEventListener("dragstart", (e) => {
    const card = e.target.closest(".task-card");
    if (card) {
      draggedElement = card;
      e.dataTransfer.setData("text/plain", card.dataset.taskId);
      setTimeout(() => card.classList.add("dragging"), 0);
    }
  });
  container.addEventListener("dragend", () => {
    if (draggedElement) {
      draggedElement.classList.remove("dragging");
      draggedElement = null;
    }
  });
  container.addEventListener("dragover", (e) => e.preventDefault());
  container.addEventListener("drop", (e) => {
    e.preventDefault();
    const targetCard = e.target.closest(".task-card");
    if (!targetCard || !draggedElement) return;
    const draggedId = e.dataTransfer.getData("text/plain");
    const targetId = targetCard.dataset.taskId;
    if (draggedId === targetId) return;

    const draggedTask = tasks.find((t) => t.id === draggedId);
    if (!draggedTask) return;

    let p = tasks.find((t) => t.id === targetId);
    while (p) {
      if (p.id === draggedId) {
        alert("自分の子孫タスクにはできません。");
        return;
      }
      p = tasks.find((t) => t.id === p.parentId);
    }

    pushToUndoStack();
    draggedTask.parentId = targetId;
    trackChange('task', 'updated', draggedTask.id);
    
    const targetTask = tasks.find((t) => t.id === targetId);
    if (targetTask) {
        targetTask.isCollapsed = false;
        trackChange('task', 'updated', targetTask.id);
    }
    scheduleSave();
  });
}

function setupDataManagerEvents() {
  document.getElementById("export-json-btn")?.addEventListener("click", () => {
    const dataStr = JSON.stringify({ tasks, labels, version: currentDataVersion }, null, 2);
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
          const taskIds = new Set(tasks.map((t) => t.id));
          const labelIds = new Set(labels.map((l) => l.id));
          const newTasks = [...tasks, ...data.tasks.filter((t) => !taskIds.has(t.id))];
          const newLabels = [...labels, ...data.labels.filter((l) => !labelIds.has(l.id))];
          importedState = {tasks: newTasks, labels: newLabels};
        } else {
          importedState = {tasks: data.tasks, labels: data.labels};
        }
        alert("インポートが完了しました。データを同期します。");
        await forceSaveAllData(importedState);
      } catch (e) {
        alert(`インポート失敗: ${e.message}`);
      }
    };
    reader.readAsText(fileInput.files[0]);
  });
}

function setupAiEvents() {
  const btn = document.getElementById("gemini-trigger-btn");
  if (btn) btn.addEventListener("click", handleAiInteraction);
}

function setupViewSwitcherEvents() {
  document.getElementById("show-list-btn")?.addEventListener("click", () => switchView("list"));
  document.getElementById("show-calendar-btn")?.addEventListener("click", () => switchView("calendar"));
}

function setupUndoRedoEvents() {
  document.getElementById("undo-btn")?.addEventListener("click", handleUndo);
  document.getElementById("redo-btn")?.addEventListener("click", handleRedo);
}

function setupWindowEvents() {
  window.addEventListener("resize", () => {
    if (calendar) {
      calendar.changeView(window.innerWidth < 1024 ? "listWeek" : "dayGridMonth");
      calendar.updateSize();
    }
  });
  if (calendar) {
    calendar.changeView(window.innerWidth < 1024 ? "listWeek" : "dayGridMonth");
  }
  window.addEventListener('beforeunload', (event) => {
    const hasChanges = Object.values(changedItems.tasks).some(s => s.size > 0) || Object.values(changedItems.labels).some(s => s.size > 0);
    if (hasChanges) {
      event.preventDefault();
      event.returnValue = '未保存の変更があります。ページを離れてもよろしいですか？';
    }
  });
}

function bindAccordionEvents() {
  const leftPane = document.getElementById("left-pane");
  if (!leftPane) return;
  leftPane.addEventListener("click", function (e) {
    const toggleButton = e.target.closest(".accordion-toggle");
    if (!toggleButton) return;
    const currentAccordion = toggleButton.closest(".accordion");
    if (!currentAccordion) return;
    const isMobileView = window.innerWidth <= 768;
    if (isMobileView) {
      document.querySelectorAll(".accordion").forEach((accordion) => {
        if (accordion !== currentAccordion) {
          accordion.classList.remove("active");
          accordion.querySelector(".accordion-content").style.display = "none";
        }
      });
    }
    const content = currentAccordion.querySelector(".accordion-content");
    const isActive = currentAccordion.classList.toggle("active");
    content.style.display = isActive ? "flex" : "none";
  });
}

function switchView(view) {
  const listView = document.getElementById("list-view");
  const calendarView = document.getElementById("calendar-view");
  const listBtn = document.getElementById("show-list-btn");
  const calendarBtn = document.getElementById("show-calendar-btn");
  const viewTitle = document.getElementById("view-title");

  if (view === "list") {
    listView.style.display = "block";
    calendarView.style.display = "none";
    listBtn.classList.add("active");
    calendarBtn.classList.remove("active");
    viewTitle.textContent = "タスクリスト";
  } else {
    listView.style.display = "none";
    calendarView.style.display = "flex";
    listBtn.classList.remove("active");
    calendarBtn.classList.add("active");
    viewTitle.textContent = "カレンダー";
    if (calendar) {
      calendar.updateSize();
    }
  }
}

async function handleEventDrop({ event }) {
  const task = tasks.find((t) => t.id === event.id);
  if (!task) return;
  pushToUndoStack();
  const originalDuration = new Date(task.endDate) - new Date(task.startDate);
  const newStartDate = event.start;
  const newEndDate = new Date(newStartDate.getTime() + originalDuration);
  const formatDate = (date) => date.toISOString().split("T")[0];
  task.startDate = formatDate(newStartDate);
  task.endDate = formatDate(newEndDate);
  trackChange('task', 'updated', task.id);
  scheduleSave();
}

async function handleEventResize({ event }) {
  const task = tasks.find((t) => t.id === event.id);
  if (!task) return;
  pushToUndoStack();
  const formatDate = (date) => date.toISOString().split("T")[0];
  const inclusiveEndDate = new Date(event.end);
  inclusiveEndDate.setDate(inclusiveEndDate.getDate() - 1);
  task.startDate = formatDate(event.start);
  task.endDate = formatDate(inclusiveEndDate);
  trackChange('task', 'updated', task.id);
  scheduleSave();
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById("undo-btn");
  const redoBtn = document.getElementById("redo-btn");
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

function pushToUndoStack() {
  undoStack.push(JSON.parse(JSON.stringify({ tasks, labels })));
  redoStack = [];
  updateUndoRedoButtons();
}

async function handleUndo() {
  if (undoStack.length === 0) return;
  redoStack.push(JSON.parse(JSON.stringify({ tasks, labels })));
  const prevState = undoStack.pop();
  await forceSaveAllData(prevState);
  updateUndoRedoButtons();
}

async function handleRedo() {
  if (redoStack.length === 0) return;
  undoStack.push(JSON.parse(JSON.stringify({ tasks, labels })));
  const nextState = redoStack.pop();
  await forceSaveAllData(nextState);
  updateUndoRedoButtons();
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
    const res = await fetchWithAuth(`${WORKER_URL}/api/ai`, {
      method: "POST",
      body: JSON.stringify({ prompt: promptText, context: { tasks, labels } }),
    });
    if (!res.ok) throw new Error((await res.json()).error || `AI APIエラー`);
    const data = await res.json();
    const newState = { tasks: data.tasks || tasks, labels: data.labels || labels };
    await forceSaveAllData(newState);
    document.getElementById("gemini-prompt").value = "";
  } catch (error) {
    alert("AIアシスタントの処理中にエラーが発生しました: " + error.message);
    if(undoStack.length > 0){
        const prevState = undoStack.pop();
        await forceSaveAllData(prevState);
    }
  } finally {
    geminiBtn.disabled = false;
    geminiBtn.querySelector(".default-text").style.display = "inline";
    geminiBtn.querySelector(".loading-indicator").style.display = "none";
  }
}