// 生産者：出品する（短い手順に分ける）。前回の出品の内容を写して始めることもできる
import { Suspense } from "react";
import { ListingWizard, type WizardValues } from "@/components/producer/listing-wizard";
import { todayText } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { PREFECTURES } from "@/lib/regions";
import { requireRole } from "@/lib/session";

export default function NewListingPage({ searchParams }: PageProps<"/producer/listings/new">) {
  return (
    <main className="space-y-5">
      <h1 className="text-2xl font-bold">野菜を出品する</h1>
      <Suspense fallback={<p>読み込んでいます…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const g2kg = (g: number) => String(Number((g / 1000).toFixed(3)));

async function Body({ searchParams }: { searchParams: PageProps<"/producer/listings/new">["searchParams"] }) {
  const user = await requireRole("producer", "/producer/listings/new");
  const sp = await searchParams;
  const today = todayText();
  const from = plusDays(today, 1);
  // 初期値：明日から3日間・締め切りは明日の正午・返事まで24時間・引き取りの場所は畑の場所
  let initial: WizardValues = {
    name: "", variety: "", description: "", totalKg: "", pricePerKg: "", minKg: "1", unitGrams: "500",
    availableFrom: from, availableUntil: plusDays(from, 2), acceptUntil: `${from}T12:00`, replyHours: "24",
    pickup: "on", pickupPref: user.prefecture ?? "", pickupCity: user.city ?? "", delivery: "", deliveryFeeYen: "", deliveryPrefs: user.prefecture ?? "",
  };
  const copyId = typeof sp.from === "string" && /^[0-9a-f-]{36}$/.test(sp.from) ? sp.from : null;
  if (copyId) {
    const l = await getDb().listing.findFirst({ where: { id: copyId, producerId: user.id } });
    if (l) {
      // 値段・量・受け取り方法は前回のまま。日付は新しくする（期間の長さは前回と同じ）
      const days = Math.round((l.availableUntil.getTime() - l.availableFrom.getTime()) / 86_400_000);
      initial = {
        ...initial, name: l.name, variety: l.variety ?? "", description: l.description ?? "", totalKg: g2kg(l.totalGrams), pricePerKg: String(l.pricePerKg),
        minKg: g2kg(l.minGrams), unitGrams: String(l.unitGrams), availableUntil: plusDays(from, days), replyHours: String(l.replyHours),
        pickup: l.pickup ? "on" : "", pickupPref: l.pickupPref ?? "", pickupCity: l.pickupCity ?? "", delivery: l.delivery ? "on" : "",
        deliveryFeeYen: l.deliveryFeeYen === null ? "" : String(l.deliveryFeeYen), deliveryPrefs: l.deliveryPrefs.join(","),
      };
    }
  }
  const cities = Object.fromEntries(PREFECTURES.map((p) => [p.code, p.cities]));
  return (
    <>
      {copyId && <p className="rounded-xl bg-brand-soft p-3">前回の出品の内容を写しました。日付は新しくしています。写真は選び直してください。</p>}
      <ListingWizard initial={initial} defaults={{ pref: user.prefecture ?? "", city: user.city ?? "", cities }} />
    </>
  );
}
