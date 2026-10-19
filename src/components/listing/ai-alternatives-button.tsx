"use client";

import { useState, useTransition } from "react";
import { aiAlternativesAction } from "@/app/actions/ai";
import { btn } from "@/components/ui";

export function AiAlternativesButton({ wanted, candidates }: { wanted: string; candidates: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<Awaited<ReturnType<typeof aiAlternativesAction>> | null>(null);
  return (
    <div className="space-y-2">
      {!res && (
        <button type="button" className={btn.secondary} disabled={pending} onClick={() => start(async () => setRes(await aiAlternativesAction(wanted, candidates.map((c) => c.id))))}>
          {pending ? "AI に聞いています…" : "AI に、代わりに使えそうな理由を聞く"}
        </button>
      )}
      {res && !res.ok && <p role="status" className="text-base text-sub">{res.message}</p>}
      {res?.ok && (
        <div className="rounded-xl border-2 border-line p-3">
          <p className="text-base font-bold">AI の説明（参考です。決めるのはお店です）</p>
          <ul className="mt-1 space-y-1 text-base">{res.items.map((i) => <li key={i.id}><b>{candidates.find((c) => c.id === i.id)?.name}</b>：{i.reason}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
