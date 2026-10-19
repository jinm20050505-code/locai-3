"use client";

// 仕入れ条件の入力（仕様 4章 A②）。入力途中は下書きとしてこのブラウザに残し、次に開いたとき再開を聞く。
// 送ると、条件はアドレスに入る（戻る・再読み込みでも消えない）。検査はサーバーで行い、エラーは欄の近くに出す
import { useEffect, useState, useTransition } from "react";
import { aiParseAction } from "@/app/actions/ai";
import { btn, input, label, Notice } from "@/components/ui";
import { METHOD_LABEL, METHODS } from "@/lib/delivery";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft";
import { PREFECTURES } from "@/lib/regions";

export type SearchValues = { mode: string; q: string; usage: string; kg: string; budget: string; date: string; pref: string; city: string; methods: string[] };
const KEY = "search";
const Err = ({ m }: { m?: string }) => (m ? <p role="alert" className="mt-1 rounded-lg bg-warn-soft px-3 py-2 text-base font-bold text-warn">⚠ {m}</p> : null);
const same = (a: SearchValues, b: SearchValues) => JSON.stringify(a) === JSON.stringify(b);

export function SearchForm({ initial, errors, today, aiOn, fromUrl }: { initial: SearchValues; errors: Record<string, string>; today: string; aiOn: boolean; fromUrl: boolean }) {
  const [v, setV] = useState(initial);
  const [resume, setResume] = useState<SearchValues | null>(null);
  const [aiText, setAiText] = useState("");
  const [aiMsg, setAiMsg] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof SearchValues) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const cities = PREFECTURES.find((p) => p.code === v.pref)?.cities ?? [];

  // 開いたとき：アドレスに条件がなく、前回の入力途中があれば「再開しますか？」と聞く
  useEffect(() => {
    if (fromUrl) return;
    const d = loadDraft<SearchValues>(KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ブラウザの保存はここでしか読めないため
    if (d && !same(d, initial)) setResume(d);
  }, [fromUrl, initial]);
  // 入力が変わるたびに、下書きとして残す（再開の確認中は上書きしない）
  useEffect(() => {
    if (!resume && !same(v, initial)) saveDraft(KEY, v);
  }, [v, initial, resume]);

  const applyAi = () =>
    start(async () => {
      setAiMsg("");
      const r = await aiParseAction(aiText);
      if (!r.ok) return setAiMsg(r.message);
      const d = r.data;
      const mm: Record<string, string> = { 宅配発送: "courier", 農家さんが配達: "delivery", 畑で引き取り: "pickup" };
      setV((x) => ({
        ...x,
        mode: d.種類を問わない ? "any" : d.代替も可 ? "alt" : "exact",
        q: d.食材 ?? x.q, usage: d.用途 ?? x.usage,
        kg: d.希望数量kg ? String(d.希望数量kg) : x.kg, budget: d.予算円 ? String(d.予算円) : x.budget, date: d.使用日 ?? x.date,
        methods: d.受け取り方法.length ? d.受け取り方法.map((m) => mm[m]) : x.methods,
      }));
      setAiMsg("AI が条件を入れました。内容を確かめて、違うところは直してから探してください。");
    });

  return (
    <div className="space-y-4">
      {resume && (
        <Notice title="前回の続きから再開しますか？">
          <p>入力の途中の条件が、このブラウザに残っています（{resume.q || "種類を問わない"}・{resume.kg || "?"}kg）。</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <button type="button" className={btn.primary} onClick={() => { setV(resume); setResume(null); }}>再開する</button>
            <button type="button" className={btn.plain} onClick={() => { clearDraft(KEY); setResume(null); }}>消して新しく入力する</button>
          </div>
        </Notice>
      )}
      {aiOn && (
        <details className="rounded-xl border-2 border-line p-3">
          <summary className="min-h-12 cursor-pointer py-2 text-lg font-bold text-brand-dark">文章で希望を書く（AI が条件に整理します）</summary>
          <div className="mt-2 space-y-2">
            <textarea aria-label="仕入れの希望（文章）" rows={3} maxLength={500} className={input} value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="例：木曜に焼物で使う万願寺唐辛子を2kg、送料込み5000円まで。代わりの野菜でもいい" />
            <button type="button" className={btn.secondary} disabled={pending || !aiText.trim()} onClick={applyAi}>{pending ? "整理しています…" : "条件に整理する"}</button>
            {aiMsg && <p role="status" className="text-base">{aiMsg}</p>}
          </div>
        </details>
      )}
      <form action="/search" className="space-y-4" onSubmit={() => clearDraft(KEY)}>
        <input type="hidden" name="go" value="1" />
        <fieldset>
          <legend className={label}>食材</legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-3">
            {[["exact", "指定する"], ["alt", "代替野菜も可"], ["any", "種類を問わない"]].map(([k, t]) => (
              <label key={k} className={`flex min-h-12 items-center gap-2 rounded-xl border-2 px-3 ${v.mode === k ? "border-brand-strong bg-brand-soft" : "border-line"}`}>
                <input type="radio" name="mode" value={k} checked={v.mode === k} onChange={set("mode")} className="h-6 w-6 accent-brand-strong" /> {t}
              </label>
            ))}
          </div>
        </fieldset>
        {v.mode !== "any" && (
          <div>
            <label htmlFor="q" className={label}>食材の名前</label>
            <input id="q" name="q" value={v.q} onChange={set("q")} placeholder="例：なす、万願寺唐辛子" className={input} maxLength={30} />
            <Err m={errors.q} />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="kg" className={label}>希望数量（kg）</label>
            <input id="kg" name="kg" value={v.kg} onChange={set("kg")} inputMode="decimal" placeholder="例：3" className={input} />
            <Err m={errors.kg} />
          </div>
          <div>
            <label htmlFor="budget" className={label}>予算（送料込み・円）</label>
            <input id="budget" name="budget" value={v.budget} onChange={set("budget")} inputMode="numeric" placeholder="例：5000" className={input} />
            <Err m={errors.budget} />
          </div>
        </div>
        <div>
          <label htmlFor="date" className={label}>使用日</label>
          <input id="date" name="date" type="date" min={today} value={v.date} onChange={set("date")} className={input} />
          <Err m={errors.date} />
        </div>
        <details open={!!errors.place || !!errors.methods || !!v.usage} className="rounded-xl border-2 border-line p-3">
          <summary className="min-h-12 cursor-pointer py-2 text-lg font-bold text-brand-dark">届け先・受け取り方法・用途を変える</summary>
          <div className="mt-2 space-y-4">
            <fieldset className="space-y-2">
              <legend className={label}>届け先の地域</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <select aria-label="届け先の地域（府県）" name="pref" className={input} value={v.pref} onChange={(e) => setV((x) => ({ ...x, pref: e.target.value, city: "" }))}>
                  <option value="">府県を選ぶ</option>
                  {PREFECTURES.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                </select>
                <select aria-label="届け先の地域（市区町村）" name="city" className={input} value={v.city} onChange={set("city")}>
                  <option value="">市区町村を選ぶ</option>
                  {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <Err m={errors.place} />
            </fieldset>
            <fieldset>
              <legend className={label}>希望する受け取り方法（いくつでも）</legend>
              <div className="mt-1 grid gap-2">
                {METHODS.map((m) => (
                  <label key={m} className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-line px-4">
                    <input type="checkbox" name="methods" value={m} checked={v.methods.includes(m)} onChange={(e) => setV((x) => ({ ...x, methods: e.target.checked ? [...x.methods, m] : x.methods.filter((y) => y !== m) }))} className="h-6 w-6 accent-brand-strong" />
                    {METHOD_LABEL[m]}{m === "pickup" ? "（料金0円）" : "（送料あり）"}
                  </label>
                ))}
              </div>
              <Err m={errors.methods} />
            </fieldset>
            <div>
              <label htmlFor="usage" className={label}>料理の用途（任意）</label>
              <input id="usage" name="usage" value={v.usage} onChange={set("usage")} placeholder="例：焼物、炊き合わせ" className={input} maxLength={100} />
            </div>
          </div>
        </details>
        <button className={btn.primary}>仕入れ候補を探す</button>
      </form>
    </div>
  );
}
