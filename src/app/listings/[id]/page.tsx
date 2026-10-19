// 商品の詳細（仕様 4章 A④）。写真・生産者プロフィール・単価と販売単位・量の内訳・期限・受け渡し条件、そして申し込み
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { OrderForm, type MethodOption } from "@/components/listing/order-form";
import { ReportForm } from "@/components/wanted/forms";
import { DemoBadge, LinkButton, Notice, card } from "@/components/ui";
import { dayText, formatDateTime, formatDay } from "@/lib/dates";
import { bandsOf, methodFee, TEMP_LABEL } from "@/lib/delivery";
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
  const bands = bandsOf(l.courierFees);
  const courierText = bands.map((b) => `${formatKg(b.upToGrams)}まで ${formatYen(b.feeYen)}`).join("・");
  const pref = user?.role === "buyer" ? user.prefecture : null;
  const grams0 = typeof sp.kg === "string" ? kgTextToGrams(sp.kg) : null;
  const methods: MethodOption[] = [];
  if (l.courier) { const f = methodFee(l, "courier", pref, grams0 ?? l.minGrams); methods.push({ method: "courier", ok: f.ok || f.reason.includes("重さ"), reason: f.ok ? undefined : f.reason, bands, note: `${TEMP_LABEL[l.courierTemp ?? "normal"]}・発送から約${l.courierDays ?? 1}日で届きます` }); }
  if (l.delivery) { const f = methodFee(l, "delivery", pref, l.minGrams); methods.push({ method: "delivery", ok: f.ok, reason: f.ok ? undefined : f.reason, feeYen: l.deliveryFeeYen ?? 0, note: `農家さんがお店まで届けます` }); }
  if (l.pickup) methods.push({ method: "pickup", ok: true, feeYen: 0, note: `${placeLabel(l.pickupPref, l.pickupCity)}（くわしい場所は販売確定のあとにメッセージで）` });
  return (
    <div className="space-y-5">
      <LinkButton href="/search" kind="plain" className="!w-auto">← 探す画面に戻る</LinkButton>
      <div className="overflow-hidden rounded-2xl bg-brand-soft">
        {l.hasPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/photos/${l.id}`} alt={`${l.name}の写真`} className="aspect-[4/3] w-full object-cover" />
        ) : <p className="flex aspect-[4/3] items-center justify-center text-sub">写真なし</p>}
      </div>
      <div className="space-y-2">
        {l.isDemo && <DemoBadge />}
        <h1 className="text-2xl font-bold">{l.name}{l.variety && <span className="text-xl font-normal">（{l.variety}）</span>}</h1>
        <p className="text-xl"><b>1kg {formatYen(l.pricePerKg)}</b>・{l.allowPartial ? `${formatKg(l.minGrams)}から${formatKg(l.unitGrams)}ずつ` : "全量での販売"}</p>
        {l.surplusReason && <p>余剰理由：{l.surplusReason}</p>}
        {l.description && <p className="whitespace-pre-wrap">{l.description}</p>}
      </div>

      <section className={`${card} space-y-2`} aria-labelledby="farm">
        <h2 id="farm" className="text-lg font-bold">生産者</h2>
        <div className="flex items-center gap-3">
          {l.producer.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/photos/user/${l.producer.id}`} alt={`${l.producer.name}の写真`} className="h-16 w-16 rounded-full object-cover" />
          )}
          <p className="text-lg">{l.producer.name}<br /><span className="text-base">{placeLabel(l.producer.prefecture, l.producer.city)}</span></p>
        </div>
        {l.producer.items && <p className="text-base">栽培している品目：{l.producer.items}</p>}
        {l.producer.intro && <p className="whitespace-pre-wrap text-base">こだわり：{l.producer.intro}</p>}
      </section>

      <section className={card} aria-labelledby="stock">
        <h2 id="stock" className="text-lg font-bold">量・期限・受け渡し</h2>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="font-bold">申し込める量</dt><dd className="font-bold">{formatKg(s.availableGrams)}</dd>
          <dt>出品総量</dt><dd>{formatKg(s.totalGrams)}</dd>
          <dt>購入希望の集計（仮押さえ）</dt><dd>{formatKg(s.heldGrams)}</dd>
          <dt>販売確定量</dt><dd>{formatKg(s.soldGrams)}</dd>
          <dt>納品できる期間</dt><dd>{formatDay(l.availableFrom)}〜{formatDay(l.availableUntil)}</dd>
          <dt>購入希望の受付期限</dt><dd>{formatDateTime(l.acceptUntil)}</dd>
          <dt>生産者の回答期限</dt><dd>{formatDateTime(l.replyUntil)}</dd>
          <dt>宅配発送</dt><dd>{l.courier ? `${courierText}（${TEMP_LABEL[l.courierTemp ?? "normal"]}・${l.courierPrefs.map(prefName).join("、")}）` : "していません"}</dd>
          <dt>農家さんが配達</dt><dd>{l.delivery ? `配達料 ${formatYen(l.deliveryFeeYen ?? 0)}（${l.deliveryPrefs.map(prefName).join("、")}${l.deliveryMaxOrders ? `・${l.deliveryMaxOrders}件まで` : ""}）` : "していません"}</dd>
          <dt>畑で引き取り</dt><dd>{l.pickup ? `できます（${placeLabel(l.pickupPref, l.pickupCity)}・料金0円）` : "していません"}</dd>
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
            l={{ id: l.id, pricePerKg: l.pricePerKg, minGrams: l.minGrams, unitGrams: l.unitGrams, availableGrams: s.availableGrams, allowPartial: l.allowPartial, methods, availableFrom: dayText(l.availableFrom), availableUntil: dayText(l.availableUntil), replyUntilText: formatDateTime(l.replyUntil) }}
            initial={{ grams: grams0, date: typeof sp.date === "string" ? sp.date : "" }}
          />
        )}
      </section>
      {user && user.id !== l.producerId && <ReportForm type="listing" id={l.id} />}
    </div>
  );
}
