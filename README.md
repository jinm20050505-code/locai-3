# LocAI.3（作り直し版）

関西の農家さんとお店を、必要な量の野菜でつなぐアプリのデモです。農家さん・野菜・お店はすべて架空で、実際の販売は行いません。

- 既存の LocAI・LocAI.2・公開中のサイト・本番 DB とは別のフォルダ（`/workspaces/LocAI-3`）と、別の DB（コンテナ内の PostgreSQL）で動きます。
- **注意**：このフォルダとコンテナ内の PostgreSQL は、開発コンテナを作り直すと消えます。残すには GitHub の非公開リポジトリに保存します（未実施）。

## 起動方法

```bash
cd /workspaces/LocAI-3
sudo service postgresql start     # 手元の DB を起動（コンテナを開き直したら毎回）
npm install                       # 初回だけ
npx prisma migrate deploy         # 表を作る（初回・変更があったとき）
npm run db:seed                   # 架空のデモデータを入れ直す（ログイン情報は demo-accounts.local.txt）
npm run build && npm start        # http://localhost:3004
```

- 接続先などの設定は `.env.local`（Git に入れない）。見本は `.env.example`。
- AI（Gemini）は任意です。`GEMINI_API_KEY` と `GEMINI_MODEL` がなくても、検索・申し込みはそのまま使えます（代わりの野菜はアプリの決まりで選びます）。

## 確認のしかた

```bash
npm run typecheck && npm run lint
npm test                        # 計算と入力の決まり（DB を使わない）
npm run test:db                 # 取引の決まり（手元の DB。同時の申し込み・連打・取消・期限切れなど）
node tests/e2e/flow.mjs         # 画面での一連の流れ（アプリを起動してから）
node tests/e2e/shots.mjs        # 見た目（文字の大きさ・ボタンの高さ・はみ出し）。画像は tests/e2e/output/
```

## 画面

| 画面 | アドレス |
|---|---|
| トップ | `/` |
| 野菜を探す（写真付きの一覧） | `/search` |
| 商品の詳細・申し込み | `/listings/[id]` |
| 注文の状況（お店） | `/orders`、1件ごと `/orders/[id]` |
| 出品一覧・出品する（農家） | `/producer`、`/producer/listings/new` |
| 届いた購入希望（農家） | `/producer/orders` |
| 登録・ログイン・お店（農園）の情報 | `/signup`、`/login`、`/account` |
