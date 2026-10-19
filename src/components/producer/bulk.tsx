"use client";

// 全件承認（確認してから）と、AI による注文の要約（参考）
import { useActionState, useState, useTransition } from "react";
import { aiSummaryAction } from "@/app/actions/ai";
import { approveAllAction, type BulkState } from "@/app/actions/orders";
import { btn } from "@/components/ui";

export function ApproveAllButton({ listingId, count }: { listingId: string; count: number }) {
  const [state, action, pending] = useActionState<BulkState, FormData>(approveAllAction, {});
  return (
    <div className="space-y-2">
      {count > 0 && (
        <form action={action} onSubmit={(e) => { if (!confirm(`回答待ちの ${count} 件を、届いた順にすべて承認します。よろしいですか？（1件ずつ在庫と配送を確かめます）`)) e.preventDefault(); }}>
          <input type="hidden" name="listingId" value={listingId} />
          <button className={btn.primary} disabled={pending}>{pending ? "承認しています…" : `全件承認する（${count}件）`}</button>
        </form>
      )}
      {state.problem && <p role="alert" className="text-base font-bold text-warn">⚠ {state.problem}</p>}
      {state.results && (
        <ul role="status" className="rounded-xl border-2 border-line p-3 text-base">
          {state.results.map((r, i) => <li key={i}>{r.ok ? "✓ 承認しました" : "× 承認できませんでした"}：{r.buyer}{r.problem ? `（${r.problem}）` : ""}</li>)}
        </ul>
      )}
    </div>
  );
}

export function AiSummary({ listingId }: { listingId: string }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<Awaited<ReturnType<typeof aiSummaryAction>> | null>(null);
  return (
    <div className="space-y-2">
      {!res && <button type="button" className={btn.secondary} disabled={pending} onClick={() => start(async () => setRes(await aiSummaryAction(listingId)))}>{pending ? "AI がまとめています…" : "AI に注文をまとめてもらう"}</button>}
      {res && !res.ok && <p role="status" className="text-base text-sub">{res.message}</p>}
      {res?.ok && (
        <div className="rounded-xl border-2 border-line p-3 text-base">
          <p className="font-bold">AI のまとめ（参考です。承認するかは農家さんが決めます）</p>
          <p>{res.data.要約}</p>
          {res.data.確認が必要な点.length > 0 && <ul className="mt-1">{res.data.確認が必要な点.map((x) => <li key={x}>・{x}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
