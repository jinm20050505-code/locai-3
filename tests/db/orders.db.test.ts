// 取引の決まりの確認（手元の DB）。どの順番で起きても、決まった量・金額・残りの量が合うこと
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { stockOf } from "@/lib/order-rules";
import { search } from "@/server/search";
import { updateListing } from "@/server/listings";
import { buyerThread, postListingMessage, producerThreads } from "@/server/threads";
import { validateListing } from "@/lib/listing-rules";
import { dayText, toJstInput } from "@/lib/dates";
import { createWanted, listOpenWanted, report, validateWanted } from "@/server/wanted";
import { acceptChange, applyOrder, approveAll, approveOrder, cancelOrder, declineOrder, getOrderForParty, proposeChange, sendMessage } from "@/server/orders";

const db = getDb();
const tag = randomUUID().slice(0, 8);
const users: string[] = [];
async function mkUser(role: "buyer" | "producer", pref = "27") {
  const id = randomUUID();
  await db.user.create({ data: { id, name: `テスト${role}${tag}（架空）`, email: `${id}@test.invalid`, role, prefecture: pref, city: "大阪市" } });
  users.push(id);
  return id;
}
async function mkListing(producerId: string, over: Partial<{ totalGrams: number; acceptUntil: Date; replyUntil: Date; allowPartial: boolean; minGrams: number; deliveryMaxOrders: number; courier: boolean }> = {}) {
  const d = (n: number) => new Date(Date.parse(new Date().toISOString().slice(0, 10)) + n * 86_400_000);
  return db.listing.create({
    data: {
      producerId, name: `テストなす${tag}`, totalGrams: over.totalGrams ?? 10_000, minGrams: over.minGrams ?? 1000, unitGrams: 500, pricePerKg: 333, allowPartial: over.allowPartial ?? true,
      availableFrom: d(1), availableUntil: d(3), acceptUntil: over.acceptUntil ?? new Date(Date.now() + 2 * 86_400_000), replyUntil: over.replyUntil ?? new Date(Date.now() + 2.5 * 86_400_000),
      pickup: true, pickupPref: "26", pickupCity: "南丹市", delivery: true, deliveryFeeYen: 1000, deliveryPrefs: ["27"], deliveryMaxOrders: over.deliveryMaxOrders ?? null,
      courier: over.courier ?? false, courierPrefs: ["27"], courierFees: [{ upToGrams: 3000, feeYen: 700 }, { upToGrams: 10000, feeYen: 1200 }], courierTemp: "normal", courierDays: 1, status: "open",
    },
  });
}
const dayAfter2 = () => new Date(Date.parse(new Date().toISOString().slice(0, 10)) + 2 * 86_400_000);
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
  await db.impression.deleteMany({ where: { producerId: { in: users } } });
  await db.message.deleteMany({ where: { senderId: { in: users } } });
  await db.listingMessage.deleteMany({ where: { senderId: { in: users } } });
  await db.order.deleteMany({ where: { buyerId: { in: users } } });
  await db.listing.deleteMany({ where: { producerId: { in: users } } });
  await db.report.deleteMany({ where: { reporterId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
});

describe("金額はアプリが計算する", () => {
  it("単価×量（1円未満は四捨五入）＋送料。画面からの金額は受け取らない", async () => {
    const l = await mkListing(producer);
    const r = await applyOrder(buyerA, { listingId: l.id, grams: 1500, method: "delivery", useDate: dayAfter2(), requestId: randomUUID() });
    expect(r.ok).toBe(true);
    const o = await db.order.findUniqueOrThrow({ where: { id: (r as { id: string }).id } });
    expect([o.subtotalYen, o.feeYen, o.totalYen]).toEqual([500, 1000, 1500]); // 333×1.5=499.5 → 500
  });
});

describe("売りすぎない", () => {
  it("残り1kgに2店が同時に申し込んでも、1件だけ通る", async () => {
    const l = await mkListing(producer, { totalGrams: 1000 });
    const rs = await Promise.all([buyerA, buyerB].map((b) => applyOrder(b, { listingId: l.id, grams: 1000, method: "pickup", useDate: dayAfter2(), requestId: randomUUID() })));
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect((await stock(l.id)).availableGrams).toBe(0);
  });
  it("同じ送信を5回続けて送っても（連打・再送）、注文は1件", async () => {
    const l = await mkListing(producer);
    const requestId = randomUUID();
    const rs = await Promise.all(Array.from({ length: 5 }, () => applyOrder(buyerA, { listingId: l.id, grams: 2000, method: "pickup", useDate: dayAfter2(), requestId })));
    expect(new Set(rs.map((r) => (r as { id: string }).id)).size).toBe(1);
    expect(await db.order.count({ where: { listingId: l.id } })).toBe(1);
    expect((await stock(l.id)).heldGrams).toBe(2000);
  });
  it("8件が同時に3kgずつ申し込んでも、10kgを超えない（3件まで）", async () => {
    const l = await mkListing(producer);
    const buyers = await Promise.all(Array.from({ length: 8 }, () => mkUser("buyer")));
    const rs = await Promise.all(buyers.map((b) => applyOrder(b, { listingId: l.id, grams: 3000, method: "pickup", useDate: dayAfter2(), requestId: randomUUID() })));
    expect(rs.filter((r) => r.ok)).toHaveLength(3);
    const s = await stock(l.id);
    expect(s.heldGrams).toBe(9000);
    expect(s.availableGrams).toBe(1000);
  });
});

describe("決めた流れ以外は起こさない", () => {
  it("取消すと取り置きが戻り、取消のあとは承認できない", async () => {
    const l = await mkListing(producer);
    const r = (await applyOrder(buyerA, { listingId: l.id, grams: 4000, method: "pickup", useDate: dayAfter2(), requestId: randomUUID() })) as { id: string };
    expect((await cancelOrder(buyerA, r.id)).ok).toBe(true);
    expect((await stock(l.id)).availableGrams).toBe(10_000);
    expect((await approveOrder(producer, r.id)).ok).toBe(false);
  });
  it("回答期限ちょうどに承認しても、期限切れ（仮押さえは解除）", async () => {
    const l = await mkListing(producer);
    const r = (await applyOrder(buyerA, { listingId: l.id, grams: 3000, method: "pickup", useDate: dayAfter2(), requestId: randomUUID() })) as { id: string };
    const o = await db.order.findUniqueOrThrow({ where: { id: r.id } });
    const res = await approveOrder(producer, r.id, o.replyDeadline);
    expect(res.ok).toBe(false);
    expect((await db.order.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("expired");
    expect((await stock(l.id)).availableGrams).toBe(10_000);
  });
  it("仕様の例：30kg に A店5kg（販売確定）・B店4kg・C店3kg（回答待ち）→ 申し込めるのは18kg。回答期限を過ぎると回答待ちの分が戻る", async () => {
    const l = await mkListing(producer, { totalGrams: 30_000 });
    const now = new Date();
    const a = (await applyOrder(buyerA, { listingId: l.id, grams: 5000, method: "pickup", useDate: dayAfter2(), requestId: randomUUID() }, now)) as { id: string };
    await approveOrder(producer, a.id, now);
    await applyOrder(buyerB, { listingId: l.id, grams: 4000, method: "pickup", useDate: dayAfter2(), requestId: randomUUID() }, now);
    await applyOrder(outsider, { listingId: l.id, grams: 3000, method: "pickup", useDate: dayAfter2(), requestId: randomUUID() }, now);
    expect((await stock(l.id, now)).availableGrams).toBe(18_000);
    const after = new Date(l.replyUntil.getTime() + 1000);
    expect((await stock(l.id, after)).availableGrams).toBe(25_000);
    expect((await approveOrder(producer, (await db.order.findFirstOrThrow({ where: { listingId: l.id, buyerId: buyerB } })).id, after)).ok).toBe(false);
  });
  it("条件変更：提案すると取り置きは提案の量。同意すると販売確定で、金額も提案どおり", async () => {
    const l = await mkListing(producer);
    const r = (await applyOrder(buyerA, { listingId: l.id, grams: 4000, method: "delivery", useDate: dayAfter2(), requestId: randomUUID() })) as { id: string };
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
    const r = (await applyOrder(buyerA, { listingId: l.id, grams: 2000, method: "pickup", useDate: dayAfter2(), requestId: randomUUID() })) as { id: string };
    await applyOrder(buyerB, { listingId: l.id, grams: 2000, method: "pickup", useDate: dayAfter2(), requestId: randomUUID() });
    expect((await proposeChange(producer, r.id, 3500, "")).ok).toBe(false);
    expect((await proposeChange(producer, r.id, 3000, "")).ok).toBe(true);
    expect((await stock(l.id)).availableGrams).toBe(0);
  });
  it("見送ると取り置きが戻り、販売確定は取消できない", async () => {
    const l = await mkListing(producer);
    const a = (await applyOrder(buyerA, { listingId: l.id, grams: 2000, method: "pickup", useDate: dayAfter2(), requestId: randomUUID() })) as { id: string };
    const b = (await applyOrder(buyerB, { listingId: l.id, grams: 2000, method: "pickup", useDate: dayAfter2(), requestId: randomUUID() })) as { id: string };
    expect((await declineOrder(producer, a.id)).ok).toBe(true);
    expect((await approveOrder(producer, b.id)).ok).toBe(true);
    expect((await cancelOrder(buyerB, b.id)).ok).toBe(false);
    const s = await stock(l.id);
    expect([s.soldGrams, s.heldGrams, s.availableGrams]).toEqual([2000, 0, 8000]);
  });
  it("数量の単位・最低量・受付の締め切り・お届けの範囲は、サーバーで断る", async () => {
    const l = await mkListing(producer);
    const base = { listingId: l.id, method: "pickup", useDate: dayAfter2() };
    expect((await applyOrder(buyerA, { ...base, grams: 1200, requestId: randomUUID() })).ok).toBe(false);
    expect((await applyOrder(buyerA, { ...base, grams: 500, requestId: randomUUID() })).ok).toBe(false);
    const kyoto = await mkUser("buyer", "26"); // お届けの範囲（大阪）の外
    expect((await applyOrder(kyoto, { ...base, method: "delivery", grams: 1000, requestId: randomUUID() })).ok).toBe(false);
    const closed = await mkListing(producer, { acceptUntil: new Date(Date.now() - 1000) });
    expect((await applyOrder(buyerA, { ...base, listingId: closed.id, grams: 1000, requestId: randomUUID() })).ok).toBe(false);
    expect((await applyOrder(producer, { ...base, grams: 1000, requestId: randomUUID() })).ok).toBe(false); // 生産者は申し込めない
  });
});

describe("仕様の追加の決まり", () => {
  it("全件承認：届いた順に承認し、配達の受付件数を超える分は理由つきで承認しない（全量未達でも承認できる）", async () => {
    const l = await mkListing(producer, { totalGrams: 30_000, deliveryMaxOrders: 2 });
    const bs = await Promise.all(Array.from({ length: 3 }, () => mkUser("buyer")));
    for (const b of bs) await applyOrder(b, { listingId: l.id, grams: 2000, method: "delivery", useDate: dayAfter2(), requestId: randomUUID() });
    const c = await mkUser("buyer");
    await applyOrder(c, { listingId: l.id, grams: 5000, method: "pickup", useDate: dayAfter2(), requestId: randomUUID() });
    // 配達の受付件数は2件なので、3件目の配達の申し込みはそもそも断られる
    expect(await db.order.count({ where: { listingId: l.id } })).toBe(3);
    const r = await approveAll(producer, l.id);
    expect(r.map((x) => x.ok)).toEqual([true, true, true]);
    const s = await stock(l.id);
    expect([s.soldGrams, s.heldGrams, s.availableGrams]).toEqual([9000, 0, 21_000]);
  });
  it("宅配発送の送料は重さで決まる。注文合計は 100,000円 まで", async () => {
    const l = await mkListing(producer, { courier: true });
    const r = (await applyOrder(buyerA, { listingId: l.id, grams: 4000, method: "courier", useDate: dayAfter2(), requestId: randomUUID() })) as { id: string };
    expect((await db.order.findUniqueOrThrow({ where: { id: r.id } })).feeYen).toBe(1200);
    const big = await db.listing.create({ data: { ...(await db.listing.findUniqueOrThrow({ where: { id: l.id } })), id: randomUUID(), pricePerKg: 50_000, courierFees: [], createdAt: undefined, updatedAt: undefined } });
    expect((await applyOrder(buyerA, { listingId: big.id, grams: 3000, method: "pickup", useDate: dayAfter2(), requestId: randomUUID() })).ok).toBe(false);
  });
  it("全量のみの出品は、全量でしか申し込めない", async () => {
    const l = await mkListing(producer, { totalGrams: 5000, minGrams: 5000, allowPartial: false });
    const b = await mkUser("buyer");
    expect((await applyOrder(b, { listingId: l.id, grams: 2000, method: "pickup", useDate: dayAfter2(), requestId: randomUUID() })).ok).toBe(false);
    expect((await applyOrder(b, { listingId: l.id, grams: 5000, method: "pickup", useDate: dayAfter2(), requestId: randomUUID() })).ok).toBe(true);
  });
  it("短い時間に続けて送られた購入希望は、11件目から断る（連打の対策とは別の、回数の上限）", async () => {
    const l = await mkListing(producer, { totalGrams: 100_000 });
    const b = await mkUser("buyer");
    const rs = [];
    for (let i = 0; i < 11; i++) rs.push(await applyOrder(b, { listingId: l.id, grams: 1000, method: "pickup", useDate: dayAfter2(), requestId: randomUUID() }));
    expect(rs.filter((r) => r.ok)).toHaveLength(10);
    expect(rs[10].ok).toBe(false);
  });
  it("注文の番号が空のときは、何も返さない", async () => {
    expect(await getOrderForParty(buyerA, "")).toBeNull();
    expect((await cancelOrder(buyerA, "")).ok).toBe(false);
  });
  it("「探しています」を生産者が見るときは、店名・アカウントの番号は渡らない", async () => {
    const v = validateWanted({ mode: "alt", q: "ししとう", kg: "2", budget: "4000", date: new Date(Date.now() + 2 * 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10), pref: "27", city: "大阪市", methods: ["courier"], usage: "焼物" }, new Date());
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const w = await createWanted(buyerA, v.value);
    expect(w.ok).toBe(true);
    const list = await listOpenWanted("26");
    const mine = list.find((x) => w.ok && x.id === w.id)!;
    expect(mine).toBeTruthy();
    expect(JSON.stringify(mine)).not.toContain(buyerA);
    expect(Object.keys(mine)).not.toContain("buyerId");
    await db.wantedPost.deleteMany({ where: { buyerId: buyerA } });
  });
  it("候補は3つに分かれ、同じ農家は2件まで。表示の少ない農家を先にし、表示は記録される", async () => {
    const name = `公平テスト${tag}`;
    const oldFarm = await mkUser("producer", "26");
    await db.user.update({ where: { id: oldFarm }, data: { createdAt: new Date(Date.now() - 400 * 86_400_000) } });
    const farmB = await mkUser("producer", "26");
    await db.user.update({ where: { id: farmB }, data: { createdAt: new Date(Date.now() - 400 * 86_400_000) } });
    const newFarm = await mkUser("producer", "26");
    // 古い農家2軒は販売確定の実績あり（新しい農家の区分に入らない）。buyerA は oldFarm と取引あり（リピート）
    const viewer = await mkUser("buyer");
    const other = await mkUser("buyer");
    for (const [f, b] of [[oldFarm, viewer], [farmB, other]] as const) {
      const x = await mkListing(f);
      const o = (await applyOrder(b, { listingId: x.id, grams: 1000, method: "pickup", useDate: dayAfter2(), requestId: randomUUID() })) as { id: string };
      await approveOrder(f, o.id);
    }
    const mk = (f: string) => db.listing.create({ data: { producerId: f, name, totalGrams: 10_000, minGrams: 1000, unitGrams: 500, pricePerKg: 500, availableFrom: new Date(Date.parse(new Date().toISOString().slice(0, 10)) + 86_400_000), availableUntil: new Date(Date.parse(new Date().toISOString().slice(0, 10)) + 3 * 86_400_000), acceptUntil: new Date(Date.now() + 2 * 86_400_000), replyUntil: new Date(Date.now() + 2.5 * 86_400_000), pickup: true, pickupPref: "26", pickupCity: "南丹市", delivery: false, deliveryPrefs: [], courierPrefs: [], status: "open" } });
    await mk(oldFarm); await mk(newFarm);
    const b1 = await mk(farmB); const b2 = await mk(farmB); const b3 = await mk(farmB);
    const input = { mode: "exact" as const, q: name, usage: "", grams: 2000, budgetYen: 5000, useDate: dayAfter2(), pref: "27", city: "大阪市", methods: ["pickup" as const] };
    const r = await search(input, viewer, new Date());
    expect(r.groups.repeat.shown.map((x) => x.producerId)).toEqual([oldFarm]);
    expect(r.groups.newcomer.shown.map((x) => x.producerId)).toEqual([newFarm]);
    expect(r.groups.match.shown).toHaveLength(2);
    expect(r.groups.match.more).toHaveLength(1);
    expect([b1.id, b2.id, b3.id]).toContain(r.groups.match.more[0].id);
    expect(await db.impression.count({ where: { viewerId: viewer, listing: { name } } })).toBe(4);
    // 表示の記録が少ない農家が先になる：farmB の表示を増やしてから、同じ条件の別の農家と比べる
    const farmC = await mkUser("producer", "26");
    await db.user.update({ where: { id: farmC }, data: { createdAt: new Date(Date.now() - 400 * 86_400_000) } });
    const xc = await mkListing(farmC);
    const oc = (await applyOrder(other, { listingId: xc.id, grams: 1000, method: "pickup", useDate: dayAfter2(), requestId: randomUUID() })) as { id: string };
    await approveOrder(farmC, oc.id);
    await mk(farmC);
    await db.impression.createMany({ data: Array.from({ length: 20 }, () => ({ listingId: b1.id, producerId: farmB, grp: "match", position: 0 })) });
    const r2 = await search(input, viewer, new Date());
    expect(r2.groups.match.shown[0].producerId).toBe(farmC);
  });
});

describe("見積相談・出品の編集・配達日・出品への相談", () => {
  it("見積相談：送料が分からない注文は承認できず、生産者が送料を提示して店が同意したときに販売確定", async () => {
    const l = await mkListing(producer);
    await db.listing.update({ where: { id: l.id }, data: { deliveryQuote: true, deliveryFeeYen: null } });
    const b = await mkUser("buyer");
    const r = (await applyOrder(b, { listingId: l.id, grams: 2000, method: "delivery", useDate: dayAfter2(), requestId: randomUUID() })) as { id: string };
    let o = await db.order.findUniqueOrThrow({ where: { id: r.id } });
    expect([o.feePending, o.feeYen, o.totalYen, o.heldGrams]).toEqual([true, 0, 666, 2000]);
    expect((await approveOrder(producer, r.id)).ok).toBe(false);
    expect((await proposeChange(producer, r.id, 2000, "", new Date(), null)).ok).toBe(false); // 送料なしの提案はできない
    expect((await proposeChange(producer, r.id, 2000, "送料は900円です", new Date(), 900)).ok).toBe(true);
    expect((await acceptChange(b, r.id)).ok).toBe(true);
    o = await db.order.findUniqueOrThrow({ where: { id: r.id } });
    expect([o.status, o.feePending, o.feeYen, o.totalYen]).toEqual(["confirmed", false, 900, 1566]);
  });
  it("出品を編集しても既存の注文の条件は変わらず、総量は販売確定と仮押さえの合計より減らせない", async () => {
    const l = await mkListing(producer, { totalGrams: 10_000 });
    const b = await mkUser("buyer");
    const r = (await applyOrder(b, { listingId: l.id, grams: 4000, method: "pickup", useDate: dayAfter2(), requestId: randomUUID() })) as { id: string };
    const base = { name: l.name, totalKg: "10", pricePerKg: "999", unitGrams: "500", minKg: "1", availableFrom: dayText(l.availableFrom), availableUntil: dayText(l.availableUntil), acceptUntil: toJstInput(l.acceptUntil), replyUntil: toJstInput(l.replyUntil), pickup: "on", pickupPref: "26", pickupCity: "南丹市" };
    const v = validateListing(base, new Date());
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect((await updateListing(producer, l.id, v.value, null)).ok).toBe(true);
    const o = await db.order.findUniqueOrThrow({ where: { id: r.id } });
    expect([o.pricePerKg, o.subtotalYen]).toEqual([333, 1332]); // 申し込んだときの値段のまま
    const small = validateListing({ ...base, totalKg: "3" }, new Date());
    if (!small.ok) return;
    expect((await updateListing(producer, l.id, small.value, null)).ok).toBe(false);
    const other = await mkUser("producer");
    expect((await updateListing(other, l.id, v.value, null)).ok).toBe(false); // 他人の出品は編集できない
  });
  it("自分で配達は、配達できる曜日の日だけ申し込める", async () => {
    const l = await mkListing(producer);
    const day = dayAfter2();
    await db.listing.update({ where: { id: l.id }, data: { deliveryWeekdays: [(day.getUTCDay() + 1) % 7] } });
    const b = await mkUser("buyer");
    expect((await applyOrder(b, { listingId: l.id, grams: 1000, method: "delivery", useDate: day, requestId: randomUUID() })).ok).toBe(false);
    await db.listing.update({ where: { id: l.id }, data: { deliveryWeekdays: [day.getUTCDay()] } });
    expect((await applyOrder(b, { listingId: l.id, grams: 1000, method: "delivery", useDate: day, requestId: randomUUID() })).ok).toBe(true);
  });
  it("出品への相談は、その店と生産者の2人だけ。ほかの店や生産者は読めない・書けない", async () => {
    const l = await mkListing(producer);
    const b = await mkUser("buyer"), c = await mkUser("buyer"), p2 = await mkUser("producer");
    expect((await postListingMessage(b, l.id, b, "何時に届きますか", randomUUID())).ok).toBe(true);
    expect((await postListingMessage(c, l.id, b, "なりすまし", randomUUID())).ok).toBe(false);
    expect((await postListingMessage(p2, l.id, b, "他人の出品", randomUUID())).ok).toBe(false);
    expect((await postListingMessage(producer, l.id, b, "朝9時です", randomUUID())).ok).toBe(true);
    expect((await buyerThread(b, l.id)).map((m) => m.body)).toEqual(["何時に届きますか", "朝9時です"]);
    expect(await buyerThread(c, l.id)).toEqual([]);
    expect(await producerThreads(p2, l.id)).toBeNull();
    expect((await producerThreads(producer, l.id))!.threads).toHaveLength(1);
  });
});

describe("他人の情報は見えない", () => {
  it("当事者でない人は、注文を見る・返事をする・メッセージを送ることができない", async () => {
    const l = await mkListing(producer);
    const me = await mkUser("buyer");
    const r = (await applyOrder(me, { listingId: l.id, grams: 1000, method: "pickup", useDate: dayAfter2(), requestId: randomUUID() })) as { id: string };
    expect(await getOrderForParty(outsider, r.id)).toBeNull();
    expect((await cancelOrder(outsider, r.id)).ok).toBe(false);
    expect((await approveOrder(buyerB, r.id)).ok).toBe(false);
    expect((await sendMessage(outsider, r.id, "こんにちは", randomUUID())).ok).toBe(false);
    expect((await sendMessage(me, r.id, "<b>よろしく</b>", randomUUID())).ok).toBe(true);
  });
});


describe("通報の保護", () => {
  it("存在しない対象と自分の出品は受け付けず、通報だけで出品は止めない", async () => {
    const l = await mkListing(producer);
    expect((await report(buyerA, "listing", randomUUID(), "確認")).ok).toBe(false);
    expect((await report(producer, "listing", l.id, "確認")).ok).toBe(false);
    expect((await report(buyerA, "listing", l.id, "確認")).ok).toBe(true);
    expect((await db.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("open");
  });
  it("同時に11対象を通報しても、連続送信は1件だけ受け付ける", async () => {
    const buyer = await mkUser("buyer");
    const listings = await Promise.all(Array.from({ length: 11 }, () => mkListing(producer)));
    const result = await Promise.all(listings.map(l => report(buyer, "listing", l.id, "確認")));
    expect(result.filter(r => r.ok)).toHaveLength(1);
  });
});


describe("運営の通報対応", () => {
  it("確認だけでは変えず、実行すると出品の公開状態だけ変えて記録する", async () => {
    const buyer = await mkUser("buyer");
    const l = await mkListing(producer);
    await report(buyer, "listing", l.id, "確認用");
    const r = await db.report.findUniqueOrThrow({ where: { reporterId_targetType_targetId: { reporterId: buyer, targetType: "listing", targetId: l.id } } });
    const args = ["scripts/reports.mjs", "--id", r.id, "--action", "pause-listing", "--reason", "確認用", "--operator", "テスト担当"];
    execFileSync(process.execPath, args);
    expect((await db.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("open");
    expect(await db.reportAction.count({ where: { reportId: r.id } })).toBe(0);
    execFileSync(process.execPath, [...args, "--yes"]);
    const after = await db.listing.findUniqueOrThrow({ where: { id: l.id } });
    expect(after.status).toBe("paused");
    expect(after.totalGrams).toBe(l.totalGrams);
    expect(after.pricePerKg).toBe(l.pricePerKg);
    expect(await db.reportAction.count({ where: { reportId: r.id } })).toBe(1);
  });
});
