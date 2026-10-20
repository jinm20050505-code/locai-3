"use client";
import { useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import { clearDraft } from "@/lib/draft";

export function LogoutButton({ className }: { className: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true); setError("");
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          const r = await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
          if (!r.ok && r.status !== 401) throw Error();
          await sub.unsubscribe();
        }
      }
    } catch { setError("通知を停止できませんでした。通信を確認してもう一度押してください。"); setBusy(false); return; }
    clearDraft();
    await logoutAction();
  }
  return <form action={logout}><button className={className} disabled={busy}>{busy ? "ログアウト中…" : "ログアウト"}</button>{error && <p role="alert" className="text-sm text-warn">{error}</p>}</form>;
}
