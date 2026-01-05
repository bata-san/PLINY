// ===============================================
// 状態管理
// ===============================================

export const store = {
    tasks: [],
    labels: [],
    calendar: null,
    undoStack: [],
    redoStack: [],
    currentDataVersion: null,
    authToken: null,
    userEmail: null,
    isGoogleConnected: false,

    saveDataDebounceTimer: null,
    changedItems: {
        tasks: { created: new Set(), updated: new Set(), deleted: new Set() },
        labels: { created: new Set(), updated: new Set(), deleted: new Set() },
    }
};

export function trackChange(type, action, id) {
    const target = type === 'task' ? store.changedItems.tasks : store.changedItems.labels;
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

export function clearTrackedChanges() {
    store.changedItems = {
        tasks: { created: new Set(), updated: new Set(), deleted: new Set() },
        labels: { created: new Set(), updated: new Set(), deleted: new Set() },
    };
}

export function saveToken(token, email) {
    localStorage.setItem("pliny_auth_token", token);
    localStorage.setItem("pliny_user_email", email);
    store.authToken = token;
    store.userEmail = email;
}

export function loadToken() {
    store.authToken = localStorage.getItem("pliny_auth_token");
    store.userEmail = localStorage.getItem("pliny_user_email");
}

export function clearToken() {
    localStorage.removeItem("pliny_auth_token");
    localStorage.removeItem("pliny_user_email");
    store.authToken = null;
    store.userEmail = null;
}
