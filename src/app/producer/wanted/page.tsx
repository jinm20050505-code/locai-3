// 生産者：地域の「探しています」（地域と条件だけ。店名・住所は出さない）。応えて出品できる
import { Suspense } from "react";
import { ReportForm } from "@/components/wanted/forms";
import { DemoBadge, LinkButton, card } from "@/components/ui";
import { formatDay } from "@/lib/dates";
import { METHOD_LABEL, type Method } from "@/lib/delivery";
import { formatKg, formatYen } from "@/lib/money";
import { placeLabel } from "@/lib/regions";
import { requireRole } from "@/lib/session";
import { listOpenWanted } from "@/server/wanted";

export default function ProducerWanted() {
  return (
    <main className="space-y-5">
      <h1 className="text-2xl font-bold">お店の「探しています」</h1>
      <p>お店が探している野菜です。応えられるときは、出品してください。お店の名前と住所は表示しません。</p>
      <Suspense fallback={<p>読み込んでいます…</p>}><Body /></Suspense>
    </main>
  );
}
async function Body() {
  const user = await requireRole("producer", "/producer/wanted");
  const rows = await listOpenWanted(user.prefecture);
  if (rows.length === 0) return <p>いま公開中の「探しています」はありません。</p>;
  return (
    <ul className="space-y-3">
      {rows.map((w) => (
        <li key={w.id} className={`${card} space-y-2`}>
          <p className="text-xl font-bold">{w.item ?? "種類を問わない"}{w.altOk ? "（代わりの野菜も可）" : ""}・{formatKg(w.grams)}</p>
          <p>送料込み {formatYen(w.budgetYen)} まで・{formatDay(w.useDate)} に使用</p>
          <p>届け先：{placeLabel(w.prefecture, w.city)}・{w.methods.map((m) => METHOD_LABEL[m as Method]).join("／")}</p>
          {w.usage && <p className="text-base">用途：{w.usage}</p>}
          <p className="text-base text-sub">応えた出品：{w._count.listings}件</p>
          {w.isDemo && <DemoBadge />}
          <LinkButton href={`/producer/listings/new?wanted=${w.id}`}>これに応えて出品する</LinkButton>
          <ReportForm type="wanted" id={w.id} />
        </li>
      ))}
    </ul>
  );
}
