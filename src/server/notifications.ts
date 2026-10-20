import { getDb } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;
type OrderEvent = { id: string; buyerId: string; producerId: string; listingId: string; quantityGrams: number; replyDeadline: Date };
const labels: Record<string, string> = {
  pending: "購入希望・仮押さえ", confirmed: "販売が確定しました", changeRequested: "条件変更の提案が届きました",
  declined: "購入希望が見送りになりました", cancelled: "購入希望が取り消されました", expired: "仮押さえの期限が切れました",
};
export async function orderNotification(tx: Tx, o: OrderEvent, status: string, now: Date) {
  const l = await tx.listing.findUniqueOrThrow({ where: { id: o.listingId }, select: { name: true } });
  const parties = await tx.user.findMany({ where: { id: { in: [o.buyerId, o.producerId] } }, select: { id: true, name: true } });
  for (const userId of [o.buyerId, o.producerId]) {
    const title = status === "pending" ? (userId === o.buyerId ? "野菜を仮押さえしました" : "購入希望が届きました") : status === "changeRequested" && userId === o.producerId ? "条件変更を提案しました"
      : status === "declined" && userId === o.producerId ? "購入希望を見送りました"
      : status === "cancelled" && userId === o.buyerId ? "購入希望を取り消しました" : labels[status];
    if (!title) continue;
    const body = status === "pending" ? `${l.name} ${o.quantityGrams / 1000}kg。まだ販売確定ではありません。${userId === o.buyerId ? "返事をお待ちください。" : "期限までに回答してください。"}`
      : status === "expired" ? `${l.name}の仮押さえを解除しました。販売は確定していません。`
      : status === "changeRequested" ? `${l.name}の数量・送料をご確認ください。同意するまで販売は確定しません。`
      : `${l.name}の注文をご確認ください。`;
    await tx.notification.createMany({ data: [{ userId, eventKey: `order:${o.id}:${status}`, kind: status, title, body,
      href: `/orders/${o.id}`, sender: status === "expired" ? "LocAI" : parties.find(p => p.id !== userId)?.name ?? "LocAI",
      createdAt: status === "expired" ? o.replyDeadline : now }], skipDuplicates: true });
  }
}
export async function messageNotification(tx: Tx, input: { id: string; userId: string; senderId: string; href: string; listingName: string }, now: Date) {
  const sender = await tx.user.findUniqueOrThrow({ where: { id: input.senderId }, select: { name: true } });
  await tx.notification.create({ data: { userId: input.userId, eventKey: `message:${input.id}`, kind: "message", title: "メッセージが届きました",
    body: `${input.listingName}について新しいメッセージがあります。`, href: input.href, sender: sender.name, createdAt: now } });
}
/** 行ロックの中で呼ぶ。通知と仮押さえの解除は一緒に保存する。 */
export async function expireListingOrders(tx: Tx, listingId: string, now: Date) {
  const orders = await tx.order.findMany({ where: { listingId, status: { in: ["pending", "changeRequested"] }, replyDeadline: { lte: now } } });
  for (const o of orders) await orderNotification(tx, o, "expired", now);
  await tx.order.updateMany({ where: { id: { in: orders.map(o => o.id) } }, data: { status: "expired", heldGrams: 0 } });
}
/** アプリを開いている間は30秒ごとに期限を確認。閉じていた場合は次に開いたときに反映。 */
export async function syncNotifications(userId: string, now = new Date()) {
  const db = getDb();
  const due = await db.order.findMany({ where: { OR: [{ buyerId: userId }, { producerId: userId }], status: { in: ["pending", "changeRequested"] }, replyDeadline: { lte: now } }, select: { listingId: true }, distinct: ["listingId"], take: 100 });
  for (const { listingId } of due.sort((a,b) => a.listingId.localeCompare(b.listingId))) {
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "listing" WHERE id = ${listingId} FOR UPDATE`;
      await expireListingOrders(tx, listingId, now);
    });
  }
}
export async function readNotifications(userId: string, cursor?: string) {
  const db = getDb();
  // 他人のIDをカーソルにしても一覧の位置を探らせない。
  const anchor = cursor ? await db.notification.findFirst({ where: { id: cursor, userId }, select: { createdAt: true, id: true } }) : null;
  const items = await db.notification.findMany({ where: { userId, ...(anchor ? { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 31,
    select: { id: true, title: true, body: true, sender: true, href: true, createdAt: true, readAt: true } });
  return { items: items.slice(0,30), next: items.length > 30 ? items[29].id : null, unread: await db.notification.count({ where: { userId, readAt: null } }) };
}
export async function markNotificationRead(userId: string, id: string) {
  return getDb().notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
}
