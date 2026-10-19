// 金額と数量の計算・表示（整数だけで計算する。金額は円、数量はグラム）

/** 商品代 = 1kg の値段 × 量。1円未満は四捨五入 */
export function subtotalYen(pricePerKg: number, grams: number): number {
  return Math.floor((pricePerKg * grams + 500) / 1000);
}

export const formatYen = (yen: number) => `${yen.toLocaleString("ja-JP")}円`;

/** 1500 → 「1.5kg」、500 → 「500g」 */
export function formatKg(grams: number): string {
  return grams < 1000 ? `${grams}g` : `${Number((grams / 1000).toFixed(3))}kg`;
}

/** 画面の「1.5」（kg）をグラムに。正しくなければ null */
export function kgTextToGrams(text: string): number | null {
  const t = text.trim().replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (!/^\d{1,4}(\.\d{1,3})?$/.test(t)) return null;
  const [i, f = ""] = t.split(".");
  return Number(i) * 1000 + Number(f.padEnd(3, "0"));
}

/** 画面の「1,200」（円）を整数に。正しくなければ null */
export function yenTextToInt(text: string): number | null {
  const t = text.trim().replace(/[,，円]/g, "").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  return /^\d{1,7}$/.test(t) ? Number(t) : null;
}
