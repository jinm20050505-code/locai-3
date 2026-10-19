// 飲食店：自分の注文の状況。返事待ち・確認が必要なものを先に
import Link from "next/link";
import { Suspense } from "react";
import { LinkButton, StatusTag, card } from "@/components/ui";
import { formatDateTime, formatDay } from "@/lib/dates";
import { formatKg, formatYen } from "@/lib/money";
import { effectiveStatus, STATUS_SHORT } from "@/lib/order-rules";
import { requireRole } from "@/lib/session";
import { listBuyerOrders } from "@/server/orders";

const RANK: Record<string, number> = { changeRequested: 0, pending: 1, confirmed: 2, declined: 3, expired: 3, cancelled: 3 };

export default function BuyerOrders() {
  return (
    <main className="space-y-5">
      <h1 className="text-2xl font-bold">注文の状況</h1>
      <Suspense fallback={<p>読み込んでいます…</p>}>
        <List />
      </Suspense>
    </main>
  );
}

async function List() {
  const user = await requireRole("buyer", "/orders");
  const now = new Date();
  const rows = (await listBuyerOrders(user.id)).map((o) => ({ ...o, s: effectiveStatus(o, now) })).sort((a, b) => RANK[a.s] - RANK[b.s] || b.createdAt.getTime() - a.createdAt.getTime());
  if (rows.length === 0) return (<><p>まだ注文はありません。</p><LinkButton href="/search">野菜を探す</LinkButton></>);
  return (
    <ul className="space-y-3">
      {rows.map((o) => (
        <li key={o.id}>
          <Link href={`/orders/${o.id}`} className={`${card} block space-y-1 hover:border-brand-strong`}>
            <StatusTag status={o.s} label={STATUS_SHORT[o.s]} />
            <p className="text-xl font-bold">{o.listing.name}{o.listing.variety && `（${o.listing.variety}）`}・{formatKg(o.quantityGrams)}</p>
            <p>{o.producer.name}・送料込み {formatYen(o.totalYen)}・受け取り {formatDay(o.useDate)}</p>
            {o.s === "pending" && <p className="font-bold text-note">まだ確定していません（返事の期限 {formatDateTime(o.replyDeadline)}）</p>}
            {o.s === "changeRequested" && <p className="font-bold text-note">農家さんから変更の提案があります。確認してください</p>}
            <p className="font-bold text-brand-dark underline">くわしく見る</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
