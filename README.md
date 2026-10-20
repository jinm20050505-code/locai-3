# LocAI.3（作り直し版）

関西の農家さんとお店を、必要な量の野菜でつなぐアプリのデモです。農家さん・野菜・お店はすべて架空で、実際の販売は行いません。

- 既存の LocAI・LocAI.2・公開中のサイト・本番 DB とは別のフォルダ（`/workspaces/LocAI-3`）と、別の DB（コンテナ内の PostgreSQL）で動きます。
- ソースは GitHub の非公開リポジトリ `jinm20050505-code/locai-3` に保存しています。秘密情報（`.env.local`）・デモのログイン情報・DB のデータ・バックアップは Git に入れません。
- 仕様書（正本）は [docs/spec.md](docs/spec.md)、照合の結果は [docs/spec-check.md](docs/spec-check.md)。
- 露出の偏りの確認：`npm run report:exposure`、成功の基準のうち測れるもの：`npm run report:metrics`

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
- Gemini の設定：`npm run ai:set`（鍵は打っても画面に出ない）→ `npm run ai:check`（使えるモデルの一覧と、架空の希望で1回応答を確かめる）→ アプリを起動し直す。

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
| マイページ（お店の注文の状況・今週の確保済み食材） | `/orders`、1件ごと `/orders/[id]` |
| 探しています（お店／農家） | `/wanted`、`/producer/wanted` |
| 出品の編集・出品への相談（農家） | `/producer/listings/[id]/edit`、`/producer/listings/[id]/messages` |
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

### 移行後の作業場所

Mac の `/Users/jin/LocAI3-移行/LocAI-3` を、LocAI.3 専用コンテナで開いています。ソースと設定は Mac、DB は専用の Docker ボリュームに残ります。古い LocAI・LocAI.2 とは別です。

## 通報の確認と対応

担当：松田。`npm run reports` で直近100件の通報と最後の対応を確認します。DBにアクセスできる運営だけが使えるコマンドです。

```bash
npm run reports -- --id 通報番号 --action pause-listing --reason "対応理由" --operator 松田
```

最初は確認のみです。内容を確認して `--yes` を付けると、出品を一時停止し、担当者・理由・日時・変更前後を記録します。「探しています」の終了は `close-wanted`、表示を変えず記録だけ残す場合は `keep`。注文・数量・金額は変えません。通報が届いただけでは自動停止しません。同じ対象の再通報は更新され、連続送信は6秒間隔・新しい対象は1分に10件までです（独自・仮）。運営は毎日一覧を確認してください。通知や管理画面はありません。

公開の設定は [docs/deploy.md](docs/deploy.md)、AIの確認結果は [docs/ai-verification.md](docs/ai-verification.md) にあります。

## スマホのメニューと案内役（2026年10月20日）

- スマホでは画面下に4つのメニュー。お店は「探す・注文・募集・マイページ」、農家は「出品・購入希望・募集・マイページ」。未ログイン時は「ホーム・探す・登録・ログイン」。
- 野菜の案内役「こまめ」を常に表示し、画面に合った短い説明を出す。押すと4段階の使い方ガイドを開く。戻る・閉じる・Escapeに対応。
- 説明文は画面に合わせて用意したもの。キャラクターは軽いSVGとCSSで動き、端末の「動きを減らす」設定では停止する。
- 下部に専用スペースを確保し、本文はその上でスクロールする。キャラクターが送信ボタンを隠さない。スマホのログアウトはマイページから。
- 確認：`node tests/e2e/mobile-guide.mjs`（手元だけ。既存の架空アカウントで閲覧・ログイン・ログアウトし、取引データは変えない）。

こまめの説明バーは「閉じる ×」で小さくできます。閉じた状態はブラウザに保存され、キャラクターを押すと説明を戻せます。
