"use server";

// 「探しています」の公開・終了と、通報（サーバー側で実行）
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser, requireRole } from "@/lib/session";
import { closeWanted, createWanted, report, validateWanted } from "@/server/wanted";

export type WantedState = { errors?: Record<string, string>; problem?: string; done?: boolean };

export async function createWantedAction(_: WantedState, fd: FormData): Promise<WantedState> {
  await connection();
  const user = await requireRole("buyer", "/wanted/new");
  const f: Record<string, string | string[]> = {};
  for (const k of ["mode", "q", "kg", "budget", "date", "pref", "city", "usage"]) f[k] = String(fd.get(k) ?? "").slice(0, 600);
  f.methods = fd.getAll("methods").map(String);
  const v = validateWanted(f, new Date());
  if (!v.ok) return { errors: v.errors };
  const r = await createWanted(user.id, v.value);
  if (!r.ok) return { problem: r.problem };
  redirect("/wanted?done=created");
}

export async function closeWantedAction(_: WantedState, fd: FormData): Promise<WantedState> {
  await connection();
  const user = await requireRole("buyer", "/wanted");
  const id = z.string().uuid().safeParse(fd.get("id"));
  if (!id.success || !(await closeWanted(user.id, id.data))) return { problem: "終了できませんでした（すでに終了しています）" };
  redirect("/wanted?done=closed");
}

export async function reportAction(_: WantedState, fd: FormData): Promise<WantedState> {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const type = fd.get("type") === "wanted" ? "wanted" : "listing";
  const id = z.string().uuid().safeParse(fd.get("id"));
  if (!id.success) return { problem: "画面を開き直して、もう一度お試しください" };
  const r = await report(user.id, type, id.data, String(fd.get("reason") ?? ""));
  return r.ok ? { done: true } : { problem: r.problem };
}
