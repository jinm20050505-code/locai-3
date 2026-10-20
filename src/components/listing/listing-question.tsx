"use client";

// 出品に紐づく相談（注文の前に農家さんへ質問する）。この店と農家さんの2人だけが読める
import { useActionState, useState } from "react";
import { threadAction, type ThreadState } from "@/app/actions/threads";
import { btn, input, label } from "@/components/ui";

type Msg = { id: string; body: string; at: string; mine: boolean };

export function ThreadForm({ listingId, buyerId, title }: { listingId: string; buyerId: string; title: string }) {
  const [state, action, pending] = useActionState<ThreadState, FormData>(threadAction, {});
  const [body, setBody] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  // 送れたら、次の送信のために入力欄と番号を新しくする
  const [seen, setSeen] = useState(state.sent);
  if (state.sent !== seen) {
    setSeen(state.sent);
    setBody("");
    setRequestId(crypto.randomUUID());
  }
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="buyerId" value={buyerId} />
      <input type="hidden" name="requestId" value={requestId} />
      <label htmlFor={`q-${buyerId}`} className={label}>{title}</label>
      <textarea id={`q-${buyerId}`} name="body" rows={2} maxLength={500} className={input} value={body} onChange={(e) => setBody(e.target.value)} />
      <button className={btn.secondary} disabled={pending || !body.trim()}>{pending ? "送っています…" : "送る"}</button>
      {state.problem && <p role="alert" className="text-base font-bold text-warn">⚠ {state.problem}</p>}
    </form>
  );
}

export function MessageList({ messages, otherName }: { messages: Msg[]; otherName: string }) {
  if (messages.length === 0) return <p className="text-base">まだ相談はありません。</p>;
  return (
    <ol className="space-y-2">
      {messages.map((m) => (
        <li key={m.id} className={`rounded-xl p-3 ${m.mine ? "ml-8 bg-brand-soft" : "mr-8 border-2 border-line"}`}>
          <p className="text-base text-sub">{m.mine ? "自分" : otherName}・{m.at}</p>
          <p className="whitespace-pre-wrap break-words">{m.body}</p>
        </li>
      ))}
    </ol>
  );
}

export function ListingQuestion({ listingId, buyerId, messages, producerName }: { listingId: string; buyerId: string; messages: Msg[]; producerName: string }) {
  return (
    <details id="consultation" open={messages.length > 0} className="rounded-xl border-2 border-line p-3">
      <summary className="min-h-12 cursor-pointer py-2 text-lg font-bold text-brand-dark">この出品について農家さんに相談する（{messages.length}件）</summary>
      <div className="mt-2 space-y-3">
        <p className="text-base text-sub">あなたと農家さんの2人だけが読めます。電話番号や口座番号は書かないでください。</p>
        <MessageList messages={messages} otherName={producerName} />
        <ThreadForm listingId={listingId} buyerId={buyerId} title="相談を書く（500文字まで）" />
      </div>
    </details>
  );
}
