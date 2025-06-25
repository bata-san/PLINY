from flask import Flask, request, jsonify, render_template_string
from flask_sqlalchemy import SQLAlchemy # type: ignore
import os
import datetime

# --- アプリケーションの初期化とデータベース設定 ---
app = Flask(__name__)

# Render.comの環境変数からデータベースURLを取得する。ローカルテスト用にも設定。
# これがお前とクラウドを繋ぐ「鍵」だ。
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///tasks.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# --- データベースの「設計図」(モデル) ---
# これが、お前のタスクがデータベースにどう保存されるかを決める。
class Task(db.Model):
    id = db.Column(db.String(80), primary_key=True)
    content = db.Column(db.String(200), nullable=False)
    due_date = db.Column(db.String(10), nullable=True)
    completed = db.Column(db.Boolean, default=False, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "content": self.content,
            "dueDate": self.due_date,
            "completed": self.completed
        }

# --- メインのUIを生成する部分 ---
@app.route('/')
def index():
    # 期限日でタスクをソート
    tasks = Task.query.order_by(Task.completed, Task.due_date.nullslast(), Task.due_date).all()
    
    # ここからは、前回お前が絶賛してくれたUIの生成ロジックだ。魂は同じだぜ。
    task_list_html = ""
    if not tasks:
        task_list_html = "<li class='empty-task'>タスクは空だ。さあ、ミッションを創造しろ。</li>"
    else:
        for task in tasks:
            today_str = datetime.date.today().isoformat()
            due_date_str = task.due_date
            is_overdue = due_date_str and not task.completed and due_date_str < today_str
            due_date_display = f"期限: {due_date_str}" if due_date_str else "期限なし"
            
            task_list_html += f"""
                <li class="task-item {'completed' if task.completed else ''}" data-id="{task.id}">
                    <input type="checkbox" {'checked' if task.completed else ''} title="完了/未完了を切り替え">
                    <div class="task-details">
                        <span class="task-content-text">{task.content}</span>
                        <div class="task-due-date-text {'overdue' if is_overdue else ''}">{due_date_display}</div>
                    </div>
                    <button class="delete-btn" title="このタスクを消去する">×</button>
                </li>
            """

    # 前回のお気に入りのテンプレートに、今回の魂を注入！
    html_template = """
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project: AETHERIUS</title>
    <style>/* 前回と同じ、最高のCSSをここに */
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap');
        :root { --bg: #1a1a1a; --surface: #242424; --text-primary: #f0f0f0; --text-secondary: #aaaaaa; --border: #444444; --primary: #6c63ff; --success: #4caf50; --danger: #f44336; --font-main: 'Noto Sans JP', sans-serif; }
        body { font-family: var(--font-main); background-color: var(--bg); color: var(--text-primary); margin: 0; padding: 20px; font-size: 16px; }
        #app { max-width: 700px; margin: 0 auto; background: var(--surface); border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); overflow: hidden; border: 1px solid var(--border); }
        .app-header { padding: 25px; background: linear-gradient(135deg, var(--primary), #4e48b3); text-align: center; }
        .app-header h1 { font-size: 2em; margin: 0; color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.3); }
        .app-body { padding: 30px; }
        #task-input-form { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 25px; }
        #task-content, #task-due-date { background: var(--bg); color: var(--text-primary); border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-size: 1em; }
        #task-content { flex-grow: 1; min-width: 200px;} #task-due-date { min-width: 150px; }
        #add-task-btn { background-color: var(--primary); color: white; border: none; padding: 0 25px; border-radius: 8px; font-weight: 700; cursor: pointer; transition: background-color 0.2s ease; }
        #add-task-btn:hover { background-color: #5a52e0; }
        #task-list { list-style: none; padding: 0; margin: 0; }
        .task-item { display: flex; align-items: center; padding: 15px; border-bottom: 1px solid var(--border); transition: background-color 0.2s; }
        .task-item:hover { background-color: rgba(255,255,255,0.03); } .task-item:last-child { border-bottom: none; }
        .task-item input[type="checkbox"] { width: 22px; height: 22px; accent-color: var(--primary); margin-right: 15px; flex-shrink: 0; cursor: pointer; }
        .task-details { flex-grow: 1; } .task-content-text { word-break: break-all; transition: color 0.3s; }
        .task-item.completed .task-content-text { text-decoration: line-through; color: var(--text-secondary); }
        .task-due-date-text { font-size: 0.8em; color: var(--text-secondary); margin-top: 4px; }
        .overdue { color: var(--danger); font-weight: bold; }
        .delete-btn { background: none; border: none; color: var(--text-secondary); font-size: 1.2em; cursor: pointer; border-radius: 50%; width: 30px; height: 30px; line-height: 30px; text-align: center; transition: background-color 0.2s, color 0.2s;}
        .delete-btn:hover { background-color: rgba(244, 67, 54, 0.2); color: var(--danger); }
        .empty-task { text-align: center; padding: 40px; color: var(--text-secondary); }
    </style>
</head><body>
    <div id="app"><div class="app-header"><h1>Project: AETHERIUS</h1></div>
    <div class="app-body">
        <form id="task-input-form"><input type="text" id="task-content" placeholder="お前のやるべきことは何だ？" required><input type="date" id="task-due-date" title="期限日を設定"><button id="add-task-btn" type="submit">創造</button></form>
        <ul id="task-list">{{task_list_html | safe}}</ul>
    </div></div>
<script>/* ここからはSOLIDUSと同じシンプルなJavaScriptロジック */
    document.addEventListener('DOMContentLoaded', () => { /* ... 全く同じでOK！ ... */ });
</script>
</body></html>"""
    # 本当は SOLIDUS の JS コードをここに展開するが、見やすさのため省略した。下のAPIと通信する形になる
    return render_template_string(html_template, task_list_html=task_list_html)


# --- API エンドポイント ---
@app.route('/api/tasks', methods=['POST'])
def add_task():
    data = request.json
    new_task = Task(
        id=str(datetime.datetime.now().timestamp()),
        content=data['content'],
        due_date=data.get('dueDate') or None,
        completed=False
    )
    db.session.add(new_task)
    db.session.commit()
    return jsonify(new_task.to_dict()), 201

@app.route('/api/tasks/<string:task_id>', methods=['PUT'])
def update_task(task_id):
    task = Task.query.get_or_404(task_id)
    data = request.json
    task.completed = data.get('completed', task.completed)
    db.session.commit()
    return jsonify(task.to_dict())

@app.route('/api/tasks/<string:task_id>', methods=['DELETE'])
def delete_task(task_id):
    task = Task.query.get_or_404(task_id)
    db.session.delete(task)
    db.session.commit()
    return jsonify({"message": "タスクを消去した"})

# アプリ起動時にデータベースを初期化するコマンド
with app.app_context():
    db.create_all()

if __name__ == '__main__':
    # この部分はRender.comが使うので、このままでOK
    app.run()