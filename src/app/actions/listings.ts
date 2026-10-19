"use server";

// 出品の作成・状態の変更（サーバー側で実行）
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { validateListing, type FieldErrors } from "@/lib/listing-rules";
import { requireRole } from "@/lib/session";
import { createListing, setListingStatus } from "@/server/listings";

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
  const input = Object.fromEntries([...fd.keys()].filter((k) => k !== "photo").map((k) => [k, k === "deliveryPrefs" ? fd.getAll(k).map(String) : String(fd.get(k) ?? "").slice(0, 400)]));
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
  if (!v.ok || Object.keys(errors).length) return { errors };
  const l = await createListing(user.id, v.value, photo);
  redirect(`/producer?done=created&id=${l.id}`);
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
