"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PushSettings } from "./push-settings";

type Item = { id: string; title: string; body: string; sender: string; href: string; createdAt: string; readAt: string | null };
type Feed = { items: Item[]; next: string | null; unread: number };
export function NotificationList() {
  const [feed, setFeed] = useState<Feed>({ items: [], next: null, unread: 0 });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fetching = useRef(false);
  const load = useCallback(async (cursor?: string) => {
    if (fetching.current) return;
    fetching.current = true;
    await Promise.resolve();
    setBusy(true);
    try {
      const r = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cursor }), cache: "no-store" });
      if (!r.ok) throw Error(r.status === 401 ? "ログインし直してください。" : "通知を取得できませんでした。もう一度お試しください。");
      const data: Feed = await r.json();
      setFeed(old => ({ ...data, items: cursor ? [...old.items, ...data.items.filter(n => !old.items.some(o => o.id === n.id))] : data.items }));
      setLoaded(true); setError(""); window.dispatchEvent(new Event("locai-notifications"));
    } catch (e) { setError(e instanceof Error ? e.message : "通信を確認してください。"); }
    finally { fetching.current = false; setBusy(false); }
  }, []);
  useEffect(() => { const frame = requestAnimationFrame(() => void load()); const timer = setInterval(() => { if (!document.hidden) void load(); }, 30_000); return () => { cancelAnimationFrame(frame); clearInterval(timer); }; }, [load]);
  async function open(item: Item) {
    setError("");
    try {
      const r = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read: item.id }), cache: "no-store" });
      if (!r.ok) throw Error();
      window.location.assign(item.href);
    } catch { setError("開けませんでした。通信を確認して、もう一度押してください。"); }
  }
  return <main>
    <div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-bold text-brand-dark">通知</h1><Link href="/" className="flex min-h-12 items-center rounded-lg px-3 font-bold text-sub" aria-label="通知を閉じる">✕ 閉じる</Link></div>
    <PushSettings />
    <div className="my-4 flex items-center justify-between gap-2"><p aria-live="polite">未読 {feed.unread}件</p><button type="button" onClick={() => void load()} disabled={busy} className="min-h-12 rounded-lg border border-line px-4 font-bold text-brand-dark">{busy ? "確認中…" : "更新"}</button></div>
    {error && <p role="alert" className="rounded-lg bg-warn-soft p-3 text-warn">{error}</p>}
    {!loaded && !error && <p role="status">通知を確認しています…</p>}
    {loaded && feed.items.length === 0 && <p className="rounded-xl bg-brand-soft p-5">通知はまだありません。購入希望や仮押さえ、相手からの返信をここで確認できます。</p>}
    <ul className="divide-y divide-line">{feed.items.map(item => <li key={item.id} className={item.readAt ? "" : "bg-brand-soft"}>
      <button type="button" onClick={() => void open(item)} className="w-full px-4 py-5 text-left hover:bg-gray-50">
        <time dateTime={item.createdAt} className="block text-right text-sm text-sub">{new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt))}</time>
        <span className="mt-2 block font-bold">{!item.readAt && <span className="mr-2 text-brand-dark">● 未読</span>}{item.title}</span>
        <span className="mt-1 block">{item.body}</span><span className="mt-2 block text-sm text-sub">差出人：{item.sender}</span>
      </button>
    </li>)}</ul>
    {feed.next && <button type="button" disabled={busy} onClick={() => void load(feed.next!)} className="my-5 min-h-12 w-full rounded-lg border border-line px-4 font-bold">前の通知を見る</button>}
  </main>;
}
