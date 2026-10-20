import { getCurrentUser } from "@/lib/session";
import { markNotificationRead, readNotifications, syncNotifications } from "@/server/notifications";
import { after } from "next/server";
import { flushPush } from "@/server/push";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return new Response(null, { status: 400 });
  if (body.read && typeof body.read === "string") await markNotificationRead(user.id, body.read);
  await syncNotifications(user.id);
  after(flushPush);
  return Response.json(await readNotifications(user.id, typeof body.cursor === "string" ? body.cursor : undefined), { headers: { "Cache-Control": "private, no-store" } });
}
