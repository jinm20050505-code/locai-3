#!/usr/bin/env bash
# DB（出品・注文・アップロードした写真を含む）のバックアップを取る：npm run db:backup
# - 保存先：backups/（Git には入れない）。新しいものから14個を残す
# - 接続先は .env.local から読み、表示しない。手元の DB（localhost）だけ
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env.local; set +a
case "$DATABASE_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "手元の DB だけをバックアップします"; exit 1 ;; esac
mkdir -p backups
f="backups/locai3-$(date +%Y%m%d-%H%M%S).dump"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$f"
chmod 600 "$f"
ls -1t backups/locai3-*.dump | tail -n +15 | xargs -r rm --
echo "バックアップしました：$f（$(du -h "$f" | cut -f1)）"
