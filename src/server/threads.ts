// 出品に紐づく相談（注文の前の質問と返信）。サーバー側だけ。
// その店と、出品した生産者の2人だけが読める。ほかの店の相談は見えない
import { getDb } from "@/lib/db";

type R = { ok: true } | { ok: false; problem: string };
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();

/** 店が見る、自分とその生産者の相談 */
export function buyerThread(buyerId: string, listingId: string) {
  return getDb().listingMessage.findMany({ where: { listingId, buyerId }, orderBy: { createdAt: "asc" }, select: { id: true, body: true, createdAt: true, senderId: true } });
}

/** 生産者が見る、自分の出品への相談（店ごと） */
export async function producerThreads(producerId: string, listingId: string) {
  const l = await getDb().listing.findFirst({ where: { id: listingId, producerId }, select: { id: true, name: true, variety: true } });
  if (!l) return null;
  const rows = await getDb().listingMessage.findMany({ where: { listingId }, orderBy: { createdAt: "asc" }, select: { id: true, body: true, createdAt: true, senderId: true, buyerId: true } });
  const buyers = await getDb().user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.buyerId))] } }, select: { id: true, name: true } });
  return { listing: l, threads: buyers.map((b) => ({ buyer: b, messages: rows.filter((r) => r.buyerId === b.id) })) };
}

/** 相談を送る。店は自分の相談に、生産者は自分の出品への相談に返信する */
export async function postListingMessage(userId: string, listingId: string, buyerId: string, body: string, requestId: string, now = new Date()): Promise<R> {
  const t = clean(body);
  if (!t) return { ok: false, problem: "相談の内容を入れてください" };
  if (t.length > 500) return { ok: false, problem: `500文字以内にしてください（今 ${t.length}文字）` };
  const db = getDb();
  const [u, l] = await Promise.all([db.user.findUnique({ where: { id: userId }, select: { role: true } }), db.listing.findUnique({ where: { id: listingId }, select: { producerId: true } })]);
  if (!u || !l) return { ok: false, problem: "出品が見つかりません" };
  if (u.role === "buyer" && buyerId !== userId) return { ok: false, problem: "自分の相談にだけ書けます" };
  if (u.role === "producer") {
    if (l.producerId !== userId) return { ok: false, problem: "自分の出品への相談にだけ返信できます" };
    if (!(await db.listingMessage.count({ where: { listingId, buyerId } }))) return { ok: false, problem: "相談が見つかりません" };
  }
  if ((await db.listingMessage.count({ where: { senderId: userId, createdAt: { gt: new Date(now.getTime() - 60_000) } } })) >= 10) return { ok: false, problem: "短い時間に続けて送られています。1分ほど待ってから、もう一度お試しください" };
  try {
    await db.listingMessage.create({ data: { listingId, buyerId, senderId: userId, body: t, requestId } });
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e; // 同じ送信の2回目は1件にまとめる
  }
  return { ok: true };
}

/** 出品ごとの相談の件数（生産者の出品一覧で使う） */
export async function threadCounts(producerId: string) {
  const rows = await getDb().listingMessage.groupBy({ by: ["listingId", "buyerId"], where: { listing: { producerId } } });
  const m = new Map<string, number>();
  rows.forEach((r) => m.set(r.listingId, (m.get(r.listingId) ?? 0) + 1));
  return m;
}
