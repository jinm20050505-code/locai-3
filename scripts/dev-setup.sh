#!/usr/bin/env bash
# 開発環境の用意（何度実行してもよい）：npm run setup
# 1. PostgreSQL がなければ入れて起動する
# 2. .env.local がなければ作る（DB のパスワードとログイン用の秘密の値は、ここでランダムに作る。表示しない）
# 3. DB の利用者と DB がなければ作る → 表の形を反映する
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v pg_ctlcluster >/dev/null; then
  sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql >/dev/null
fi
sudo service postgresql start >/dev/null
if [ ! -f .env.local ]; then
  umask 077
  printf 'DATABASE_URL="postgresql://locai3:%s@localhost:5432/locai3"\nBETTER_AUTH_SECRET="%s"\nBETTER_AUTH_URL="http://localhost:3004"\n' "$(openssl rand -hex 16)" "$(openssl rand -hex 32)" > .env.local
  echo ".env.local を作りました（値は表示しません）"
fi
set -a; . ./.env.local; set +a
pw="$(node -e 'console.log(new URL(process.env.DATABASE_URL).password)')"
if ! sudo runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='locai3'" | grep -q 1; then
  sudo runuser -u postgres -- psql -qc "CREATE ROLE locai3 LOGIN CREATEDB PASSWORD '$pw'"
fi
if ! sudo runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='locai3'" | grep -q 1; then
  sudo runuser -u postgres -- psql -qc "CREATE DATABASE locai3 OWNER locai3"
fi
npx prisma migrate deploy >/dev/null && echo "DB の準備ができました（表の形は最新）"
