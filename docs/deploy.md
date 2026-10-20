# LocAI.3 の公開

旧 LocAI・LocAI.2 と別のプロジェクト、別のDBで公開する。現在のローカルDBは公開用の接続先にしない。

## 公開先の設定

Vercel で GitHub の `jinm20050505-code/locai-3` を取り込む。Next.js としてビルドし、Build Command は `vercel.json` の `npm run db:deploy && npm run build`。Node.js は24系を使用する。Production は main。

LocAI.3専用の空のPostgreSQLを用意し、次の設定をVercelのProductionへ登録する。値はチャット・GitHub・ログに出さない。

| 名前 | 値 |
|---|---|
| DATABASE_URL | LocAI.3専用DBの接続文字列 |
| BETTER_AUTH_SECRET | 新しく生成した十分長いランダム値 |
| BETTER_AUTH_URL | 公開した本番の https URL（末尾の / なし） |
| GEMINI_API_KEY | Gemini のキー（任意） |
| GEMINI_MODEL | 動作を確認したモデル名（任意。手元の確認では gemini-3.5-flash-lite） |

DBの表はVercelのビルド時に `npm run db:deploy` で反映する。Prismaの変更コマンドは `DATABASE_URL_UNPOOLED` を優先する。6件の変更を反映し、データは自動では入れない。手元の `.env.local` を本番の接続先に書き換えない。プレビューを使う場合は専用DBまたはDBブランチを割り当て、Productionと同じ接続先を登録しない。

## 公開前の確認

1. 秘密の値、バックアップ、デモのパスワードをGitに含めていないことを履歴も含めて確認する。
2. 型・lint・単体・DB・画面の流れ・スマートフォンでの見た目を確認する。
3. 公開URLで新規登録、ログイン、検索、出品、購入希望、返信を確認する。開発用のテスト一式を本番DBへ向けない。
4. ログインしていない別ブラウザからトップとログイン画面が開くことを確認する。
5. 実際に開けたURLを共有する。GitHubの公開はアプリの公開とは別。

## 運営

通報は `npm run reports` で松田が毎日確認する。公開DBに対して使う場合は専用の作業環境で接続先を設定し、開発用設定を上書きしない。対応コマンドはREADME参照。現在、メール本人確認・パスワード再設定・アプリ内の運営管理画面はない。

ローカルの架空デモデータを作る `db:seed` は外部DBへ書き込めない。本番へ持ち込む場合は、別途対象と内容を確認した移行が必要。バックアップや利用者情報を含む開発DBを丸ごとコピーしない。

## 今回の公開先

Vercel：`test11-76c3/locai-3`。DB：`locai-3-prod`（Neon・Singapore・Free）。DBの接続先はProductionだけに登録し、DevelopmentとPreviewには登録していない。関数のリージョンはsin1。公開ドメイン：`locai-3.vercel.app`。旧版のプロジェクトとDBは変更しない。
