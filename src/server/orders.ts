// 購入希望（注文）の処理（サーバー側だけ）。
// 在庫にかかわる処理は、出品の行をロックした1つのトランザクションの中で、確かめてから書き込む（同時の申し込みでも売りすぎない）。
// 金額は画面から受け取らず、ここで計算する。
import { getDb } from "@/lib/db";
import { subtotalYen } from "@/lib/money";
import { ACTIVE, effectiveStatus, quantityProblem, replyDeadlineFor, stockOf, type OrderStatus } from "@/lib/order-rules";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;
export type Result<T = { id: string }> = ({ ok: true } & T) | { ok: false; problems: string[] };
const fail = (...problems: string[]) => ({ ok: false as const, problems });

/** 出品の行をロックし、期限を過ぎた仮押さえを「期限切れ」に確定する */
async function lockListing(tx: Tx, listingId: string, now: Date) {
  await tx.$queryRaw`SELECT id FROM "listing" WHERE id = ${listingId} FOR UPDATE`;
  await tx.order.updateMany({ where: { listingId, status: { in: [...ACTIVE] }, replyDeadline: { lte: now } }, data: { status: "expired", heldGrams: 0 } });
}

async function stockInTx(tx: Tx, listingId: string, totalGrams: number, now: Date) {
  const orders = await tx.order.findMany({ where: { listingId, status: { in: ["pending", "changeRequested", "confirmed"] } }, select: { status: true, replyDeadline: true, quantityGrams: true, heldGrams: true } });
  return stockOf(totalGrams, orders, now);
}

export type ApplyInput = { listingId: string; grams: number; method: string; useDate: Date; requestId: string };

/** 購入希望を送る（仮押さえする。まだ販売確定ではない）。同じ requestId なら1件だけ */
export async function applyOrder(buyerId: string, input: ApplyInput, now = new Date()): Promise<Result> {
  const db = getDb();
  const again = await db.order.findUnique({ where: { buyerId_requestId: { buyerId, requestId: input.requestId } }, select: { id: true } });
  if (again) return { ok: true, id: again.id };
  const buyer = await db.user.findUnique({ where: { id: buyerId }, select: { role: true, prefecture: true } });
  if (buyer?.role !== "buyer") return fail("飲食店のアカウントで申し込んでください");
  try {
    return await db.$transaction(async (tx): Promise<Result> => {
      await lockListing(tx, input.listingId, now);
      // ロックを待つ間に同じ送信が終わっていたら、それを返す（連打・再送でも1件）
      const dup = await tx.order.findUnique({ where: { buyerId_requestId: { buyerId, requestId: input.requestId } }, select: { id: true } });
      if (dup) return { ok: true, id: dup.id };
      const l = await tx.listing.findUnique({ where: { id: input.listingId } });
      if (!l) return fail("出品が見つかりません");
      if (l.status !== "open" || l.acceptUntil <= now) return fail("この出品は、いま購入希望を受け付けていません");
      if (l.producerId === buyerId) return fail("自分の出品には申し込めません");
      const qp = quantityProblem(input.grams, l);
      if (qp) return fail(qp);
      if (input.useDate < l.availableFrom || input.useDate > l.availableUntil) return fail("受け取る日は、受け渡しできる期間の中から選んでください");
      let feeYen = 0;
      if (input.method === "delivery") {
        if (!l.delivery) return fail("この出品はお届けをしていません");
        if (!buyer.prefecture || !l.deliveryPrefs.includes(buyer.prefecture)) return fail("お店の地域はお届けの範囲外です。引き取りを選んでください");
        feeYen = l.deliveryFeeYen ?? 0;
      } else if (input.method === "pickup") {
        if (!l.pickup) return fail("この出品は引き取りをしていません");
      } else return fail("受け取り方法を選んでください");
      const stock = await stockInTx(tx, l.id, l.totalGrams, now);
      if (input.grams > stock.availableGrams) return fail(`残りが足りません。いま申し込めるのは ${stock.availableGrams / 1000}kg までです`);
      const sub = subtotalYen(l.pricePerKg, input.grams);
      const o = await tx.order.create({
        data: {
          listingId: l.id, buyerId, producerId: l.producerId, requestId: input.requestId, status: "pending", method: input.method,
          pricePerKg: l.pricePerKg, quantityGrams: input.grams, subtotalYen: sub, feeYen, totalYen: sub + feeYen, heldGrams: input.grams,
          useDate: input.useDate, replyDeadline: replyDeadlineFor(now, l),
        },
        select: { id: true },
      });
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
  const first = await db.order.findFirst({ where: { id: orderId, ...who }, select: { listingId: true } });
  if (!first) return fail("注文が見つかりません");
  return db.$transaction(async (tx) => {
    await lockListing(tx, first.listingId, now);
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    return fn(tx, o, effectiveStatus(o, now));
  });
}

const ended = (s: OrderStatus) => (s === "expired" ? "返事の期限が過ぎたため、この注文は期限切れになりました" : `この注文はすでに「${s === "confirmed" ? "販売確定" : s === "declined" ? "見送り" : "取消"}」です`);

/** 生産者：承認する（販売確定） */
export function approveOrder(producerId: string, orderId: string, now = new Date()) {
  return withOrder(orderId, { producerId }, now, async (tx, o, s) => {
    if (s !== "pending") return fail(s === "changeRequested" ? "条件の変更を提案中です。飲食店の返事を待ってください" : ended(s));
    await tx.order.update({ where: { id: o.id }, data: { status: "confirmed", heldGrams: 0, decidedAt: now } });
    return { ok: true, id: o.id };
  });
}

/** 生産者：見送る */
export function declineOrder(producerId: string, orderId: string, now = new Date()) {
  return withOrder(orderId, { producerId }, now, async (tx, o, s) => {
    if (!ACTIVE.includes(s)) return fail(ended(s));
    await tx.order.update({ where: { id: o.id }, data: { status: "declined", heldGrams: 0, decidedAt: now } });
    return { ok: true, id: o.id };
  });
}

/** 生産者：条件（数量）を変えて提案する。飲食店が同意すると販売確定 */
export function proposeChange(producerId: string, orderId: string, grams: number, note: string, now = new Date()) {
  return withOrder(orderId, { producerId }, now, async (tx, o, s) => {
    if (s !== "pending") return fail(s === "changeRequested" ? "すでに変更を提案しています" : ended(s));
    if (note.length > 200) return fail("ひとことは200文字以内にしてください");
    const l = await tx.listing.findUniqueOrThrow({ where: { id: o.listingId } });
    const qp = quantityProblem(grams, l);
    if (qp) return fail(qp);
    if (grams === o.quantityGrams) return fail("いまと同じ数量です。そのままでよければ「承認する」を押してください");
    const stock = await stockInTx(tx, l.id, l.totalGrams, now);
    if (grams > stock.availableGrams + o.heldGrams) return fail(`残りが足りません。提案できるのは ${(stock.availableGrams + o.heldGrams) / 1000}kg までです`);
    const sub = subtotalYen(o.pricePerKg, grams);
    await tx.order.update({ where: { id: o.id }, data: { status: "changeRequested", proposedGrams: grams, proposedSubtotalYen: sub, proposedTotalYen: sub + o.feeYen, proposalNote: note || null, heldGrams: grams } });
    return { ok: true, id: o.id };
  });
}

/** 飲食店：変更に同意する（販売確定） */
export function acceptChange(buyerId: string, orderId: string, now = new Date()) {
  return withOrder(orderId, { buyerId }, now, async (tx, o, s) => {
    if (s !== "changeRequested") return fail(s === "pending" ? "農家さんの返事を待っています" : ended(s));
    await tx.order.update({ where: { id: o.id }, data: { status: "confirmed", quantityGrams: o.proposedGrams!, subtotalYen: o.proposedSubtotalYen!, totalYen: o.proposedTotalYen!, heldGrams: 0, decidedAt: now } });
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
  return getDb().order.findFirst({
    where: { id: orderId, OR: [{ buyerId: userId }, { producerId: userId }] },
    include: {
      listing: { select: { id: true, name: true, variety: true, unitGrams: true, minGrams: true, pickupPref: true, pickupCity: true, isDemo: true } },
      buyer: PARTY, producer: PARTY,
      messages: { orderBy: { createdAt: "asc" }, select: { id: true, body: true, createdAt: true, senderId: true } },
    },
  });
}

export async function listBuyerOrders(buyerId: string) {
  return getDb().order.findMany({ where: { buyerId }, orderBy: { createdAt: "desc" }, take: 100, include: { listing: { select: { name: true, variety: true } }, producer: { select: { name: true } } } });
}

export async function listProducerOrders(producerId: string) {
  return getDb().order.findMany({ where: { producerId }, orderBy: { createdAt: "desc" }, take: 200, include: { listing: { select: { id: true, name: true, variety: true } }, buyer: { select: { name: true, prefecture: true, city: true } } } });
}

/** メッセージを送る（当事者だけ・終わった注文には送れない） */
export async function sendMessage(userId: string, orderId: string, body: string, requestId: string, now = new Date()): Promise<Result> {
  const t = body.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (!t) return fail("メッセージを入れてください");
  if (t.length > 500) return fail(`500文字以内にしてください（今 ${t.length}文字）`);
  const db = getDb();
  const o = await db.order.findFirst({ where: { id: orderId, OR: [{ buyerId: userId }, { producerId: userId }] }, select: { status: true, replyDeadline: true } });
  if (!o) return fail("注文が見つかりません");
  const s = effectiveStatus(o, now);
  if (!["pending", "changeRequested", "confirmed"].includes(s)) return fail("この注文は終わったため、メッセージは送れません");
  try {
    const m = await db.message.create({ data: { orderId, senderId: userId, body: t, requestId }, select: { id: true } });
    return { ok: true, id: m.id };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { ok: true, id: requestId };
    throw e;
  }
}
