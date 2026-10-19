// 注文の画面（当事者2人だけ）。今の状態・次にすること・金額の内訳・返事のボタン・メッセージ
import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { MessageForm, OrderButton, ProposeForm } from "@/components/orders/action-forms";
import { DemoBadge, Notice, StatusTag, card } from "@/components/ui";
import { formatDateTime, formatDay } from "@/lib/dates";
import { formatKg, formatYen } from "@/lib/money";
import { effectiveStatus, STATUS_LABEL } from "@/lib/order-rules";
import { placeLabel } from "@/lib/regions";
import { getCurrentUser } from "@/lib/session";
import { getOrderForParty } from "@/server/orders";
import { getPublicListing } from "@/server/listings";

const DONE: Record<string, string> = {
  sent: "購入希望を送りました。まだ確定していません。農家さんの返事を待ちましょう。",
  approved: "承認しました。販売確定です。受け渡しの相談はメッセージでどうぞ。",
  declined: "見送りました。取り置きしていた量は戻りました。",
  proposed: "数量の変更を提案しました。お店が同意すると販売確定になります。",
  accepted: "変更に同意しました。販売確定です。",
  cancelled: "取り消しました。取り置きしていた量は戻りました。",
  message: "メッセージを送りました。",
};

export default function OrderPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  return (
    <main>
      <Suspense fallback={<p>読み込んでいます…</p>}>
        <Detail params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Detail({ params, searchParams }: { params: PageProps<"/orders/[id]">["params"]; searchParams: PageProps<"/orders/[id]">["searchParams"] }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user) redirect(`/login?next=${encodeURIComponent(`/orders/${id}`)}`);
  const sp = await searchParams;
  const o = /^[0-9a-f-]{36}$/.test(id) ? await getOrderForParty(user.id, id) : null;
  if (!o) notFound(); // 他人の注文は「見つからない」と同じ扱い
  const now = new Date();
  const s = effectiveStatus(o, now);
  const isBuyer = o.buyerId === user.id;
  const other = isBuyer ? o.producer : o.buyer;
  const done = typeof sp.done === "string" ? DONE[sp.done] : null;
  const live = s === "pending" || s === "changeRequested";
  const avail = !isBuyer && s === "pending" ? (await getPublicListing(o.listingId, now))?.stock.availableGrams ?? 0 : 0;

  // 次にすること（役割と状態で、1つにしぼって伝える）
  const next =
    s === "pending" ? (isBuyer ? `農家さんの返事を待っています。返事の期限は ${formatDateTime(o.replyDeadline)} です。` : `返事をしてください（期限：${formatDateTime(o.replyDeadline)}）。期限を過ぎると、この購入希望は期限切れになります。`)
    : s === "changeRequested" ? (isBuyer ? `農家さんから数量の変更の提案があります。同意すると販売確定です（期限：${formatDateTime(o.replyDeadline)}）。` : `お店の返事を待っています（期限：${formatDateTime(o.replyDeadline)}）。`)
    : s === "confirmed" ? "販売確定です。受け渡しの日時・場所と支払いは、メッセージで相談してください（アプリの外で行います）。"
    : s === "expired" ? "返事の期限を過ぎたため、期限切れになりました。取り置きしていた量は戻りました。"
    : s === "declined" ? "農家さんが今回は見送りました。ほかの野菜を探してみてください。"
    : "取り消されました。";

  return (
    <div className="space-y-5">
      <p><Link href={isBuyer ? "/orders" : "/producer/orders"} className="inline-flex min-h-12 items-center font-bold text-brand-dark underline">← 一覧に戻る</Link></p>
      {done && <Notice kind="ok" title={done} />}
      <div className="space-y-2">
        <StatusTag status={s} label={STATUS_LABEL[s]} />
        <h1 className="text-2xl font-bold">{o.listing.name}{o.listing.variety && `（${o.listing.variety}）`}</h1>
        {o.listing.isDemo && <DemoBadge />}
        <p>{isBuyer ? "農家さん" : "お店"}：{other.name}（{placeLabel(other.prefecture, other.city)}）</p>
      </div>
      <div className="rounded-2xl border-4 border-brand p-4">
        <p className="text-base font-bold">次にすること</p>
        <p className="text-lg">{next}</p>
      </div>

      <section className={card} aria-labelledby="terms">
        <h2 id="terms" className="text-lg font-bold">{s === "confirmed" ? "決まった条件" : "申し込んだ条件"}</h2>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="font-bold">数量</dt><dd>{formatKg(o.quantityGrams)}</dd>
          <dt className="font-bold">商品代</dt><dd>{formatYen(o.pricePerKg)} × {formatKg(o.quantityGrams)} ＝ {formatYen(o.subtotalYen)}</dd>
          <dt className="font-bold">{o.method === "delivery" ? "送料" : "引き取り"}</dt><dd>{formatYen(o.feeYen)}</dd>
          <dt className="font-bold">送料込みの総額</dt><dd className="text-xl font-bold">{formatYen(o.totalYen)}</dd>
          <dt className="font-bold">受け取り</dt><dd>{o.method === "delivery" ? "お店に届ける" : `畑で引き取り（${placeLabel(o.listing.pickupPref, o.listing.pickupCity)}）`}・{formatDay(o.useDate)}</dd>
          <dt className="font-bold">申し込み</dt><dd>{formatDateTime(o.createdAt)}</dd>
        </dl>
      </section>

      {s === "changeRequested" && o.proposedGrams && (
        <section className="space-y-2 rounded-2xl border-2 border-note bg-note-soft p-4" aria-labelledby="prop">
          <h2 id="prop" className="text-lg font-bold">農家さんからの変更の提案</h2>
          <p className="text-lg">数量 {formatKg(o.quantityGrams)} → <b>{formatKg(o.proposedGrams)}</b></p>
          <p className="text-lg">送料込みの総額 {formatYen(o.totalYen)} → <b>{formatYen(o.proposedTotalYen!)}</b></p>
          {o.proposalNote && <p>ひとこと：{o.proposalNote}</p>}
        </section>
      )}

      {live && (
        <section className="space-y-3" aria-label="操作">
          {isBuyer && s === "changeRequested" && <OrderButton orderId={o.id} act="accept" text="この変更に同意する（販売確定）" />}
          {!isBuyer && s === "pending" && (
            <>
              <OrderButton orderId={o.id} act="approve" text="承認する（販売確定）" />
              <details className="rounded-xl border-2 border-line p-3">
                <summary className="min-h-12 cursor-pointer py-2 text-lg font-bold text-brand-dark">数量を変えて提案する</summary>
                <div className="mt-2">
                  <ProposeForm orderId={o.id} currentKg={String(o.quantityGrams / 1000)} hint={`${formatKg(o.listing.minGrams)} から ${formatKg(o.listing.unitGrams)} ずつ。いま提案できるのは ${formatKg(avail + o.heldGrams)} まで`} />
                </div>
              </details>
              <OrderButton orderId={o.id} act="decline" text="今回は見送る" kind="plain" confirmText="この購入希望を見送りますか？（取り置きは戻ります）" />
            </>
          )}
          {isBuyer && <OrderButton orderId={o.id} act="cancel" text="この購入希望を取り消す" kind="plain" confirmText="この購入希望を取り消しますか？（販売確定の前なので、取り消せます）" />}
          {!isBuyer && s === "changeRequested" && <OrderButton orderId={o.id} act="decline" text="提案を取り下げて見送る" kind="plain" confirmText="提案を取り下げて、この購入希望を見送りますか？" />}
        </section>
      )}

      <section id="messages" className="space-y-3" aria-labelledby="msg">
        <h2 id="msg" className="text-xl font-bold">メッセージ</h2>
        <p className="text-base text-sub">この注文の2人だけが読めます。電話番号や口座番号は、必要になってから書いてください。</p>
        {o.messages.length === 0 && <p>まだメッセージはありません。</p>}
        <ol className="space-y-2">
          {o.messages.map((m) => (
            <li key={m.id} className={`rounded-xl p-3 ${m.senderId === user.id ? "ml-8 bg-brand-soft" : "mr-8 border-2 border-line"}`}>
              <p className="text-base text-sub">{m.senderId === user.id ? "自分" : other.name}・{formatDateTime(m.createdAt)}</p>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
            </li>
          ))}
        </ol>
        {["pending", "changeRequested", "confirmed"].includes(s) ? <MessageForm orderId={o.id} /> : <p className="text-base text-sub">この注文は終わったため、メッセージは送れません。</p>}
      </section>
    </div>
  );
}
