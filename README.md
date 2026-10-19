# LocAI.3（作り直し版）

関西の農家さんとお店を、必要な量の野菜でつなぐアプリのデモです。農家さん・野菜・お店はすべて架空で、実際の販売は行いません。

- 既存の LocAI・LocAI.2・公開中のサイト・本番 DB とは別のフォルダ（`/workspaces/LocAI-3`）と、別の DB（コンテナ内の PostgreSQL）で動きます。
- ソースは GitHub の非公開リポジトリ `jinm20050505-code/locai-3` に保存しています。秘密情報（`.env.local`）・デモのログイン情報・DB のデータ・バックアップは Git に入れません。
- 仕様との照合の結果は [docs/spec-check.md](docs/spec-check.md)。

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

## データの保存と、コンテナを作り直したあとの再開

| もの | 保存場所 | コンテナを作り直すと |
|---|---|---|
| ソース | GitHub（`locai-3`） | 残る |
| DB（出品・注文・アカウント・**アップロードした写真**） | PostgreSQL。写真も DB の中に保存 | LocAI.3 専用の開発コンテナ（`.devcontainer/`）で開けば、Docker のボリューム `locai3-pgdata` に残る |
| `.env.local`（DB のパスワード・ログイン用の秘密の値） | 作業フォルダ | Mac のフォルダで開いていれば残る。なくなっても `npm run setup` で作り直せる |
| バックアップ | `backups/`（Git に入れない） | 作業フォルダと同じ |

- バックアップを取る：`npm run db:backup`（新しいものから14個を残す）
- 戻す：`npm run db:restore -- backups/locai3-....dump --yes`（戻す前の状態も自動でバックアップ）
- 2026年10月19日に、バックアップを別の一時的な DB に戻し、利用者・出品・写真・注文の数と写真の中身が一致することを確かめた。

### 今の作業場所について（大事）

今は既存の LocAI の開発コンテナの中の `/workspaces/LocAI-3` で作業している。ここは Mac のフォルダではないため、**このコンテナを作り直すと、作業フォルダ・DB・バックアップが消える**（ソースは GitHub に残る）。続けて使う場合は、次の手順で LocAI.3 専用の環境に移す。

1. 移す前に `npm run db:backup` を実行し、VS Code の左のファイル一覧で `backups/` の中のファイルを右クリック →「ダウンロード」で Mac に保存する（必要なら `demo-accounts.local.txt` も）。
2. Mac で、LocAI とは別のフォルダに `git clone https://github.com/jinm20050505-code/locai-3.git` する。
3. そのフォルダを VS Code で開き、「Dev Containers: Reopen in Container」。初回は `npm install` と `npm run setup`（DB と `.env.local` の用意）が自動で動く。
4. 1 のバックアップを `backups/` に置き、`npm run db:restore -- backups/<ファイル名> --yes`。データを持ち込まない場合は `npm run db:seed`（架空のデモデータ）。
