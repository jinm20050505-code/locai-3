"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { komameChatAction } from "@/app/actions/komame";
import type { ChatMessage, KomameCard, KomamePlan } from "@/lib/komame";
import { formatKg, formatYen } from "@/lib/money";
import { METHOD_LABEL } from "@/lib/delivery";
import { prefName } from "@/lib/regions";
import type { Role } from "@/lib/roles";
type Turn = ChatMessage & { cards?: KomameCard[]; conditions?: KomamePlan; checkedAt?: string };
export function KomameChat({ role, open, onClose }: { role: Role | null; open: boolean; onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const [resultReady, setResultReady] = useState(false);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: "nearest" }); }, [open, turns, pending]);
  const submit = (value: string) => {
    const message = value.trim();
    if (!message || pending || !role) return;
    if (message.length > 1000) { setError("1回1,000文字以内で書いてね。"); return; }
    if (turns.length >= 10) { setError("会話が長くなったので「新しい相談」から始めてね。"); return; }
    setError(""); setResultReady(false);
    const next: Turn[] = [...turns, { role: "user", text: message }];
    setTurns(next); setText("");
    start(async () => {
      try {
        const r = await komameChatAction({ messages: next.map(t => ({ role: t.role, text: t.text })) });
        if (r.ok) { setTurns([...next, { role: "assistant", text: r.data.reply, cards: r.data.cards, conditions: r.data.conditions, checkedAt: r.data.checkedAt }]); setResultReady(true); }
        else { setTurns(turns); setText(message); setError(r.message); }
      } catch { setTurns(turns); setText(message); setError("つながりませんでした。書いた相談は残してあるよ。もう一度送ってみてね。"); }
    });
  };
  if (!open) return null;
  const examples = role === "producer" ? ["なすのおすすめ料理を紹介する文章を考えて", "購入希望が届いたらどうしたらいい？"] : ["金曜に10人分の野菜カレーを作りたい", "予算を抑えてスープに使う野菜を探したい"];
  return <section className="komame-chat" role="dialog" aria-modal="false" aria-labelledby="komame-chat-title" onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
    <header className="komame-chat-heading"><div><h2 id="komame-chat-title">こまめに相談</h2><p>料理・野菜・使い方を気軽に聞いてね</p></div><button type="button" className="komame-dismiss" onClick={onClose} aria-label="相談を閉じる">閉じる ×</button></header>
    {!role ? <div className="komame-chat-log"><p>料理や野菜のAI相談は、ログインすると使えるよ。</p><Link className="komame-chat-link" href="/login" onClick={onClose}>ログインする</Link><p>使い方のガイドは、ログインせずに見られるよ。</p></div> : <>
      <div className="komame-chat-log" role="log" aria-label="こまめとの会話" aria-busy={pending}>
        <p className="komame-chat-intro">「いつ、何人分の、どんな料理？」から話してみてね。料理の目安を一緒に考えて、出品されている野菜を探せるよ。</p>
        <p className="komame-chat-note">相談文と公開中の野菜の説明をGoogle Geminiに送ります。住所・連絡先・秘密の情報は書かないでね。会話は画面を開いている間だけ保持します。AIは1人1日20回まで（ほかのAI機能と共通）。</p>
        {!turns.length && <div className="komame-chat-examples">{examples.map(e => <button type="button" key={e} onClick={() => setText(e)}>{e}</button>)}</div>}
        {turns.map((t,i) => <article className={t.role === "user" ? "komame-chat-turn from-user" : "komame-chat-turn"} key={i}><b>{t.role === "user" ? "あなた" : "こまめ（AI・参考）"}</b><p className="komame-chat-message">{t.text}</p>
          {t.conditions && <>
            <div className="komame-conditions"><b>聞き取った条件（違ったら会話で直してね）</b><p>{t.conditions.date ?? "使う日未定"} ／ {t.conditions.kg === null ? "野菜ごとの量は未定" : `野菜ごとに${t.conditions.kg}kg`} ／ {t.conditions.budgetYen === null ? "商品ごとの予算未定" : `1商品${formatYen(t.conditions.budgetYen)}まで`} ／ {prefName(t.conditions.pref) || "府県は登録情報を参照・未登録なら要確認"} ／ {t.conditions.method ? METHOD_LABEL[t.conditions.method] : "受け取り方未定"}</p></div>
            {t.conditions.vegetables.length > 0 && <><h3>出品から探した参考候補</h3><p className="komame-chat-note">料理全体の買い物かご・合計ではありません。条件未定の項目は、まだ確認が必要です。在庫・金額は相談時点の表示で、購入画面で再確認します。</p>{!t.cards?.length && <p>確認した出品には、条件に合う候補がなかったよ。日付・量・受け取り方を変えるか、別の野菜で相談してみよう。</p>}</>}
          </>}
          {t.cards?.map(c => <div className="komame-product" key={c.id}>
            {c.hasPhoto && <Image src={`/api/photos/${c.id}`} alt={c.name} width={72} height={72} unoptimized className="komame-product-photo" />}
            <div><h4>{c.name}</h4><p>{c.place}{c.isDemo ? "・架空のデモ出品" : ""}</p><p>1kg {formatYen(c.pricePerKg)} ／ 残り{formatKg(c.availableGrams)}</p><p>{formatKg(c.grams)}の商品代 {formatYen(c.subtotalYen)}</p><p><b>{c.totalYen === null ? "送料込みの合計は未確定" : `送料込み ${formatYen(c.totalYen)}`}</b>{c.method ? `（${METHOD_LABEL[c.method]}）` : ""}</p>{c.notes.map(n => <p className="komame-chat-note" key={n}>{n}</p>)}
            <Link className="komame-chat-link" href={`/listings/${c.id}?${new URLSearchParams({ kg: String(c.grams/1000), ...(c.useDate ? { date: c.useDate } : {}) })}`} onClick={onClose}>商品を見て条件を確認</Link></div>
          </div>)}
        </article>)}
        {pending && <p role="status">出品を確かめて、考えているよ…</p>}
        <div ref={end} />
      </div>
      <div className="komame-chat-compose">
        <p className="sr-only" role="status">{resultReady ? "こまめから返事が届きました" : ""}</p>
        {error && <p role="alert">{error}</p>}
        <form onSubmit={e => { e.preventDefault(); submit(text); }}>
          <label htmlFor="komame-question">こまめへの相談</label><textarea ref={input} id="komame-question" rows={2} maxLength={1000} value={text} onChange={e => setText(e.target.value)} placeholder="金曜に10人分のカレーを作りたい…" disabled={pending} />
          <div className="komame-chat-buttons"><button type="button" disabled={pending} onClick={() => { setTurns([]); setError(""); setText(""); setResultReady(false); input.current?.focus(); }}>新しい相談</button><button type="submit" disabled={pending || !text.trim()}>{pending ? "考えています…" : "相談を送る"}</button></div>
        </form>
        <p className="komame-chat-note">購入希望や承認は自動では行いません。使い方・野菜の検索は、相談できないときも使えます。</p>
      </div>
    </>}
  </section>;
}
