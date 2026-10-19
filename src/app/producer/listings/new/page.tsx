// 生産者：出品する（短い手順に分ける）。前回の出品を写す・「探しています」に応えることもできる
import { Suspense } from "react";
import { ListingWizard, type WizardValues } from "@/components/producer/listing-wizard";
import { Notice } from "@/components/ui";
import { dayText, formatDay, todayText } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { bandsOf } from "@/lib/delivery";
import { formatKg, formatYen } from "@/lib/money";
import { placeLabel } from "@/lib/regions";
import { requireRole } from "@/lib/session";
import { getPublicWanted } from "@/server/wanted";

export default function NewListingPage({ searchParams }: PageProps<"/producer/listings/new">) {
  return (
    <main className="space-y-5">
      <h1 className="text-2xl font-bold">野菜を出品する</h1>
      <Suspense fallback={<p>読み込んでいます…</p>}><Body searchParams={searchParams} /></Suspense>
    </main>
  );
}

const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const g2kg = (g: number) => String(Number((g / 1000).toFixed(3)));
const ID = /^[0-9a-f-]{36}$/;

async function Body({ searchParams }: { searchParams: PageProps<"/producer/listings/new">["searchParams"] }) {
  const user = await requireRole("producer", "/producer/listings/new");
  const sp = await searchParams;
  const from = plusDays(todayText(), 1);
  // 初期値（アプリで決めた仮の値）：明日から3日間・受付期限は明日の正午・回答期限は明日の20時・引き取りの場所は畑の場所
  let initial: WizardValues = {
    name: "", variety: "", description: "", surplusReason: "", surplusOther: "", totalKg: "", pricePerKg: "", allowPartial: "yes", minKg: "1", unitGrams: "500",
    availableFrom: from, availableUntil: plusDays(from, 2), acceptUntil: `${from}T12:00`, replyUntil: `${from}T20:00`,
    courier: "", courierTemp: "normal", courierDays: "1", courierPrefs: user.prefecture ?? "", delivery: "", deliveryFeeYen: "", deliveryMaxOrders: "", deliveryPrefs: user.prefecture ?? "",
    pickup: "on", pickupPref: user.prefecture ?? "", pickupCity: user.city ?? "", wantedPostId: "",
  };
  let banner: React.ReactNode = null;
  const copyId = typeof sp.from === "string" && ID.test(sp.from) ? sp.from : null;
  const wantedId = typeof sp.wanted === "string" && ID.test(sp.wanted) ? sp.wanted : null;
  if (copyId) {
    const l = await getDb().listing.findFirst({ where: { id: copyId, producerId: user.id } });
    if (l) {
      // 値段・量・受け渡し条件は前回のまま。日付は新しくする（期間の長さは前回と同じ）
      const days = Math.round((l.availableUntil.getTime() - l.availableFrom.getTime()) / 86_400_000);
      const bands = bandsOf(l.courierFees);
      initial = {
        ...initial, name: l.name, variety: l.variety ?? "", description: l.description ?? "", surplusReason: l.surplusReason && ["規格外", "豊作"].includes(l.surplusReason) ? l.surplusReason : l.surplusReason ? "その他" : "", surplusOther: l.surplusReason && !["規格外", "豊作"].includes(l.surplusReason) ? l.surplusReason : "",
        totalKg: g2kg(l.totalGrams), pricePerKg: String(l.pricePerKg), allowPartial: l.allowPartial ? "yes" : "no", minKg: g2kg(l.minGrams), unitGrams: String(l.unitGrams), availableUntil: plusDays(from, days),
        courier: l.courier ? "on" : "", courierTemp: l.courierTemp ?? "normal", courierDays: String(l.courierDays ?? 1), courierPrefs: l.courierPrefs.join(","),
        ...Object.fromEntries(bands.flatMap((b, i) => [[`band${i + 1}Kg`, g2kg(b.upToGrams)], [`band${i + 1}Fee`, String(b.feeYen)]])),
        delivery: l.delivery ? "on" : "", deliveryFeeYen: l.deliveryFeeYen === null ? "" : String(l.deliveryFeeYen), deliveryMaxOrders: l.deliveryMaxOrders ? String(l.deliveryMaxOrders) : "", deliveryPrefs: l.deliveryPrefs.join(","),
        pickup: l.pickup ? "on" : "", pickupPref: l.pickupPref ?? "", pickupCity: l.pickupCity ?? "",
      };
      banner = <p className="rounded-xl bg-brand-soft p-3">前回の出品の内容を写しました。日付は新しくしています。写真は選び直してください。</p>;
    }
  } else if (wantedId) {
    const w = await getPublicWanted(wantedId);
    if (w) {
      const use = dayText(w.useDate);
      initial = { ...initial, name: w.item ?? "", totalKg: g2kg(w.grams), wantedPostId: w.id, availableFrom: from <= use ? from : use, availableUntil: use >= from ? use : plusDays(from, 2) };
      banner = (
        <Notice title="お店の「探しています」に応えて出品します">
          <p>{w.item ?? "種類を問わない"}・{formatKg(w.grams)}・送料込み {formatYen(w.budgetYen)} まで・{formatDay(w.useDate)} に使用・届け先 {placeLabel(w.prefecture, w.city)}</p>
          <p>出品すると、お店の「探しています」の画面に表示されます。値段や量は、農家さんが決めてください。</p>
        </Notice>
      );
    }
  }
  return (
    <>
      {banner}
      <ListingWizard initial={initial} fresh={!copyId && !wantedId} />
    </>
  );
}
