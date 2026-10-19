"use server";

import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { isPlace } from "@/lib/regions";
import { getCurrentUser } from "@/lib/session";

export type AccountState = { errors?: Record<string, string> };

export async function saveAccountAction(_: AccountState, fd: FormData): Promise<AccountState> {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const name = String(fd.get("name") ?? "").trim();
  const prefecture = String(fd.get("prefecture") ?? "");
  const city = String(fd.get("city") ?? "");
  const intro = String(fd.get("intro") ?? "").trim();
  const errors: Record<string, string> = {};
  if (!name) errors.name = "名前を入れてください";
  else if (name.length > 40) errors.name = "40文字以内にしてください";
  if (!isPlace(prefecture, city)) errors.place = "府県と市区町村を選んでください";
  if (intro.length > 300) errors.intro = `300文字以内にしてください（今 ${intro.length}文字）`;
  if (Object.keys(errors).length) return { errors };
  await getDb().user.update({ where: { id: user.id }, data: { name, prefecture, city, intro: user.role === "producer" ? intro || null : null } });
  redirect("/account?done=1");
}
