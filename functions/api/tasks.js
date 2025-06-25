// --- Project: SYNCHRONUS - Backend API (Cloudflare Functions) ---
// タスクデータをCloudflare D1（データベース）で管理する。

const handleRequest = async ({ request, env }) => {
    try {
        const url = new URL(request.url);
        switch (request.method) {
            case 'GET': {
                // すべてのタスクを取得
                const { results } = await env.DB.prepare("SELECT * FROM tasks").all();
                return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
            }
            case 'POST': {
                // 新しいタスクを追加
                const { content, dueDate } = await request.json();
                if (!content) return new Response('タスク内容が空だ', { status: 400 });
                
                const id = Date.now().toString();
                await env.DB.prepare("INSERT INTO tasks (id, content, dueDate, completed) VALUES (?, ?, ?, ?)")
                    .bind(id, content, dueDate, 0)
                    .run();
                return new Response(JSON.stringify({ id, content, dueDate }), { status: 201 });
            }
            case 'PUT': {
                // タスクの完了状態を更新
                const { id, completed } = await request.json();
                if (!id) return new Response('IDが指定されていない', { status: 400 });
                
                await env.DB.prepare("UPDATE tasks SET completed = ? WHERE id = ?")
                    .bind(completed ? 1 : 0, id)
                    .run();
                return new Response('タスクを更新した', { status: 200 });
            }
            case 'DELETE': {
                // タスクを削除
                const { id } = await request.json();
                if (!id) return new Response('IDが指定されていない', { status: 400 });
                
                await env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(id).run();
                return new Response('タスクを削除した', { status: 200 });
            }
            default:
                return new Response('許可されていないメソッドだ', { status: 405 });
        }
    } catch (e) {
        return new Response(e.message, { status: 500 });
    }
};

export const onRequest = handleRequest;