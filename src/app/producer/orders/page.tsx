// 生産者：届いた購入希望（仕様 4章 B③〜⑤）。出品ごとに、店舗別の数量・商品代・送料・受け渡し条件を並べ、
// 集計は「販売可能／購入希望（店舗数）／全件承認した場合の残量」を分けて出す。「利益」「手取り」とは書かない
import Link from "next/link";
import { Suspense } from "react";
import { AiSummary, ApproveAllButton } from "@/components/producer/bulk";
import { StatusTag, card } from "@/components/ui";
import { formatDateTime, formatDay, parseDay, todayText } from "@/lib/dates";
import { METHOD_LABEL, type Method } from "@/lib/delivery";
import { formatKg, formatYen } from "@/lib/money";
import { effectiveStatus, STATUS_SHORT } from "@/lib/order-rules";
import { placeLabel, prefName } from "@/lib/regions";
import { requireRole } from "@/lib/session";
import { aiConfigured } from "@/server/ai";
import { listProducerOrders } from "@/server/orders";

export default function ProducerOrders() {
  return (
    <main className="space-y-5">
      <h1 className="text-2xl font-bold">届いた購入希望</h1>
      <Suspense fallback={<p>読み込んでいます…</p>}><List /></Suspense>
    </main>
  );
}

async function List() {
  const user = await requireRole("producer", "/producer/orders");
  const now = new Date();
  const today = parseDay(todayText(now))!;
  const rows = (await listProducerOrders(user.id)).map((o) => ({ ...o, s: effectiveStatus(o, now) }));
  if (rows.length === 0) return <p>まだ購入希望は届いていません。</p>;
  const byListing = new Map<string, typeof rows>();
  rows.forEach((o) => byListing.set(o.listingId, [...(byListing.get(o.listingId) ?? []), o]));
  const listings = [...byListing.values()].sort((a, b) => b.filter((o) => o.s === "pending").length - a.filter((o) => o.s === "pending").length);
  return (
    <ul className="space-y-6">
      {listings.map((orders) => {
        const l = orders[0].listing;
        const waiting = orders.filter((o) => o.s === "pending").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        const active = orders.filter((o) => o.s === "pending" || o.s === "changeRequested");
        const sold = orders.filter((o) => o.s === "confirmed").reduce((n, o) => n + o.quantityGrams, 0);
        const wanted = active.reduce((n, o) => n + o.quantityGrams, 0);
        const stores = new Set(active.map((o) => o.buyerId)).size;
        const remainIfAll = l.totalGrams - sold - active.reduce((n, o) => n + (o.s === "changeRequested" ? o.heldGrams : o.quantityGrams), 0);
        const subSum = waiting.reduce((n, o) => n + o.subtotalYen, 0);
        const feeSum = waiting.reduce((n, o) => n + o.feeYen, 0);
        // 確認が必要な点（アプリの決まりで出す。AI がなくても出る）
        const notes: string[] = [];
        if (waiting.some((o) => o.useDate.getTime() - today.getTime() <= 86_400_000)) notes.push("使用日が明日までの注文があります（納品が間に合うか確かめてください）");
        if (waiting.some((o) => o.method !== "pickup" && o.buyer.prefecture !== user.prefecture)) notes.push(`府県をまたぐお届けがあります（${[...new Set(waiting.filter((o) => o.method !== "pickup" && o.buyer.prefecture !== user.prefecture).map((o) => prefName(o.buyer.prefecture)))].join("・")}）`);
        const deliveries = orders.filter((o) => o.method === "delivery" && (o.s === "confirmed" || o.s === "pending" || o.s === "changeRequested")).length;
        if (l.deliveryMaxOrders && deliveries >= l.deliveryMaxOrders) notes.push(`配達の受付件数（${l.deliveryMaxOrders}件）に達しています`);
        if (waiting.some((o) => o.replyDeadline.getTime() - now.getTime() < 6 * 3_600_000)) notes.push("回答期限まで6時間を切った注文があります");
        if (waiting.some((o) => o.feePending)) notes.push("送料・配達料が見積もりの注文があります（注文ごとに送料を決めて提案してください。全件承認では承認されません）");
        return (
          <li key={l.id} className={`${card} space-y-3`}>
            <h2 className="text-xl font-bold">{l.name}{l.variety && `（${l.variety}）`}</h2>
            <p className="rounded-xl bg-brand-soft p-3 text-lg">
              販売可能 <b>{formatKg(l.totalGrams)}</b>／購入希望 <b>{formatKg(wanted)}・{stores}店舗</b>／全件承認した場合の残量 <b>{formatKg(Math.max(0, remainIfAll))}</b>
              <br /><span className="text-base">販売確定 {formatKg(sold)}・回答待ちの商品代の合計 {formatYen(subSum)}・送料と配達料の合計 {formatYen(feeSum)}（別々に表示しています）</span>
            </p>
            <p className="text-base">受付期限 {formatDateTime(l.acceptUntil)}・回答期限 {formatDateTime(l.replyUntil)}。全量がそろわなくても、注文ごとに承認できます。</p>
            {notes.length > 0 && (
              <div className="rounded-xl border-2 border-note bg-note-soft p-3">
                <p className="font-bold">確認が必要な点</p>
                <ul className="text-base">{notes.map((n) => <li key={n}>・{n}</li>)}</ul>
              </div>
            )}
            <ul className="space-y-2">
              {orders.sort((a, b) => Number(b.s === "pending") - Number(a.s === "pending") || a.createdAt.getTime() - b.createdAt.getTime()).map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="block space-y-1 rounded-xl border-2 border-line p-3 hover:border-brand-strong">
                    <StatusTag status={o.s} label={STATUS_SHORT[o.s]} />
                    <p className="text-lg font-bold">{o.buyer.name}（{placeLabel(o.buyer.prefecture, o.buyer.city)}）・{formatKg(o.quantityGrams)}</p>
                    <p className="text-base">商品代 {formatYen(o.subtotalYen)}・送料・配達料 {o.feePending ? "見積もり中" : formatYen(o.feeYen)}・{METHOD_LABEL[o.method as Method]}・使用日 {formatDay(o.useDate)}</p>
                    {o.s === "pending" && <p className="text-base font-bold text-note">回答期限 {formatDateTime(o.replyDeadline)}</p>}
                    <p className="text-base font-bold text-brand-dark underline">くわしく見る・注文ごとに承認／条件変更／見送り</p>
                  </Link>
                </li>
              ))}
            </ul>
            {/* 全件承認の結果は、回答待ちが0件になっても残す */}
            <ApproveAllButton listingId={l.id} count={waiting.length} />
            {waiting.length > 0 && aiConfigured() && <AiSummary listingId={l.id} />}
          </li>
        );
      })}
    </ul>
  );
}
