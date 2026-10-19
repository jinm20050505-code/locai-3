#!/usr/bin/env bash
# 移行の仕上げ（移行先の LocAI.3 専用コンテナで、1回だけ実行）：npm run migrate:finish
# 1. DB をバックアップから戻す（写真を含む）→ 2. 中身の一覧と照らし合わせる → 3. 起動する → 4. 写真の表示と主要な操作を画面で確かめる
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/dev-setup.sh >/dev/null
dump=$(ls -1t backups/locai3-*.dump 2>/dev/null | head -1 || true)
[ -n "$dump" ] || { echo "backups/ にバックアップがありません"; exit 1; }
manifest="${dump%.dump}.manifest.json"
set -a; . ./.env.local; set +a
echo "1. DB をバックアップから戻します：$dump"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$dump"
npx prisma migrate deploy >/dev/null
echo "2. 中身の照合"
node scripts/db-manifest.mjs "$manifest"
echo "3. 起動（http://localhost:3004）"
npm run build >/dev/null
if ! curl -s -o /dev/null http://localhost:3004/; then (nohup npm start > /tmp/locai3-start.log 2>&1 &); fi
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:3004/ && break; sleep 1; done
echo "4. 画面での確認（登録済みのデータと写真・主要な操作）"
node tests/e2e/migration-check.mjs
node tests/e2e/flow.mjs | grep -E "^(OK|NG)" | awk '{print $1}' | sort | uniq -c | sed 's/^/   主要な操作の確認：/'
echo "おわり。上に NG がなければ、移行は完了です。"
