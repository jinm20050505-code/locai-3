#!/usr/bin/env bash
# バックアップから DB を戻す：npm run db:restore -- backups/locai3-....dump --yes
# - 今の DB の中身は、バックアップの内容に置き換わる（--yes を付けたときだけ実行）
# - 戻す前に、今の状態も自動でバックアップする
set -euo pipefail
cd "$(dirname "$0")/.."
file="${1:-}"; yes="${2:-}"
[ -f "$file" ] || { echo "使い方：npm run db:restore -- <バックアップのファイル> --yes"; exit 1; }
[ "$yes" = "--yes" ] || { echo "今の DB の中身が置き換わります。よければ最後に --yes を付けて、もう一度実行してください"; exit 1; }
set -a; . ./.env.local; set +a
case "$DATABASE_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "手元の DB だけに戻します"; exit 1 ;; esac
bash scripts/db-backup.sh >/dev/null && echo "戻す前の状態もバックアップしました"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$file"
echo "戻しました：$file"
