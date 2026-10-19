// 画面の共通部品。ボタンは高さ48px以上、文字を必ず添える。主な操作は緑のボタン1つ
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const base = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 text-lg font-bold";
export const btn = {
  primary: `${base} w-full bg-brand-strong text-white hover:bg-brand-dark disabled:bg-gray-400`,
  secondary: `${base} w-full border-2 border-brand-strong bg-white text-brand-dark hover:bg-brand-soft disabled:border-gray-300 disabled:text-gray-500`,
  plain: `${base} w-full border-2 border-line bg-white text-ink hover:bg-gray-50`,
  danger: `${base} w-full border-2 border-warn bg-white text-warn hover:bg-warn-soft`,
};

export function LinkButton({ kind = "primary", className = "", ...p }: ComponentProps<typeof Link> & { kind?: keyof typeof btn }) {
  return <Link {...p} className={`${btn[kind]} ${className}`} />;
}

export const input = "block w-full min-h-12 rounded-xl border-2 border-line bg-white px-4 py-2 text-lg focus:border-brand-strong";
export const label = "block text-lg font-bold";

/** 入力欄。エラーは欄のすぐ下に、理由と直し方を出す */
export function Field({ id, title, hint, error, children }: { id: string; title: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className={label}>{title}</label>
      {hint && <p id={`${id}-hint`} className="text-base text-sub">{hint}</p>}
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-base font-bold text-warn">
          ⚠ {error}
        </p>
      )}
    </div>
  );
}

/** お知らせ（色だけに頼らず、見出しの文字で種類を伝える） */
export function Notice({ kind = "info", title, children }: { kind?: "info" | "ok" | "warn"; title: string; children?: ReactNode }) {
  const style = kind === "ok" ? "border-brand bg-brand-soft" : kind === "warn" ? "border-warn bg-warn-soft" : "border-note bg-note-soft";
  return (
    <div role={kind === "warn" ? "alert" : "status"} className={`rounded-xl border-2 p-4 ${style}`}>
      <p className="text-lg font-bold">{title}</p>
      {children && <div className="mt-1 text-base">{children}</div>}
    </div>
  );
}

/** 架空のデータの印 */
export const DemoBadge = () => <span className="inline-block rounded-md border border-note bg-note-soft px-2 py-0.5 text-sm font-bold text-note">架空・実際の販売なし</span>;

/** 注文の状態の札（文字で状態を出す） */
export function StatusTag({ status, label }: { status: string; label: string }) {
  const style = status === "confirmed" ? "bg-brand-strong text-white" : status === "pending" || status === "changeRequested" ? "bg-note-soft text-note border border-note" : "bg-gray-100 text-sub border border-line";
  return <span className={`inline-block rounded-lg px-3 py-1 text-base font-bold ${style}`}>{label}</span>;
}

export const card = "rounded-2xl border-2 border-line bg-white p-4";
