// 野菜を探す（写真付きの一覧）。条件はアドレスに入れるので、戻る・再読み込みでも消えない
import { Suspense } from "react";
import { ListingCard } from "@/components/listing/listing-card";
import { btn, input, label, Notice } from "@/components/ui";
import { sameGroup } from "@/lib/alternatives";
import { matches, searchTerms } from "@/lib/kana";
import { parseDay, todayText } from "@/lib/dates";
import { kgTextToGrams, yenTextToInt } from "@/lib/money";
import { prefName } from "@/lib/regions";
import { getCurrentUser } from "@/lib/session";
import { search } from "@/server/search";
import { AiAlternatives } from "@/components/listing/ai-alternatives";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 50) : "");

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <main className="space-y-5">
      <h1 className="text-2xl font-bold">野菜を探す</h1>
      <Suspense fallback={<p>読み込んでいます…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Body({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const v = { q: one(sp.q), kg: one(sp.kg), date: one(sp.date), budget: one(sp.budget), method: one(sp.method) || "any" };
  const grams = v.kg ? kgTextToGrams(v.kg) : null;
  const useDate = v.date ? parseDay(v.date) : null;
  const budgetYen = v.budget ? yenTextToInt(v.budget) : null;
  const errors = {
    kg: v.kg && !grams ? "数量は kg の数字で入れてください（例：3 や 1.5）" : "",
    date: v.date && !useDate ? "使う日を選び直してください" : "",
    budget: v.budget && budgetYen === null ? "予算は円の数字で入れてください（例：5000）" : "",
  };
  const buyerPref = user?.role === "buyer" ? user.prefecture : null;
  const method = (["pickup", "delivery"].includes(v.method) ? v.method : "any") as "any" | "pickup" | "delivery";
  const now = new Date();
  const r = await search({ q: v.q, grams, useDate, budgetYen, method, buyerPref }, now);
  const passOn = new URLSearchParams(Object.entries({ kg: grams ? v.kg : "", date: useDate ? v.date : "", method: method === "any" ? "" : method }).filter(([, x]) => x)).toString();
  const query = passOn ? `?${passOn}` : "";
  const hasDetail = !!(v.kg || v.date || v.budget || method !== "any");
  // 欲しい野菜がないとき：同じ仲間の野菜の候補（アプリの決まりで選ぶ）
  let alternatives: typeof r.matched = [];
  const group = r.matched.length === 0 && v.q ? sameGroup(v.q) : null;
  if (r.matched.length === 0 && v.q) {
    const all = await search({ q: "", grams, useDate, budgetYen, method, buyerPref }, now);
    const terms = group ? group.items.flatMap(searchTerms) : [];
    // 同じ仲間の野菜。仲間が分からないときは、受付中の野菜を総額の安い順に3件
    alternatives = group ? all.matched.filter((x) => matches(terms, x.name, x.variety)).slice(0, 5) : all.matched.slice(0, 3);
  }

  return (
    <>
      <form action="/search" className="space-y-3" role="search">
        <label htmlFor="q" className={label}>野菜の名前</label>
        <div className="flex gap-2">
          <input id="q" name="q" defaultValue={v.q} placeholder="例：なす、万願寺唐辛子" className={input} enterKeyHint="search" />
        </div>
        <details open={hasDetail} className="rounded-xl border-2 border-line p-3">
          <summary className="min-h-12 cursor-pointer py-2 text-lg font-bold text-brand-dark">数量・使う日・予算・受け取り方法を指定する</summary>
          <div className="mt-3 grid gap-4">
            <div>
              <label htmlFor="kg" className={label}>ほしい量（kg）</label>
              <input id="kg" name="kg" defaultValue={v.kg} inputMode="decimal" placeholder="例：3" className={input} />
              {errors.kg && <p role="alert" className="mt-1 rounded-lg bg-warn-soft px-3 py-2 text-base font-bold text-warn">⚠ {errors.kg}</p>}
            </div>
            <div>
              <label htmlFor="date" className={label}>使う日</label>
              <input id="date" name="date" type="date" min={todayText()} defaultValue={v.date} className={input} />
              {errors.date && <p role="alert" className="mt-1 rounded-lg bg-warn-soft px-3 py-2 text-base font-bold text-warn">⚠ {errors.date}</p>}
            </div>
            <div>
              <label htmlFor="budget" className={label}>予算（送料込み・円）</label>
              <input id="budget" name="budget" defaultValue={v.budget} inputMode="numeric" placeholder="例：5000" className={input} />
              {errors.budget && <p role="alert" className="mt-1 rounded-lg bg-warn-soft px-3 py-2 text-base font-bold text-warn">⚠ {errors.budget}</p>}
            </div>
            <fieldset>
              <legend className={label}>受け取り方法</legend>
              <div className="mt-1 grid gap-2">
                {[["any", "どちらでもよい"], ["pickup", "畑で引き取る（料金0円）"], ["delivery", "お店に届けてもらう（送料あり）"]].map(([k, t]) => (
                  <label key={k} className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-line px-4">
                    <input type="radio" name="method" value={k} defaultChecked={method === k} className="h-6 w-6 accent-brand-strong" /> {t}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </details>
        <button className={btn.primary}>この条件で探す</button>
      </form>

      {user?.role === "buyer" && buyerPref && <p className="text-base text-sub">お届けの範囲は、お店の場所（{prefName(buyerPref)}）で確かめています。</p>}
      {!user && <p className="text-base text-sub">お届けできるかは、登録したお店の場所で確かめます（ログイン後）。</p>}

      <section aria-labelledby="result" className="space-y-3">
        <h2 id="result" className="text-xl font-bold">
          {v.q ? `「${v.q}」` : "受付中の野菜"}：{r.matched.length}件
        </h2>
        <p className="text-base text-sub">並び順：送料込みの総額が安い順（人気順ではありません）。{grams ? "" : "金額は、いちばん少ない注文量の場合です。"}</p>
        {r.matched.length > 0 ? (
          <ul className="space-y-3">{r.matched.map((x) => <ListingCard key={x.id} item={x} query={query} />)}</ul>
        ) : (
          <Notice title="条件に合う野菜は見つかりませんでした">
            <p>野菜の名前を短くする（例：「賀茂茄子」→「なす」）か、数量・使う日・予算を変えてお試しください。</p>
          </Notice>
        )}
      </section>

      {alternatives.length > 0 && (
        <section aria-labelledby="alt" className="space-y-3">
          <h2 id="alt" className="text-xl font-bold">代わりになりそうな野菜{group ? `（同じ「${group.group}」）` : ""}</h2>
          <p className="text-base text-sub">アプリが、条件に合う受付中の野菜から選びました。使えるかは、お店で判断してください。</p>
          <ul className="space-y-3">{alternatives.map((x) => <ListingCard key={x.id} item={x} query={query} />)}</ul>
          <AiAlternatives wanted={v.q} candidates={alternatives.map((x) => ({ id: x.id, name: x.variety ? `${x.name}（${x.variety}）` : x.name }))} />
        </section>
      )}

      {r.near.length > 0 && (
        <details className="rounded-xl border-2 border-line p-3">
          <summary className="min-h-12 cursor-pointer py-2 text-lg font-bold">条件の一部が合わない野菜も見る（{r.near.length}件）</summary>
          <ul className="mt-3 space-y-3">{r.near.map((x) => <ListingCard key={x.id} item={x} query={query} />)}</ul>
        </details>
      )}
    </>
  );
}

