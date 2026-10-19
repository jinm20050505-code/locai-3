// 飲食店：自分の注文の状況。返事待ち・確認が必要なものを先に
import Link from "next/link";
import { Suspense } from "react";
import { LinkButton, StatusTag, card } from "@/components/ui";
import { formatDateTime, formatDay, parseDay, todayText } from "@/lib/dates";
import { METHOD_LABEL, type Method } from "@/lib/delivery";
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
  // 今週の確保済み食材（仕様 4章 A⑤）：販売確定した注文のうち、使用日が今日から7日以内のもの。市場へ行く前に献立を組める
  const today = parseDay(todayText(now))!;
  const weekEnd = new Date(today.getTime() + 7 * 86_400_000);
  const secured = rows.filter((o) => o.s === "confirmed" && o.useDate >= today && o.useDate < weekEnd).sort((a, b) => a.useDate.getTime() - b.useDate.getTime());
  return (
    <>
    <section aria-labelledby="secured" className="space-y-2 rounded-2xl border-4 border-brand p-4">
      <h2 id="secured" className="text-xl font-bold">今週の確保済み食材（{secured.length}件）</h2>
      <p className="text-base text-sub">販売確定した食材です。市場へ行く前に、これを前提に献立を組めます。</p>
      {secured.length === 0 ? <p>今週の確保済みの食材は、まだありません。</p> : (
        <ul className="space-y-1">
          {secured.map((o) => <li key={o.id}><Link href={`/orders/${o.id}`} className="inline-flex min-h-12 items-center text-lg underline"><b>{formatDay(o.useDate)}</b>　{o.listing.name}{o.listing.variety && `（${o.listing.variety}）`} {formatKg(o.quantityGrams)}・{o.producer.name}・{METHOD_LABEL[o.method as Method]}</Link></li>)}
        </ul>
      )}
    </section>
    <h2 className="text-xl font-bold">すべての注文</h2>
    <ul className="space-y-3">
      {rows.map((o) => (
        <li key={o.id}>
          <Link href={`/orders/${o.id}`} className={`${card} block space-y-1 hover:border-brand-strong`}>
            <StatusTag status={o.s} label={STATUS_SHORT[o.s]} />
            <p className="text-xl font-bold">{o.listing.name}{o.listing.variety && `（${o.listing.variety}）`}・{formatKg(o.quantityGrams)}</p>
            <p>{o.producer.name}・送料込み {formatYen(o.totalYen)}・受け取り {formatDay(o.useDate)}</p>
            {o.s === "pending" && <p className="font-bold text-note">まだ確定していません（回答期限 {formatDateTime(o.replyDeadline)}）</p>}
            {o.s === "changeRequested" && <p className="font-bold text-note">農家さんから変更の提案があります。確認してください</p>}
            <p className="font-bold text-brand-dark underline">くわしく見る</p>
          </Link>
        </li>
      ))}
    </ul>
    </>
  );
}
