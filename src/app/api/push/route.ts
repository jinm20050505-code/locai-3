import { getCurrentUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { validPushEndpoint } from "@/lib/push-validation";
import { z } from "zod";
const schema = z.object({ endpoint: z.string().max(2048).refine(validPushEndpoint), keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}=?$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/) }) });
const headers = { "Cache-Control": "private, no-store" };
export async function GET() { return Response.json({ publicKey: process.env.WEB_PUSH_PUBLIC_KEY ?? null }, { headers }); }
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const { endpoint, keys } = parsed.data;
  const db = getDb();
  const result = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${user.id} FOR UPDATE`;
    const existing = await tx.pushSubscription.findUnique({ where: { endpoint } });
    if (existing && existing.userId !== user.id) return 409;
    if (!existing && await tx.pushSubscription.count({ where: { userId: user.id } }) >= 10) return 429;
    await tx.pushSubscription.upsert({ where: { endpoint }, create: { userId: user.id, endpoint, ...keys }, update: { ...keys } });
    return 200;
  });
  return new Response(null, { status: result, headers });
}
export async function DELETE(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.endpoint !== "string") return new Response(null, { status: 400 });
  await getDb().pushSubscription.deleteMany({ where: { userId: user.id, endpoint: body.endpoint } });
  return new Response(null, { status: 204, headers });
}
