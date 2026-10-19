"use client";

// 注文への操作のボタン（1回だけ送る）。エラーはボタンの近くに出す
import { useActionState, useState } from "react";
import { acceptChangeAction, approveAction, cancelAction, declineAction, messageAction, proposeAction, type ActionState } from "@/app/actions/orders";
import { btn, input, label } from "@/components/ui";

type Act = (s: ActionState, fd: FormData) => Promise<ActionState>;
const ACTS: Record<string, Act> = { approve: approveAction, decline: declineAction, accept: acceptChangeAction, cancel: cancelAction };

const Problems = ({ s }: { s: ActionState }) => (s.problems?.length ? <div role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-base font-bold text-warn">{s.problems.map((p) => <p key={p}>⚠ {p}</p>)}</div> : null);

export function OrderButton({ orderId, act, text, kind = "primary", confirmText }: { orderId: string; act: keyof typeof ACTS; text: string; kind?: keyof typeof btn; confirmText?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(ACTS[act], {});
  return (
    <form action={action} onSubmit={(e) => { if (confirmText && !confirm(confirmText)) e.preventDefault(); }} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <button className={btn[kind]} disabled={pending}>{pending ? "送っています…" : text}</button>
      <Problems s={state} />
    </form>
  );
}

export function ProposeForm({ orderId, currentKg, hint }: { orderId: string; currentKg: string; hint: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(proposeAction, {});
  const [kg, setKg] = useState(currentKg);
  const [note, setNote] = useState("");
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <div>
        <label htmlFor="kg" className={label}>提案する数量（kg）</label>
        <p className="text-base text-sub">{hint}</p>
        <input id="kg" name="kg" className={input} inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} />
      </div>
      <div>
        <label htmlFor="note" className={label}>ひとこと（あれば・200文字まで）</label>
        <input id="note" name="note" className={input} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：今週は半分なら用意できます" />
      </div>
      <button className={btn.secondary} disabled={pending}>{pending ? "送っています…" : "この数量で提案する"}</button>
      <Problems s={state} />
    </form>
  );
}

export function MessageForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(messageAction, {});
  const [body, setBody] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="requestId" value={requestId} />
      <label htmlFor="body" className={label}>メッセージを書く（500文字まで）</label>
      <textarea id="body" name="body" rows={3} maxLength={500} className={input} value={body} onChange={(e) => setBody(e.target.value)} />
      <button className={btn.secondary} disabled={pending || !body.trim()}>{pending ? "送っています…" : "メッセージを送る"}</button>
      <Problems s={state} />
    </form>
  );
}
