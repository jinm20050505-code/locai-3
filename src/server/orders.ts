// 購入希望（注文）の処理（サーバー側だけ）。
// 在庫にかかわる処理は、出品の行をロックした1つのトランザクションの中で、確かめてから書き込む（同時の申し込みでも売りすぎない）。
// 金額は画面から受け取らず、ここで計算する。
import { expireListingOrders, orderNotification, messageNotification } from "@/server/notifications";
import { getDb } from "@/lib/db";
import { subtotalYen } from "@/lib/money";
import { deliveryDayOk, methodFee, METHODS, SLOT_LABEL, WEEKDAY_LABEL, type Method } from "@/lib/delivery";
import { ACTIVE, effectiveStatus, quantityProblem, stockOf, type OrderStatus } from "@/lib/order-rules";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;
export type Result<T = { id: string }> = ({ ok: true } & T) | { ok: false; problems: string[] };
const fail = (...problems: string[]) => ({ ok: false as const, problems });

/** 出品の行をロックし、期限を過ぎた仮押さえを「期限切れ」に確定する */
async function lockListing(tx: Tx, listingId: string, now: Date) {
  await tx.$queryRaw`SELECT id FROM "listing" WHERE id = ${listingId} FOR UPDATE`;
  await expireListingOrders(tx, listingId, now);
}

async function stockInTx(tx: Tx, listingId: string, totalGrams: number, now: Date) {
  const orders = await tx.order.findMany({ where: { listingId, status: { in: ["pending", "changeRequested", "confirmed"] } }, select: { status: true, replyDeadline: true, quantityGrams: true, heldGrams: true } });
  return stockOf(totalGrams, orders, now);
}

export const ORDER_TOTAL_MAX = 100_000; // 注文合計の上限（仕様 5章：予算・注文合計 1〜100,000円）
const RATE = { perMinute: 10 }; // 連続操作の回数の上限（アプリで決めた仮の値）

/** 自分で配達の受付件数の上限に達していないか（販売確定と、期限内の回答待ち・確認待ちを数える） */
async function deliveryFull(tx: Tx, l: { id: string; deliveryMaxOrders: number | null }, now: Date, excludeOrderId?: string) {
  if (!l.deliveryMaxOrders) return false;
  const n = await tx.order.count({ where: { listingId: l.id, method: "delivery", id: excludeOrderId ? { not: excludeOrderId } : undefined, OR: [{ status: "confirmed" }, { status: { in: [...ACTIVE] }, replyDeadline: { gt: now } }] } });
  return n >= l.deliveryMaxOrders;
}

export type ApplyInput = { listingId: string; grams: number; method: string; useDate: Date; requestId: string; receiveSlot?: string | null };

/** 購入希望を送る（仮押さえする。まだ販売確定ではない）。同じ requestId なら1件だけ */
export async function applyOrder(buyerId: string, input: ApplyInput, now = new Date()): Promise<Result> {
  const db = getDb();
  const again = await db.order.findUnique({ where: { buyerId_requestId: { buyerId, requestId: input.requestId } }, select: { id: true } });
  if (again) return { ok: true, id: again.id };
  const buyer = await db.user.findUnique({ where: { id: buyerId }, select: { role: true, prefecture: true } });
  if (buyer?.role !== "buyer") return fail("飲食店のアカウントで申し込んでください");
  if ((await db.order.count({ where: { buyerId, createdAt: { gt: new Date(now.getTime() - 60_000) } } })) >= RATE.perMinute) return fail("短い時間に続けて送られています。1分ほど待ってから、もう一度お試しください");
  try {
    return await db.$transaction(async (tx): Promise<Result> => {
      await lockListing(tx, input.listingId, now);
      // ロックを待つ間に同じ送信が終わっていたら、それを返す（連打・再送でも1件）
      const dup = await tx.order.findUnique({ where: { buyerId_requestId: { buyerId, requestId: input.requestId } }, select: { id: true } });
      if (dup) return { ok: true, id: dup.id };
      const l = await tx.listing.findUnique({ where: { id: input.listingId } });
      if (!l) return fail("出品が見つかりません");
      if (l.status !== "open" || l.acceptUntil <= now || l.replyUntil <= now) return fail("この出品は、いま購入希望を受け付けていません（受付期限を過ぎました）");
      if (l.producerId === buyerId) return fail("自分の出品には申し込めません");
      const qp = quantityProblem(input.grams, l);
      if (qp) return fail(qp);
      if (input.useDate < l.availableFrom || input.useDate > l.availableUntil) return fail("受け取る日は、受け渡しできる期間の中から選んでください");
      if (!METHODS.includes(input.method as Method)) return fail("受け取り方法を選んでください");
      const fee = methodFee(l, input.method as Method, buyer.prefecture, input.grams);
      if (!fee.ok) return fail(fee.reason);
      if (input.method === "delivery" && (await deliveryFull(tx, l, now))) return fail("配達の受付件数がいっぱいです。ほかの受け取り方法を選んでください");
      if (input.method === "delivery" && !deliveryDayOk(l.deliveryWeekdays, input.useDate)) return fail(`配達できるのは ${l.deliveryWeekdays.map((d) => WEEKDAY_LABEL[d]).join("・")}曜日 です。受け取る日を選び直してください`);
      const slot = input.receiveSlot && SLOT_LABEL[input.receiveSlot] ? input.receiveSlot : null;
      const feeYen = fee.feeYen;
      const stock = await stockInTx(tx, l.id, l.totalGrams, now);
      if (input.grams > stock.availableGrams) return fail(`残りが足りません。いま申し込めるのは ${stock.availableGrams / 1000}kg までです`);
      const sub = subtotalYen(l.pricePerKg, input.grams);
      if (sub + feeYen > ORDER_TOTAL_MAX) return fail("1回の注文合計は 100,000円 までです。数量を減らしてください");
      const o = await tx.order.create({
        data: {
          listingId: l.id, buyerId, producerId: l.producerId, requestId: input.requestId, status: "pending", method: input.method,
          pricePerKg: l.pricePerKg, quantityGrams: input.grams, subtotalYen: sub, feeYen, totalYen: sub + feeYen, heldGrams: input.grams,
          useDate: input.useDate, replyDeadline: l.replyUntil, feePending: fee.quote, receiveSlot: slot,
        },
        });
      await orderNotification(tx, o, "pending", now);
      return { ok: true, id: o.id };
    });
  } catch (e) {
    // ほぼ同時の同じ送信（requestId の重複）は、先に入った1件を返す
    if ((e as { code?: string }).code === "P2002") {
      const o = await db.order.findUnique({ where: { buyerId_requestId: { buyerId, requestId: input.requestId } }, select: { id: true } });
      if (o) return { ok: true, id: o.id };
    }
    throw e;
  }
}

/** 注文を読み、出品をロックしてから処理する共通部分（当事者でなければ見つからない扱い） */
async function withOrder(orderId: string, who: { buyerId?: string; producerId?: string }, now: Date, fn: (tx: Tx, o: Prisma.OrderGetPayload<object>, status: OrderStatus) => Promise<Result>): Promise<Result> {
  const db = getDb();
  if (typeof orderId !== "string" || !orderId) return fail("注文が見つかりません");
  const first = await db.order.findFirst({ where: { id: orderId, ...who }, select: { listingId: true } });
  if (!first) return fail("注文が見つかりません");
  return db.$transaction(async (tx) => {
    await lockListing(tx, first.listingId, now);
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const result = await fn(tx, o, effectiveStatus(o, now));
    if (result.ok) {
      const updated = await tx.order.findUniqueOrThrow({ where: { id: o.id } });
      if (updated.status !== o.status) await orderNotification(tx, updated, updated.status, now);
    }
    return result;
  });
}

const ended = (s: OrderStatus) => (s === "expired" ? "返事の期限が過ぎたため、この注文は期限切れになりました" : `この注文はすでに「${s === "confirmed" ? "販売確定" : s === "declined" ? "見送り" : "取消"}」です`);

/** 生産者：承認する（販売確定） */
export function approveOrder(producerId: string, orderId: string, now = new Date()) {
  return withOrder(orderId, { producerId }, now, async (tx, o, s) => {
    if (s !== "pending") return fail(s === "changeRequested" ? "条件の変更を提案中です。飲食店の返事を待ってください" : ended(s));
    if (o.feePending) return fail("送料・配達料が見積もり中です。「条件を変えて提案する」で送料を決めてください（お店が総額に同意すると販売確定）");
    // 承認の前に、在庫と配送の対応をもう一度確かめる
    const l = await tx.listing.findUniqueOrThrow({ where: { id: o.listingId } });
    const stock = await stockInTx(tx, l.id, l.totalGrams, now);
    if (stock.soldGrams + stock.heldGrams > l.totalGrams) return fail("在庫の数が合いません。いったん見送りにしてください");
    if (o.method === "delivery" && l.deliveryMaxOrders) {
      const confirmed = await tx.order.count({ where: { listingId: l.id, method: "delivery", status: "confirmed" } });
      if (confirmed >= l.deliveryMaxOrders) return fail(`配達の受付件数（${l.deliveryMaxOrders}件）に達しています。承認できません`);
    }
    await tx.order.update({ where: { id: o.id }, data: { status: "confirmed", heldGrams: 0, decidedAt: now } });
    return { ok: true, id: o.id };
  });
}

/** 生産者：全件承認（回答待ちの購入希望を、届いた順に1件ずつ承認する。承認できなかったものは理由を返す） */
export async function approveAll(producerId: string, listingId: string, now = new Date()) {
  const pending = await getDb().order.findMany({ where: { listingId, producerId, status: "pending", replyDeadline: { gt: now } }, orderBy: { createdAt: "asc" }, select: { id: true, buyer: { select: { name: true } } } });
  const results: { id: string; buyer: string; ok: boolean; problem?: string }[] = [];
  for (const p of pending) {
    const r = await approveOrder(producerId, p.id, now);
    results.push({ id: p.id, buyer: p.buyer.name, ok: r.ok, problem: r.ok ? undefined : r.problems[0] });
  }
  return results;
}

/** 生産者：見送る */
export function declineOrder(producerId: string, orderId: string, now = new Date()) {
  return withOrder(orderId, { producerId }, now, async (tx, o, s) => {
    if (!ACTIVE.includes(s)) return fail(ended(s));
    await tx.order.update({ where: { id: o.id }, data: { status: "declined", heldGrams: 0, decidedAt: now } });
    return { ok: true, id: o.id };
  });
}

/** 生産者：条件（数量・送料）を変えて提案する。飲食店が同意すると販売確定。送料が見積もり中なら、送料の提示が必要 */
export function proposeChange(producerId: string, orderId: string, grams: number, note: string, now = new Date(), feeYen: number | null = null) {
  return withOrder(orderId, { producerId }, now, async (tx, o, s) => {
    if (s !== "pending") return fail(s === "changeRequested" ? "すでに変更を提案しています" : ended(s));
    if (note.length > 200) return fail("ひとことは200文字以内にしてください");
    const l = await tx.listing.findUniqueOrThrow({ where: { id: o.listingId } });
    const qp = quantityProblem(grams, l);
    if (qp) return fail(qp);
    if (o.feePending && feeYen === null) return fail("送料・配達料が見積もり中です。送料を円で入れて提案してください");
    if (feeYen !== null && (!Number.isInteger(feeYen) || feeYen < 0 || feeYen > 50_000)) return fail("送料は 0円 から 50,000円 までの数字で入れてください");
    if (grams === o.quantityGrams && feeYen === null) return fail("いまと同じ数量です。そのままでよければ「承認する」を押してください");
    const stock = await stockInTx(tx, l.id, l.totalGrams, now);
    if (grams > stock.availableGrams + o.heldGrams) return fail(`残りが足りません。提案できるのは ${(stock.availableGrams + o.heldGrams) / 1000}kg までです`);
    const sub = subtotalYen(o.pricePerKg, grams);
    const fee = feeYen ?? o.feeYen;
    if (sub + fee > ORDER_TOTAL_MAX) return fail("注文合計が 100,000円 を超えます。数量か送料を見直してください");
    await tx.order.update({ where: { id: o.id }, data: { status: "changeRequested", proposedGrams: grams, proposedSubtotalYen: sub, proposedFeeYen: fee, proposedTotalYen: sub + fee, proposalNote: note || null, heldGrams: grams } });
    return { ok: true, id: o.id };
  });
}

/** 飲食店：変更に同意する（販売確定） */
export function acceptChange(buyerId: string, orderId: string, now = new Date()) {
  return withOrder(orderId, { buyerId }, now, async (tx, o, s) => {
    if (s !== "changeRequested") return fail(s === "pending" ? "農家さんの返事を待っています" : ended(s));
    await tx.order.update({ where: { id: o.id }, data: { status: "confirmed", quantityGrams: o.proposedGrams!, subtotalYen: o.proposedSubtotalYen!, feeYen: o.proposedFeeYen ?? o.feeYen, totalYen: o.proposedTotalYen!, feePending: false, heldGrams: 0, decidedAt: now } });
    return { ok: true, id: o.id };
  });
}

/** 飲食店：取り消す（販売確定の前だけ） */
export function cancelOrder(buyerId: string, orderId: string, now = new Date()) {
  return withOrder(orderId, { buyerId }, now, async (tx, o, s) => {
    if (!ACTIVE.includes(s)) return fail(s === "confirmed" ? "販売確定のあとは、ここでは取り消せません。メッセージで農家さんに相談してください" : ended(s));
    await tx.order.update({ where: { id: o.id }, data: { status: "cancelled", heldGrams: 0, decidedAt: now } });
    return { ok: true, id: o.id };
  });
}

// ---------------------------------------------------------------------------
// 読み取り（当事者だけ）

const PARTY = { select: { name: true, prefecture: true, city: true, isDemo: true } } as const;

export async function getOrderForParty(userId: string, orderId: string) {
  if (typeof orderId !== "string" || !orderId || typeof userId !== "string" || !userId) return null;
  return getDb().order.findFirst({
    where: { id: orderId, OR: [{ buyerId: userId }, { producerId: userId }] },
    include: {
      listing: { select: { id: true, name: true, variety: true, unitGrams: true, minGrams: true, pickupPref: true, pickupCity: true, isDemo: true, courierTemp: true, courierDays: true, deliveryWeekdays: true } },
      buyer: PARTY, producer: PARTY,
      messages: { orderBy: { createdAt: "asc" }, select: { id: true, body: true, createdAt: true, senderId: true } },
    },
  });
}

export async function listBuyerOrders(buyerId: string) {
  return getDb().order.findMany({ where: { buyerId }, orderBy: { createdAt: "desc" }, take: 100, include: { listing: { select: { name: true, variety: true } }, producer: { select: { name: true } } } });
}

export async function listProducerOrders(producerId: string) {
  return getDb().order.findMany({ where: { producerId }, orderBy: { createdAt: "desc" }, take: 300, include: { listing: { select: { id: true, name: true, variety: true, totalGrams: true, status: true, acceptUntil: true, replyUntil: true, deliveryMaxOrders: true, producerId: true } }, buyer: { select: { name: true, prefecture: true, city: true } } } });
}

/** メッセージを送る（当事者だけ・終わった注文には送れない） */
export async function sendMessage(userId: string, orderId: string, body: string, requestId: string, now = new Date()): Promise<Result> {
  const t = body.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (!t) return fail("メッセージを入れてください");
  if (t.length > 500) return fail(`500文字以内にしてください（今 ${t.length}文字）`);
  const db = getDb();
  const o = await db.order.findFirst({ where: { id: orderId, OR: [{ buyerId: userId }, { producerId: userId }] }, select: { status: true, replyDeadline: true, buyerId: true, producerId: true, listing: { select: { name: true } } } });
  if (!o) return fail("注文が見つかりません");
  const s = effectiveStatus(o, now);
  if (!["pending", "changeRequested", "confirmed"].includes(s)) return fail("この注文は終わったため、メッセージは送れません");
  if ((await db.message.count({ where: { senderId: userId, createdAt: { gt: new Date(now.getTime() - 60_000) } } })) >= RATE.perMinute) return fail("短い時間に続けて送られています。1分ほど待ってから、もう一度お試しください");
  try {
    const m = await db.$transaction(async tx => {
      const message = await tx.message.create({ data: { orderId, senderId: userId, body: t, requestId }, select: { id: true } });
      await messageNotification(tx, { id: message.id, userId: o.buyerId === userId ? o.producerId : o.buyerId, senderId: userId, href: `/orders/${orderId}#messages`, listingName: o.listing.name }, now);
      return message;
    });
    return { ok: true, id: m.id };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { ok: true, id: requestId };
    throw e;
  }
}
