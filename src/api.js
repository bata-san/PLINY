import { WORKER_URL } from './config.js';
import { store, clearToken, clearTrackedChanges, saveToken } from './state.js';
import { showAuthMessage, updateSaveStatus, updateGoogleSyncUI, renderAll } from './components/ui.js';
import { normalizeTask } from './utils.js';

async function handleLogout() {
    clearToken();
    store.tasks = [];
    store.labels = [];
    store.undoStack = [];
    store.redoStack = [];
    store.currentDataVersion = null;
    store.isGoogleConnected = false;
    clearTrackedChanges();
    clearTimeout(store.saveDataDebounceTimer);
    document.getElementById("app-container").style.display = "none";
    document.getElementById("auth-overlay").style.display = "flex";
}

// 循環参照を避けるため、必要な関数は外部から注入するか、イベントディスパッチモデルにするのが理想ですが、
// ここでは単純化のために window オブジェクト経由か、モジュールバンドル時の巻き上げを利用します。
// ただしブラウザのnative ESMでは循環依存は許容されますが、初期化順序に注意が必要です。
// ここでは handleLogout を関数として定義・利用します。

export async function fetchWithAuth(url, options = {}) {
    const headers = { ...options.headers, "Content-Type": "application/json" };
    if (store.authToken) headers["Authorization"] = `Bearer ${store.authToken}`;
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
        await handleLogout();
        throw new Error("認証が切れました。再度ログインしてください。");
    }
    return res;
}

export async function handleLogin(e, initializeAppCallback) {
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
        initializeAppCallback();
    } catch (err) {
        showAuthMessage(err.message);
    }
}

export async function handleRegister(e) {
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

export async function loadData() {
    document.getElementById("loading-overlay").style.display = "flex";
    try {
        const res = await fetchWithAuth(`${WORKER_URL}/api/data`);
        if (!res.ok) throw new Error((await res.json()).error || "サーバーエラー");
        const data = await res.json();
        store.currentDataVersion = data.version;
        store.tasks = Array.isArray(data.tasks) ? data.tasks.map(normalizeTask) : [];
        store.labels = Array.isArray(data.labels) ? data.labels : [];
        store.isGoogleConnected = data.isGoogleConnected || false;
        clearTrackedChanges();

        // UI更新のためにCustomEventをディスパッチするか、コールバックを呼ぶ
        // ここでは循環依存回避のため、ui.jsのrenderAllなどはmain.jsで注入するか、
        // 簡易的にwindow.dispatchEventを使用すると疎結合になりますが、
        // 今回は直接的なリファクタリングを目指すため、ui.jsからimportした関数を使いたいところです。
        // しかし ui.js はさらに state.js や api.js に依存する可能性が高いため、
        // ロジックを分離しましょう。
        // renderAll() は ui.js から import して呼び出すことにします。

        renderAll();
        updateGoogleSyncUI();
    } catch (e) {
        alert("データの読み込みに失敗しました: " + e.message);
    } finally {
        document.getElementById("loading-overlay").style.display = "none";
    }
}

export async function sendChangesToServer() {
    const hasTaskChanges = Object.values(store.changedItems.tasks).some(set => set.size > 0);
    const hasLabelChanges = Object.values(store.changedItems.labels).some(set => set.size > 0);
    if (!hasTaskChanges && !hasLabelChanges) {
        updateSaveStatus('saved');
        return;
    }

    updateSaveStatus('saving');
    const patch = {
        tasks: {
            created: Array.from(store.changedItems.tasks.created).map(id => store.tasks.find(t => t.id === id)).filter(Boolean),
            updated: Array.from(store.changedItems.tasks.updated).map(id => store.tasks.find(t => t.id === id)).filter(Boolean),
            deleted: Array.from(store.changedItems.tasks.deleted),
        },
        labels: {
            created: Array.from(store.changedItems.labels.created).map(id => store.labels.find(l => l.id === id)).filter(Boolean),
            updated: Array.from(store.changedItems.labels.updated).map(id => store.labels.find(l => l.id === id)).filter(Boolean),
            deleted: Array.from(store.changedItems.labels.deleted),
        },
        expectedVersion: store.currentDataVersion,
    };

    try {
        const res = await fetchWithAuth(`${WORKER_URL}/api/data`, {
            method: "PATCH",
            body: JSON.stringify(patch),
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
        store.currentDataVersion = result.version;
        clearTrackedChanges();
        updateSaveStatus('saved');
    } catch (error) {
        updateSaveStatus('error');
        alert(`データの保存に失敗しました: ${error.message}`);
    }
}

export function scheduleSave() {
    renderAll();
    updateSaveStatus('unsaved');
    clearTimeout(store.saveDataDebounceTimer);
    store.saveDataDebounceTimer = setTimeout(sendChangesToServer, 2000);
}

export async function forceSaveAllData(state, source = "internal") {
    clearTimeout(store.saveDataDebounceTimer);
    updateSaveStatus('saving', 'データを同期中...');
    try {
        const res = await fetchWithAuth(`${WORKER_URL}/api/data`, {
            method: 'PUT',
            body: JSON.stringify({
                tasks: state.tasks.map(normalizeTask).filter(Boolean),
                labels: state.labels,
                expectedVersion: store.currentDataVersion,
                source: source,
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
        store.currentDataVersion = result.version;
        store.tasks = state.tasks;
        store.labels = state.labels;
        clearTrackedChanges();
        renderAll();
        updateSaveStatus('saved');
    } catch (error) {
        alert(`データの同期に失敗しました: ${error.message}`);
        updateSaveStatus('error');
    }
}
