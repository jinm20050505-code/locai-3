"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
export function Bell() {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const update = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", cache: "no-store", signal: controller.signal });
        if (response.status === 401) { setUnread(0); return; }
        if (response.ok) setUnread((await response.json()).unread);
      } catch { /* 次の更新で再試行。画面の入力や操作は妨げない。 */ }
    };
    void update();
    const timer = setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("locai-notifications", update);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", update); window.removeEventListener("locai-notifications", update); };
  }, []);
  return <Link href="/notifications" prefetch={false} aria-label={unread ? `通知、未読${unread}件` : "通知"} className="relative flex min-h-12 min-w-12 shrink-0 flex-col items-center justify-center rounded-xl px-2 text-brand-dark hover:bg-brand-soft">
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a2 2 0 0 0-2 2v.3A6 6 0 0 0 6 10v4l-2 3v1h16v-1l-2-3v-4a6 6 0 0 0-4-5.7V4a2 2 0 0 0-2-2Zm-2 18a2 2 0 0 0 4 0Z"/></svg>
    <span className="text-sm font-bold">通知</span>
    {unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-warn px-1.5 text-sm font-bold text-white" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
  </Link>;
}
