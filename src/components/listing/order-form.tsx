"use client";

// 申し込みの2つの手順：①数量と受け取り方法を選ぶ → ②内容を確かめて「購入希望を送る」。
// 画面の金額は目安の表示。実際の金額はサーバーで計算し直す。送信は1回だけ（連打しても1件）
import { useActionState, useState } from "react";
import { applyAction, type ActionState } from "@/app/actions/orders";
import { btn, input, label, Notice } from "@/components/ui";
import { formatKg, formatYen, subtotalYen } from "@/lib/money";
import { quantityChoices } from "@/lib/order-rules";

export type OrderFormListing = {
  id: string; name: string; pricePerKg: number; minGrams: number; unitGrams: number; availableGrams: number;
  pickup: boolean; pickupPlace: string; delivery: boolean; deliveryFeeYen: number; deliveryOk: boolean;
  availableFrom: string; availableUntil: string; replyHours: number;
};

export function OrderForm({ l, initial }: { l: OrderFormListing; initial: { grams: number | null; date: string; method: string } }) {
  const choices = quantityChoices(l, l.availableGrams);
  const [grams, setGrams] = useState(initial.grams && choices.includes(initial.grams) ? initial.grams : choices[0]);
  const methods = [l.pickup && "pickup", l.delivery && l.deliveryOk && "delivery"].filter(Boolean) as string[];
  const [method, setMethod] = useState(methods.includes(initial.method) ? initial.method : methods[0] ?? "");
  const [date, setDate] = useState(initial.date >= l.availableFrom && initial.date <= l.availableUntil ? initial.date : l.availableFrom);
  const [step, setStep] = useState<"choose" | "confirm">("choose");
  const [requestId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState<ActionState, FormData>(applyAction, {});
  const sub = subtotalYen(l.pricePerKg, grams ?? 0);
  const fee = method === "delivery" ? l.deliveryFeeYen : 0;

  if (choices.length === 0) return <Notice kind="warn" title="残りがないため、いまは申し込めません" />;

  const summary = (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-lg">
      <dt className="font-bold">数量</dt><dd>{formatKg(grams)}</dd>
      <dt className="font-bold">商品代</dt><dd>{formatYen(l.pricePerKg)} × {formatKg(grams)} ＝ {formatYen(sub)}</dd>
      <dt className="font-bold">{method === "delivery" ? "送料" : "引き取り"}</dt><dd>{formatYen(fee)}</dd>
      <dt className="font-bold">送料込みの総額</dt><dd className="text-xl font-bold">{formatYen(sub + fee)}</dd>
      <dt className="font-bold">受け取り</dt><dd>{method === "delivery" ? "お店に届けてもらう" : `畑で引き取る（${l.pickupPlace}）`}・{date.replaceAll("-", "/")}</dd>
    </dl>
  );

  if (step === "confirm") {
    return (
      <form action={action} className="space-y-4">
        <input type="hidden" name="listingId" value={l.id} />
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="grams" value={grams} />
        <input type="hidden" name="method" value={method} />
        <input type="hidden" name="useDate" value={date} />
        <h2 className="text-xl font-bold">内容を確かめてください</h2>
        {summary}
        <Notice title="購入希望を送っただけでは、まだ確定しません">
          <p>農家さんが {l.replyHours} 時間以内に返事をします。農家さんが承認すると「販売確定」になります。それまでの間、この量は取り置き（仮押さえ）されます。</p>
          <p>お金の支払いと受け渡しは、販売確定のあとにアプリの外で行います。</p>
        </Notice>
        {state.problems?.length ? <Notice kind="warn" title="送れませんでした">{state.problems.map((p) => <p key={p}>{p}</p>)}</Notice> : null}
        <button className={btn.primary} disabled={pending}>{pending ? "送っています…" : "購入希望を送る"}</button>
        <button type="button" className={btn.plain} onClick={() => setStep("choose")} disabled={pending}>戻って直す</button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold">数量と受け取り方法を選ぶ</h2>
      <div>
        <label htmlFor="grams" className={label}>数量</label>
        <p className="text-base text-sub">{formatKg(l.minGrams)} から {formatKg(l.unitGrams)} ずつ選べます（残り {formatKg(l.availableGrams)}）</p>
        <select id="grams" className={input} value={grams} onChange={(e) => setGrams(Number(e.target.value))}>
          {choices.map((g) => <option key={g} value={g}>{formatKg(g)}（{formatYen(subtotalYen(l.pricePerKg, g))}）</option>)}
        </select>
      </div>
      <fieldset>
        <legend className={label}>受け取り方法</legend>
        <div className="mt-1 grid gap-2">
          {l.pickup && (
            <label className={`flex min-h-12 items-start gap-3 rounded-xl border-2 p-3 ${method === "pickup" ? "border-brand-strong bg-brand-soft" : "border-line"}`}>
              <input type="radio" name="m" checked={method === "pickup"} onChange={() => setMethod("pickup")} className="mt-1 h-6 w-6 accent-brand-strong" />
              <span><b>畑で引き取る</b>（料金0円）<br /><span className="text-base text-sub">場所：{l.pickupPlace}（くわしい場所は販売確定のあとにメッセージで）</span></span>
            </label>
          )}
          {l.delivery && (
            <label className={`flex min-h-12 items-start gap-3 rounded-xl border-2 p-3 ${!l.deliveryOk ? "border-line bg-gray-50 text-sub" : method === "delivery" ? "border-brand-strong bg-brand-soft" : "border-line"}`}>
              <input type="radio" name="m" checked={method === "delivery"} disabled={!l.deliveryOk} onChange={() => setMethod("delivery")} className="mt-1 h-6 w-6 accent-brand-strong" />
              <span><b>お店に届けてもらう</b>（送料 {formatYen(l.deliveryFeeYen)}）{!l.deliveryOk && <><br /><span className="text-base">お店の地域はお届けの範囲外です</span></>}</span>
            </label>
          )}
        </div>
      </fieldset>
      <div>
        <label htmlFor="date" className={label}>受け取る日</label>
        <p className="text-base text-sub">{l.availableFrom.replaceAll("-", "/")} 〜 {l.availableUntil.replaceAll("-", "/")} の中から選べます</p>
        <input id="date" type="date" className={input} min={l.availableFrom} max={l.availableUntil} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="rounded-xl bg-brand-soft p-4">
        <p className="text-base">送料込みの総額（目安）</p>
        <p className="text-2xl font-bold">{formatYen(sub + fee)}</p>
      </div>
      <button type="button" className={btn.primary} disabled={!method || !date} onClick={() => setStep("confirm")}>内容を確認する</button>
      {!method && <p role="alert" className="text-base font-bold text-warn">⚠ 選べる受け取り方法がありません</p>}
    </div>
  );
}
