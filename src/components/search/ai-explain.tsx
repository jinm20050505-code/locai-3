"use client";

// AI による候補の説明（2）と、代替野菜の用途の提案（3）。参考として出し、候補や並び順は変えない
import { useState, useTransition } from "react";
import { aiExplainAction } from "@/app/actions/ai";
import { btn } from "@/components/ui";

export function AiExplain({ cond, candidates }: { cond: { item: string; usage: string; kg: string; budget: string; date: string; alternative: boolean }; candidates: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<Awaited<ReturnType<typeof aiExplainAction>> | null>(null);
  const title = cond.alternative ? "AI に、代わりの野菜の使い方を聞く" : "AI に、条件に合う理由を聞く";
  return (
    <div className="space-y-2">
      {!res && <button type="button" className={btn.secondary} disabled={pending} onClick={() => start(async () => setRes(await aiExplainAction(cond, candidates.map((c) => c.id))))}>{pending ? "AI に聞いています…" : title}</button>}
      {res && !res.ok && <p role="status" className="text-base text-sub">{res.message}</p>}
      {res?.ok && (
        <div className="rounded-xl border-2 border-line p-3">
          <p className="text-base font-bold">AI の説明（参考です。分量は目安です。決めるのはお店です）</p>
          <ul className="mt-1 space-y-1 text-base">{res.data.map((i) => <li key={i.id}><b>{candidates.find((c) => c.id === i.id)?.name}</b>：{i.説明}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
