// 出品（サーバー側だけ）
import { getDb } from "@/lib/db";
import type { ListingValue } from "@/lib/listing-rules";
import { stockOf } from "@/lib/order-rules";
import type { Prisma } from "@/generated/prisma/client";

const STOCK_ORDERS = { where: { status: { in: ["pending", "changeRequested", "confirmed"] } }, select: { status: true, replyDeadline: true, quantityGrams: true, heldGrams: true } } satisfies Prisma.Listing$ordersArgs;

export async function createListing(producerId: string, v: ListingValue, photo: { mime: string; data: Buffer } | null) {
  return getDb().listing.create({
    data: { ...v, producerId, status: "open", ...(photo ? { photo: { create: { mime: photo.mime, data: new Uint8Array(photo.data) } } } : {}) },
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
    include: { orders: STOCK_ORDERS, photo: { select: { listingId: true } }, producer: { select: { id: true, name: true, prefecture: true, city: true, intro: true, isDemo: true, createdAt: true } } },
  });
  if (!l) return null;
  const { orders, photo, ...rest } = l;
  return { ...rest, hasPhoto: !!photo, stock: stockOf(l.totalGrams, orders, now), accepting: l.status === "open" && l.acceptUntil > now };
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
