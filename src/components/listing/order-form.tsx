"use client";

// 申し込みの2つの手順：①数量と受け取り方法を選ぶ → ②内容を確かめて「購入希望を送る」。
// 画面の金額は目安の表示。実際の金額はサーバーで計算し直す。送信は1回だけ（連打しても1件）
import { useActionState, useState } from "react";
import { applyAction, type ActionState } from "@/app/actions/orders";
import { btn, input, label, Notice } from "@/components/ui";
import { courierFee, METHOD_LABEL, type FeeBand, type Method } from "@/lib/delivery";
import { formatKg, formatYen, subtotalYen } from "@/lib/money";
import { quantityChoices } from "@/lib/order-rules";

export type MethodOption = { method: Method; ok: boolean; reason?: string; feeYen?: number; bands?: FeeBand[]; note: string };
export type OrderFormListing = {
  id: string; pricePerKg: number; minGrams: number; unitGrams: number; availableGrams: number; allowPartial: boolean;
  methods: MethodOption[]; availableFrom: string; availableUntil: string; replyUntilText: string;
};

const feeOf = (m: MethodOption | undefined, grams: number) => (!m ? null : m.method === "courier" ? courierFee(m.bands ?? [], grams) : m.feeYen ?? 0);

export function OrderForm({ l, initial }: { l: OrderFormListing; initial: { grams: number | null; date: string } }) {
  const choices = l.allowPartial ? quantityChoices(l, l.availableGrams) : l.availableGrams >= l.minGrams ? [l.minGrams] : [];
  const [grams, setGrams] = useState(initial.grams && choices.includes(initial.grams) ? initial.grams : choices[0]);
  const usable = l.methods.filter((m) => m.ok);
  const [method, setMethod] = useState<Method | "">(usable[0]?.method ?? "");
  const lastDay = initial.date && initial.date < l.availableUntil && initial.date >= l.availableFrom ? initial.date : l.availableUntil;
  const [date, setDate] = useState(initial.date >= l.availableFrom && initial.date <= l.availableUntil ? initial.date : l.availableFrom);
  const [step, setStep] = useState<"choose" | "confirm">("choose");
  const [requestId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState<ActionState, FormData>(applyAction, {});
  const chosen = l.methods.find((m) => m.method === method);
  const sub = subtotalYen(l.pricePerKg, grams ?? 0);
  const fee = feeOf(chosen, grams ?? 0);
  if (choices.length === 0) return <Notice kind="warn" title="残りがないため、いまは申し込めません" />;

  if (step === "confirm" && chosen && fee !== null) {
    return (
      <form action={action} className="space-y-4">
        <input type="hidden" name="listingId" value={l.id} />
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="grams" value={grams} />
        <input type="hidden" name="method" value={method} />
        <input type="hidden" name="useDate" value={date} />
        <h2 className="text-xl font-bold">内容を確かめてください</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-lg">
          <dt className="font-bold">数量</dt><dd>{formatKg(grams)}</dd>
          <dt className="font-bold">商品代</dt><dd>{formatYen(l.pricePerKg)} × {formatKg(grams)} ＝ {formatYen(sub)}</dd>
          <dt className="font-bold">{method === "pickup" ? "引き取り" : "送料・配達料"}</dt><dd>{formatYen(fee)}</dd>
          <dt className="font-bold">合計金額</dt><dd className="text-xl font-bold">{formatYen(sub + fee)}</dd>
          <dt className="font-bold">受け取り</dt><dd>{METHOD_LABEL[chosen.method]}（{chosen.note}）・{date.replaceAll("-", "/")}</dd>
        </dl>
        <Notice title="購入希望を送っただけでは、まだ確定しません">
          <p>農家さんが回答期限（{l.replyUntilText}）までに回答します。農家さんが承認すると、この数量・合計金額・受け取り条件で「販売確定」になります。農家さんが条件を変えた場合は、あなたが同意した時点で販売確定です。</p>
          <p>それまでの間、この量は仮押さえされます。支払いと受け渡しは、販売確定のあとにアプリの外で行います。</p>
        </Notice>
        {state.problems?.length ? <Notice kind="warn" title="送れませんでした">{state.problems.map((p) => <p key={p}>{p}</p>)}</Notice> : null}
        <button className={btn.primary} disabled={pending}>{pending ? "送っています…" : "購入希望を送る"}</button>
        <button type="button" className={btn.plain} onClick={() => setStep("choose")} disabled={pending}>戻って直す</button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold">数量と受け取り条件を選ぶ</h2>
      <div>
        <label htmlFor="grams" className={label}>希望数量</label>
        <p className="text-base text-sub">{l.allowPartial ? `${formatKg(l.minGrams)} から ${formatKg(l.unitGrams)} ずつ選べます（申し込める量 ${formatKg(l.availableGrams)}）` : "この出品は全量での販売です"}</p>
        <select id="grams" className={input} value={grams} onChange={(e) => setGrams(Number(e.target.value))}>
          {choices.map((g) => <option key={g} value={g}>{formatKg(g)}（商品代 {formatYen(subtotalYen(l.pricePerKg, g))}）</option>)}
        </select>
      </div>
      <fieldset>
        <legend className={label}>受け取り方法</legend>
        <div className="mt-1 grid gap-2">
          {l.methods.map((m) => {
            const f = feeOf(m, grams);
            const ok = m.ok && f !== null;
            return (
              <label key={m.method} className={`flex min-h-12 items-start gap-3 rounded-xl border-2 p-3 ${!ok ? "border-line bg-gray-50 text-sub" : method === m.method ? "border-brand-strong bg-brand-soft" : "border-line"}`}>
                <input type="radio" name="m" checked={method === m.method} disabled={!ok} onChange={() => setMethod(m.method)} className="mt-1 h-6 w-6 accent-brand-strong" />
                <span><b>{METHOD_LABEL[m.method]}</b>{ok ? `（${m.method === "pickup" ? "料金0円" : `送料・配達料 ${formatYen(f!)}`}）` : ""}<br /><span className="text-base">{ok ? m.note : m.reason ?? "この量では使えません"}</span></span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div>
        <label htmlFor="date" className={label}>受け取る日</label>
        <p className="text-base text-sub">{l.availableFrom.replaceAll("-", "/")} 〜 {lastDay.replaceAll("-", "/")} の中から選べます</p>
        <input id="date" type="date" className={input} min={l.availableFrom} max={lastDay} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="rounded-xl bg-brand-soft p-4">
        <p className="text-base">合計金額（目安）</p>
        <p className="text-2xl font-bold">{fee === null ? "受け取り方法を選んでください" : formatYen(sub + fee)}</p>
        {fee !== null && <p className="text-base">商品代 {formatYen(sub)} ＋ {method === "pickup" ? "引き取り 0円" : `送料・配達料 ${formatYen(fee)}`}</p>}
      </div>
      <button type="button" className={btn.primary} disabled={!chosen || fee === null || !date} onClick={() => setStep("confirm")}>内容を確認する</button>
    </div>
  );
}
