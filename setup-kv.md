# PLINY KVネームスペースセットアップガイド

## 1. KVネームスペースを作成

```bash
# 本番用KVネームスペースを作成
npx wrangler kv:namespace create "PLINY_KV"

# プレビュー用KVネームスペースを作成
npx wrangler kv:namespace create "PLINY_KV" --preview
```

## 2. wrangler.tomlを更新

上記コマンドの出力に表示されるIDを使用して、wrangler.tomlを更新:

```toml
[[kv_namespaces]]
binding = "PLINY_KV"
id = "実際のKV namespace ID"
preview_id = "実際のプレビューKV namespace ID"
```

## 3. デプロイ

```bash
npx wrangler deploy
```

## 4. Worker URLを確認

デプロイ後に表示されるWorker URLをscript.jsのWORKER_URLに設定:

```javascript
const WORKER_URL = 'https://pliny-worker.your-subdomain.workers.dev';
```
