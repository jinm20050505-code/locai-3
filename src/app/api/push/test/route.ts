import { getCurrentUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { after } from "next/server";
import { flushPush } from "@/server/push";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const status = await getDb().$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${user.id} FOR UPDATE`;
    if (!await tx.pushSubscription.count({ where: { userId: user.id } })) return 400;
    if (await tx.notification.count({ where: { userId: user.id, kind: "test", createdAt: { gt: new Date(Date.now() - 60_000) } } }) >= 3) return 429;
    await tx.notification.create({ data: { userId: user.id, eventKey: `test:${crypto.randomUUID()}`, kind: "test", title: "テスト通知", body: "スマホへの通知を確認するためのお知らせです。", sender: "LocAI", href: "/notifications" } });
    return 200;
  });
  if (status === 200) after(flushPush);
  return new Response(null, { status, headers: { "Cache-Control": "private, no-store" } });
}
