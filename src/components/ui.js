import { store, trackChange } from '../state.js';
import { renderTaskList, updateTaskStats } from './taskList.js';
import { renderCalendar } from './calendar.js';
import { renderLabelEditor, renderAddTaskLabelSelector } from './labels.js'; //, renderLabelList } 
import { scheduleSave, forceSaveAllData } from '../api.js';
import { PRESET_COLORS, ICONS } from '../config.js';

export function renderAll() {
    if (!Array.isArray(store.tasks)) store.tasks = [];
    if (!Array.isArray(store.labels)) store.labels = [];
    renderTaskList();
    renderCalendar();
    renderLabelEditor();
    renderAddTaskLabelSelector();
    updateUndoRedoButtons();
}

export function showAuthMessage(message, type = "error") {
    const messageArea = document.getElementById("auth-message-area");
    if (!messageArea) return;
    messageArea.textContent = message;
    messageArea.className = `auth-message ${type}`;
    messageArea.style.display = message ? "block" : "none";
}

export function updateSaveStatus(status, message = "") {
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
            if (indicator.textContent === statusMap.saved) {
                indicator.style.opacity = '0';
            }
        }, 2000);
    }
}

export function updateGoogleSyncUI(status = null, message = '') {
    const statusEl = document.getElementById('google-sync-status');
    const connectBtn = document.getElementById('google-connect-btn');
    const syncBtn = document.getElementById('google-sync-btn');
    const disconnectBtn = document.getElementById('google-disconnect-btn');
    if (!statusEl || !connectBtn || !syncBtn || !disconnectBtn) return;

    const allButtons = [connectBtn, syncBtn, disconnectBtn];
    allButtons.forEach(btn => btn.style.display = 'none');

    if (status === 'syncing') {
        statusEl.className = 'syncing';
        statusEl.textContent = message || 'Googleカレンダーと同期中...';
        syncBtn.style.display = 'block';
        syncBtn.disabled = true;
    } else if (status === 'error') {
        statusEl.className = 'error';
        statusEl.textContent = message || '同期中にエラーが発生しました。';
        syncBtn.style.display = 'block';
        disconnectBtn.style.display = 'block';
        syncBtn.disabled = false;
    } else if (store.isGoogleConnected) {
        statusEl.className = 'connected';
        statusEl.textContent = 'Googleカレンダーと連携済みです。';
        syncBtn.style.display = 'block';
        disconnectBtn.style.display = 'block';
        syncBtn.disabled = false;
    } else {
        statusEl.className = 'disconnected';
        statusEl.textContent = 'Googleカレンダーと連携していません。';
        connectBtn.style.display = 'block';
    }
}

export function showColorPalette(anchor, label) {
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

export function positionPopover(anchor, popover) {
    const anchorRect = anchor.getBoundingClientRect();
    popover.style.position = "absolute";
    popover.style.left = `${anchorRect.left}px`;
    popover.style.top = `${anchorRect.bottom + 8}px`;
    popover.style.zIndex = 1001;
}

export function closeAllPopovers() {
    document.querySelectorAll(".popover").forEach((p) => p.remove());
}

export function updateUndoRedoButtons() {
    const undoBtn = document.getElementById("undo-btn");
    const redoBtn = document.getElementById("redo-btn");
    if (undoBtn) undoBtn.disabled = store.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = store.redoStack.length === 0;
}

export function pushToUndoStack() {
    store.undoStack.push(JSON.parse(JSON.stringify({ tasks: store.tasks, labels: store.labels })));
    store.redoStack = [];
    updateUndoRedoButtons();
}

export async function openLabelEditorModal(taskToEdit) {
    const modal = document.getElementById('label-editor-modal');
    if (!modal) return;
    modal.dataset.taskId = taskToEdit.id;
    document.getElementById('modal-task-name').textContent = taskToEdit.text;
    const listContainer = document.getElementById('modal-label-list');
    listContainer.innerHTML = '';
    store.labels
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

export function closeLabelEditorModal() {
    const modal = document.getElementById('label-editor-modal');
    if (modal) modal.style.display = 'none';
}
