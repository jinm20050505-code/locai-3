// デモデータ（すべて架空・実際の販売なし）を入れ直す：npm run db:seed
// - 手元の DB（localhost）にだけ入れる。ほかの接続先なら止める
// - 前回入れた架空のデータ（isDemo）だけを消してから入れ直す。自分で登録したデータは消さない
// - デモのアカウントのパスワードは毎回ランダムに作り、demo-accounts.local.txt（Git に入れない）にだけ書く
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";

process.loadEnvFile(new URL("../.env.local", import.meta.url));
const url = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
  console.error("デモデータは、手元の DB（localhost）にだけ入れます。");
  process.exit(1);
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const JST = 9 * 3_600_000;
const today = new Date(Date.now() + JST).toISOString().slice(0, 10);
const day = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const at = (n, hm) => new Date(`${day(n)}T${hm}:00+09:00`);

// 架空の写真（絵）。野菜の形を簡単な図形で描き、「架空の写真」と書く
const svg = (bg, shapes) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="800" height="600"><rect width="400" height="300" fill="${bg}"/>${shapes}<rect x="0" y="262" width="400" height="38" fill="#ffffffcc"/><text x="200" y="288" font-size="20" text-anchor="middle" fill="#333" font-family="sans-serif">架空の写真（デモ）</text></svg>`);
const PHOTOS = {
  kamonasu: svg("#f3efe6", `<circle cx="150" cy="140" r="78" fill="#3b1f4a"/><circle cx="255" cy="150" r="70" fill="#4a2660"/><path d="M120 70 q30 -30 60 0 z" fill="#3f7d2c"/><path d="M228 84 q28 -28 56 0 z" fill="#3f7d2c"/>`),
  nasu: svg("#eef3e6", `<ellipse cx="140" cy="140" rx="45" ry="95" fill="#40205a" transform="rotate(-20 140 140)"/><ellipse cx="250" cy="140" rx="45" ry="95" fill="#4b2766" transform="rotate(15 250 140)"/>`),
  manganji: svg("#fbf7e9", `<path d="M70 120 q150 -40 260 30 q-120 10 -260 -10 z" fill="#3c8a2e"/><path d="M80 170 q140 -30 250 25 q-120 15 -250 -5 z" fill="#4c9b35"/>`),
  negi: svg("#eef6f0", `<rect x="80" y="40" width="22" height="200" rx="10" fill="#4f9d3a"/><rect x="130" y="30" width="22" height="210" rx="10" fill="#5aa843"/><rect x="180" y="45" width="22" height="195" rx="10" fill="#4f9d3a"/><rect x="230" y="35" width="22" height="205" rx="10" fill="#5aa843"/><rect x="70" y="190" width="200" height="50" fill="#f4f1e1"/>`),
  tamanegi: svg("#f6efe2", `<circle cx="140" cy="160" r="70" fill="#c98b3c"/><circle cx="260" cy="160" r="62" fill="#b97a30"/><path d="M135 92 l5 -40 l5 40 z" fill="#8a5a20"/><path d="M255 100 l5 -36 l5 36 z" fill="#8a5a20"/>`),
  tomato: svg("#fdf1ef", `<circle cx="120" cy="150" r="40" fill="#d8322a"/><circle cx="200" cy="130" r="42" fill="#e13d30"/><circle cx="280" cy="155" r="40" fill="#cf2f27"/><circle cx="165" cy="200" r="38" fill="#e04434"/><circle cx="240" cy="205" r="38" fill="#d63a2d"/>`),
};

await db.query("BEGIN");
// 前回の架空のデータを消す（注文 → 出品 → アカウントの順）
const demoIds = (await db.query(`SELECT id FROM "user" WHERE "isDemo"`)).rows.map((r) => r.id);
if (demoIds.length) {
  await db.query(`DELETE FROM "message" WHERE "orderId" IN (SELECT id FROM "order" WHERE "buyerId" = ANY($1) OR "producerId" = ANY($1))`, [demoIds]);
  await db.query(`DELETE FROM "order" WHERE "buyerId" = ANY($1) OR "producerId" = ANY($1)`, [demoIds]);
  await db.query(`DELETE FROM "listing" WHERE "producerId" = ANY($1)`, [demoIds]);
  await db.query(`DELETE FROM "wanted_post" WHERE "buyerId" = ANY($1)`, [demoIds]);
  await db.query(`DELETE FROM "search_preset" WHERE "userId" = ANY($1)`, [demoIds]);
  await db.query(`DELETE FROM "report" WHERE "reporterId" = ANY($1)`, [demoIds]);
  await db.query(`DELETE FROM "listing_message" WHERE "senderId" = ANY($1)`, [demoIds]);
  await db.query(`DELETE FROM "ai_call" WHERE "userId" = ANY($1)`, [demoIds]);
  await db.query(`DELETE FROM "user" WHERE id = ANY($1)`, [demoIds]);
}

const accounts = [];
async function user({ key, name, role, pref, city, intro = null, items = null, daysAgo = 200 }) {
  const id = randomUUID();
  const email = `${key}@demo.locai.invalid`;
  const password = randomBytes(9).toString("base64url");
  const created = new Date(Date.now() - daysAgo * 86_400_000);
  await db.query(`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role, prefecture, city, intro, items, "isDemo") VALUES ($1,$2,$3,false,$4,$4,$5,$6,$7,$8,$9,true)`, [id, name, email, created, role, pref, city, intro, items]);
  await db.query(`INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES ($1,$2,'credential',$2,$3,now(),now())`, [randomUUID(), id, await hashPassword(password)]);
  accounts.push({ name, role, email, password });
  return id;
}

const sakata = await user({ key: "sakata", name: "坂田農園（架空）", role: "producer", pref: "26", city: "南丹市", intro: "南丹市で賀茂茄子を育てています（架空の農家です）。朝に収穫したものをお渡しします。", items: "賀茂茄子、千両なす" });
const midori = await user({ key: "midori", name: "みどり畑（架空）", role: "producer", pref: "26", city: "亀岡市", intro: "万願寺唐辛子とミニトマトを育てています（架空）。", items: "万願寺唐辛子、伏見甘長、ミニトマト" });
const yamabiko = await user({ key: "yamabiko", name: "やまびこファーム（架空）", role: "producer", pref: "29", city: "宇陀市", intro: "今年から始めた農家です（架空）。", daysAgo: 10 });
const awaji = await user({ key: "awaji", name: "淡路の風農園（架空）", role: "producer", pref: "28", city: "淡路市" });
const mikami = await user({ key: "mikami", name: "小料理屋みかみ（架空）", role: "buyer", pref: "27", city: "大阪市" });
const tanaka = await user({ key: "tanaka", name: "割烹たなか（架空）", role: "buyer", pref: "26", city: "京都市" });
const tanaka2 = await user({ key: "kawabata", name: "食堂かわばた（架空）", role: "buyer", pref: "27", city: "吹田市" });
const tanaka3 = await user({ key: "nishi", name: "西の酒場（架空）", role: "buyer", pref: "28", city: "神戸市" });

async function listing(producerId, l, photoKey) {
  const id = randomUUID();
  await db.query(
    `INSERT INTO "listing" (id, "producerId", name, variety, description, "surplusReason", "allowPartial", "totalGrams", "minGrams", "unitGrams", "pricePerKg", "availableFrom", "availableUntil", "acceptUntil", "replyUntil",
       courier, "courierPrefs", "courierFees", "courierTemp", "courierDays", delivery, "deliveryFeeYen", "deliveryPrefs", "deliveryMaxOrders", pickup, "pickupPref", "pickupCity", "courierQuote", "deliveryQuote", "deliveryWeekdays", status, "isDemo", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,'open',true,now(),now())`,
    [id, producerId, l.name, l.variety ?? null, l.description ?? null, l.surplus ?? null, l.partial ?? true, l.total, l.min, l.unit, l.price, day(l.from), day(l.until), at(l.acceptDay, "12:00"), at(l.acceptDay, "20:00"),
     !!l.courier, l.courier?.prefs ?? [], l.courier ? JSON.stringify(l.courier.bands) : null, l.courier?.temp ?? null, l.courier?.days ?? null,
     !!l.delivery, l.delivery?.[0] ?? null, l.delivery?.[1] ?? [], l.delivery?.[2] ?? null, !!l.pickup, l.pickup?.[0] ?? null, l.pickup?.[1] ?? null,
     !!l.courierQuote, !!l.deliveryQuote, l.weekdays ?? []],
  );
  await db.query(`INSERT INTO "listing_photo" ("listingId", mime, data, "createdAt") VALUES ($1,'image/svg+xml',$2,now())`, [id, PHOTOS[photoKey]]);
  return id;
}

const kamo = await listing(sakata, { name: "なす", variety: "賀茂茄子", description: "丸くて大きな京野菜。田楽や揚げびたしに（架空の出品です）。", total: 30000, min: 1000, unit: 500, price: 600, from: 1, until: 4, acceptDay: 3, pickup: ["26", "南丹市"], courier: { prefs: ["26", "27", "25", "28"], bands: [{ upToGrams: 5000, feeYen: 800 }, { upToGrams: 20000, feeYen: 1500 }], temp: "normal", days: 1 }, delivery: [1200, ["26", "27"], 3] }, "kamonasu");
await listing(sakata, { name: "なす", variety: "千両なす", surplus: "規格外", description: "形がふぞろいですが、味は同じです（架空）。", total: 20000, min: 1000, unit: 1000, price: 400, from: 1, until: 5, acceptDay: 4, pickup: ["26", "南丹市"], delivery: [1200, ["26", "27"]] }, "nasu");
const manganji = await listing(midori, { name: "万願寺唐辛子", description: "甘くて肉厚。焼いてもおいしい（架空）。", surplus: "豊作", total: 10000, min: 500, unit: 500, price: 1500, from: 1, until: 3, acceptDay: 2, delivery: [800, ["26", "27"]] }, "manganji");
await listing(midori, { name: "伏見甘長", description: "細長い甘とうがらし。焼物や炊いたんに（架空）。", total: 6000, min: 500, unit: 500, price: 1200, from: 1, until: 4, acceptDay: 3, courier: { prefs: ["26", "27"], bands: [{ upToGrams: 3000, feeYen: 700 }, { upToGrams: 10000, feeYen: 1100 }], temp: "chilled", days: 1 } }, "manganji");
await listing(midori, { name: "ミニトマト", total: 6000, min: 500, unit: 250, price: 1200, from: 2, until: 4, acceptDay: 3, pickup: ["26", "亀岡市"], delivery: [800, ["26", "27"]] }, "tomato");
// 配達料は見積もり・配達できる曜日つきの例
await listing(yamabiko, { name: "ねぎ", variety: "九条ねぎ", total: 8000, min: 1000, unit: 1000, price: 700, from: 1, until: 6, acceptDay: 5, pickup: ["29", "宇陀市"], delivery: [null, ["29", "27"], null], deliveryQuote: true, weekdays: [1, 3, 5] }, "negi");
await listing(awaji, { name: "玉ねぎ", total: 50000, min: 5000, unit: 1000, price: 300, from: 2, until: 7, acceptDay: 6, courier: { prefs: ["28", "27", "26"], bands: [{ upToGrams: 10000, feeYen: 1000 }, { upToGrams: 30000, feeYen: 1800 }], temp: "normal", days: 2 } }, "tamanegi");

// 仕様書の例：賀茂茄子30kg に、A店5kg（販売確定）・B店4kg（返事待ち）→ ほかの店が申し込めるのは21kg
async function order(listingId, buyerId, producerId, grams, status, price, fee, method, useDay = 2) {
  const sub = Math.floor((price * grams + 500) / 1000);
  await db.query(
    `INSERT INTO "order" (id, "listingId", "buyerId", "producerId", "requestId", status, method, "pricePerKg", "quantityGrams", "subtotalYen", "feeYen", "totalYen", "heldGrams", "useDate", "replyDeadline", "decidedAt", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now(),now())`,
    [randomUUID(), listingId, buyerId, producerId, randomUUID(), status, method, price, grams, sub, fee, sub + fee, status === "pending" ? grams : 0, day(useDay), at(3, "20:00"), status === "confirmed" ? new Date() : null],
  );
}
// 仕様書の例：賀茂茄子30kg に、A店5kg（販売確定）・B店4kg と C店3kg（回答待ち）→ ほかの店が申し込めるのは18kg
await order(kamo, tanaka, sakata, 5000, "confirmed", 600, 1200, "delivery");
await order(kamo, tanaka2, sakata, 4000, "pending", 600, 0, "pickup");
await order(kamo, tanaka3, sakata, 3000, "pending", 600, 800, "courier");
// 小料理屋みかみ（架空）の今週の確保済み食材
await order(manganji, mikami, midori, 2000, "confirmed", 1500, 800, "delivery", 2);
// 「探しています」（架空）
await db.query(`INSERT INTO "wanted_post" (id, "buyerId", item, "altOk", grams, "budgetYen", "useDate", prefecture, city, methods, usage, status, "isDemo", "createdAt") VALUES ($1,$2,'ししとう',true,2000,4000,$3,'27','大阪市',$4,'焼物','open',true,now())`, [randomUUID(), mikami, day(3), ["courier", "delivery"]]);
await db.query("COMMIT");
await db.end();

writeFileSync(new URL("../demo-accounts.local.txt", import.meta.url), `デモのアカウント（すべて架空・実際の販売なし）。このファイルは Git に入れない。npm run db:seed のたびにパスワードが変わる\n\n${accounts.map((a) => `${a.name}（${a.role === "buyer" ? "お店" : "農家"}）\n  メール：${a.email}\n  パスワード：${a.password}`).join("\n")}\n`, { mode: 0o600 });
console.log(`デモデータを入れました：農家4・お店4・出品7・注文4・探しています1（すべて架空）。ログイン情報は demo-accounts.local.txt に書きました（ここには表示しません）。`);
