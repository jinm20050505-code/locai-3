// 野菜を探す（仕様 4章 A②〜④）。条件はアドレスに入るので、戻る・再読み込みでも消えない
import Link from "next/link";
import { Suspense } from "react";
import { ListingCard } from "@/components/listing/listing-card";
import { AiExplain } from "@/components/search/ai-explain";
import { SearchForm, type SearchValues } from "@/components/search/search-form";
import { LinkButton, Notice } from "@/components/ui";
import { parseDay, todayText } from "@/lib/dates";
import { METHOD_LABEL, METHODS, type Method } from "@/lib/delivery";
import { kgTextToGrams, yenTextToInt } from "@/lib/money";
import { isPlace, prefName } from "@/lib/regions";
import { getCurrentUser } from "@/lib/session";
import { aiConfigured } from "@/server/ai";
import { GROUP_LABEL, loadPreset, savePreset, search, type Group } from "@/server/search";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined, n = 50) => (typeof v === "string" ? v.slice(0, n) : "");
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []);

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

const toQuery = (v: SearchValues) => {
  const p = new URLSearchParams({ go: "1", mode: v.mode, q: v.q, kg: v.kg, budget: v.budget, date: v.date, pref: v.pref, city: v.city, usage: v.usage });
  v.methods.forEach((m) => p.append("methods", m));
  return p.toString();
};

async function Body({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const buyer = user?.role === "buyer" ? user : null;
  const now = new Date();
  const go = sp.go === "1";
  const methodsIn = many(sp.methods).filter((m): m is Method => METHODS.includes(m as Method));
  const v: SearchValues = {
    mode: ["exact", "alt", "any"].includes(one(sp.mode)) ? one(sp.mode) : "exact",
    q: one(sp.q, 30), usage: one(sp.usage, 100), kg: one(sp.kg), budget: one(sp.budget), date: one(sp.date),
    pref: go ? one(sp.pref) : buyer?.prefecture ?? "", city: go ? one(sp.city) : buyer?.city ?? "",
    methods: go ? methodsIn : [...METHODS],
  };
  const preset = buyer ? await loadPreset(buyer.id) : null;
  // 必須の項目（仕様 5章1）：希望数量・予算・使用日・地域・受け取り方法。食材は「種類を問わない」以外で必須
  const errors: Record<string, string> = {};
  const grams = kgTextToGrams(v.kg);
  const budgetYen = yenTextToInt(v.budget);
  const useDate = parseDay(v.date);
  if (go) {
    if (v.mode !== "any" && !v.q.trim()) errors.q = "食材の名前を入れてください（決めていなければ「種類を問わない」を選ぶ）";
    if (!v.kg) errors.kg = "希望数量を入れてください（例：3）";
    else if (!grams || grams < 500 || grams > 1_000_000) errors.kg = "希望数量は 0.5kg から 1,000kg までの数字で入れてください";
    if (!v.budget) errors.budget = "予算を入力してください（送料込み・円）";
    else if (!budgetYen || budgetYen > 100_000) errors.budget = "予算は 1円 から 100,000円 までの数字で入れてください";
    if (!v.date) errors.date = "使用日を選んでください";
    else if (!useDate || v.date < todayText(now)) errors.date = "使用日は今日以降を選んでください";
    if (!isPlace(v.pref, v.city)) errors.place = "届け先の地域（府県と市区町村）を選んでください";
    if (v.methods.length === 0) errors.methods = "受け取り方法を1つ以上選んでください";
  }
  const valid = go && Object.keys(errors).length === 0;
  const r = valid ? await search({ mode: v.mode as "exact" | "alt" | "any", q: v.q, usage: v.usage, grams: grams!, budgetYen: budgetYen!, useDate: useDate!, pref: v.pref, city: v.city, methods: v.methods as Method[] }, buyer?.id ?? null, now) : null;
  if (valid && buyer) await savePreset(buyer.id, { query: toQuery(v), mode: v.mode, q: v.q, kg: v.kg, budget: v.budget }).catch(() => {});
  const passOn = valid ? `?${new URLSearchParams({ kg: v.kg, date: v.date }).toString()}` : "";
  const aiOn = aiConfigured() && !!buyer;
  const all = r ? (["repeat", "match", "newcomer"] as Group[]).flatMap((g) => r.groups[g].shown) : [];

  return (
    <>
      {preset && !go && (
        <LinkButton href={`/search?${preset.query}`} kind="secondary">
          前回の条件で探す（{preset.mode === "any" ? "種類を問わない" : preset.q}・{preset.kg}kg・{preset.budget}円まで）
        </LinkButton>
      )}
      {/* 条件（アドレス）が変わったら入力欄を作り直す（前回の条件をワンタップで呼び出したときなど） */}
      <SearchForm key={JSON.stringify(v)} initial={v} errors={errors} today={todayText(now)} aiOn={aiOn} fromUrl={go} />
      {go && !valid && <Notice kind="warn" title="入力を直してください">上の欄の近くに、理由と直し方を出しています。入力した内容はそのまま残っています。</Notice>}

      {r && (
        <section aria-labelledby="result" className="space-y-4" data-komame-cue={r.total === 0 ? "候補がなかったね。量・予算・日付を変えるか、こまめに代わりの野菜を相談してみよう。" : "候補が見つかったよ。商品の画面で数量と送料込みの金額を確認しよう。"}>
          <h2 id="result" className="text-xl font-bold">仕入れ候補：{r.total}件</h2>
          <p className="text-base text-sub">
            {v.mode === "any" ? "種類を問わない" : v.q}・{v.kg}kg・送料込み {Number(v.budget).toLocaleString("ja-JP")}円まで・{v.date.replaceAll("-", "/")} に使用・{prefName(v.pref)}{v.city}・{v.methods.map((m) => METHOD_LABEL[m as Method]).join("／")}
          </p>
          <p className="text-base text-sub">並び順：数量・予算・使用日・受け取り方法に合うものを先に。同じくらいなら、表示された回数の少ない農家さんを先にしています（人気順ではありません）。</p>
          {(["repeat", "match", "newcomer"] as Group[]).map((g) =>
            r.groups[g].shown.length ? (
              <section key={g} aria-labelledby={`g-${g}`} className="space-y-3">
                <h3 id={`g-${g}`} className="text-lg font-bold">{GROUP_LABEL[g]}（{r.groups[g].shown.length + r.groups[g].more.length}件）</h3>
                <ul className="space-y-3">{r.groups[g].shown.map((x) => <ListingCard key={x.id} item={x} query={passOn} />)}</ul>
                {r.groups[g].more.length > 0 && (
                  <details className="rounded-xl border-2 border-line p-3">
                    <summary className="min-h-12 cursor-pointer py-2 text-lg font-bold text-brand-dark">同じ農家さんのほかの出品（{r.groups[g].more.length}件）</summary>
                    <ul className="mt-2 space-y-3">{r.groups[g].more.map((x) => <ListingCard key={x.id} item={x} query={passOn} />)}</ul>
                  </details>
                )}
              </section>
            ) : null,
          )}
          {all.length > 0 && aiOn && <AiExplain cond={{ item: v.q, usage: v.usage, kg: v.kg, budget: v.budget, date: v.date, alternative: v.mode === "alt" && all.some((x) => x.alternative) }} candidates={all.slice(0, 8).map((x) => ({ id: x.id, name: x.variety ? `${x.name}（${x.variety}）` : x.name }))} />}
          {all.length > 0 && !aiConfigured() && <p className="text-base text-sub">AI による説明は、いまは使えません（候補の選び方と並び順は、アプリの決まりです）。</p>}

          {r.total === 0 && (
            <div className="space-y-3">
              <Notice title="条件に合う候補は見つかりませんでした">
                {r.reasonCount.length > 0 ? (
                  <>
                    <p>合わなかった理由：</p>
                    <ul>{r.reasonCount.map(([why, n]) => <li key={why}>・{why}（{n}件）</li>)}</ul>
                  </>
                ) : <p>いま受付中の出品の中に、この食材はありません。</p>}
                <p className="mt-1">条件を変えるには：数量を減らす・予算を上げる・使用日を後にする・受け取り方法を増やす{v.mode === "exact" ? "・「代替野菜も可」にする" : ""}。</p>
              </Notice>
              {v.mode === "exact" && <LinkButton href={`/search?${toQuery({ ...v, mode: "alt" })}`} kind="secondary">代替野菜も可で探しなおす</LinkButton>}
              {buyer ? (
                <LinkButton href={`/wanted/new?${toQuery(v)}`}>この条件を「探しています」として公開する</LinkButton>
              ) : (
                <p className="text-base">お店のアカウントで<Link href="/login?next=/search" className="font-bold text-brand-dark underline">ログイン</Link>すると、この条件を「探しています」として地域の農家さんに公開できます。</p>
              )}
              <p className="text-base text-sub">「探しています」で公開するのは、地域と条件だけです。店名・住所は公開しません。</p>
            </div>
          )}
        </section>
      )}
    </>
  );
}
