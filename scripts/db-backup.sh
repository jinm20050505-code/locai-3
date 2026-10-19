#!/usr/bin/env bash
# DB（出品・注文・アカウント・アップロードした写真）のバックアップを取る：npm run db:backup
# - 保存先：backups/（Git には入れない）。新しいものから14個を残す
# - 中身の一覧（表ごとの件数と、写真ごとの照合値）を .manifest.json として一緒に残す。秘密の値は入れない
#   → 戻したあとに npm run verify:restore で、同じ中身かを確かめられる
# - 接続先は .env.local から読み、表示しない。手元の DB（localhost）だけ
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env.local; set +a
case "$DATABASE_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "手元の DB だけをバックアップします"; exit 1 ;; esac
mkdir -p backups
f="backups/locai3-$(date +%Y%m%d-%H%M%S).dump"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$f"
node scripts/db-manifest.mjs > "${f%.dump}.manifest.json"
chmod 600 "$f" "${f%.dump}.manifest.json"
ls -1t backups/locai3-*.dump | tail -n +15 | while read -r old; do rm -f -- "$old" "${old%.dump}.manifest.json"; done
echo "バックアップしました：$f（$(du -h "$f" | cut -f1)）と中身の一覧"
