import { store, trackChange } from '../state.js';
import { scheduleSave } from '../api.js';
import { pushToUndoStack } from './ui.js'; // ui.js needs to export pushToUndoStack, circular dependency risk?
// pushToUndoStack depends on store. undoStack/redoStack are in store.
// move pushToUndoStack to state.js? No, it often involves UI updates (button state).
// Let's implement pushToUndoStack in a separate utils or interaction module, or keep it in ui.js and deal with circularity via function hoisting or careful ordering.
// Better: move pushToUndoStack to data logic (state.js) but pass a callback for UI update?
// Or just export updateUndoRedoButtons from ui.js and import it in state.js?
// Circular dependency: state.js (logic) <-> ui.js (view).
// Ideally: state.js emits events. ui.js listens.
// For now: I will stick to the plan. generic UI updates in ui.js.
// Labels.js needs ICONS, PRESET_COLORS.

import { ICONS, PRESET_COLORS } from '../config.js';
import { showColorPalette, closeAllPopovers, positionPopover } from './ui.js';
// showColorPalette is in ui.js in original script.

export function renderLabelEditor() {
    renderLabelList();
    renderLabelAddForm();
}

export function renderLabelList() {
    const listContainer = document.getElementById("label-editor-list");
    if (!listContainer) return;
    listContainer.innerHTML = "";
    store.labels
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
                    import('./ui.js').then(m => m.pushToUndoStack()); // Dynamic import to avoid circular dep if needed, or just standard import if handled well.
                    // Standard import is fine if ui.js is already loaded.
                    // Note: Cyclic dependencies are supported in ESM, but we must be careful about access during module evaluation.
                    // Functions are hoisted so calling pushToUndoStack inside a function body is usually safe.

                    // Re-importing pushToUndoStack at top level.
                    label.name = e.target.value.trim();
                    trackChange('label', 'updated', label.id);
                    scheduleSave(); // scheduleSave in api.js? No, api.js imports state.js.
                    // scheduleSave is in api.js.
                    // We need to import scheduleSave from api.js.
                }
            };
            item.querySelector(".delete-label-btn").onclick = () => {
                if (confirm(`「${label.name}」を削除しますか？`)) {
                    import('./ui.js').then(m => m.pushToUndoStack());
                    trackChange('label', 'deleted', label.id);
                    store.labels = store.labels.filter((l) => l.id !== label.id);
                    store.tasks.forEach((t) => {
                        if (t.labelIds.includes(label.id)) {
                            t.labelIds = t.labelIds.filter((id) => id !== label.id);
                            trackChange('task', 'updated', t.id);
                        }
                    });
                    import('../api.js').then(m => m.scheduleSave());
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
            import('./ui.js').then(m => m.pushToUndoStack());
            label.priority = prio.p;
            trackChange('label', 'updated', label.id);
            import('../api.js').then(m => m.scheduleSave());
        };
        control.appendChild(btn);
    });
    return control;
}

export function renderLabelAddForm() {
    const addContainer = document.getElementById("label-add-container");
    if (!addContainer) return;
    addContainer.innerHTML = `<form id="new-label-form"><div class="form-row"><input type="text" id="new-label-name" placeholder="新しいラベル名" required><button type="submit" id="add-new-label-btn">${ICONS.plus}</button></div></form>`;
    document.getElementById("new-label-form").onsubmit = (e) => {
        e.preventDefault();
        const nameInput = document.getElementById("new-label-name");
        if (nameInput.value.trim()) {
            import('./ui.js').then(m => m.pushToUndoStack());
            const newLabel = {
                id: `label-${Date.now()}`,
                name: nameInput.value.trim(),
                color: PRESET_COLORS[store.labels.length % PRESET_COLORS.length],
                priority: (store.labels.length > 0 ? Math.max(...store.labels.map((l) => l.priority || 0)) : 0) + 1,
            };
            store.labels.push(newLabel);
            trackChange('label', 'created', newLabel.id);
            import('../api.js').then(m => m.scheduleSave());
            nameInput.value = "";
        }
    };
}

export function renderAddTaskLabelSelector() {
    const container = document.getElementById("add-task-label-selector");
    if (!container) return;
    container.innerHTML = "";
    store.labels.forEach((label) => {
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
