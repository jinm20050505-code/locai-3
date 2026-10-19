// 手元の DB を使う確認（npm run test:db）。作った架空のデータは最後に消す
import path from "node:path";
import { defineConfig } from "vitest/config";

process.loadEnvFile(path.resolve(import.meta.dirname, ".env.local"));
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "")) throw new Error("DB のテストは手元の DB だけで動かします");

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { include: ["tests/db/**/*.db.test.ts"], environment: "node", testTimeout: 60_000, fileParallelism: false },
});
