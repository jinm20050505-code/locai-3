"use server";

import { connection } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { explainAlternatives, type AiResult } from "@/server/ai";

export async function aiAlternativesAction(wanted: string, ids: string[]): Promise<AiResult> {
  await connection();
  const user = await getCurrentUser();
  if (user?.role !== "buyer") return { ok: false, message: "AI の説明は、お店のアカウントでログインすると使えます。" };
  if (typeof wanted !== "string" || !Array.isArray(ids) || ids.some((i) => typeof i !== "string")) return { ok: false, message: "もう一度お試しください。" };
  return explainAlternatives(user.id, wanted, ids);
}
