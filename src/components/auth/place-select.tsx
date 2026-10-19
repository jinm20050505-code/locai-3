"use client";

// 府県 → 市区町村 の順に選ぶ（府県を変えると市区町村の選択肢が変わる）
import { useState } from "react";
import { input, label } from "@/components/ui";
import { PREFECTURES } from "@/lib/regions";

export function PlaceSelect({ prefix = "", pref: p0 = "", city: c0 = "", error, title }: { prefix?: string; pref?: string; city?: string; error?: string; title: string }) {
  const [pref, setPref] = useState(p0);
  const [city, setCity] = useState(c0);
  const cities = PREFECTURES.find((p) => p.code === pref)?.cities ?? [];
  return (
    <fieldset className="space-y-2">
      <legend className={label}>{title}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <select aria-label={`${title}（府県）`} name={`${prefix}prefecture`} className={input} value={pref} onChange={(e) => { setPref(e.target.value); setCity(""); }}>
          <option value="">府県を選ぶ</option>
          {PREFECTURES.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
        <select aria-label={`${title}（市区町村）`} name={`${prefix}city`} className={input} value={city} onChange={(e) => setCity(e.target.value)} disabled={!pref}>
          <option value="">市区町村を選ぶ</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {error && <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-base font-bold text-warn">⚠ {error}</p>}
    </fieldset>
  );
}
