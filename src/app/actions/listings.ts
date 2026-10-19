"use server";

// 出品の作成・状態の変更（サーバー側で実行）
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { validateListing, type FieldErrors } from "@/lib/listing-rules";
import { requireRole } from "@/lib/session";
import { createListing, previousValues, setListingStatus, updateListing } from "@/server/listings";
import { getCurrentUser } from "@/lib/session";

export type ListingState = { errors?: FieldErrors; problem?: string };
const MAX_PHOTO = 1_500_000;

/** 写真は JPEG か PNG だけ（中身の先頭で確かめる） */
function photoKind(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

export async function createListingAction(_: ListingState, fd: FormData): Promise<ListingState> {
  await connection();
  const user = await requireRole("producer");
  const { v, photo, errors } = await readListingForm(fd);
  if (!v.ok || Object.keys(errors).length) return { errors };
  const l = await createListing(user.id, v.value, photo);
  redirect(`/producer?done=created&id=${l.id}`);
}

/** 出品の入力を読み取り、確かめる（作成と編集で共通） */
async function readListingForm(fd: FormData) {
  const multi = ["deliveryPrefs", "courierPrefs", "deliveryWeekdays"];
  const input = Object.fromEntries([...fd.keys()].filter((k) => k !== "photo").map((k) => [k, multi.includes(k) ? fd.getAll(k).map(String) : String(fd.get(k) ?? "").slice(0, 600)]));
  const v = validateListing(input, new Date());
  const errors: FieldErrors = v.ok ? {} : { ...v.errors };
  let photo: { mime: string; data: Buffer } | null = null;
  const file = fd.get("photo");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PHOTO) errors.photo = "写真が大きすぎます。別の写真を選んでください";
    else {
      const data = Buffer.from(await file.arrayBuffer());
      const mime = photoKind(data);
      if (!mime) errors.photo = "写真は JPEG か PNG を選んでください";
      else photo = { mime, data };
    }
  }
  return { v, photo, errors };
}

/** 出品の編集（既存の注文の条件は変わらない） */
export async function updateListingAction(_: ListingState, fd: FormData): Promise<ListingState> {
  await connection();
  const user = await requireRole("producer");
  const id = z.string().uuid().safeParse(fd.get("id"));
  if (!id.success) return { problem: "画面を開き直して、もう一度お試しください" };
  const { v, photo, errors } = await readListingForm(fd);
  if (!v.ok || Object.keys(errors).length) return { errors };
  const r = await updateListing(user.id, id.data, v.value, photo);
  if (!r.ok) return { errors: Object.fromEntries(Object.entries(r.errors).filter(([, m]) => !!m)) as FieldErrors };
  redirect("/producer?done=updated");
}

const statusInput = z.object({ id: z.string().uuid(), to: z.enum(["open", "paused", "closed"]) });

export async function listingStatusAction(_: ListingState, fd: FormData): Promise<ListingState> {
  await connection();
  const user = await requireRole("producer");
  const p = statusInput.safeParse({ id: fd.get("id"), to: fd.get("to") });
  if (!p.success) return { problem: "画面を開き直して、もう一度お試しください" };
  const ok = await setListingStatus(user.id, p.data.id, p.data.to);
  if (!ok) return { problem: "この出品の状態は変えられません（受付終了のあとは、もとに戻せません）" };
  redirect(`/producer?done=${p.data.to}`);
}

/** 同じ食材の前回の値段・量（確認の画面で、大きく違うときに注意を出す） */
export async function previousAction(name: string) {
  await connection();
  const u = await getCurrentUser();
  if (u?.role !== "producer" || typeof name !== "string" || !name.trim()) return null;
  return previousValues(u.id, name.trim().slice(0, 30));
}
