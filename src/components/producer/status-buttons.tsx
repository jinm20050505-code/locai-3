"use client";

// 出品の一時停止・再開・受付終了（受付終了は確認してから）
import { useActionState } from "react";
import { listingStatusAction, type ListingState } from "@/app/actions/listings";
import { btn } from "@/components/ui";

type Props = { id: string; to: string; text: string; kind?: keyof typeof btn; action: (fd: FormData) => void; pending: boolean };

function StatusButton({ id, to, text, kind = "plain", action, pending }: Props) {
  return (
    <form action={action} onSubmit={(e) => { if (to === "closed" && !confirm("受付を終了すると、もとに戻せません。終了しますか？（返事待ちの購入希望には、このあとも返事ができます）")) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value={to} />
      <button className={btn[kind]} disabled={pending}>{text}</button>
    </form>
  );
}

export function StatusButtons({ id, status }: { id: string; status: string }) {
  const [state, action, pending] = useActionState<ListingState, FormData>(listingStatusAction, {});
  if (status === "closed") return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {status === "open" ? <StatusButton id={id} to="paused" text="一時停止する" action={action} pending={pending} /> : <StatusButton id={id} to="open" text="受付を再開する" kind="secondary" action={action} pending={pending} />}
      <StatusButton id={id} to="closed" text="受付を終了する" kind="danger" action={action} pending={pending} />
      {state.problem && <p role="alert" className="text-base font-bold text-warn sm:col-span-2">⚠ {state.problem}</p>}
    </div>
  );
}
