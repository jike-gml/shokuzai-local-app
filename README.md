# 食材管理アプリ Local

GASを使わず、スマホ内のIndexedDBにデータを保存するPWA版です。

## 主な機能

- 食材登録 / 編集 / 削除
- カテゴリー絞り込み
- 買い物リスト
- 献立相談文生成
- IndexedDBによる端末内保存
- Google Sheetsから書き出したCSVのインポート
- JSONバックアップ / 復元
- オフライン起動
- PWA
- Service Workerによる更新検知
- DBバージョン管理

## GitHub Pagesへの公開

1. GitHub → Settings → Pages
2. Source を `Deploy from a branch`
3. Branchを `main`、フォルダを `/ (root)` に設定
4. 表示されたURLをスマホで開く
5. ブラウザの「ホーム画面に追加」でPWAとして利用

## Google Sheetsからの移行

現在の `在庫リスト` シートをCSVでダウンロードしてください。

必要な列:
- 食材名
- メモ
- 状態
- 登録日
- カテゴリー
- 量
- 期限
- 購入店
- ID
- 買い物リスト

アプリ右上の設定 → 「Google Sheets用CSVをインポート」から読み込めます。

既存の `legacy-xxxx` IDとUUIDはどちらも維持されます。

## バックアップ

設定 → 「JSONバックアップを書き出す」

復元時は設定 → 「JSONから復元」。

## 更新

`APP_VERSION` と `service-worker.js` の `CACHE_VERSION` を更新してGitHubへpushすると、新版を検知できます。

DB構造を変更する場合は `js/db.js` の `DB_VERSION` を上げ、`onupgradeneeded` に移行処理を追加します。

## 注意

IndexedDBは端末・ブラウザ内に保存されます。
サイトデータ削除、端末初期化、ブラウザのデータ削除等で消える可能性があるため、定期的なJSONバックアップを推奨します。
