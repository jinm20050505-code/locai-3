// 受け渡し方法と料金（アプリが計算する）。仕様：宅配発送／自分で配達／引き取り
export const METHODS = ["courier", "delivery", "pickup"] as const;
export type Method = (typeof METHODS)[number];
export const METHOD_LABEL: Record<Method, string> = { courier: "宅配発送", delivery: "農家さんが配達", pickup: "畑で引き取り" };
export const TEMP_LABEL: Record<string, string> = { normal: "常温", chilled: "冷蔵" };

export type FeeBand = { upToGrams: number; feeYen: number };

/** 宅配発送の送料：重さの上限の小さい順に見て、最初に当てはまる段の送料。どの段にも入らなければ null（送れない） */
export function courierFee(bands: FeeBand[], grams: number): number | null {
  const b = [...bands].sort((x, y) => x.upToGrams - y.upToGrams).find((x) => grams <= x.upToGrams);
  return b ? b.feeYen : null;
}

export type MethodListing = {
  courier: boolean; courierPrefs: string[]; courierFees: unknown; courierQuote?: boolean;
  delivery: boolean; deliveryPrefs: string[]; deliveryFeeYen: number | null; deliveryQuote?: boolean;
  pickup: boolean;
};
export const WEEKDAY_LABEL = ["日", "月", "火", "水", "木", "金", "土"];
export const SLOT_LABEL: Record<string, string> = { morning: "午前", afternoon: "午後", evening: "夕方" };

/** その日（DB の日付）に配達できるか。曜日の指定がなければ、どの日でもよい */
export const deliveryDayOk = (weekdays: number[], d: Date) => weekdays.length === 0 || weekdays.includes(d.getUTCDay());

export const bandsOf = (v: unknown): FeeBand[] => (Array.isArray(v) ? v.filter((b) => Number.isInteger(b?.upToGrams) && Number.isInteger(b?.feeYen)) : []);

/** この方法で、この府県へ、この量を受け取れるか。受け取れるなら料金、だめなら理由 */
/** quote：送料・配達料が見積もり（生産者が提示し、店が総額に同意するまで確定しない） */
export function methodFee(l: MethodListing, m: Method, buyerPref: string | null, grams: number): { ok: true; feeYen: number; quote: boolean } | { ok: false; reason: string } {
  if (m === "pickup") return l.pickup ? { ok: true, feeYen: 0, quote: false } : { ok: false, reason: "引き取りはできません" };
  if (m === "delivery") {
    if (!l.delivery) return { ok: false, reason: "配達はしていません" };
    if (buyerPref && !l.deliveryPrefs.includes(buyerPref)) return { ok: false, reason: "お店の地域は配達の範囲外です" };
    return l.deliveryQuote ? { ok: true, feeYen: 0, quote: true } : { ok: true, feeYen: l.deliveryFeeYen ?? 0, quote: false };
  }
  if (!l.courier) return { ok: false, reason: "宅配発送はしていません" };
  if (buyerPref && !l.courierPrefs.includes(buyerPref)) return { ok: false, reason: "お店の地域は宅配発送の範囲外です" };
  if (l.courierQuote) return { ok: true, feeYen: 0, quote: true };
  const fee = courierFee(bandsOf(l.courierFees), grams);
  return fee === null ? { ok: false, reason: "この量は宅配発送できません（重さの上限を超えます）" } : { ok: true, feeYen: fee, quote: false };
}
