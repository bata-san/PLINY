import { store, trackChange } from '../state.js';
import { getHighestPriorityLabel, formatDueDate } from '../utils.js';
import { openLabelEditorModal, renderAll, pushToUndoStack } from './ui.js';
import { scheduleSave } from '../api.js';

export function renderTaskList() {
    const container = document.getElementById("task-list-container");
    if (!container) return;
    container.innerHTML = "";

    updateTaskStats();

    const map = new Map(store.tasks.map((t) => [t.id, { ...t, children: [] }]));
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
        const highestPrioLabel = getHighestPriorityLabel(node, store.labels); // Pass labels from store
        const labelColor = highestPrioLabel ? highestPrioLabel.color : "transparent";

        const el = document.createElement("div");
        el.className = "task-node";
        el.style.setProperty("--level", level);
        el.innerHTML = `
        <div class="task-card ${node.completed ? "completed" : ""}" data-task-id="${node.id}" draggable="true">
            <div class="task-content">
                <div class="task-text">${(node.text || "").replace(/</g, "&lt;")}</div>
                <div class="task-meta">
                    <div class="task-labels">${(node.labelIds || [])
                .map((id) => store.labels.find((l) => l.id.toString() === id.toString()))
                .filter(Boolean)
                .sort((a, b) => (a.priority || 99) - (b.priority || 99))
                .map((l) => `<span class="task-label-badge" style="background-color: ${l.color}20; color: ${l.color}; border: 1px solid ${l.color}40;">${l.name}</span>`)
                .join("")}</div>
                    <span class="task-due-date">${formatDueDate(node.startDate, node.endDate)}</span>
                </div>
            </div>
            <div class="task-actions">
                <button data-action="edit-labels" title="ラベルを編集" class="action-btn">
                    <i class="fas fa-tags"></i>
                </button>
                <button data-action="complete" title="${node.completed ? "未完了" : "完了"}" class="action-btn ${node.completed ? 'complete' : ''}">
                    <i class="fas fa-check"></i>
                </button>
                <button data-action="delete" title="削除" class="action-btn delete">
                    <i class="fas fa-trash"></i>
                </button>
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

    setupDragAndDropEvents(container); // Re-bind events after render
    // Note: Better to bind events once to container, but current logic redraws container innerHTML.
    // The event listener on container disappears if container itself is replaced, but here we clear innerHTML so container remains.
    // Wait, if we attach listener to `container` in `setupTaskListEvents` (called once), we don't need to re-attach here?
    // `setupTaskListEvents` in `main.js` attaches to `task-list-container`.
    // `renderTaskList` clears `innerHTML`. The listener on `container` persists.
    // So we DON'T need to setup events here, EXCEPT drag and drop if it attaches to specific elements? 
    // In script.js `setupDragAndDropEvents` attached to `container`.
    // So we don't need to call it here if it's called in init.
    // BUT `setupDragAndDropEvents` sets up dragstart/etc on container.
    // So fine.
}

export function updateTaskStats() {
    const totalTasks = store.tasks.length;
    const completedTasks = store.tasks.filter(t => t.completed).length;
    const pendingTasks = totalTasks - completedTasks;

    const elTotal = document.getElementById('total-tasks');
    if (elTotal) elTotal.textContent = totalTasks;
    const elComp = document.getElementById('completed-tasks');
    if (elComp) elComp.textContent = completedTasks;
    const elPend = document.getElementById('pending-tasks');
    if (elPend) elPend.textContent = pendingTasks;
}

// Moved setupDragAndDropEvents here or import from main?
// It functions on the container.
// We can export it and call it in main.js
export function setupDragAndDropEvents(container) {
    // This needs to be called only once on init.
    // Logic is same as script.js
    let draggedElement = null;
    container.addEventListener("dragstart", (e) => {
        const card = e.target.closest(".task-card");
        if (card) {
            draggedElement = card;
            e.dataTransfer.setData("text/plain", card.dataset.taskId);
            setTimeout(() => card.classList.add("dragging"), 0);
        }
    });
    // ... rest of drag drop logic ...
    // To avoid duplication, I will implement it fully here if I export it for main.js to use.
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
        const draggedTask = store.tasks.find((t) => t.id === draggedId);
        if (!draggedTask) return;
        let p = store.tasks.find((t) => t.id === targetId);
        while (p) {
            if (p.id === draggedId) {
                alert("自分の子孫タスクにはできません。");
                return;
            }
            p = store.tasks.find((t) => t.id === p.parentId);
        }
        pushToUndoStack();
        draggedTask.parentId = targetId;
        trackChange('task', 'updated', draggedTask.id);
        const targetTask = store.tasks.find((t) => t.id === targetId);
        if (targetTask) {
            targetTask.isCollapsed = false;
        }
        scheduleSave();
    });
}
