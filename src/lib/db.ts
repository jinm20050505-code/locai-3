// アプリから DB につなぐ共通部品（サーバー側だけで使う）
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const g = globalThis as unknown as { locaiDb?: PrismaClient };

export function getDb(): PrismaClient {
  if (!g.locaiDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL が設定されていません（.env.local を確認）");
    g.locaiDb = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }
  return g.locaiDb;
}
