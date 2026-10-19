// 候補の1件（仕様 4章 A④の項目）。カード全体が詳細への入口
import Link from "next/link";
import { DemoBadge } from "@/components/ui";
import { formatDateTime, formatDay } from "@/lib/dates";
import { METHOD_LABEL, type Method } from "@/lib/delivery";
import { formatKg, formatYen } from "@/lib/money";
import { placeLabel } from "@/lib/regions";

export type CardItem = {
  id: string; name: string; variety: string | null; hasPhoto: boolean; isDemo: boolean; pricePerKg: number; minGrams: number; unitGrams: number; allowPartial: boolean;
  surplusReason: string | null; acceptUntil: Date; replyUntil: Date; availableFrom: Date; availableUntil: Date;
  producer: { id: string; name: string; prefecture: string | null; city: string | null; intro: string | null };
  producerHasPhoto: boolean;
  stock: { availableGrams: number; totalGrams: number; soldGrams: number; heldGrams: number }; grams: number; subtotalYen: number; totalYen: number; feeYen: number; method: Method;
  alternative?: boolean;
};

export function ListingCard({ item, query }: { item: CardItem; query: string }) {
  return (
    <li>
      <Link href={`/listings/${item.id}${query}`} className="block space-y-2 rounded-2xl border-2 border-line bg-white p-3 hover:border-brand-strong">
        <div className="flex gap-3">
          <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-brand-soft">
            {item.hasPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/photos/${item.id}`} alt={`${item.name}の写真`} className="h-full w-full object-cover" loading="lazy" />
            ) : <span className="flex h-full items-center justify-center text-base text-sub">写真なし</span>}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            {item.alternative && <p className="inline-block rounded-md border border-note bg-note-soft px-2 text-sm font-bold text-note">代わりの野菜</p>}
            <p className="text-xl font-bold leading-snug">{item.name}{item.variety && <span className="text-lg font-normal">（{item.variety}）</span>}</p>
            <p className="text-xl"><b>合計 {formatYen(item.totalYen)}</b></p>
            <p className="text-base">商品代 {formatYen(item.subtotalYen)}（{formatKg(item.grams)}）＋ {item.method === "pickup" ? "引き取り 0円" : `送料・配達料 ${formatYen(item.feeYen)}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {item.producerHasPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/photos/user/${item.producer.id}`} alt="" className="h-10 w-10 rounded-full object-cover" loading="lazy" />
          )}
          <p className="text-base">{item.producer.name}・{placeLabel(item.producer.prefecture, item.producer.city)}</p>
        </div>
        {item.producer.intro && <p className="text-base text-sub">こだわり：{item.producer.intro.slice(0, 50)}{item.producer.intro.length > 50 ? "…" : ""}</p>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-base">
          <dt className="text-sub">単価・単位</dt><dd>1kg {formatYen(item.pricePerKg)}・{item.allowPartial ? `${formatKg(item.minGrams)}から${formatKg(item.unitGrams)}ずつ` : "全量での販売"}</dd>
          <dt className="text-sub">納品</dt><dd>{METHOD_LABEL[item.method]}・{formatDay(item.availableFrom)}〜{formatDay(item.availableUntil)}</dd>
          <dt className="text-sub">期限</dt><dd>受付 {formatDateTime(item.acceptUntil)}／回答 {formatDateTime(item.replyUntil)}</dd>
          <dt className="text-sub">量</dt><dd>出品 {formatKg(item.stock.totalGrams)}・申し込める {formatKg(item.stock.availableGrams)}</dd>
        </dl>
        <div className="flex flex-wrap gap-1">
          {item.surplusReason && <span className="rounded-md border border-line px-2 text-sm">余剰理由：{item.surplusReason}</span>}
          {item.isDemo && <DemoBadge />}
        </div>
      </Link>
    </li>
  );
}
