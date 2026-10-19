// 条件での検索（サーバー側だけ）。並び順はアプリの決まり（送料込みの総額が安い順）で決め、AI には決めさせない
import { getDb } from "@/lib/db";
import { matches, searchTerms } from "@/lib/kana";
import { subtotalYen } from "@/lib/money";
import { quantityProblem, stockOf } from "@/lib/order-rules";

export type SearchInput = { q: string; grams: number | null; useDate: Date | null; budgetYen: number | null; method: "any" | "pickup" | "delivery"; buyerPref: string | null };
export type Candidate = Awaited<ReturnType<typeof search>>["matched"][number];

export async function search(input: SearchInput, now: Date) {
  const rows = await getDb().listing.findMany({
    where: { status: "open", acceptUntil: { gt: now } },
    include: {
      orders: { where: { status: { in: ["pending", "changeRequested", "confirmed"] } }, select: { status: true, replyDeadline: true, quantityGrams: true, heldGrams: true } },
      photo: { select: { listingId: true } },
      producer: { select: { name: true, prefecture: true, city: true, isDemo: true, createdAt: true } },
    },
  });
  const terms = searchTerms(input.q);
  const items = rows.flatMap(({ orders, photo, ...l }) => {
    if (!matches(terms, l.name, l.variety)) return [];
    const stock = stockOf(l.totalGrams, orders, now);
    if (stock.availableGrams < l.minGrams) return []; // 残りがない
    const grams = input.grams ?? l.minGrams;
    // 受け取り方法ごとの総額。お届けは、お店の府県が届け先に入っているときだけ
    const options: { method: "pickup" | "delivery"; feeYen: number }[] = [];
    if (l.pickup && input.method !== "delivery") options.push({ method: "pickup", feeYen: 0 });
    if (l.delivery && input.method !== "pickup" && (!input.buyerPref || l.deliveryPrefs.includes(input.buyerPref))) options.push({ method: "delivery", feeYen: l.deliveryFeeYen ?? 0 });
    const reasons: string[] = [];
    if (options.length === 0) reasons.push(input.method === "delivery" ? "お店の地域へのお届けがありません" : "選んだ受け取り方法がありません");
    const qp = input.grams ? quantityProblem(grams, l) : null;
    if (qp) reasons.push(qp);
    if (input.grams && grams > stock.availableGrams) reasons.push(`残りは ${stock.availableGrams / 1000}kg です`);
    if (input.useDate && (input.useDate < l.availableFrom || input.useDate > l.availableUntil)) reasons.push("使う日に受け渡しの期間が合いません");
    const sub = subtotalYen(l.pricePerKg, grams);
    const best = options.length ? options.reduce((a, b) => (a.feeYen <= b.feeYen ? a : b)) : { method: "pickup" as const, feeYen: 0 };
    const total = sub + best.feeYen;
    if (input.budgetYen !== null && total > input.budgetYen) reasons.push(`送料込みの総額 ${total.toLocaleString("ja-JP")}円 が予算を超えます`);
    return [{ ...l, hasPhoto: !!photo, stock, grams, subtotalYen: sub, method: best.method, feeYen: best.feeYen, totalYen: total, reasons, isNewProducer: now.getTime() - l.producer.createdAt.getTime() < 60 * 86_400_000 }];
  });
  // 名前は合うが、ほかの条件が合わないもの（near）は、理由を出して参考に見せる
  const matched = items.filter((x) => x.reasons.length === 0);
  const near = items.filter((x) => x.reasons.length > 0);
  // 公平な並び：送料込みの総額が安い順 → 受け渡しの早い順 → 出品の新しい順（人気や売上では並べない）
  const order = (a: (typeof items)[number], b: (typeof items)[number]) => a.totalYen - b.totalYen || a.availableFrom.getTime() - b.availableFrom.getTime() || b.createdAt.getTime() - a.createdAt.getTime();
  matched.sort(order);
  near.sort(order);
  return { matched, near };
}
