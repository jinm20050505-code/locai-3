// 出品（サーバー側だけ）
import { getDb } from "@/lib/db";
import type { ListingValue } from "@/lib/listing-rules";
import { stockOf } from "@/lib/order-rules";
import type { Prisma } from "@/generated/prisma/client";

const STOCK_ORDERS = { where: { status: { in: ["pending", "changeRequested", "confirmed"] } }, select: { status: true, replyDeadline: true, quantityGrams: true, heldGrams: true } } satisfies Prisma.Listing$ordersArgs;

export async function createListing(producerId: string, v: ListingValue, photo: { mime: string; data: Buffer } | null) {
  const { courierFees, ...rest } = v;
  return getDb().listing.create({
    data: { ...rest, courierFees: courierFees ?? undefined, producerId, status: "open", ...(photo ? { photo: { create: { mime: photo.mime, data: new Uint8Array(photo.data) } } } : {}) },
    select: { id: true },
  });
}

/** 自分の出品の一覧（量の内訳つき） */
export async function listOwnListings(producerId: string, now: Date) {
  const rows = await getDb().listing.findMany({
    where: { producerId },
    orderBy: { createdAt: "desc" },
    include: { orders: STOCK_ORDERS, photo: { select: { listingId: true } } },
  });
  return rows.map(({ orders, photo, ...l }) => ({ ...l, hasPhoto: !!photo, stock: stockOf(l.totalGrams, orders, now), waiting: orders.filter((o) => o.status === "pending" && o.replyDeadline > now).length }));
}

/** 出品の詳細（だれでも見られる内容だけ。受付中でなければ null） */
export async function getPublicListing(id: string, now: Date) {
  const l = await getDb().listing.findUnique({
    where: { id },
    include: { orders: STOCK_ORDERS, photo: { select: { listingId: true } }, producer: { select: { id: true, name: true, prefecture: true, city: true, intro: true, items: true, isDemo: true, createdAt: true, photo: { select: { userId: true } } } } },
  });
  if (!l) return null;
  const { orders, photo, ...rest } = l;
  return { ...rest, hasPhoto: !!photo, stock: stockOf(l.totalGrams, orders, now), accepting: l.status === "open" && l.acceptUntil > now && l.replyUntil > now };
}

/** 一時停止・再開・受付終了（自分の出品だけ）。受付終了はもとに戻せない */
export async function setListingStatus(producerId: string, id: string, to: "open" | "paused" | "closed") {
  const from = to === "open" ? ["paused"] : to === "paused" ? ["open"] : ["open", "paused"];
  const r = await getDb().listing.updateMany({ where: { id, producerId, status: { in: from } }, data: { status: to } });
  return r.count === 1;
}

export async function getPhoto(listingId: string) {
  return getDb().listingPhoto.findUnique({ where: { listingId }, select: { mime: true, data: true } });
}

/** 同じ食材の前回の値段と量（大きく違うときに「確認してください」と出すため） */
export async function previousValues(producerId: string, name: string) {
  return getDb().listing.findFirst({ where: { producerId, name }, orderBy: { createdAt: "desc" }, select: { pricePerKg: true, totalGrams: true } });
}

/** 今週の表示回数（自分の出品ごと） */
export async function weeklyImpressions(producerId: string, now: Date) {
  const rows = await getDb().impression.groupBy({ by: ["listingId"], where: { producerId, createdAt: { gt: new Date(now.getTime() - 7 * 86_400_000) } }, _count: true });
  return new Map(rows.map((r) => [r.listingId, r._count]));
}

/**
 * 出品の編集（自分の出品・受付終了の前だけ）。仕様「回答待ちの注文がある出品の条件を変更しても、既存の注文の条件は保持する」：
 * 注文は申し込んだときの値段・数量・料金を持っているので、出品を変えても注文は変わらない。
 * 総量は、販売確定と仮押さえの合計より少なくできない（売りすぎない）
 */
export async function updateListing(producerId: string, id: string, v: ListingValue, photo: { mime: string; data: Buffer } | null, now = new Date()) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "listing" WHERE id = ${id} FOR UPDATE`;
    const l = await tx.listing.findFirst({ where: { id, producerId }, include: { orders: STOCK_ORDERS } });
    if (!l) return { ok: false as const, errors: { name: "出品が見つかりません" } };
    if (l.status === "closed") return { ok: false as const, errors: { name: "受付を終了した出品は編集できません。「前回の内容でもう一度出品」を使ってください" } };
    const s = stockOf(l.totalGrams, l.orders, now);
    if (v.totalGrams < s.soldGrams + s.heldGrams) return { ok: false as const, errors: { totalKg: `販売確定と回答待ちの合計（${(s.soldGrams + s.heldGrams) / 1000}kg）より少なくはできません` } };
    const { courierFees, wantedPostId: _w, ...rest } = v;
    void _w;
    await tx.listing.update({ where: { id }, data: { ...rest, courierFees: courierFees ?? undefined } });
    if (photo) await tx.listingPhoto.upsert({ where: { listingId: id }, create: { listingId: id, mime: photo.mime, data: new Uint8Array(photo.data) }, update: { mime: photo.mime, data: new Uint8Array(photo.data) } });
    return { ok: true as const };
  });
}
