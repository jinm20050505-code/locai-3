// 露出の偏りの確認（仕様「表示履歴はアプリ側で記録し、露出の偏りを確認する」）：npm run report:exposure [-- 日数]
// 農家ごとの、候補に表示された回数と割合、区分（リピート・条件に合う・新しい農家）ごとの回数を出す。手元の DB だけ
import pg from "pg";

process.loadEnvFile(new URL("../.env.local", import.meta.url));
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL)) process.exit(1);
const days = Number(process.argv[2] ?? 7);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const rows = (await db.query(`SELECT u.name, i.grp, count(*)::int AS n FROM impression i JOIN "user" u ON u.id = i."producerId" WHERE i."createdAt" > now() - make_interval(days => $1) GROUP BY u.name, i.grp`, [days])).rows;
const total = rows.reduce((s, r) => s + r.n, 0);
const by = new Map();
for (const r of rows) by.set(r.name, { ...(by.get(r.name) ?? {}), [r.grp]: r.n, all: (by.get(r.name)?.all ?? 0) + r.n });
console.log(`直近 ${days} 日の候補の表示：合計 ${total} 回`);
for (const [name, v] of [...by.entries()].sort((a, b) => b[1].all - a[1].all)) {
  console.log(`  ${name}：${v.all} 回（${total ? Math.round((v.all / total) * 100) : 0}%）／リピート ${v.repeat ?? 0}・条件に合う ${v.match ?? 0}・新しい農家 ${v.newcomer ?? 0}`);
}
const shares = [...by.values()].map((v) => v.all / (total || 1));
if (shares.length > 1) console.log(`いちばん多い農家の割合：${Math.round(Math.max(...shares) * 100)}%（${by.size} 軒で均等なら ${Math.round(100 / by.size)}%）`);
console.log("※表示が増えても、購入や売上を約束するものではありません。");
await db.end();
