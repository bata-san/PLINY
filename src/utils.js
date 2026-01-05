export function normalizeTask(task) {
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
        googleEventId: task.googleEventId || null,
        googleSyncTimestamp: task.googleSyncTimestamp || null,
    };
}

export function formatDueDate(start, end) {
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

// 注意: この関数は labels に依存するため、使用側で labels を渡すか、state から取得するように変更が必要
// ここでは純粋関数として実装し、labels を引数として受け取るように変更します。
export function getHighestPriorityLabel(task, labels) {
    if (!task.labelIds || task.labelIds.length === 0) return null;
    return task.labelIds
        .map((id) => labels.find((l) => l.id.toString() === id.toString()))
        .filter(Boolean)
        .sort((a, b) => (a.priority || 99) - (b.priority || 99))[0];
}
