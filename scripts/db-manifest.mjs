// DB の中身の一覧（表ごとの件数・写真ごとの照合値）を出す。秘密の値（パスワードの暗号・ログイン中の情報）は出さない
// 使い方：node scripts/db-manifest.mjs [比べる一覧の .manifest.json]
//   比べる一覧を渡すと、今の DB と同じ中身かを確かめ、違いがあれば終了コード1
import { readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(new URL("../.env.local", import.meta.url));
// 確かめる先の DB を変えるとき（復元の試しなど）だけ、CHECK_DATABASE_URL を使う
if (process.env.CHECK_DATABASE_URL) process.env.DATABASE_URL = process.env.CHECK_DATABASE_URL;
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL)) process.exit(1);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const tables = ["user", "account", "listing", "listing_photo", "user_photo", "order", "message", "listing_message", "wanted_post", "search_preset", "impression", "report", "ai_call"];
const counts = {};
for (const t of tables) counts[t] = (await db.query(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n;
const photos = Object.fromEntries((await db.query(`SELECT 'listing:' || "listingId" AS k, md5(data) AS h FROM listing_photo UNION ALL SELECT 'user:' || "userId", md5(data) FROM user_photo ORDER BY 1`)).rows.map((r) => [r.k, r.h]));
// 出品・注文は、金額・数量・状態の照合値も（中身が同じかを確かめるため）
const rows = (await db.query(`SELECT md5(string_agg(x, ',' ORDER BY x)) AS h FROM (SELECT id || ':' || status || ':' || "quantityGrams" || ':' || "totalYen" || ':' || "heldGrams" AS x FROM "order" UNION ALL SELECT id || ':' || status || ':' || "totalGrams" || ':' || "pricePerKg" FROM listing) s`)).rows[0].h;
const migrations = (await db.query(`SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL`)).rows[0].n;
await db.end();
const now = { counts, photos, ordersAndListings: rows, migrations };
const against = process.argv[2];
if (!against) {
  console.log(JSON.stringify({ createdAt: new Date().toISOString(), ...now }, null, 2));
} else {
  const want = JSON.parse(readFileSync(against, "utf8"));
  let ng = 0;
  const say = (ok, t) => { if (!ok) ng++; console.log(`${ok ? "OK" : "NG"}  ${t}`); };
  for (const t of tables) say(now.counts[t] === want.counts[t], `${t}：${now.counts[t]} 件（バックアップ ${want.counts[t]} 件）`);
  const pk = Object.keys(want.photos);
  const same = pk.filter((k) => now.photos[k] === want.photos[k]).length;
  say(same === pk.length && Object.keys(now.photos).length === pk.length, `写真：${same} / ${pk.length} 枚が同じ中身`);
  say(now.ordersAndListings === want.ordersAndListings, "出品と注文の数量・金額・状態が同じ");
  say(now.migrations === want.migrations, `表の形の変更記録：${now.migrations} 件（バックアップ ${want.migrations} 件）`);
  console.log(ng ? `結果：${ng} 件の違いがあります` : "結果：バックアップと同じ中身です");
  process.exitCode = ng ? 1 : 0;
}
