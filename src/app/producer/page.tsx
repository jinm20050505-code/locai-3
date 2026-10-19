// 生産者：出品一覧（量の内訳つき）。主な操作は「野菜を出品する」
import Link from "next/link";
import { Suspense } from "react";
import { StatusButtons } from "@/components/producer/status-buttons";
import { DemoBadge, LinkButton, Notice, card } from "@/components/ui";
import { formatDateTime, formatDay } from "@/lib/dates";
import { formatKg, formatYen } from "@/lib/money";
import { requireRole } from "@/lib/session";
import { listOwnListings } from "@/server/listings";

const DONE: Record<string, string> = { created: "出品しました。お店の一覧に表示されます。", paused: "一時停止しました。新しい購入希望は届きません。", open: "受付を再開しました。", closed: "受付を終了しました。" };
const STATUS: Record<string, string> = { open: "受付中", paused: "一時停止中", closed: "受付終了" };

export default function ProducerHome({ searchParams }: PageProps<"/producer">) {
  return (
    <main className="space-y-5">
      <h1 className="text-2xl font-bold">出品一覧</h1>
      <LinkButton href="/producer/listings/new">野菜を出品する</LinkButton>
      <Suspense fallback={<p>読み込んでいます…</p>}>
        <List searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/producer">["searchParams"] }) {
  const user = await requireRole("producer", "/producer");
  const sp = await searchParams;
  const now = new Date();
  const rows = await listOwnListings(user.id, now);
  const done = typeof sp.done === "string" ? DONE[sp.done] : null;
  return (
    <>
      {done && <Notice kind="ok" title={done} />}
      {rows.length === 0 && <p>まだ出品はありません。「野菜を出品する」から始めましょう。</p>}
      <ul className="space-y-4">
        {rows.map((l) => {
          const status = l.status === "open" && l.acceptUntil <= now ? "closedByTime" : l.status;
          return (
            <li key={l.id} className={`${card} space-y-3`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-lg px-3 py-1 text-base font-bold ${status === "open" ? "bg-brand-strong text-white" : "border border-line bg-gray-100 text-sub"}`}>
                  {status === "closedByTime" ? "締め切りを過ぎました" : STATUS[l.status]}
                </span>
                {l.isDemo && <DemoBadge />}
              </div>
              <p className="text-xl font-bold">{l.name}{l.variety && `（${l.variety}）`}・1kg {formatYen(l.pricePerKg)}</p>
              <dl className="grid grid-cols-2 gap-2 rounded-xl bg-gray-50 p-3 sm:grid-cols-4" aria-label="量の内訳">
                <div><dt className="text-base text-sub">出品した量</dt><dd className="text-lg font-bold">{formatKg(l.stock.totalGrams)}</dd></div>
                <div><dt className="text-base text-sub">販売確定</dt><dd className="text-lg font-bold">{formatKg(l.stock.soldGrams)}</dd></div>
                <div><dt className="text-base text-sub">返事待ち（取り置き）</dt><dd className="text-lg font-bold">{formatKg(l.stock.heldGrams)}</dd></div>
                <div><dt className="text-base text-sub">残り（申し込める量）</dt><dd className="text-lg font-bold">{formatKg(l.stock.availableGrams)}</dd></div>
              </dl>
              <p className="text-base">受け渡し {formatDay(l.availableFrom)}〜{formatDay(l.availableUntil)}・締め切り {formatDateTime(l.acceptUntil)}</p>
              {l.waiting > 0 && <LinkButton href="/producer/orders">返事待ちの購入希望 {l.waiting}件 を見る</LinkButton>}
              <StatusButtons id={l.id} status={l.status} />
              <p className="text-base">
                <Link href={`/listings/${l.id}`} className="font-bold text-brand-dark underline">お店から見える画面</Link>
                {"　"}
                <Link href={`/producer/listings/new?from=${l.id}`} className="font-bold text-brand-dark underline">同じ内容でもう一度出品</Link>
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
