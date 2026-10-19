"use client";

// 出品の手順：① 野菜と写真 → ② 量と値段 → ③ 期限と受け渡し → ④ 確認して出品（仕様 4章 B②③）。
// 入力は手順を行き来しても残り、このブラウザに下書きとしても残る（次に開いたとき再開を聞く）。
// サーバーのエラーは、その欄がある手順に戻って欄の近くに出す
import { useActionState, useEffect, useRef, useState } from "react";
import { createListingAction, previousAction, type ListingState } from "@/app/actions/listings";
import { btn, Field, input, label, Notice } from "@/components/ui";
import { METHOD_LABEL } from "@/lib/delivery";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft";
import { formatKg, formatYen, kgTextToGrams, subtotalYen, yenTextToInt } from "@/lib/money";
import { SURPLUS_CHOICES, UNIT_CHOICES } from "@/lib/listing-rules";
import { PREFECTURES, prefName } from "@/lib/regions";

export type WizardValues = Record<string, string>;
const STEP_OF: Record<string, number> = { name: 0, variety: 0, description: 0, photo: 0, surplusReason: 0, totalKg: 1, pricePerKg: 1, minKg: 1, unitGrams: 1, allowPartial: 1 };
const STEPS = ["野菜と写真", "量と値段", "期限と受け渡し", "確認"];
const KEY = "listing";
const Err = ({ m }: { m?: string }) => (m ? <p role="alert" className="mt-1 rounded-lg bg-warn-soft px-3 py-2 text-base font-bold text-warn">⚠ {m}</p> : null);

async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok, ng) => c.toBlob((b) => (b ? ok(b) : ng(new Error("shrink"))), "image/jpeg", 0.85));
}

function PrefChecks({ value, onChange, title, error }: { value: string; onChange: (v: string) => void; title: string; error?: string }) {
  const list = value ? value.split(",") : [];
  return (
    <fieldset>
      <legend className="text-lg font-bold">{title}</legend>
      <div className="mt-1 grid grid-cols-2 gap-2">
        {PREFECTURES.map((p) => (
          <label key={p.code} className="flex min-h-12 items-center gap-2 rounded-xl border-2 border-line px-3">
            <input type="checkbox" checked={list.includes(p.code)} onChange={(e) => onChange((e.target.checked ? [...list, p.code] : list.filter((c) => c !== p.code)).join(","))} className="h-6 w-6 accent-brand-strong" /> {p.name}
          </label>
        ))}
      </div>
      <Err m={error} />
    </fieldset>
  );
}

export function ListingWizard({ initial, fresh }: { initial: WizardValues; fresh: boolean }) {
  const [v, setV] = useState<WizardValues>(initial);
  const [resume, setResume] = useState<WizardValues | null>(null);
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [prev, setPrev] = useState<{ pricePerKg: number; totalGrams: number } | null>(null);
  const [state, action, pending] = useActionState<ListingState, FormData>(createListingAction, {});
  const e = state.errors ?? {};
  const top = useRef<HTMLDivElement>(null);
  const set = (k: string) => (ev: { target: { value: string } }) => setV((x) => ({ ...x, [k]: ev.target.value }));
  const check = (k: string) => (ev: { target: { checked: boolean } }) => setV((x) => ({ ...x, [k]: ev.target.checked ? "on" : "" }));

  // サーバーのエラーが届いたら、エラーのある いちばん前の手順に戻る
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    const keys = Object.keys(state.errors ?? {});
    if (keys.length) setStep(Math.min(...keys.map((k) => STEP_OF[k] ?? 2)));
  }
  useEffect(() => {
    top.current?.scrollIntoView({ block: "start" });
  }, [step]);
  // 下書き：何も写していない新しい出品のときだけ、前回の入力途中の再開を聞く
  useEffect(() => {
    if (!fresh) return;
    const d = loadDraft<WizardValues>(KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ブラウザの保存はここでしか読めないため
    if (d && d.name) setResume(d);
  }, [fresh]);
  useEffect(() => {
    if (!resume && v.name) saveDraft(KEY, v);
  }, [v, resume]);
  // 確認の手順に入ったら、同じ食材の前回の値を取り直す
  useEffect(() => {
    if (step === 3) previousAction(v.name).then(setPrev).catch(() => setPrev(null));
  }, [step, v.name]);

  const grams = kgTextToGrams(v.totalKg ?? "");
  const price = yenTextToInt(v.pricePerKg ?? "");
  const minG = v.allowPartial === "no" ? grams : kgTextToGrams(v.minKg ?? "");
  const cities = PREFECTURES.find((p) => p.code === v.pickupPref)?.cities ?? [];
  const far = (a: number | null, b: number) => !!a && (a > b * 1.5 || a < b * 0.5);

  const submit = (fd: FormData) => {
    for (const [k, val] of Object.entries(v)) if (k !== "deliveryPrefs" && k !== "courierPrefs") fd.set(k, val);
    (v.deliveryPrefs ? v.deliveryPrefs.split(",") : []).forEach((p) => fd.append("deliveryPrefs", p));
    (v.courierPrefs ? v.courierPrefs.split(",") : []).forEach((p) => fd.append("courierPrefs", p));
    if (photo) fd.set("photo", new File([photo], "photo.jpg", { type: "image/jpeg" }));
    clearDraft(KEY);
    return action(fd);
  };

  return (
    <div ref={top} className="scroll-mt-4 space-y-5">
      {resume && (
        <Notice title="前回の続きから再開しますか？">
          <p>入力の途中の出品（{resume.name}）が、このブラウザに残っています。写真は選び直してください。</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <button type="button" className={btn.primary} onClick={() => { setV(resume); setResume(null); }}>再開する</button>
            <button type="button" className={btn.plain} onClick={() => { clearDraft(KEY); setResume(null); }}>消して新しく入力する</button>
          </div>
        </Notice>
      )}
      <ol className="flex flex-wrap gap-2" aria-label="手順">
        {STEPS.map((s, i) => (
          <li key={s} className={`rounded-lg px-3 py-1 text-base font-bold ${i === step ? "bg-brand-strong text-white" : i < step ? "bg-brand-soft text-brand-dark" : "bg-gray-100 text-sub"}`} aria-current={i === step ? "step" : undefined}>
            {i + 1}. {s}{i < step ? "（済）" : ""}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="space-y-5">
          <Field id="name" title="食材の名前（必ず入れる）" hint="例：なす、万願寺唐辛子" error={e.name}>
            <input id="name" className={input} value={v.name ?? ""} onChange={set("name")} maxLength={30} />
          </Field>
          <Field id="variety" title="品種（あれば）" hint="例：賀茂茄子" error={e.variety}>
            <input id="variety" className={input} value={v.variety ?? ""} onChange={set("variety")} maxLength={30} />
          </Field>
          <fieldset>
            <legend className={label}>余剰理由（あれば）</legend>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {["", ...SURPLUS_CHOICES].map((r) => (
                <label key={r || "none"} className={`flex min-h-12 items-center gap-2 rounded-xl border-2 px-3 ${v.surplusReason === r ? "border-brand-strong bg-brand-soft" : "border-line"}`}>
                  <input type="radio" name="sr" checked={(v.surplusReason ?? "") === r} onChange={() => setV((x) => ({ ...x, surplusReason: r }))} className="h-5 w-5 accent-brand-strong" /> {r || "なし"}
                </label>
              ))}
            </div>
            {v.surplusReason === "その他" && <input aria-label="余剰理由（その他）" className={`${input} mt-2`} value={v.surplusOther ?? ""} onChange={set("surplusOther")} maxLength={50} placeholder="例：形が不ぞろい" />}
            <Err m={e.surplusReason} />
          </fieldset>
          <Field id="description" title="ひとこと（あれば）" hint="育て方や、おすすめの使い方など（500文字まで）" error={e.description}>
            <textarea id="description" rows={3} className={input} value={v.description ?? ""} onChange={set("description")} maxLength={500} />
          </Field>
          <Field id="photo" title="写真（あれば）" hint="野菜がよく見える写真を1枚" error={e.photo || photoError}>
            <input id="photo" type="file" accept="image/jpeg,image/png" className={input} onChange={async (ev) => {
              const f = ev.target.files?.[0];
              setPhotoError("");
              if (!f) return;
              try { const b = await shrink(f); setPhoto(b); setPreview(URL.createObjectURL(b)); } catch { setPhotoError("この写真は使えません。JPEG か PNG の写真を選んでください"); }
            }} />
          </Field>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview && <img src={preview} alt="選んだ写真" className="max-h-60 rounded-xl" />}
          <button type="button" className={btn.primary} onClick={() => setStep(1)} disabled={!v.name?.trim()}>次へ（量と値段）</button>
          {!v.name?.trim() && <p className="text-base text-sub">食材の名前を入れると、次へ進めます。</p>}
        </section>
      )}

      {step === 1 && (
        <section className="space-y-5">
          <Field id="totalKg" title="販売できる総量（kg）" hint="0.5kg から 1,000kg まで。例：30" error={e.totalKg}>
            <input id="totalKg" className={input} inputMode="decimal" value={v.totalKg ?? ""} onChange={set("totalKg")} />
          </Field>
          <Field id="pricePerKg" title="1kg あたりの値段（円）" hint="値段は農家さんが決めます。例：800" error={e.pricePerKg}>
            <input id="pricePerKg" className={input} inputMode="numeric" value={v.pricePerKg ?? ""} onChange={set("pricePerKg")} />
          </Field>
          <fieldset>
            <legend className={label}>一部だけの購入</legend>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {[["yes", "受け付ける（必要な量だけ）"], ["no", "受け付けない（全量のみ）"]].map(([k, t]) => (
                <label key={k} className={`flex min-h-12 items-center gap-2 rounded-xl border-2 px-3 ${(v.allowPartial || "yes") === k ? "border-brand-strong bg-brand-soft" : "border-line"}`}>
                  <input type="radio" name="ap" checked={(v.allowPartial || "yes") === k} onChange={() => setV((x) => ({ ...x, allowPartial: k }))} className="h-5 w-5 accent-brand-strong" /> {t}
                </label>
              ))}
            </div>
          </fieldset>
          {v.allowPartial !== "no" && (
            <>
              <fieldset>
                <legend className={label}>注文の単位</legend>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {UNIT_CHOICES.map((u) => (
                    <label key={u} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 ${v.unitGrams === String(u) ? "border-brand-strong bg-brand-soft" : "border-line"}`}>
                      <input type="radio" name="unit" checked={v.unitGrams === String(u)} onChange={() => setV((x) => ({ ...x, unitGrams: String(u) }))} className="h-5 w-5 accent-brand-strong" /> {formatKg(u)}ずつ
                    </label>
                  ))}
                </div>
                <Err m={e.unitGrams} />
              </fieldset>
              <Field id="minKg" title="いちばん少ない注文量（kg）" hint="例：1" error={e.minKg}>
                <input id="minKg" className={input} inputMode="decimal" value={v.minKg ?? ""} onChange={set("minKg")} />
              </Field>
            </>
          )}
          {grams && price && minG ? <p className="rounded-xl bg-brand-soft p-3">例：{formatKg(minG)} の注文なら商品代 {formatYen(subtotalYen(price, minG))}、全量（{formatKg(grams)}）なら {formatYen(subtotalYen(price, grams))}</p> : null}
          <button type="button" className={btn.primary} onClick={() => setStep(2)}>次へ（期限と受け渡し）</button>
          <button type="button" className={btn.plain} onClick={() => setStep(0)}>戻る</button>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-5">
          <Field id="availableFrom" title="納品できる最初の日" error={e.availableFrom}><input id="availableFrom" type="date" className={input} value={v.availableFrom ?? ""} onChange={set("availableFrom")} /></Field>
          <Field id="availableUntil" title="納品できる最後の日" error={e.availableUntil}><input id="availableUntil" type="date" className={input} value={v.availableUntil ?? ""} onChange={set("availableUntil")} /></Field>
          <Field id="acceptUntil" title="購入希望の受付期限" hint="この日時を過ぎると、新しい購入希望は届きません" error={e.acceptUntil}><input id="acceptUntil" type="datetime-local" className={input} value={v.acceptUntil ?? ""} onChange={set("acceptUntil")} /></Field>
          <Field id="replyUntil" title="回答期限" hint="受付期限より後で、納品に間に合う日時。これまでに回答のない注文は期限切れ（未成立）になり、仮押さえは解除されます" error={e.replyUntil}><input id="replyUntil" type="datetime-local" className={input} value={v.replyUntil ?? ""} onChange={set("replyUntil")} /></Field>
          <fieldset className="space-y-3">
            <legend className={label}>受け渡し条件（できるものを選ぶ）</legend>
            <label className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-line px-4"><input type="checkbox" checked={v.courier === "on"} onChange={check("courier")} className="h-6 w-6 accent-brand-strong" /> {METHOD_LABEL.courier}（注文ごとに梱包して送る）</label>
            {v.courier === "on" && (
              <div className="ml-2 space-y-3 border-l-4 border-brand pl-3">
                <p className="text-lg font-bold">送料（重さごと・1回の注文あたり）</p>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <input aria-label={`送料${i}段目の重さ（kg まで）`} className={input} inputMode="decimal" placeholder={i === 1 ? "例：5（kg まで）" : "kg まで（任意）"} value={v[`band${i}Kg`] ?? ""} onChange={set(`band${i}Kg`)} />
                    <input aria-label={`送料${i}段目の金額（円）`} className={input} inputMode="numeric" placeholder={i === 1 ? "例：900（円）" : "円（任意）"} value={v[`band${i}Fee`] ?? ""} onChange={set(`band${i}Fee`)} />
                  </div>
                ))}
                <Err m={e.courierFees} />
                <div className="grid grid-cols-2 gap-2">
                  {[["normal", "常温"], ["chilled", "冷蔵"]].map(([k, t]) => (
                    <label key={k} className={`flex min-h-12 items-center gap-2 rounded-xl border-2 px-3 ${(v.courierTemp || "normal") === k ? "border-brand-strong bg-brand-soft" : "border-line"}`}>
                      <input type="radio" name="temp" checked={(v.courierTemp || "normal") === k} onChange={() => setV((x) => ({ ...x, courierTemp: k }))} className="h-5 w-5 accent-brand-strong" /> {t}
                    </label>
                  ))}
                </div>
                <Field id="courierDays" title="発送から届くまでの目安（日）" error={e.courierDays}><input id="courierDays" className={input} inputMode="numeric" value={v.courierDays ?? ""} onChange={set("courierDays")} /></Field>
                <PrefChecks title="宅配発送できる府県" value={v.courierPrefs ?? ""} onChange={(x) => setV((y) => ({ ...y, courierPrefs: x }))} error={e.courierPrefs} />
              </div>
            )}
            <label className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-line px-4"><input type="checkbox" checked={v.delivery === "on"} onChange={check("delivery")} className="h-6 w-6 accent-brand-strong" /> {METHOD_LABEL.delivery}（自分で届ける）</label>
            {v.delivery === "on" && (
              <div className="ml-2 space-y-3 border-l-4 border-brand pl-3">
                <Field id="deliveryFeeYen" title="配達料（1回の注文あたり・円）" hint="無料なら 0" error={e.deliveryFeeYen}><input id="deliveryFeeYen" className={input} inputMode="numeric" value={v.deliveryFeeYen ?? ""} onChange={set("deliveryFeeYen")} /></Field>
                <Field id="deliveryMaxOrders" title="受けられる件数（任意）" hint="上限がなければ空のまま" error={e.deliveryMaxOrders}><input id="deliveryMaxOrders" className={input} inputMode="numeric" value={v.deliveryMaxOrders ?? ""} onChange={set("deliveryMaxOrders")} /></Field>
                <PrefChecks title="配達できる府県" value={v.deliveryPrefs ?? ""} onChange={(x) => setV((y) => ({ ...y, deliveryPrefs: x }))} error={e.deliveryPrefs} />
              </div>
            )}
            <label className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-line px-4"><input type="checkbox" checked={v.pickup === "on"} onChange={check("pickup")} className="h-6 w-6 accent-brand-strong" /> {METHOD_LABEL.pickup}（料金0円）</label>
            {v.pickup === "on" && (
              <div className="ml-2 space-y-2 border-l-4 border-brand pl-3">
                <p className="text-base">引き取りの場所（市区町村まで。くわしい場所は販売確定のあとにメッセージで伝えます）</p>
                <select aria-label="引き取りの場所（府県）" className={input} value={v.pickupPref ?? ""} onChange={(ev) => setV((x) => ({ ...x, pickupPref: ev.target.value, pickupCity: "" }))}>
                  <option value="">府県を選ぶ</option>
                  {PREFECTURES.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                </select>
                <select aria-label="引き取りの場所（市区町村）" className={input} value={v.pickupCity ?? ""} onChange={set("pickupCity")}>
                  <option value="">市区町村を選ぶ</option>
                  {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <Err m={e.pickupPlace} />
              </div>
            )}
            <Err m={e.methods} />
          </fieldset>
          <button type="button" className={btn.primary} onClick={() => setStep(3)}>次へ（確認）</button>
          <button type="button" className={btn.plain} onClick={() => setStep(1)}>戻る</button>
        </section>
      )}

      {step === 3 && (
        <form action={submit} className="space-y-5">
          <h2 className="text-xl font-bold">この内容で出品します</h2>
          {prev && (far(price, prev.pricePerKg) || far(grams, prev.totalGrams)) && (
            <Notice kind="warn" title="前回の出品と大きく違います。確認してください">
              {far(price, prev.pricePerKg) && <p>値段：前回は 1kg {formatYen(prev.pricePerKg)}、今回は 1kg {formatYen(price!)}</p>}
              {far(grams, prev.totalGrams) && <p>総量：前回は {formatKg(prev.totalGrams)}、今回は {formatKg(grams!)}</p>}
              <p>このままでよければ、そのまま出品できます。</p>
            </Notice>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="font-bold">食材</dt><dd>{v.name}{v.variety ? `（${v.variety}）` : ""}{v.surplusReason ? `・余剰理由：${v.surplusReason === "その他" ? v.surplusOther || "その他" : v.surplusReason}` : ""}</dd>
            <dt className="font-bold">写真</dt><dd>{photo ? "あり" : "なし"}</dd>
            <dt className="font-bold">総量</dt><dd>{grams ? formatKg(grams) : "未入力"}</dd>
            <dt className="font-bold">値段</dt><dd>{price ? `1kg ${formatYen(price)}` : "未入力"}</dd>
            <dt className="font-bold">注文</dt><dd>{v.allowPartial === "no" ? "全量のみ" : `${minG ? formatKg(minG) : "?"} から ${v.unitGrams ? formatKg(Number(v.unitGrams)) : "?"} ずつ`}</dd>
            <dt className="font-bold">納品</dt><dd>{v.availableFrom?.replaceAll("-", "/")} 〜 {v.availableUntil?.replaceAll("-", "/")}</dd>
            <dt className="font-bold">期限</dt><dd>受付 {v.acceptUntil?.replace("T", " ").replaceAll("-", "/")}／回答 {v.replyUntil?.replace("T", " ").replaceAll("-", "/")}</dd>
            <dt className="font-bold">受け渡し</dt>
            <dd>
              {v.courier === "on" && <>宅配発送（{[1, 2, 3].filter((i) => v[`band${i}Kg`]).map((i) => `${v[`band${i}Kg`]}kgまで${v[`band${i}Fee`]}円`).join("・")}・{v.courierTemp === "chilled" ? "冷蔵" : "常温"}・{(v.courierPrefs ?? "").split(",").filter(Boolean).map(prefName).join("、")}）<br /></>}
              {v.delivery === "on" && <>配達（配達料 {v.deliveryFeeYen}円・{(v.deliveryPrefs ?? "").split(",").filter(Boolean).map(prefName).join("、")}{v.deliveryMaxOrders ? `・${v.deliveryMaxOrders}件まで` : ""}）<br /></>}
              {v.pickup === "on" && <>引き取り（{prefName(v.pickupPref)} {v.pickupCity}）</>}
            </dd>
          </dl>
          <p className="text-base text-sub">出品すると、お店の候補に表示されます。購入希望が届いたら、「全件承認」か「注文ごとに承認・見送り」を選べます。全量がそろわなくても承認できます。</p>
          {Object.keys(e).length > 0 && <Notice kind="warn" title="直してほしいところがあります">前の手順の欄の近くに、理由を出しています。</Notice>}
          {state.problem && <Notice kind="warn" title={state.problem} />}
          <button className={btn.primary} disabled={pending}>{pending ? "出品しています…" : "出品する"}</button>
          <button type="button" className={btn.plain} onClick={() => setStep(2)} disabled={pending}>戻って直す</button>
        </form>
      )}
    </div>
  );
}
