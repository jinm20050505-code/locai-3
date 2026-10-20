import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db";
import { expireListingOrders } from "@/server/notifications";
import { flushPush } from "@/server/push";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return new Response(null, { status: 401 });
  const db = getDb(); const now = new Date();
  const listings = await db.order.findMany({ where: { status: { in: ["pending", "changeRequested"] }, replyDeadline: { lte: now } }, distinct: ["listingId"], select: { listingId: true }, take: 100 });
  for (const { listingId } of listings) await db.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "listing" WHERE id = ${listingId} FOR UPDATE`; await expireListingOrders(tx, listingId, now); });
  await flushPush();
  return Response.json({ ok: true, checked: listings.length }, { headers: { "Cache-Control": "no-store" } });
}
