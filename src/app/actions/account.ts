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
  const items = String(fd.get("items") ?? "").trim();
  const errors: Record<string, string> = {};
  if (!name) errors.name = "名前を入れてください";
  else if (name.length > 40) errors.name = "40文字以内にしてください";
  if (!isPlace(prefecture, city)) errors.place = "府県と市区町村を選んでください";
  if (intro.length > 500) errors.intro = `500文字以内にしてください（今 ${intro.length}文字）`;
  if (items.length > 200) errors.items = "200文字以内にしてください";
  let photo: { mime: string; data: Buffer } | null = null;
  const file = fd.get("photo");
  if (user.role === "producer" && file instanceof File && file.size > 0) {
    const data = Buffer.from(await file.arrayBuffer());
    const jpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    const png = data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (file.size > 1_500_000 || (!jpeg && !png)) errors.photo = "写真は JPEG か PNG で、大きすぎないものを選んでください";
    else photo = { mime: jpeg ? "image/jpeg" : "image/png", data };
  }
  if (Object.keys(errors).length) return { errors };
  await getDb().user.update({ where: { id: user.id }, data: { name, prefecture, city, intro: user.role === "producer" ? intro || null : null, items: user.role === "producer" ? items || null : null } });
  if (photo) await getDb().userPhoto.upsert({ where: { userId: user.id }, create: { userId: user.id, mime: photo.mime, data: new Uint8Array(photo.data) }, update: { mime: photo.mime, data: new Uint8Array(photo.data) } });
  redirect("/account?done=1");
}
