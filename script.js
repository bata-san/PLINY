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
  document
    .getElementById("register-form")
    .addEventListener("submit", handleRegister);
  document
    .getElementById("show-register-form")
    .addEventListener("click", (e) => {
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
    renderAll();
  } catch (e) {
    alert("データの読み込みに失敗しました: " + e.message);
  } finally {
    document.getElementById("loading-overlay").style.display = "none";
  }
}

async function saveData(tasksToSave = tasks, labelsToSave = labels) {
  try {
    const res = await fetchWithAuth(`${WORKER_URL}/api/data`, {
      method: "PUT",
      body: JSON.stringify({
        tasks: tasksToSave.map(normalizeTask).filter(Boolean),
        labels: labelsToSave,
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
    if (!res.ok) throw new Error((await res.json()).error || "保存失敗");
    const result = await res.json();
    currentDataVersion = result.version;
  } catch (error) {
    alert(`データの保存に失敗しました: ${error.message}`);
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
    const labelColor = highestPrioLabel
      ? highestPrioLabel.color
      : "transparent";

    const el = document.createElement("div");
    el.className = "task-node";
    el.style.setProperty("--level", level);
    el.innerHTML = `
            <div class="task-card ${node.completed ? "completed" : ""} ${
      labelColor !== "transparent" ? "has-label-color" : ""
    }" data-task-id="${
      node.id
    }" draggable="true" style="--label-color: ${labelColor};">
                <div class="task-card-main">
                    <div class="task-toggle ${hasChildren ? "" : "hidden"} ${
      isCollapsed ? "" : "collapsed"
    }" data-action="toggle">${ICONS.chevron}</div>
                    <div class="task-content-wrapper">
                        <span class="task-text">${(node.text || "").replace(
                          /</g,
                          "<"
                        )}</span>
                        <div class="task-meta">
                            <div class="task-labels">${(node.labelIds || [])
                              .map((id) =>
                                labels.find(
                                  (l) => l.id.toString() === id.toString()
                                )
                              )
                              .filter(Boolean)
                              .sort(
                                (a, b) =>
                                  (a.priority || 99) - (b.priority || 99)
                              )
                              .map(
                                (l) =>
                                  `<span class="task-label-badge">${l.name}</span>`
                              )
                              .join("")}</div>
                            <span class="task-due-date">${formatDueDate(
                              node.startDate,
                              node.endDate
                            )}</span>
                        </div>
                    </div>
                </div>
                <div class="task-actions">
                    <button data-action="edit-labels" title="ラベルを編集">${
                      ICONS.label
                    }</button>
                    <button data-action="complete" title="${
                      node.completed ? "未完了" : "完了"
                    }">${ICONS.check}</button>
                    <button data-action="delete" title="削除">${
                      ICONS.delete
                    }</button>
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
      const eventColor = task.completed
        ? "#adb5bd"
        : highestPrioLabel?.color || "#007aff";

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
          saveDataAndRender();
        }
      };
      item.querySelector(".delete-label-btn").onclick = () => {
        if (confirm(`「${label.name}」を削除しますか？`)) {
          pushToUndoStack();
          labels = labels.filter((l) => l.id !== label.id);
          tasks.forEach(
            (t) => (t.labelIds = t.labelIds.filter((id) => id !== label.id))
          );
          saveDataAndRender();
        }
      };
      item
        .querySelector(".priority-control-container")
        .appendChild(createPriorityControl(label));
      listContainer.appendChild(item);
    });
}

function createPriorityControl(label) {
  const control = document.createElement("div");
  control.className = "priority-control";
  [
    { p: 1, t: "高" },
    { p: 2, t: "中" },
    { p: 3, t: "低" },
  ].forEach((prio) => {
    const btn = document.createElement("button");
    btn.textContent = prio.t;
    btn.className = label.priority === prio.p ? "active" : "";
    btn.onclick = () => {
      pushToUndoStack();
      label.priority = prio.p;
      saveDataAndRender();
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
      labels.push({
        id: `label-${Date.now()}`,
        name: nameInput.value.trim(),
        color: "transparent",
        priority:
          (labels.length > 0
            ? Math.max(...labels.map((l) => l.priority || 0))
            : 0) + 1,
      });
      saveDataAndRender();
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
// UIコンポーネント (ポップオーバー)
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
      saveDataAndRender();
      closeAllPopovers();
    };
    palette.appendChild(colorBox);
  });
  document.body.appendChild(palette);
  positionPopover(anchor, palette);
  palette.style.display = "grid";
}

function showLabelSelectPopover(anchor, task) {
  closeAllPopovers();
  const popover = document.createElement("div");
  popover.className = "popover label-select-popover";
  popover.innerHTML = "<h3>ラベルを選択</h3>";
  const list = document.createElement("div");
  list.className = "label-select-list";
  labels.forEach((label) => {
    const item = document.createElement("label");
    item.className = "label-select-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = label.id;
    checkbox.checked = task.labelIds.includes(label.id);
    checkbox.onchange = () => {
      pushToUndoStack();
      if (checkbox.checked) {
        task.labelIds.push(label.id);
      } else {
        task.labelIds = task.labelIds.filter((id) => id !== label.id);
      }
      saveDataAndRender();
    };
    const colorDot = document.createElement("div");
    colorDot.className = "label-color-dot";
    colorDot.style.backgroundColor = label.color;

    item.appendChild(checkbox);
    item.appendChild(colorDot);
    item.innerHTML += `<span class="label-name">${label.name}</span>`;
    list.appendChild(item);
  });
  popover.appendChild(list);
  document.body.appendChild(popover);
  positionPopover(anchor, popover);
  popover.style.display = "block";
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
// ヘルパー関数
// ===============================================
function normalizeTask(task) {
  if (!task) return null;
  const today = new Date().toISOString().split("T")[0];
  const startDate = task.startDate || today;
  return {
    id: task.id || `task-${Date.now()}`,
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
      return startDate.toLocaleDateString("ja-JP", {
        month: "numeric",
        day: "numeric",
      });
    const endDate = new Date(end + "T00:00:00");
    return `${startDate.toLocaleDateString("ja-JP", {
      month: "numeric",
      day: "numeric",
    })} → ${endDate.toLocaleDateString("ja-JP", {
      month: "numeric",
      day: "numeric",
    })}`;
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

async function saveDataAndRender() {
  renderAll();
  await saveData();
}

// ===============================================
// イベントハンドラ
// ===============================================
function bindGlobalEvents() {
  document.addEventListener("click", (e) => {
    if (!e.target.closest('.popover, [data-action="edit-labels"]'))
      closeAllPopovers();
  });
  document.getElementById("logout-btn").addEventListener("click", handleLogout);

  bindAccordionEvents();

  setupTaskFormEvents();
  setupTaskListEvents();
  setupViewSwitcherEvents(); // ★ 定義を追加
  setupUndoRedoEvents(); // ★ 定義を追加
  setupAiEvents();
  setupDataManagerEvents();
  setupWindowEvents();
}

function setupTaskFormEvents() {
  const form = document.getElementById("task-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const taskInput = document.getElementById("task-input");
    const dates =
      document.getElementById("task-due-date")._flatpickr.selectedDates;
    if (!taskInput.value.trim() || dates.length === 0)
      return alert("タスク名と期間を入力してください。");

    pushToUndoStack();
    tasks.push(
      normalizeTask({
        text: taskInput.value.trim(),
        startDate: dates[0].toISOString().split("T")[0],
        endDate: (dates[1] || dates[0]).toISOString().split("T")[0],
        labelIds: Array.from(
          document.querySelectorAll("#add-task-label-selector .selected input")
        ).map((i) => i.value),
      })
    );
    await saveDataAndRender();

    form.reset();
    document.getElementById("task-due-date")._flatpickr.clear();
    document
      .querySelectorAll("#add-task-label-selector .selected")
      .forEach((el) => el.classList.remove("selected"));
  });
}

function setupTaskListEvents() {
  const container = document.getElementById("task-list-container");
  if (!container) return;

  container.addEventListener("click", async (e) => {
    const actionTarget = e.target.closest("[data-action]");
    if (!actionTarget) return;
    const taskCard = e.target.closest(".task-card");
    if (!taskCard) return;
    const task = tasks.find((t) => t.id === taskCard.dataset.taskId);
    if (!task) return;

    let shouldSave = true,
      shouldRender = true;
    pushToUndoStack();

    switch (actionTarget.dataset.action) {
      case "toggle":
        task.isCollapsed = !task.isCollapsed;
        shouldSave = false;
        break;
      case "complete":
        task.completed = !task.completed;
        break;
      case "edit-labels":
        e.stopPropagation();
        showLabelSelectPopover(actionTarget, task);
        shouldSave = shouldRender = false;
        break;
      case "delete":
        const descendantIds = tasks
          .filter((t) => t.parentId === task.id)
          .map((t) => t.id);
        if (
          confirm(
            `このタスクと${descendantIds.length}個の子タスクを削除しますか？`
          )
        ) {
          const allIdsToDelete = [task.id, ...descendantIds];
          tasks = tasks.filter((t) => !allIdsToDelete.includes(t.id));
        } else {
          shouldSave = shouldRender = false;
          undoStack.pop(); // キャンセルしたのでUndoスタックから削除
        }
        break;
      default:
        shouldSave = shouldRender = false;
        undoStack.pop();
    }

    if (shouldRender) renderAll();
    if (shouldSave) await saveData();
  });
  setupDragAndDropEvents(container);
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
  container.addEventListener("drop", async (e) => {
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
    const targetTask = tasks.find((t) => t.id === targetId);
    if (targetTask) targetTask.isCollapsed = false;
    await saveDataAndRender();
  });
}

function setupDataManagerEvents() {
  document.getElementById("export-json-btn")?.addEventListener("click", () => {
    const dataStr = JSON.stringify(
      { tasks, labels, version: currentDataVersion },
      null,
      2
    );
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
        if (!Array.isArray(data.tasks) || !Array.isArray(data.labels))
          throw new Error("無効な形式です。");
        pushToUndoStack();
        if (merge) {
          const taskIds = new Set(tasks.map((t) => t.id));
          const labelIds = new Set(labels.map((l) => l.id));
          tasks.push(...data.tasks.filter((t) => !taskIds.has(t.id)));
          labels.push(...data.labels.filter((l) => !labelIds.has(l.id)));
        } else {
          tasks = data.tasks;
          labels = data.labels;
        }
        alert("インポートが完了しました。");
        await saveDataAndRender();
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

// ★★★★★ ここからが前回抜けていた関数の定義です ★★★★★

function setupViewSwitcherEvents() {
  document
    .getElementById("show-list-btn")
    ?.addEventListener("click", () => switchView("list"));
  document
    .getElementById("show-calendar-btn")
    ?.addEventListener("click", () => switchView("calendar"));
}

function setupUndoRedoEvents() {
  document.getElementById("undo-btn")?.addEventListener("click", handleUndo);
  document.getElementById("redo-btn")?.addEventListener("click", handleRedo);
}

function setupWindowEvents() {
  window.addEventListener("resize", () => {
    if (calendar) {
      calendar.changeView(
        window.innerWidth < 1024 ? "listWeek" : "dayGridMonth"
      );
      calendar.updateSize();
    }
  });
  // 初期表示時にも一度実行
  if (calendar) {
    calendar.changeView(window.innerWidth < 1024 ? "listWeek" : "dayGridMonth");
  }
}

function bindAccordionEvents() {
  const leftPane = document.getElementById("left-pane");
  if (!leftPane) return;

  leftPane.addEventListener("click", function (e) {
    const toggleButton = e.target.closest(".accordion-toggle");
    if (!toggleButton) return;

    const currentAccordion = toggleButton.closest(".accordion");
    if (!currentAccordion) return;

    // モバイルビューかどうかを判定 (CSSのブレークポイントと合わせる)
    const isMobileView = window.innerWidth <= 768;

    if (isMobileView) {
      // モバイルの場合：他のアコーディオンを全て閉じる
      document.querySelectorAll(".accordion").forEach((accordion) => {
        if (accordion !== currentAccordion) {
          accordion.classList.remove("active");
          accordion.querySelector(".accordion-content").style.display = "none";
        }
      });
    }

    // クリックされたアコーディオンの開閉をトグル
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

async function handleEventDrop({ event, revert }) {
  const task = tasks.find((t) => t.id === event.id);
  if (!task) return revert();

  pushToUndoStack();
  const originalDuration = new Date(task.endDate) - new Date(task.startDate);
  const newStartDate = event.start;
  const newEndDate = new Date(newStartDate.getTime() + originalDuration);

  const formatDate = (date) => date.toISOString().split("T")[0];
  task.startDate = formatDate(newStartDate);
  task.endDate = formatDate(newEndDate);

  await saveDataAndRender();
}

async function handleEventResize({ event, revert }) {
  const task = tasks.find((t) => t.id === event.id);
  if (!task) return revert();

  pushToUndoStack();
  const formatDate = (date) => date.toISOString().split("T")[0];
  const inclusiveEndDate = new Date(event.end);
  inclusiveEndDate.setDate(inclusiveEndDate.getDate() - 1);

  task.startDate = formatDate(event.start);
  task.endDate = formatDate(inclusiveEndDate);

  await saveDataAndRender();
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById("undo-btn");
  const redoBtn = document.getElementById("redo-btn");
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

function pushToUndoStack() {
  undoStack.push(
    JSON.parse(JSON.stringify({ tasks, labels, version: currentDataVersion }))
  );
  redoStack = [];
  updateUndoRedoButtons();
}

async function handleUndo() {
  if (undoStack.length === 0) return;
  redoStack.push(
    JSON.parse(JSON.stringify({ tasks, labels, version: currentDataVersion }))
  );
  const prevState = undoStack.pop();
  tasks = prevState.tasks;
  labels = prevState.labels;
  currentDataVersion = prevState.version;
  await saveDataAndRender();
  updateUndoRedoButtons();
}

async function handleRedo() {
  if (redoStack.length === 0) return;
  undoStack.push(
    JSON.parse(JSON.stringify({ tasks, labels, version: currentDataVersion }))
  );
  const nextState = redoStack.pop();
  tasks = nextState.tasks;
  labels = nextState.labels;
  currentDataVersion = nextState.version;
  await saveDataAndRender();
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
      body: JSON.stringify({
        prompt: promptText,
        context: { tasks, labels },
      }),
    });

    if (!res.ok) throw new Error((await res.json()).error || `AI APIエラー`);
    const data = await res.json();

    tasks = data.tasks || tasks;
    labels = data.labels || labels;

    await saveDataAndRender();
    document.getElementById("gemini-prompt").value = "";
  } catch (error) {
    alert("AIアシスタントの処理中にエラーが発生しました: " + error.message);
    handleUndo();
  } finally {
    geminiBtn.disabled = false;
    geminiBtn.querySelector(".default-text").style.display = "inline";
    geminiBtn.querySelector(".loading-indicator").style.display = "none";
  }
}
