// Prisma のコマンド用の設定。手元では .env.local を読み込む（中身は表示しない）
import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile(".env.local");
} catch {
  // ファイルがない環境では何もしない
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "" },
});
