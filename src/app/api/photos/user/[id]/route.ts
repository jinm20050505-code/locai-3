// 農家さんのプロフィールの写真（出品と一緒に公開する情報）
import { getDb } from "@/lib/db";

export async function GET(_req: Request, ctx: RouteContext<"/api/photos/user/[id]">) {
  const { id } = await ctx.params;
  const p = /^[0-9A-Za-z-]{10,64}$/.test(id) ? await getDb().userPhoto.findFirst({ where: { userId: id, user: { role: "producer" } }, select: { mime: true, data: true } }) : null;
  if (!p) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(p.data), { headers: { "content-type": p.mime, "cache-control": "public, max-age=600", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } });
}
