// 商品の詳細。写真・農家さん・値段・残り・受け取り方法、そして申し込み
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { OrderForm } from "@/components/listing/order-form";
import { DemoBadge, LinkButton, Notice, card } from "@/components/ui";
import { dayText, formatDateTime, formatDay } from "@/lib/dates";
import { formatKg, formatYen, kgTextToGrams } from "@/lib/money";
import { placeLabel, prefName } from "@/lib/regions";
import { getCurrentUser } from "@/lib/session";
import { getPublicListing } from "@/server/listings";

export default function ListingPage({ params, searchParams }: PageProps<"/listings/[id]">) {
  return (
    <main>
      <Suspense fallback={<p>読み込んでいます…</p>}>
        <Detail params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Detail({ params, searchParams }: { params: PageProps<"/listings/[id]">["params"]; searchParams: PageProps<"/listings/[id]">["searchParams"] }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const now = new Date();
  const l = await getPublicListing(id, now);
  if (!l) notFound();
  const user = await getCurrentUser();
  const s = l.stock;
  const back = new URLSearchParams(Object.entries({ kg: sp.kg, date: sp.date, method: sp.method }).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
  return (
    <div className="space-y-5">
      <LinkButton href={`/search${back ? `?${back}` : ""}`} kind="plain" className="!w-auto">← 一覧に戻る</LinkButton>
      <div className="overflow-hidden rounded-2xl bg-brand-soft">
        {l.hasPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/photos/${l.id}`} alt={`${l.name}の写真`} className="aspect-[4/3] w-full object-cover" />
        ) : (
          <p className="flex aspect-[4/3] items-center justify-center text-sub">写真なし</p>
        )}
      </div>
      <div className="space-y-2">
        {l.isDemo && <DemoBadge />}
        <h1 className="text-2xl font-bold">{l.name}{l.variety && <span className="text-xl font-normal">（{l.variety}）</span>}</h1>
        <p className="text-xl"><b>1kg {formatYen(l.pricePerKg)}</b></p>
        {l.description && <p className="whitespace-pre-wrap">{l.description}</p>}
      </div>

      <section className={card} aria-labelledby="farm">
        <h2 id="farm" className="text-lg font-bold">農家さん</h2>
        <p className="text-lg">{l.producer.name}（{placeLabel(l.producer.prefecture, l.producer.city)}）</p>
        {l.producer.intro && <p className="mt-1 whitespace-pre-wrap text-base">{l.producer.intro}</p>}
      </section>

      <section className={card} aria-labelledby="stock">
        <h2 id="stock" className="text-lg font-bold">量と受け渡し</h2>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="font-bold">いま申し込める量</dt><dd className="font-bold">{formatKg(s.availableGrams)}</dd>
          <dt>出品した量</dt><dd>{formatKg(s.totalGrams)}</dd>
          <dt>販売確定</dt><dd>{formatKg(s.soldGrams)}</dd>
          <dt>返事待ちで取り置き中</dt><dd>{formatKg(s.heldGrams)}</dd>
          <dt>注文の単位</dt><dd>{formatKg(l.minGrams)} から {formatKg(l.unitGrams)} ずつ</dd>
          <dt>受け渡しの期間</dt><dd>{formatDay(l.availableFrom)}〜{formatDay(l.availableUntil)}</dd>
          <dt>受付の締め切り</dt><dd>{formatDateTime(l.acceptUntil)}</dd>
          <dt>引き取り</dt><dd>{l.pickup ? `できます（${placeLabel(l.pickupPref, l.pickupCity)}・料金0円）` : "していません"}</dd>
          <dt>お届け</dt><dd>{l.delivery ? `できます（送料 ${formatYen(l.deliveryFeeYen ?? 0)}・${l.deliveryPrefs.map(prefName).join("、")}）` : "していません"}</dd>
        </dl>
      </section>

      <section className="space-y-3 rounded-2xl border-4 border-brand p-4" aria-label="申し込み">
        {!l.accepting ? (
          <Notice kind="warn" title="この出品は、いま購入希望を受け付けていません" />
        ) : !user ? (
          <div className="space-y-3">
            <p>購入希望を送るには、お店のアカウントでログインしてください。</p>
            <LinkButton href={`/login?next=${encodeURIComponent(`/listings/${l.id}`)}`}>ログインして申し込む</LinkButton>
            <LinkButton href={`/signup?role=buyer&next=${encodeURIComponent(`/listings/${l.id}`)}`} kind="secondary">はじめての方（登録する）</LinkButton>
          </div>
        ) : user.role !== "buyer" ? (
          <Notice title="農家のアカウントでは申し込めません">お店のアカウントでログインしてください。</Notice>
        ) : (
          <OrderForm
            l={{
              id: l.id, name: l.name, pricePerKg: l.pricePerKg, minGrams: l.minGrams, unitGrams: l.unitGrams, availableGrams: s.availableGrams,
              pickup: l.pickup, pickupPlace: placeLabel(l.pickupPref, l.pickupCity), delivery: l.delivery, deliveryFeeYen: l.deliveryFeeYen ?? 0,
              deliveryOk: !!user.prefecture && l.deliveryPrefs.includes(user.prefecture),
              availableFrom: dayText(l.availableFrom), availableUntil: dayText(l.availableUntil), replyHours: l.replyHours,
            }}
            initial={{ grams: typeof sp.kg === "string" ? kgTextToGrams(sp.kg) : null, date: typeof sp.date === "string" ? sp.date : "", method: typeof sp.method === "string" ? sp.method : "" }}
          />
        )}
      </section>
    </div>
  );
}
