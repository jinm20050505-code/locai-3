"use client";

import { useActionState, useState } from "react";
import { closeWantedAction, createWantedAction, reportAction, type WantedState } from "@/app/actions/wanted";
import { btn, input, label, Notice } from "@/components/ui";
import { METHOD_LABEL, METHODS } from "@/lib/delivery";
import { PREFECTURES } from "@/lib/regions";

const Err = ({ m }: { m?: string }) => (m ? <p role="alert" className="mt-1 rounded-lg bg-warn-soft px-3 py-2 text-base font-bold text-warn">⚠ {m}</p> : null);

/** 「探しています」の公開（検索の条件を引き継ぐ。公開する内容を見せてから送る） */
export function WantedForm({ initial, today }: { initial: Record<string, string | string[]>; today: string }) {
  const [state, action, pending] = useActionState<WantedState, FormData>(createWantedAction, {});
  const e = state.errors ?? {};
  const [pref, setPref] = useState(String(initial.pref ?? ""));
  const [mode, setMode] = useState(String(initial.mode ?? "exact"));
  const methods = Array.isArray(initial.methods) ? initial.methods : [];
  return (
    <form action={action} className="space-y-4">
      <fieldset>
        <legend className={label}>食材</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-3">
          {[["exact", "指定する"], ["alt", "代替野菜も可"], ["any", "種類を問わない"]].map(([k, t]) => (
            <label key={k} className={`flex min-h-12 items-center gap-2 rounded-xl border-2 px-3 ${mode === k ? "border-brand-strong bg-brand-soft" : "border-line"}`}>
              <input type="radio" name="mode" value={k} checked={mode === k} onChange={() => setMode(k)} className="h-6 w-6 accent-brand-strong" /> {t}
            </label>
          ))}
        </div>
      </fieldset>
      {mode !== "any" && (<div><label htmlFor="q" className={label}>食材の名前</label><input id="q" name="q" defaultValue={String(initial.q ?? "")} className={input} maxLength={30} /><Err m={e.q} /></div>)}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="kg" className={label}>希望数量（kg）</label><input id="kg" name="kg" defaultValue={String(initial.kg ?? "")} inputMode="decimal" className={input} /><Err m={e.kg} /></div>
        <div><label htmlFor="budget" className={label}>予算（送料込み・円）</label><input id="budget" name="budget" defaultValue={String(initial.budget ?? "")} inputMode="numeric" className={input} /><Err m={e.budget} /></div>
      </div>
      <div><label htmlFor="date" className={label}>使用日</label><input id="date" name="date" type="date" min={today} defaultValue={String(initial.date ?? "")} className={input} /><Err m={e.date} /></div>
      <fieldset className="space-y-2">
        <legend className={label}>届け先の地域（市区町村まで公開）</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <select aria-label="届け先の地域（府県）" name="pref" className={input} value={pref} onChange={(ev) => setPref(ev.target.value)}>
            <option value="">府県を選ぶ</option>
            {PREFECTURES.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
          <select aria-label="届け先の地域（市区町村）" name="city" className={input} defaultValue={String(initial.city ?? "")} key={pref}>
            <option value="">市区町村を選ぶ</option>
            {(PREFECTURES.find((p) => p.code === pref)?.cities ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <Err m={e.place} />
      </fieldset>
      <fieldset>
        <legend className={label}>受け取り方法（いくつでも）</legend>
        <div className="mt-1 grid gap-2">
          {METHODS.map((m) => (
            <label key={m} className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-line px-4">
              <input type="checkbox" name="methods" value={m} defaultChecked={methods.length ? methods.includes(m) : true} className="h-6 w-6 accent-brand-strong" /> {METHOD_LABEL[m]}
            </label>
          ))}
        </div>
        <Err m={e.methods} />
      </fieldset>
      <div><label htmlFor="usage" className={label}>料理の用途（任意・公開されます）</label><input id="usage" name="usage" defaultValue={String(initial.usage ?? "")} className={input} maxLength={500} /></div>
      <Notice title="公開されるのは、地域と条件だけです">店名・住所は公開しません。農家さんがこれに応えて出品すると、「探しています」の画面に表示されます。</Notice>
      {state.problem && <Notice kind="warn" title={state.problem} />}
      <button className={btn.primary} disabled={pending}>{pending ? "公開しています…" : "「探しています」を公開する"}</button>
    </form>
  );
}

export function CloseWantedButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<WantedState, FormData>(closeWantedAction, {});
  return (
    <form action={action} onSubmit={(ev) => { if (!confirm("この「探しています」を終了しますか？")) ev.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button className={btn.plain} disabled={pending}>見つかったので終了する</button>
      {state.problem && <p role="alert" className="text-base font-bold text-warn">⚠ {state.problem}</p>}
    </form>
  );
}

/** 通報（理由を書いて送る。通報だけでは非表示にならない） */
export function ReportForm({ type, id }: { type: "listing" | "wanted"; id: string }) {
  const [state, action, pending] = useActionState<WantedState, FormData>(reportAction, {});
  if (state.done) return <p role="status" className="text-base">通報しました。ありがとうございました。</p>;
  return (
    <details className="rounded-xl border-2 border-line p-3">
      <summary className="min-h-12 cursor-pointer py-2 text-base font-bold text-sub">問題があるので通報する</summary>
      <form action={action} className="mt-2 space-y-2">
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="id" value={id} />
        <label htmlFor={`reason-${id}`} className="block text-base font-bold">通報の理由（500文字まで）</label>
        <textarea id={`reason-${id}`} name="reason" rows={2} maxLength={500} className={input} />
        <button className={btn.plain} disabled={pending}>通報する</button>
        {state.problem && <p role="alert" className="text-base font-bold text-warn">⚠ {state.problem}</p>}
      </form>
    </details>
  );
}
