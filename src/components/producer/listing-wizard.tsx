"use client";

// 出品の手順：① 野菜と写真 → ② 量と値段 → ③ 受け取り方法と期間 → ④ 確認して出品。
// 入力は手順を行き来しても残る。サーバーのエラーは、その欄がある手順に戻って欄の近くに出す
import { useActionState, useEffect, useRef, useState } from "react";
import { createListingAction, type ListingState } from "@/app/actions/listings";
import { btn, Field, input, label, Notice } from "@/components/ui";
import { formatKg, formatYen, kgTextToGrams, subtotalYen, yenTextToInt } from "@/lib/money";
import { REPLY_HOURS, UNIT_CHOICES } from "@/lib/listing-rules";
import { PREFECTURES, prefName } from "@/lib/regions";

export type WizardValues = Record<string, string> & { deliveryPrefs?: string };
const STEP_OF: Record<string, number> = { name: 0, variety: 0, description: 0, photo: 0, totalKg: 1, pricePerKg: 1, minKg: 1, unitGrams: 1, availableFrom: 2, availableUntil: 2, acceptUntil: 2, replyHours: 2, methods: 2, pickupPlace: 2, deliveryFeeYen: 2, deliveryPrefs: 2 };
const STEPS = ["野菜と写真", "量と値段", "受け取り方法と期間", "確認"];

/** 写真を長い辺 1280px の JPEG に縮めて、送る量を小さくする */
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok, ng) => c.toBlob((b) => (b ? ok(b) : ng(new Error("shrink"))), "image/jpeg", 0.85));
}

export function ListingWizard({ initial, defaults }: { initial: WizardValues; defaults: { pref: string; city: string; cities: Record<string, readonly string[]> } }) {
  const [v, setV] = useState<WizardValues>(initial);
  const [prefs, setPrefs] = useState<string[]>(initial.deliveryPrefs ? initial.deliveryPrefs.split(",") : defaults.pref ? [defaults.pref] : []);
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [state, action, pending] = useActionState<ListingState, FormData>(createListingAction, {});
  const e = state.errors ?? {};
  const top = useRef<HTMLDivElement>(null);
  const set = (k: string) => (ev: { target: { value: string } }) => setV((x) => ({ ...x, [k]: ev.target.value }));
  const check = (k: string) => (ev: { target: { checked: boolean } }) => setV((x) => ({ ...x, [k]: ev.target.checked ? "on" : "" }));

  // サーバーのエラーが届いたら、エラーのある いちばん前の手順に戻る（届いたときに1回だけ）
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    const keys = Object.keys(state.errors ?? {});
    if (keys.length) setStep(Math.min(...keys.map((k) => STEP_OF[k] ?? 0)));
  }
  useEffect(() => {
    top.current?.scrollIntoView({ block: "start" });
  }, [step]);

  const go = (n: number) => setStep(n);
  const grams = kgTextToGrams(v.totalKg ?? "");
  const price = yenTextToInt(v.pricePerKg ?? "");
  const minG = kgTextToGrams(v.minKg ?? "");
  const cities = defaults.cities[v.pickupPref ?? ""] ?? [];

  const submit = (fd: FormData) => {
    for (const [k, val] of Object.entries(v)) if (k !== "deliveryPrefs") fd.set(k, val);
    fd.delete("deliveryPrefs");
    prefs.forEach((p) => fd.append("deliveryPrefs", p));
    if (photo) fd.set("photo", new File([photo], "photo.jpg", { type: "image/jpeg" }));
    return action(fd);
  };

  return (
    <div ref={top} className="space-y-5 scroll-mt-4">
      <ol className="flex flex-wrap gap-2" aria-label="手順">
        {STEPS.map((s, i) => (
          <li key={s} className={`rounded-lg px-3 py-1 text-base font-bold ${i === step ? "bg-brand-strong text-white" : i < step ? "bg-brand-soft text-brand-dark" : "bg-gray-100 text-sub"}`} aria-current={i === step ? "step" : undefined}>
            {i + 1}. {s}{i < step ? "（済）" : ""}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="space-y-5">
          <Field id="name" title="野菜の名前（必ず入れる）" hint="例：なす、万願寺唐辛子" error={e.name}>
            <input id="name" className={input} value={v.name ?? ""} onChange={set("name")} maxLength={30} />
          </Field>
          <Field id="variety" title="品種（あれば）" hint="例：賀茂茄子" error={e.variety}>
            <input id="variety" className={input} value={v.variety ?? ""} onChange={set("variety")} maxLength={30} />
          </Field>
          <Field id="description" title="ひとこと（あれば）" hint="育て方や、おすすめの使い方など（300文字まで）" error={e.description}>
            <textarea id="description" rows={3} className={input} value={v.description ?? ""} onChange={set("description")} maxLength={300} />
          </Field>
          <Field id="photo" title="写真（あれば）" hint="野菜がよく見える写真を1枚" error={e.photo || photoError}>
            <input
              id="photo" type="file" accept="image/jpeg,image/png" className={input}
              onChange={async (ev) => {
                const f = ev.target.files?.[0];
                setPhotoError("");
                if (!f) return;
                try {
                  const b = await shrink(f);
                  setPhoto(b);
                  setPreview(URL.createObjectURL(b));
                } catch {
                  setPhotoError("この写真は使えません。JPEG か PNG の写真を選んでください");
                }
              }}
            />
          </Field>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview && <img src={preview} alt="選んだ写真" className="max-h-60 rounded-xl" />}
          <button type="button" className={btn.primary} onClick={() => go(1)} disabled={!v.name?.trim()}>次へ（量と値段）</button>
          {!v.name?.trim() && <p className="text-base text-sub">野菜の名前を入れると、次へ進めます。</p>}
        </section>
      )}

      {step === 1 && (
        <section className="space-y-5">
          <Field id="totalKg" title="出品する量（kg）" hint="例：30" error={e.totalKg}>
            <input id="totalKg" className={input} inputMode="decimal" value={v.totalKg ?? ""} onChange={set("totalKg")} />
          </Field>
          <Field id="pricePerKg" title="1kg あたりの値段（円）" hint="値段は農家さんが決めます。例：800" error={e.pricePerKg}>
            <input id="pricePerKg" className={input} inputMode="numeric" value={v.pricePerKg ?? ""} onChange={set("pricePerKg")} />
          </Field>
          <fieldset>
            <legend className={label}>注文の単位</legend>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {UNIT_CHOICES.map((u) => (
                <label key={u} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 ${v.unitGrams === String(u) ? "border-brand-strong bg-brand-soft" : "border-line"}`}>
                  <input type="radio" name="unit" checked={v.unitGrams === String(u)} onChange={() => setV((x) => ({ ...x, unitGrams: String(u) }))} className="h-5 w-5 accent-brand-strong" />
                  {formatKg(u)}ずつ
                </label>
              ))}
            </div>
            {e.unitGrams && <p role="alert" className="mt-1 rounded-lg bg-warn-soft px-3 py-2 text-base font-bold text-warn">⚠ {e.unitGrams}</p>}
          </fieldset>
          <Field id="minKg" title="いちばん少ない注文量（kg）" hint="例：1" error={e.minKg}>
            <input id="minKg" className={input} inputMode="decimal" value={v.minKg ?? ""} onChange={set("minKg")} />
          </Field>
          {grams && price && minG ? (
            <p className="rounded-xl bg-brand-soft p-3">例：{formatKg(minG)} の注文なら {formatYen(subtotalYen(price, minG))}、全部（{formatKg(grams)}）なら {formatYen(subtotalYen(price, grams))}</p>
          ) : null}
          <button type="button" className={btn.primary} onClick={() => go(2)}>次へ（受け取り方法と期間）</button>
          <button type="button" className={btn.plain} onClick={() => go(0)}>戻る</button>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-5">
          <Field id="availableFrom" title="受け渡しできる最初の日" error={e.availableFrom}>
            <input id="availableFrom" type="date" className={input} value={v.availableFrom ?? ""} onChange={set("availableFrom")} />
          </Field>
          <Field id="availableUntil" title="受け渡しできる最後の日" error={e.availableUntil}>
            <input id="availableUntil" type="date" className={input} value={v.availableUntil ?? ""} onChange={set("availableUntil")} />
          </Field>
          <Field id="acceptUntil" title="購入希望の受付の締め切り" hint="この日時を過ぎると、新しい購入希望は届きません" error={e.acceptUntil}>
            <input id="acceptUntil" type="datetime-local" className={input} value={v.acceptUntil ?? ""} onChange={set("acceptUntil")} />
          </Field>
          <fieldset>
            <legend className={label}>購入希望に返事をするまでの時間</legend>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {REPLY_HOURS.map((h) => (
                <label key={h} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 ${v.replyHours === String(h) ? "border-brand-strong bg-brand-soft" : "border-line"}`}>
                  <input type="radio" name="reply" checked={v.replyHours === String(h)} onChange={() => setV((x) => ({ ...x, replyHours: String(h) }))} className="h-5 w-5 accent-brand-strong" />
                  {h}時間
                </label>
              ))}
            </div>
            <p className="mt-1 text-base text-sub">この時間を過ぎると、返事のない購入希望は「期限切れ」になり、取り置きは戻ります。</p>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className={label}>受け取り方法（1つ以上）</legend>
            <label className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-line px-4">
              <input type="checkbox" checked={v.pickup === "on"} onChange={check("pickup")} className="h-6 w-6 accent-brand-strong" /> お店が畑へ引き取りに来る（料金0円）
            </label>
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
                {e.pickupPlace && <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-base font-bold text-warn">⚠ {e.pickupPlace}</p>}
              </div>
            )}
            <label className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-line px-4">
              <input type="checkbox" checked={v.delivery === "on"} onChange={check("delivery")} className="h-6 w-6 accent-brand-strong" /> 農家さんがお店に届ける（送料あり）
            </label>
            {v.delivery === "on" && (
              <div className="ml-2 space-y-3 border-l-4 border-brand pl-3">
                <Field id="deliveryFeeYen" title="送料（1回の注文あたり・円）" hint="無料なら 0" error={e.deliveryFeeYen}>
                  <input id="deliveryFeeYen" className={input} inputMode="numeric" value={v.deliveryFeeYen ?? ""} onChange={set("deliveryFeeYen")} />
                </Field>
                <fieldset>
                  <legend className="text-lg font-bold">お届けできる府県</legend>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {PREFECTURES.map((p) => (
                      <label key={p.code} className="flex min-h-12 items-center gap-2 rounded-xl border-2 border-line px-3">
                        <input type="checkbox" checked={prefs.includes(p.code)} onChange={(ev) => setPrefs((x) => (ev.target.checked ? [...x, p.code] : x.filter((c) => c !== p.code)))} className="h-6 w-6 accent-brand-strong" /> {p.name}
                      </label>
                    ))}
                  </div>
                  {e.deliveryPrefs && <p role="alert" className="mt-1 rounded-lg bg-warn-soft px-3 py-2 text-base font-bold text-warn">⚠ {e.deliveryPrefs}</p>}
                </fieldset>
              </div>
            )}
            {e.methods && <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-base font-bold text-warn">⚠ {e.methods}</p>}
          </fieldset>
          <button type="button" className={btn.primary} onClick={() => go(3)}>次へ（確認）</button>
          <button type="button" className={btn.plain} onClick={() => go(1)}>戻る</button>
        </section>
      )}

      {step === 3 && (
        <form action={submit} className="space-y-5">
          <h2 className="text-xl font-bold">この内容で出品します</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="font-bold">野菜</dt><dd>{v.name}{v.variety ? `（${v.variety}）` : ""}</dd>
            <dt className="font-bold">写真</dt><dd>{photo ? "あり" : "なし"}</dd>
            <dt className="font-bold">量</dt><dd>{grams ? formatKg(grams) : "未入力"}</dd>
            <dt className="font-bold">値段</dt><dd>{price ? `1kg ${formatYen(price)}` : "未入力"}</dd>
            <dt className="font-bold">注文</dt><dd>{minG ? formatKg(minG) : "?"} から {v.unitGrams ? formatKg(Number(v.unitGrams)) : "?"} ずつ</dd>
            <dt className="font-bold">受け渡し</dt><dd>{v.availableFrom?.replaceAll("-", "/")} 〜 {v.availableUntil?.replaceAll("-", "/")}</dd>
            <dt className="font-bold">締め切り</dt><dd>{v.acceptUntil?.replace("T", " ").replaceAll("-", "/")}</dd>
            <dt className="font-bold">返事まで</dt><dd>{v.replyHours}時間</dd>
            <dt className="font-bold">受け取り</dt>
            <dd>
              {v.pickup === "on" && <>引き取り（{prefName(v.pickupPref)} {v.pickupCity}）<br /></>}
              {v.delivery === "on" && <>お届け（送料 {v.deliveryFeeYen}円・{prefs.map(prefName).join("、")}）</>}
            </dd>
          </dl>
          <p className="text-base text-sub">出品すると、お店が一覧で見られるようになります。購入希望が届いたら、注文ごとに「承認」「量を変えて提案」「見送り」を選べます。</p>
          {Object.keys(e).length > 0 && <Notice kind="warn" title="直してほしいところがあります">前の手順の欄の近くに、理由を出しています。</Notice>}
          {state.problem && <Notice kind="warn" title={state.problem} />}
          <button className={btn.primary} disabled={pending}>{pending ? "出品しています…" : "出品する"}</button>
          <button type="button" className={btn.plain} onClick={() => go(2)} disabled={pending}>戻って直す</button>
        </form>
      )}
    </div>
  );
}
