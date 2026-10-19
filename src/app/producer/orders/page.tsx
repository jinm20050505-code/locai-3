// 生産者：届いた購入希望の一覧。返事が必要なものを先に、期限の近い順に並べる
import Link from "next/link";
import { Suspense } from "react";
import { StatusTag, card } from "@/components/ui";
import { formatDateTime, formatDay } from "@/lib/dates";
import { formatKg, formatYen } from "@/lib/money";
import { effectiveStatus, STATUS_SHORT } from "@/lib/order-rules";
import { placeLabel } from "@/lib/regions";
import { requireRole } from "@/lib/session";
import { listProducerOrders } from "@/server/orders";

export default function ProducerOrders() {
  return (
    <main className="space-y-5">
      <h1 className="text-2xl font-bold">届いた購入希望</h1>
      <Suspense fallback={<p>読み込んでいます…</p>}>
        <List />
      </Suspense>
    </main>
  );
}

async function List() {
  const user = await requireRole("producer", "/producer/orders");
  const now = new Date();
  const rows = (await listProducerOrders(user.id)).map((o) => ({ ...o, s: effectiveStatus(o, now) }));
  const waiting = rows.filter((o) => o.s === "pending").sort((a, b) => a.replyDeadline.getTime() - b.replyDeadline.getTime());
  const others = rows.filter((o) => o.s !== "pending");
  const Item = ({ o }: { o: (typeof rows)[number] }) => (
    <li>
      <Link href={`/orders/${o.id}`} className={`${card} block space-y-1 hover:border-brand-strong`}>
        <StatusTag status={o.s} label={STATUS_SHORT[o.s]} />
        <p className="text-xl font-bold">{o.listing.name}{o.listing.variety && `（${o.listing.variety}）`}・{formatKg(o.quantityGrams)}</p>
        <p>{o.buyer.name}（{placeLabel(o.buyer.prefecture, o.buyer.city)}）</p>
        <p>送料込み {formatYen(o.totalYen)}・{o.method === "pickup" ? "畑で引き取り" : "お届け"}・受け取り {formatDay(o.useDate)}</p>
        {o.s === "pending" && <p className="font-bold text-note">返事の期限：{formatDateTime(o.replyDeadline)}</p>}
        <p className="font-bold text-brand-dark underline">くわしく見る・返事をする</p>
      </Link>
    </li>
  );
  return (
    <>
      <section className="space-y-3" aria-labelledby="w">
        <h2 id="w" className="text-xl font-bold">返事が必要（{waiting.length}件）</h2>
        {waiting.length === 0 ? <p>いま返事が必要な購入希望はありません。</p> : <ul className="space-y-3">{waiting.map((o) => <Item key={o.id} o={o} />)}</ul>}
      </section>
      <section className="space-y-3" aria-labelledby="o">
        <h2 id="o" className="text-xl font-bold">そのほか（{others.length}件）</h2>
        <ul className="space-y-3">{others.map((o) => <Item key={o.id} o={o} />)}</ul>
      </section>
    </>
  );
}
