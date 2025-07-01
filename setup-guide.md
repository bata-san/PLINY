# PLINY Cloudflare Workers KVセットアップガイド

## 前提条件
- Node.js（v16以上）がインストールされていること
- npmまたはyarnがインストールされていること
- Cloudflareアカウントが作成されていること

## ステップ1: Wranglerのインストール

```bash
npm install -g wrangler
# または
yarn global add wrangler
```

## ステップ2: Cloudflareにログイン

```bash
wrangler login
```

ブラウザが開いてCloudflareのログイン画面が表示されます。ログインして認証を完了してください。

## ステップ3: KVネームスペースを作成

```bash
# 本番用KVネームスペースを作成
wrangler kv:namespace create "PLINY_KV"

# プレビュー用KVネームスペースを作成（開発・テスト用）
wrangler kv:namespace create "PLINY_KV" --preview
```

コマンド実行後、以下のような出力が表示されます：

```
✅ Success!
Add the following to your wrangler.toml file:

[[kv_namespaces]]
binding = "PLINY_KV"
id = "a1b2c3d4e5f6g7h8i9j0"

For preview:
[[kv_namespaces]]
binding = "PLINY_KV"
preview_id = "x1y2z3a4b5c6d7e8f9g0"
```

## ステップ4: wrangler.tomlを更新

上記で出力されたIDを使用して、`wrangler.toml`ファイルを更新：

```toml
name = "pliny-worker"
main = "worker.js" 
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "PLINY_KV"
id = "a1b2c3d4e5f6g7h8i9j0"  # 実際のIDに置き換え
preview_id = "x1y2z3a4b5c6d7e8f9g0"  # 実際のプレビューIDに置き換え

[env.production.vars]
GEMINI_API_KEY = "AIzaSyD4GPZ85iVlKjbmd-j3DKfbPooGpqlaZtM"
```

## ステップ5: ローカル開発

```bash
# ローカルで開発サーバーを起動
wrangler dev
```

これで `http://localhost:8787` でWorkerが起動します。

## ステップ6: 本番デプロイ

```bash
# Workerを本番環境にデプロイ
wrangler deploy
```

デプロイ後、以下のようなURLが表示されます：
```
Published pliny-worker (1.23s)
  https://pliny-worker.your-subdomain.workers.dev
```

## ステップ7: フロントエンドの設定更新

`script.js`のWORKER_URLを実際のWorker URLに更新：

```javascript
const WORKER_URL = 'https://pliny-worker.your-subdomain.workers.dev';
```

## トラブルシューティング

### KVネームスペースが見つからない場合
```bash
# 既存のKVネームスペースを確認
wrangler kv:namespace list
```

### デプロイエラーが発生した場合
```bash
# ログを確認
wrangler tail

# 設定を確認
wrangler whoami
```

### データが保存されない場合
- KVバインディング名が正しく設定されているか確認
- Worker内でenv.PLINY_KVを正しく使用しているか確認

## よくある質問

**Q: KVストレージは無料ですか？**
A: Cloudflare Workersの無料プランでは、月10万回のリクエストとKVストレージが利用可能です。

**Q: データが消えることはありますか？**
A: KVストレージは永続化されており、自動的に削除されることはありません。

**Q: 複数人で同じWorkerを使えますか？**
A: はい、同じWorker URLを共有すれば複数人で利用可能です。データの競合は楽観的ロックで管理されます。
