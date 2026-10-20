"use server";

// 出品に紐づく相談の送信（サーバー側で実行）
import { refresh } from "next/cache";
import { after, connection } from "next/server";
import { flushPush } from "@/server/push";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { postListingMessage } from "@/server/threads";

export type ThreadState = { problem?: string; sent?: number };
const id = z.string().uuid();

export async function threadAction(prev: ThreadState, fd: FormData): Promise<ThreadState> {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const p = z.object({ listingId: id, buyerId: z.string().min(1).max(64), requestId: id }).safeParse({ listingId: fd.get("listingId"), buyerId: fd.get("buyerId"), requestId: fd.get("requestId") });
  if (!p.success) return { problem: "画面を開き直して、もう一度お試しください" };
  after(flushPush);
  const r = await postListingMessage(user.id, p.data.listingId, p.data.buyerId, String(fd.get("body") ?? "").slice(0, 600), p.data.requestId);
  if (!r.ok) return { problem: r.problem };
  refresh();
  return { sent: (prev.sent ?? 0) + 1 };
}
