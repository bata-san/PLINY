# Google Calendar 同期セットアップ手順

## 1. Google Cloud Console の設定

### 1.1 プロジェクトの作成/選択
1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 新しいプロジェクトを作成するか、既存のプロジェクトを選択

### 1.2 Google Calendar API の有効化
1. ナビゲーションメニュー → 「APIとサービス」 → 「ライブラリ」
2. 「Google Calendar API」を検索
3. 「有効にする」をクリック

### 1.3 OAuth 2.0 認証情報の作成
1. ナビゲーションメニュー → 「APIとサービス」 → 「認証情報」
2. 「認証情報を作成」 → 「OAuth クライアント ID」
3. アプリケーションの種類: 「ウェブアプリケーション」
4. 名前: 「PLINY Calendar Sync」
5. **承認済みの JavaScript 生成元**: 
   - `https://pliny-worker.youguitest.workers.dev`
   - `http://localhost:3000` (開発用)
6. **承認済みのリダイレクト URI**:
   - `https://pliny-worker.youguitest.workers.dev`
   - `http://localhost:3000` (開発用)

### 1.4 クライアント ID の取得
1. 作成された OAuth クライアント ID をコピー
2. script.js の `clientId` 変数を更新:
```javascript
const clientId = 'YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com';
```

## 2. 現在のクライアント ID (テスト用)

**重要**: 以下は一時的なテスト用 ID です。本番環境では独自のクライアント ID を使用してください。

```
クライアント ID: 908477423398-0j7qtb4j8ksr9lhbl3o41snb1v46n1vs.apps.googleusercontent.com
```

## 3. 利用方法

1. PLINYアプリを開く
2. 左パネルの「📅 Google Calendar 同期」セクションを展開
3. 「Google Calendar に接続」ボタンをクリック
4. Googleアカウントでログイン・認証
5. カレンダーを選択
6. 「今すぐ同期」または自動同期を有効化

## 4. トラブルシューティング

### 認証エラーが発生する場合
1. ブラウザのキャッシュとクッキーをクリア
2. Google Cloud Console で承認済みドメインが正しく設定されているか確認
3. OAuth クライアント ID が正しく設定されているか確認

### 同期が失敗する場合
1. Google Calendar API が有効化されているか確認
2. カレンダーの権限が適切に設定されているか確認
3. ネットワーク接続を確認

## 5. セキュリティ注意事項

- 本番環境では必ず独自のOAuth クライアント ID を使用
- アクセストークンはローカルストレージに保存されるため、共有端末では注意
- 定期的にGoogle アカウントの接続済みアプリを確認・管理

## 6. 制限事項

- 現在は読み取り専用の同期（PLINYからGoogleへの一方向）
- 削除の同期は安全性のため実装していません
- 1日のAPI呼び出し制限にご注意ください
