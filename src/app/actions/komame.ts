"use server";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { consultKomame } from "@/server/komame";
export async function komameChatAction(input: unknown) {
  await connection();
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, message: "料理・野菜の相談はログインすると使えるよ。使い方案内はそのまま見られるよ。" };
  try { return await consultKomame(user, input); }
  catch { return { ok: false as const, message: "いまは相談につながりません。少し待ってもう一度試してね。野菜の検索や使い方案内は使えるよ。" }; }
}
