#!/usr/bin/env bash
# Gemini の設定を .env.local に入れる：npm run ai:set
# 鍵は打っても画面に出ない（貼り付けて Enter）。モデル名は npm run ai:check で使えるものを確かめられる
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.local ] || { echo ".env.local がありません。先に npm run setup を実行してください"; exit 1; }
read -rsp "GEMINI_API_KEY（画面には出ません。空のまま Enter で今の値を残す）: " key; echo
read -rp "GEMINI_MODEL（空のまま Enter で今の値を残す）: " model
[ -z "$key$model" ] && { echo "何も変えていません"; exit 0; }
case "$key$model" in *'"'*|*\\*) echo "使えない文字が入っています"; exit 1;; esac
umask 077
set_var() {
  grep -v "^$1=" .env.local > .env.local.tmp || true
  printf '%s="%s"\n' "$1" "$2" >> .env.local.tmp
  mv .env.local.tmp .env.local
}
[ -n "$key" ] && set_var GEMINI_API_KEY "$key"
[ -n "$model" ] && set_var GEMINI_MODEL "$model"
chmod 600 .env.local
echo "保存しました（値は表示しません）。アプリを起動し直すと反映されます"
