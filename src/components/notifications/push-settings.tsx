"use client";
import { useEffect, useState } from "react";

export function PushSettings() {
  const [supported, setSupported] = useState(false);
  const [homeRequired, setHomeRequired] = useState(false);
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [publicKey, setPublicKey] = useState("");
  useEffect(() => {
    void (async () => {
    await Promise.resolve();
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const installed = matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const home = ios && !installed;
    setHomeRequired(home);
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (!ok || home) { setReady(true); return; }
      try {
        const config = await fetch("/api/push", { cache: "no-store" }).then(r => r.json());
        setPublicKey(config.publicKey ?? "");
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        const subscription = await registration.pushManager.getSubscription();
        if (subscription && Notification.permission === "granted") {
          // 端末と現在のログイン先の対応を確認。別アカウントへ勝手に移さない。
          const r = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
          setEnabled(r.ok);
        }
      } catch { setMessage("通知の設定を確認できませんでした。画面を開き直してください。"); }
      finally { setReady(true); }
    })();
  }, []);
  async function enable() {
    setBusy(true); setMessage("");
    try {
      // 許可の要求はこのボタンを押した瞬間だけ。読み込み時には出さない。
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setMessage(permission === "denied" ? "通知がオフになっています。スマホまたはブラウザの設定からLocAIの通知を許可してください。" : "許可すると通知を受け取れます。必要なときにもう一度押してください。"); return; }
      const reg = await navigator.serviceWorker.ready;
      const old = await reg.pushManager.getSubscription();
      // 明示的な操作時のみ端末の以前の購読を入れ替える。
      if (old) await old.unsubscribe();
      const normalized = publicKey.replace(/-/g, "+").replace(/_/g, "/");
      const key = Uint8Array.from(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)), c => c.charCodeAt(0));
      const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const response = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
      if (!response.ok) { await subscription.unsubscribe(); throw Error(); }
      setEnabled(true); setMessage("通知をオンにしました。アプリを閉じていてもお知らせが届きます。");
    } catch { setMessage("通知をオンにできませんでした。ログインと通信を確認して、もう一度お試しください。"); }
    finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true); setMessage("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const r = await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        if (!r.ok) throw Error();
        await sub.unsubscribe();
      }
      setEnabled(false); setMessage("この端末の通知をオフにしました。アプリ内の通知は引き続き確認できます。");
    } catch { setMessage("変更できませんでした。通信を確認して、もう一度押してください。"); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setMessage("");
    try {
      const r = await fetch("/api/push/test", { method: "POST" });
      if (!r.ok) throw Error();
      setMessage("テスト通知を送信しました。届かない場合は、スマホの通知設定をご確認ください。");
      window.dispatchEvent(new Event("locai-notifications"));
    } catch { setMessage("テスト通知を送れませんでした。通知の許可と通信を確認し、1分ほど待ってからお試しください。"); }
    finally { setBusy(false); }
  }
  return <section aria-label="スマホへの通知設定" className="mt-4 space-y-2 rounded-xl border border-line bg-white p-4">
    <h2 className="font-bold">スマホにも通知する</h2>
    <p className="text-sm">メッセージ・購入希望・仮押さえ・取引の変更をお知らせします。</p>
    {homeRequired ? <p className="rounded-lg bg-brand-soft p-3">iPhoneはSafariの共有ボタン →「ホーム画面に追加」→ 追加したLocAIを開き、ここで通知を許可してください。</p>
      : !ready ? <p className="text-sm">通知の設定を確認しています…</p>
      : !supported ? <p className="text-sm">このブラウザではスマホへの通知に対応していません。アプリ内の通知一覧は利用できます。</p>
      : !publicKey ? <p className="text-sm">スマホへの通知は準備中です。アプリ内の通知一覧は利用できます。</p>
      : <button type="button" disabled={busy} onClick={() => void (enabled ? disable() : enable())} className={`min-h-12 w-full rounded-xl px-4 py-3 font-bold ${enabled ? "border border-line text-brand-dark" : "bg-brand-strong text-white"}`}>{busy ? "設定しています…" : enabled ? "この端末の通知をオフにする" : "通知を許可する"}</button>}
    {enabled && <button type="button" disabled={busy} onClick={() => void test()} className="min-h-12 w-full rounded-xl border border-line px-4 py-3 font-bold text-brand-dark">テスト通知を送る</button>}
    <p role="status" className="text-sm text-brand-dark">{message}</p>
    <p className="text-sm text-sub">ロック画面には通知の到着だけを表示します。端末の設定や通信により届く時間が変わります。期限切れはアプリを開いたとき、または1日1回の確認後にお知らせします。</p>
  </section>;
}
