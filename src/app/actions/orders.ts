"use server";

// 購入希望の送信と、注文への返事・取消・メッセージ（サーバー側で実行）。金額は受け取らず、サーバーで計算する
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseDay } from "@/lib/dates";
import { kgTextToGrams } from "@/lib/money";
import { requireRole, getCurrentUser } from "@/lib/session";
import { acceptChange, applyOrder, approveOrder, cancelOrder, declineOrder, proposeChange, sendMessage } from "@/server/orders";

export type ActionState = { problems?: string[] };
const uuid = z.string().uuid();
const bad = { problems: ["画面を開き直して、もう一度お試しください"] };
const get = (fd: FormData, k: string) => String(fd.get(k) ?? "").slice(0, 600);

export async function applyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await connection();
  const listingId = get(fd, "listingId");
  const user = await requireRole("buyer", `/listings/${listingId}`);
  const requestId = get(fd, "requestId");
  const grams = Number(get(fd, "grams"));
  const useDate = parseDay(get(fd, "useDate"));
  if (!uuid.safeParse(listingId).success || !uuid.safeParse(requestId).success || !Number.isInteger(grams)) return bad;
  if (!useDate) return { problems: ["受け取る日を選んでください"] };
  const r = await applyOrder(user.id, { listingId, grams, method: get(fd, "method"), useDate, requestId });
  if (!r.ok) return { problems: r.problems };
  redirect(`/orders/${r.id}?done=sent`);
}

async function decide(fd: FormData, fn: (userId: string, orderId: string) => Promise<{ ok: boolean; problems?: string[] }>, role: "buyer" | "producer", done: string): Promise<ActionState> {
  await connection();
  const user = await requireRole(role);
  const id = get(fd, "orderId");
  if (!uuid.safeParse(id).success) return bad;
  const r = await fn(user.id, id);
  if (!r.ok) return { problems: r.problems };
  redirect(`/orders/${id}?done=${done}`);
}

export const approveAction = async (_: ActionState, fd: FormData) => decide(fd, approveOrder, "producer", "approved");
export const declineAction = async (_: ActionState, fd: FormData) => decide(fd, declineOrder, "producer", "declined");
export const acceptChangeAction = async (_: ActionState, fd: FormData) => decide(fd, acceptChange, "buyer", "accepted");
export const cancelAction = async (_: ActionState, fd: FormData) => decide(fd, cancelOrder, "buyer", "cancelled");

export async function proposeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await connection();
  const user = await requireRole("producer");
  const id = get(fd, "orderId");
  const grams = kgTextToGrams(get(fd, "kg"));
  if (!uuid.safeParse(id).success) return bad;
  if (grams === null) return { problems: ["提案する数量を kg で入れてください（例：2.5）"] };
  const r = await proposeChange(user.id, id, grams, get(fd, "note").trim());
  if (!r.ok) return { problems: r.problems };
  redirect(`/orders/${id}?done=proposed`);
}

export async function messageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = get(fd, "orderId");
  const requestId = get(fd, "requestId");
  if (!uuid.safeParse(id).success || !uuid.safeParse(requestId).success) return bad;
  const r = await sendMessage(user.id, id, get(fd, "body"), requestId);
  if (!r.ok) return { problems: r.problems };
  redirect(`/orders/${id}?done=message#messages`);
}
