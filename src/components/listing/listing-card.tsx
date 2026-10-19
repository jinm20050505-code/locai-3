// 一覧の1件（写真・名前・農家さん・送料込みの総額）。カード全体が詳細への入口
import Link from "next/link";
import { DemoBadge } from "@/components/ui";
import { formatDay } from "@/lib/dates";
import { formatKg, formatYen } from "@/lib/money";
import { placeLabel } from "@/lib/regions";

export type CardItem = {
  id: string; name: string; variety: string | null; hasPhoto: boolean; isDemo: boolean; pricePerKg: number;
  producer: { name: string; prefecture: string | null; city: string | null };
  stock: { availableGrams: number }; grams: number; totalYen: number; feeYen: number; method: "pickup" | "delivery";
  availableFrom: Date; availableUntil: Date; isNewProducer: boolean; reasons?: string[];
};

export function ListingCard({ item, query }: { item: CardItem; query: string }) {
  return (
    <li>
      <Link href={`/listings/${item.id}${query}`} className="flex gap-3 rounded-2xl border-2 border-line bg-white p-3 hover:border-brand-strong">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-brand-soft">
          {item.hasPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/photos/${item.id}`} alt={`${item.name}の写真`} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="flex h-full items-center justify-center text-base text-sub">写真なし</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xl font-bold leading-snug">
            {item.name}{item.variety && <span className="text-lg font-normal">（{item.variety}）</span>}
          </p>
          <p className="text-base text-sub">{item.producer.name}・{placeLabel(item.producer.prefecture, item.producer.city)}</p>
          <p className="text-lg">
            <b className="text-xl">{formatYen(item.totalYen)}</b>
            <span className="text-base text-sub">（{formatKg(item.grams)}・{item.method === "pickup" ? "引き取り" : item.feeYen ? `送料${formatYen(item.feeYen)}込み` : "送料無料"}）</span>
          </p>
          <p className="text-base">1kg {formatYen(item.pricePerKg)}・残り {formatKg(item.stock.availableGrams)}</p>
          <p className="text-base text-sub">受け渡し {formatDay(item.availableFrom)}〜{formatDay(item.availableUntil)}</p>
          <div className="flex flex-wrap gap-1">
            {item.isDemo && <DemoBadge />}
            {item.isNewProducer && <span className="inline-block rounded-md border border-brand-strong px-2 py-0.5 text-sm font-bold text-brand-dark">はじめたばかりの農家さん</span>}
          </div>
          {item.reasons && item.reasons.length > 0 && (
            <ul className="text-base font-bold text-note">{item.reasons.map((r) => <li key={r}>・{r}</li>)}</ul>
          )}
        </div>
      </Link>
    </li>
  );
}
