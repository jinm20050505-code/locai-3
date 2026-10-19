// 出品の写真を返す（出品の写真は、だれでも見られる公開の情報）
import { getPhoto } from "@/server/listings";

export async function GET(_req: Request, ctx: RouteContext<"/api/photos/[id]">) {
  const { id } = await ctx.params;
  const p = /^[0-9a-f-]{36}$/.test(id) ? await getPhoto(id) : null;
  if (!p) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(p.data), {
    headers: {
      "content-type": p.mime,
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
      // SVG（デモの写真）の中で、スクリプトなどを動かさない
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
