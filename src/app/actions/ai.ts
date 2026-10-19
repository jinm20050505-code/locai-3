"use server";

// AI の呼び出し（サーバー側で実行）。結果は参考で、条件・候補・注文は変えない
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { explainCandidates, parseRequest, summarizeOrders } from "@/server/ai";

const ID = /^[0-9a-f-]{36}$/;

export async function aiParseAction(text: string) {
  await connection();
  const u = await getCurrentUser();
  if (u?.role !== "buyer") return { ok: false as const, message: "お店のアカウントでログインすると使えます" };
  return parseRequest(u.id, String(text ?? ""));
}

export async function aiExplainAction(cond: { item: string; usage: string; kg: string; budget: string; date: string; alternative: boolean }, ids: string[]) {
  await connection();
  const u = await getCurrentUser();
  if (u?.role !== "buyer") return { ok: false as const, message: "お店のアカウントでログインすると使えます" };
  if (!Array.isArray(ids) || ids.some((i) => typeof i !== "string" || !ID.test(i))) return { ok: false as const, message: "もう一度お試しください" };
  const c = { item: String(cond?.item ?? "").slice(0, 30), usage: String(cond?.usage ?? "").slice(0, 100), kg: String(cond?.kg ?? "").slice(0, 10), budget: String(cond?.budget ?? "").slice(0, 10), date: String(cond?.date ?? "").slice(0, 10), alternative: !!cond?.alternative };
  return explainCandidates(u.id, c, ids);
}

export async function aiSummaryAction(listingId: string) {
  await connection();
  const u = await getCurrentUser();
  if (u?.role !== "producer" || !ID.test(String(listingId))) return { ok: false as const, message: "農家のアカウントでログインすると使えます" };
  return summarizeOrders(u.id, listingId);
}
