// 成功の基準（仕様 7章）のうち、アプリの記録から測れるものの集計：npm run report:metrics
// - 生産者：初回出品から最初の販売確定までの日数（目標 14日以内）
// - 継続：直近4週間のうち、店が購入希望を送った週の数（目標 4週中3週以上）
// ほかの基準（献立の組み直しの回数・廃棄量・市場出荷単価との比較）は、アプリの外でヒアリングして測る。手元の DB だけ
import pg from "pg";

process.loadEnvFile(new URL("../.env.local", import.meta.url));
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL)) process.exit(1);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const p = (await db.query(`
  SELECT u.name, min(l."createdAt") AS first_listing, min(o."decidedAt") FILTER (WHERE o.status = 'confirmed') AS first_sale
  FROM "user" u JOIN listing l ON l."producerId" = u.id LEFT JOIN "order" o ON o."producerId" = u.id
  WHERE u.role = 'producer' GROUP BY u.name ORDER BY u.name`)).rows;
console.log("生産者：初回出品から最初の販売確定までの日数（目標 14日以内）");
for (const r of p) console.log(`  ${r.name}：${r.first_sale ? `${Math.max(0, Math.round((r.first_sale - r.first_listing) / 86_400_000))} 日` : "まだ販売確定なし"}`);
const b = (await db.query(`
  SELECT u.name, count(DISTINCT date_trunc('week', o."createdAt"))::int AS weeks
  FROM "user" u LEFT JOIN "order" o ON o."buyerId" = u.id AND o."createdAt" > now() - interval '28 days'
  WHERE u.role = 'buyer' GROUP BY u.name ORDER BY u.name`)).rows;
console.log("継続：直近4週間のうち、購入希望を送った週の数（目標 4週中3週以上）");
for (const r of b) console.log(`  ${r.name}：${r.weeks} 週`);
console.log("※ほかの基準（献立の組み直しの回数・廃棄量・市場出荷単価との比較）は、ヒアリングで測ります。");
await db.end();
