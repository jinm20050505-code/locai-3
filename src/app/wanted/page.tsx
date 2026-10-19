// 飲食店：自分の「探しています」と、応えてくれた出品
import Link from "next/link";
import { Suspense } from "react";
import { CloseWantedButton } from "@/components/wanted/forms";
import { LinkButton, Notice, card } from "@/components/ui";
import { formatDay } from "@/lib/dates";
import { METHOD_LABEL, type Method } from "@/lib/delivery";
import { formatKg, formatYen } from "@/lib/money";
import { placeLabel } from "@/lib/regions";
import { requireRole } from "@/lib/session";
import { listOwnWanted } from "@/server/wanted";

export default function WantedPage({ searchParams }: PageProps<"/wanted">) {
  return (
    <main className="space-y-5">
      <h1 className="text-2xl font-bold">探しています</h1>
      <Suspense fallback={<p>読み込んでいます…</p>}><Body searchParams={searchParams} /></Suspense>
    </main>
  );
}
async function Body({ searchParams }: { searchParams: PageProps<"/wanted">["searchParams"] }) {
  const user = await requireRole("buyer", "/wanted");
  const sp = await searchParams;
  const rows = await listOwnWanted(user.id);
  return (
    <>
      {sp.done === "created" && <Notice kind="ok" title="公開しました。地域の農家さんに、地域と条件だけが表示されます。" />}
      {sp.done === "closed" && <Notice kind="ok" title="終了しました。" />}
      <LinkButton href="/search">野菜を探す</LinkButton>
      {rows.length === 0 && <p>まだ公開していません。探して見つからなかったときに、結果の画面から公開できます。</p>}
      <ul className="space-y-3">
        {rows.map((w) => (
          <li key={w.id} className={`${card} space-y-2`}>
            <p className="text-base font-bold">{w.status === "open" ? "公開中" : "終了"}</p>
            <p className="text-xl font-bold">{w.item ?? "種類を問わない"}{w.altOk ? "（代替野菜も可）" : ""}・{formatKg(w.grams)}</p>
            <p>送料込み {formatYen(w.budgetYen)} まで・{formatDay(w.useDate)} に使用・{placeLabel(w.prefecture, w.city)}・{w.methods.map((m) => METHOD_LABEL[m as Method]).join("／")}</p>
            <p className="font-bold">応えてくれた出品：{w.listings.length}件</p>
            <ul className="space-y-1">{w.listings.map((l) => <li key={l.id}><Link href={`/listings/${l.id}?kg=${w.grams / 1000}`} className="inline-flex min-h-12 items-center font-bold text-brand-dark underline">{l.name}{l.variety ? `（${l.variety}）` : ""}・1kg {formatYen(l.pricePerKg)}・{l.producer.name}</Link></li>)}</ul>
            {w.status === "open" && <CloseWantedButton id={w.id} />}
          </li>
        ))}
      </ul>
    </>
  );
}
