"use client";

import { useActionState } from "react";
import { saveAccountAction, type AccountState } from "@/app/actions/account";
import { btn, Field, input } from "@/components/ui";
import { PlaceSelect } from "./place-select";

export function AccountForm({ role, name, pref, city, intro }: { role: string; name: string; pref: string; city: string; intro: string }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(saveAccountAction, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-5">
      <Field id="name" title={role === "producer" ? "農園の名前" : "お店の名前"} error={e.name}>
        <input id="name" name="name" defaultValue={name} className={input} />
      </Field>
      <PlaceSelect title={role === "producer" ? "畑のある場所" : "お店のある場所"} pref={pref} city={city} error={e.place} />
      {role === "producer" && (
        <Field id="intro" title="こだわり（お店に表示されます・300文字まで）" hint="例：農薬を減らして育てています" error={e.intro}>
          <textarea id="intro" name="intro" rows={4} maxLength={300} defaultValue={intro} className={input} />
        </Field>
      )}
      <button className={btn.primary} disabled={pending}>{pending ? "保存しています…" : "保存する"}</button>
    </form>
  );
}
