"use client";

import { useActionState } from "react";
import { saveAccountAction, type AccountState } from "@/app/actions/account";
import { btn, Field, input } from "@/components/ui";
import { PlaceSelect } from "./place-select";

export function AccountForm({ role, name, pref, city, intro, items, hasPhoto, userId }: { role: string; name: string; pref: string; city: string; intro: string; items: string; hasPhoto: boolean; userId: string }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(saveAccountAction, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-5">
      <Field id="name" title={role === "producer" ? "農園の名前" : "お店の名前"} error={e.name}>
        <input id="name" name="name" defaultValue={name} className={input} />
      </Field>
      <PlaceSelect title={role === "producer" ? "畑のある場所" : "お店のある場所"} pref={pref} city={city} error={e.place} />
      {role === "producer" && (
        <>
          <Field id="photo" title="写真（お店に表示されます）" hint="顔や畑の写真を1枚（JPEG か PNG）" error={e.photo}>
            <input id="photo" name="photo" type="file" accept="image/jpeg,image/png" className={input} />
          </Field>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {hasPhoto && <img src={`/api/photos/user/${userId}`} alt="いまの写真" className="h-24 w-24 rounded-full object-cover" />}
          <Field id="items" title="栽培している品目（お店に表示されます）" hint="例：賀茂茄子、九条ねぎ" error={e.items}>
            <input id="items" name="items" defaultValue={items} maxLength={200} className={input} />
          </Field>
          <Field id="intro" title="こだわり（お店に表示されます・500文字まで）" hint="例：農薬を減らして育てています" error={e.intro}>
            <textarea id="intro" name="intro" rows={4} maxLength={500} defaultValue={intro} className={input} />
          </Field>
        </>
      )}
      <button className={btn.primary} disabled={pending}>{pending ? "保存しています…" : "保存する"}</button>
    </form>
  );
}
