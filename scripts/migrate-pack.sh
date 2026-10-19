#!/usr/bin/env bash
# 移行の荷造り（今の環境で実行）：npm run migrate:pack
# ソース（Git の履歴つき）・DB のバックアップ（写真を含む）と中身の一覧・デモのログイン情報を、1つのファイルにまとめる。
# .env.local（DB のパスワード・ログイン用の秘密の値）は入れない（移行先で npm run setup が新しく作る）
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/db-backup.sh
dump=$(ls -1t backups/locai3-*.dump | head -1)
stamp=$(date +%Y%m%d-%H%M%S)
mkdir -p migration
out="migration/locai3-migration-$stamp.tar.gz"
tmp="migration/locai3-migration-$stamp.tar"
# ソースと Git の履歴（作り直せるもの・秘密の値・古いバックアップは入れない）
tar -cf "$tmp" -C .. \
  --exclude=LocAI-3/node_modules --exclude=LocAI-3/.next --exclude=LocAI-3/src/generated --exclude=LocAI-3/.env.local \
  --exclude=LocAI-3/tests/e2e/output --exclude=LocAI-3/migration --exclude=LocAI-3/backups \
  LocAI-3
# 最新のバックアップと中身の一覧だけを足す
tar -rf "$tmp" -C .. "LocAI-3/$dump" "LocAI-3/${dump%.dump}.manifest.json"
gzip -9 "$tmp"
chmod 600 "$out"
# 中身の確かめ：バックアップ・一覧・デモのログイン情報が入り、.env.local が入っていないこと
list=$(tar -tzf "$out")
grep -q "LocAI-3/$dump" <<<"$list" && grep -q "manifest.json" <<<"$list" && grep -q "demo-accounts.local.txt" <<<"$list" || { echo "荷物にバックアップが入っていません"; exit 1; }
! grep -qE "\.env\.local$|node_modules/" <<<"$list" || { echo "荷物に入れてはいけないものがあります"; exit 1; }
echo "まとめました：$out（$(du -h "$out" | cut -f1)）"
echo "照合用の値（SHA-256）：$(sha256sum "$out" | cut -d' ' -f1)"
