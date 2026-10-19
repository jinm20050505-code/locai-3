"use client";

// 登録とログインのフォーム。エラーは欄の近くに出し、入力した内容は残す
import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction, signupAction, type AuthState } from "@/app/actions/auth";
import { btn, Field, input, label, Notice } from "@/components/ui";
import { PlaceSelect } from "./place-select";

export function SignupForm({ next, initialRole }: { next: string; initialRole: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signupAction, {});
  const v = state.values ?? {};
  const e = state.errors ?? {};
  const [role, setRole] = useState(v.role ?? initialRole);
  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="next" value={next} />
      <fieldset className="space-y-2">
        <legend className={label}>どちらで使いますか</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["buyer", "お店（飲食店）", "野菜を探して、購入希望を送ります"],
            ["producer", "農家（生産者）", "野菜を出品して、売る相手を決めます"],
          ].map(([k, t, d]) => (
            <label key={k} className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border-2 p-4 ${role === k ? "border-brand-strong bg-brand-soft" : "border-line"}`}>
              <input type="radio" name="role" value={k} checked={role === k} onChange={() => setRole(k)} className="mt-1 h-6 w-6 accent-brand-strong" />
              <span><b className="block text-lg">{t}</b><span className="text-base text-sub">{d}</span></span>
            </label>
          ))}
        </div>
        {e.role && <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-base font-bold text-warn">⚠ {e.role}</p>}
      </fieldset>
      <Field id="name" title={role === "producer" ? "農園の名前" : "お店の名前"} hint="相手に表示されます" error={e.name}>
        <input id="name" name="name" defaultValue={v.name} className={input} autoComplete="organization" />
      </Field>
      <PlaceSelect title={role === "producer" ? "畑のある場所" : "お店のある場所"} pref={v.prefecture} city={v.city} error={e.place} />
      <p className="-mt-4 text-base text-sub">市区町村まで。詳しい住所は入れません。</p>
      <Field id="email" title="メールアドレス" hint="ログインに使います" error={e.email}>
        <input id="email" name="email" type="email" defaultValue={v.email} className={input} autoComplete="email" inputMode="email" />
      </Field>
      <Field id="password" title="パスワード（8文字以上）" error={e.password}>
        <input id="password" name="password" type="password" className={input} autoComplete="new-password" />
      </Field>
      <button className={btn.primary} disabled={pending}>{pending ? "登録しています…" : "登録する"}</button>
      <p className="text-center">登録済みの方は <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-bold text-brand-dark underline">ログイン</Link></p>
    </form>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(loginAction, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="next" value={next} />
      {state.errors?.form && <Notice kind="warn" title={state.errors.form} />}
      <Field id="email" title="メールアドレス">
        <input id="email" name="email" type="email" defaultValue={v.email} className={input} autoComplete="email" inputMode="email" />
      </Field>
      <Field id="password" title="パスワード">
        <input id="password" name="password" type="password" className={input} autoComplete="current-password" />
      </Field>
      <button className={btn.primary} disabled={pending}>{pending ? "確認しています…" : "ログインする"}</button>
      <p className="text-center">はじめての方は <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-bold text-brand-dark underline">登録する</Link></p>
    </form>
  );
}
