import { store, trackChange } from '../state.js';
import { scheduleSave } from '../api.js';
import { fetchWithAuth, forceSaveAllData } from '../api.js';
import { updateGoogleSyncUI, renderAll, pushToUndoStack, updateSaveStatus } from './ui.js';
import { normalizeTask } from '../utils.js';
import { WORKER_URL } from '../config.js';

export async function handleGoogleConnect() {
    const res = await fetchWithAuth(`${WORKER_URL}/api/auth/google/redirect-url`);
    const data = await res.json();
    if (res.ok && data.url) {
        window.location.href = data.url;
    } else {
        alert('Google認証URLの取得に失敗しました。');
    }
}

export async function handleGoogleDisconnect() {
    if (!confirm('Googleカレンダーとの連携を解除しますか？\nPLINY上のタスクは削除されませんが、カレンダーとの同期は停止します。')) return;
    try {
        const res = await fetchWithAuth(`${WORKER_URL}/api/auth/google/disconnect`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        store.isGoogleConnected = false;
        store.tasks.forEach(t => {
            t.googleEventId = null;
            t.googleSyncTimestamp = null;
        });
        renderAll();
        updateGoogleSyncUI();
        alert('連携を解除しました。');
    } catch (err) {
        alert('連携の解除に失敗しました: ' + err.message);
    }
}

export async function handleGoogleSync() {
    updateGoogleSyncUI('syncing');
    try {
        const res = await fetchWithAuth(`${WORKER_URL}/api/sync/google`, { method: 'POST' });
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || '同期中に不明なエラーが発生しました。');
        }
        const syncResult = await res.json();

        store.tasks = syncResult.tasks.map(normalizeTask);
        store.labels = syncResult.labels;
        store.currentDataVersion = syncResult.version;
        store.isGoogleConnected = syncResult.isGoogleConnected;

        // This is tricky: clearTrackedChanges is imported from state.js. 
        // We import it here? 
        // Yes, handleGoogleSync needs to clear changes.
        import('../state.js').then(m => m.clearTrackedChanges());

        pushToUndoStack();
        renderAll();
        updateGoogleSyncUI();
        updateSaveStatus('saved', '同期が完了しました');

    } catch (err) {
        alert('同期に失敗しました: ' + err.message);
        updateGoogleSyncUI('error', '同期に失敗しました。');
    }
}
