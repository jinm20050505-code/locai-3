// 生産者：出品を編集する（受付終了の前だけ）。既存の注文の条件は変わらない
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ListingWizard } from "@/components/producer/listing-wizard";
import { getDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { listingToWizard } from "@/lib/wizard-values";

export default function EditListing({ params }: PageProps<"/producer/listings/[id]/edit">) {
  return (
    <main className="space-y-5">
      <h1 className="text-2xl font-bold">出品を編集する</h1>
      <Suspense fallback={<p>読み込んでいます…</p>}><Body params={params} /></Suspense>
    </main>
  );
}
async function Body({ params }: { params: PageProps<"/producer/listings/[id]/edit">["params"] }) {
  const user = await requireRole("producer", "/producer");
  const { id } = await params;
  const l = /^[0-9a-f-]{36}$/.test(id) ? await getDb().listing.findFirst({ where: { id, producerId: user.id, status: { not: "closed" } } }) : null;
  if (!l) notFound();
  return (
    <>
      <p>写真は、選び直したときだけ変わります。</p>
      <ListingWizard initial={listingToWizard(l, true)} fresh={false} editId={l.id} />
    </>
  );
}
