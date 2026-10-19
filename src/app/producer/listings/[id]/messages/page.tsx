// 生産者：出品への相談（店ごと）。返信できる。ほかの店には見えない
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MessageList, ThreadForm } from "@/components/listing/listing-question";
import { LinkButton, card } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { requireRole } from "@/lib/session";
import { producerThreads } from "@/server/threads";

export default function ListingMessages({ params }: PageProps<"/producer/listings/[id]/messages">) {
  return (
    <main className="space-y-5">
      <Suspense fallback={<p>読み込んでいます…</p>}><Body params={params} /></Suspense>
    </main>
  );
}
async function Body({ params }: { params: PageProps<"/producer/listings/[id]/messages">["params"] }) {
  const user = await requireRole("producer", "/producer");
  const { id } = await params;
  const r = /^[0-9a-f-]{36}$/.test(id) ? await producerThreads(user.id, id) : null;
  if (!r) notFound();
  return (
    <>
      <LinkButton href="/producer" kind="plain" className="!w-auto">← 出品一覧に戻る</LinkButton>
      <h1 className="text-2xl font-bold">{r.listing.name}{r.listing.variety && `（${r.listing.variety}）`}への相談</h1>
      {r.threads.length === 0 && <p>まだ相談はありません。</p>}
      <ul className="space-y-4">
        {r.threads.map((t) => (
          <li key={t.buyer.id} className={`${card} space-y-3`}>
            <h2 className="text-lg font-bold">{t.buyer.name}</h2>
            <MessageList messages={t.messages.map((m) => ({ id: m.id, body: m.body, at: formatDateTime(m.createdAt), mine: m.senderId === user.id }))} otherName={t.buyer.name} />
            <ThreadForm listingId={r.listing.id} buyerId={t.buyer.id} title="返信を書く（500文字まで）" />
          </li>
        ))}
      </ul>
    </>
  );
}
