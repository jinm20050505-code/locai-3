// 取引の決まりの確認（手元の DB）。どの順番で起きても、決まった量・金額・残りの量が合うこと
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { stockOf } from "@/lib/order-rules";
import { acceptChange, applyOrder, approveOrder, cancelOrder, declineOrder, getOrderForParty, proposeChange, sendMessage } from "@/server/orders";

const db = getDb();
const tag = randomUUID().slice(0, 8);
const users: string[] = [];
async function mkUser(role: "buyer" | "producer", pref = "27") {
  const id = randomUUID();
  await db.user.create({ data: { id, name: `テスト${role}${tag}（架空）`, email: `${id}@test.invalid`, role, prefecture: pref, city: "大阪市" } });
  users.push(id);
  return id;
}
async function mkListing(producerId: string, over: Partial<{ totalGrams: number; acceptUntil: Date; replyHours: number }> = {}) {
  const d = (n: number) => new Date(Date.parse(new Date().toISOString().slice(0, 10)) + n * 86_400_000);
  return db.listing.create({
    data: {
      producerId, name: `テストなす${tag}`, totalGrams: over.totalGrams ?? 10_000, minGrams: 1000, unitGrams: 500, pricePerKg: 333,
      availableFrom: d(1), availableUntil: d(3), acceptUntil: over.acceptUntil ?? new Date(Date.now() + 3 * 86_400_000), replyHours: over.replyHours ?? 24,
      pickup: true, pickupPref: "26", pickupCity: "南丹市", delivery: true, deliveryFeeYen: 1000, deliveryPrefs: ["27"], status: "open",
    },
  });
}
const useDate = () => new Date(Date.parse(new Date().toISOString().slice(0, 10)) + 2 * 86_400_000);
async function stock(listingId: string, now = new Date()) {
  const l = await db.listing.findUniqueOrThrow({ where: { id: listingId }, include: { orders: true } });
  return stockOf(l.totalGrams, l.orders, now);
}

let producer: string, buyerA: string, buyerB: string, outsider: string;
beforeAll(async () => {
  producer = await mkUser("producer", "26");
  buyerA = await mkUser("buyer");
  buyerB = await mkUser("buyer");
  outsider = await mkUser("buyer");
});
afterAll(async () => {
  await db.message.deleteMany({ where: { senderId: { in: users } } });
  await db.order.deleteMany({ where: { buyerId: { in: users } } });
  await db.listing.deleteMany({ where: { producerId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
});

describe("金額はアプリが計算する", () => {
  it("単価×量（1円未満は四捨五入）＋送料。画面からの金額は受け取らない", async () => {
    const l = await mkListing(producer);
    const r = await applyOrder(buyerA, { listingId: l.id, grams: 1500, method: "delivery", useDate: useDate(), requestId: randomUUID() });
    expect(r.ok).toBe(true);
    const o = await db.order.findUniqueOrThrow({ where: { id: (r as { id: string }).id } });
    expect([o.subtotalYen, o.feeYen, o.totalYen]).toEqual([500, 1000, 1500]); // 333×1.5=499.5 → 500
  });
});

describe("売りすぎない", () => {
  it("残り1kgに2店が同時に申し込んでも、1件だけ通る", async () => {
    const l = await mkListing(producer, { totalGrams: 1000 });
    const rs = await Promise.all([buyerA, buyerB].map((b) => applyOrder(b, { listingId: l.id, grams: 1000, method: "pickup", useDate: useDate(), requestId: randomUUID() })));
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect((await stock(l.id)).availableGrams).toBe(0);
  });
  it("同じ送信を5回続けて送っても（連打・再送）、注文は1件", async () => {
    const l = await mkListing(producer);
    const requestId = randomUUID();
    const rs = await Promise.all(Array.from({ length: 5 }, () => applyOrder(buyerA, { listingId: l.id, grams: 2000, method: "pickup", useDate: useDate(), requestId })));
    expect(new Set(rs.map((r) => (r as { id: string }).id)).size).toBe(1);
    expect(await db.order.count({ where: { listingId: l.id } })).toBe(1);
    expect((await stock(l.id)).heldGrams).toBe(2000);
  });
  it("8件が同時に3kgずつ申し込んでも、10kgを超えない（3件まで）", async () => {
    const l = await mkListing(producer);
    const buyers = await Promise.all(Array.from({ length: 8 }, () => mkUser("buyer")));
    const rs = await Promise.all(buyers.map((b) => applyOrder(b, { listingId: l.id, grams: 3000, method: "pickup", useDate: useDate(), requestId: randomUUID() })));
    expect(rs.filter((r) => r.ok)).toHaveLength(3);
    const s = await stock(l.id);
    expect(s.heldGrams).toBe(9000);
    expect(s.availableGrams).toBe(1000);
  });
});

describe("決めた流れ以外は起こさない", () => {
  it("取消すと取り置きが戻り、取消のあとは承認できない", async () => {
    const l = await mkListing(producer);
    const r = (await applyOrder(buyerA, { listingId: l.id, grams: 4000, method: "pickup", useDate: useDate(), requestId: randomUUID() })) as { id: string };
    expect((await cancelOrder(buyerA, r.id)).ok).toBe(true);
    expect((await stock(l.id)).availableGrams).toBe(10_000);
    expect((await approveOrder(producer, r.id)).ok).toBe(false);
  });
  it("返事の期限ちょうどに承認しても、期限切れ（取り置きは戻る）", async () => {
    const l = await mkListing(producer);
    const r = (await applyOrder(buyerA, { listingId: l.id, grams: 3000, method: "pickup", useDate: useDate(), requestId: randomUUID() })) as { id: string };
    const o = await db.order.findUniqueOrThrow({ where: { id: r.id } });
    const res = await approveOrder(producer, r.id, o.replyDeadline);
    expect(res.ok).toBe(false);
    expect((await db.order.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("expired");
    expect((await stock(l.id)).availableGrams).toBe(10_000);
  });
  it("期限が過ぎた分の量は、次の申し込みに使える（例：30−5−4−3＝18、B店が期限切れで22）", async () => {
    const l = await mkListing(producer, { totalGrams: 30_000 });
    const now = new Date();
    const a = (await applyOrder(buyerA, { listingId: l.id, grams: 5000, method: "pickup", useDate: useDate(), requestId: randomUUID() }, now)) as { id: string };
    await approveOrder(producer, a.id, now);
    const later = new Date(now.getTime() + 10 * 3_600_000);
    await applyOrder(buyerB, { listingId: l.id, grams: 4000, method: "pickup", useDate: useDate(), requestId: randomUUID() }, now);
    await applyOrder(outsider, { listingId: l.id, grams: 3000, method: "pickup", useDate: useDate(), requestId: randomUUID() }, later);
    expect((await stock(l.id, later)).availableGrams).toBe(18_000);
    // B店の返事の期限（24時間後）を過ぎると、B店の4kgが戻る
    const afterB = new Date(now.getTime() + 25 * 3_600_000);
    expect((await stock(l.id, afterB)).availableGrams).toBe(22_000);
  });
  it("条件変更：提案すると取り置きは提案の量。同意すると販売確定で、金額も提案どおり", async () => {
    const l = await mkListing(producer);
    const r = (await applyOrder(buyerA, { listingId: l.id, grams: 4000, method: "delivery", useDate: useDate(), requestId: randomUUID() })) as { id: string };
    expect((await proposeChange(producer, r.id, 2000, "半分なら")).ok).toBe(true);
    expect((await stock(l.id)).heldGrams).toBe(2000);
    expect((await approveOrder(producer, r.id)).ok).toBe(false); // 提案中は承認できない
    expect((await acceptChange(buyerA, r.id)).ok).toBe(true);
    const o = await db.order.findUniqueOrThrow({ where: { id: r.id } });
    expect([o.status, o.quantityGrams, o.subtotalYen, o.totalYen, o.heldGrams]).toEqual(["confirmed", 2000, 666, 1666, 0]);
    const s = await stock(l.id);
    expect([s.soldGrams, s.heldGrams, s.availableGrams]).toEqual([2000, 0, 8000]);
  });
  it("提案の量は、残りの範囲まで（ほかの取り置きを超えて増やせない）", async () => {
    const l = await mkListing(producer, { totalGrams: 5000 });
    const r = (await applyOrder(buyerA, { listingId: l.id, grams: 2000, method: "pickup", useDate: useDate(), requestId: randomUUID() })) as { id: string };
    await applyOrder(buyerB, { listingId: l.id, grams: 2000, method: "pickup", useDate: useDate(), requestId: randomUUID() });
    expect((await proposeChange(producer, r.id, 3500, "")).ok).toBe(false);
    expect((await proposeChange(producer, r.id, 3000, "")).ok).toBe(true);
    expect((await stock(l.id)).availableGrams).toBe(0);
  });
  it("見送ると取り置きが戻り、販売確定は取消できない", async () => {
    const l = await mkListing(producer);
    const a = (await applyOrder(buyerA, { listingId: l.id, grams: 2000, method: "pickup", useDate: useDate(), requestId: randomUUID() })) as { id: string };
    const b = (await applyOrder(buyerB, { listingId: l.id, grams: 2000, method: "pickup", useDate: useDate(), requestId: randomUUID() })) as { id: string };
    expect((await declineOrder(producer, a.id)).ok).toBe(true);
    expect((await approveOrder(producer, b.id)).ok).toBe(true);
    expect((await cancelOrder(buyerB, b.id)).ok).toBe(false);
    const s = await stock(l.id);
    expect([s.soldGrams, s.heldGrams, s.availableGrams]).toEqual([2000, 0, 8000]);
  });
  it("数量の単位・最低量・受付の締め切り・お届けの範囲は、サーバーで断る", async () => {
    const l = await mkListing(producer);
    const base = { listingId: l.id, method: "pickup", useDate: useDate() };
    expect((await applyOrder(buyerA, { ...base, grams: 1200, requestId: randomUUID() })).ok).toBe(false);
    expect((await applyOrder(buyerA, { ...base, grams: 500, requestId: randomUUID() })).ok).toBe(false);
    const kyoto = await mkUser("buyer", "26"); // お届けの範囲（大阪）の外
    expect((await applyOrder(kyoto, { ...base, method: "delivery", grams: 1000, requestId: randomUUID() })).ok).toBe(false);
    const closed = await mkListing(producer, { acceptUntil: new Date(Date.now() - 1000) });
    expect((await applyOrder(buyerA, { ...base, listingId: closed.id, grams: 1000, requestId: randomUUID() })).ok).toBe(false);
    expect((await applyOrder(producer, { ...base, grams: 1000, requestId: randomUUID() })).ok).toBe(false); // 生産者は申し込めない
  });
});

describe("他人の情報は見えない", () => {
  it("当事者でない人は、注文を見る・返事をする・メッセージを送ることができない", async () => {
    const l = await mkListing(producer);
    const r = (await applyOrder(buyerA, { listingId: l.id, grams: 1000, method: "pickup", useDate: useDate(), requestId: randomUUID() })) as { id: string };
    expect(await getOrderForParty(outsider, r.id)).toBeNull();
    expect((await cancelOrder(outsider, r.id)).ok).toBe(false);
    expect((await approveOrder(buyerB, r.id)).ok).toBe(false);
    expect((await sendMessage(outsider, r.id, "こんにちは", randomUUID())).ok).toBe(false);
    expect((await sendMessage(buyerA, r.id, "<b>よろしく</b>", randomUUID())).ok).toBe(true);
  });
});
