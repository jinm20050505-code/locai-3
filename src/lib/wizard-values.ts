// 出品の内容を、出品の手順の入力欄の値にする（前回の内容を写す・編集で共通）
import { dayText, toJstInput } from "./dates";
import { bandsOf } from "./delivery";

const g2kg = (g: number) => String(Number((g / 1000).toFixed(3)));
type L = {
  name: string; variety: string | null; description: string | null; surplusReason: string | null; totalGrams: number; pricePerKg: number; allowPartial: boolean; minGrams: number; unitGrams: number;
  availableFrom: Date; availableUntil: Date; acceptUntil: Date; replyUntil: Date;
  courier: boolean; courierTemp: string | null; courierDays: number | null; courierPrefs: string[]; courierFees: unknown; courierQuote: boolean;
  delivery: boolean; deliveryFeeYen: number | null; deliveryMaxOrders: number | null; deliveryPrefs: string[]; deliveryQuote: boolean; deliveryWeekdays: number[];
  pickup: boolean; pickupPref: string | null; pickupCity: string | null;
};

export function listingToWizard(l: L, keepDates: boolean): Record<string, string> {
  const known = ["規格外", "豊作"];
  const bands = bandsOf(l.courierFees);
  return {
    name: l.name, variety: l.variety ?? "", description: l.description ?? "",
    surplusReason: l.surplusReason ? (known.includes(l.surplusReason) ? l.surplusReason : "その他") : "", surplusOther: l.surplusReason && !known.includes(l.surplusReason) ? l.surplusReason : "",
    totalKg: g2kg(l.totalGrams), pricePerKg: String(l.pricePerKg), allowPartial: l.allowPartial ? "yes" : "no", minKg: g2kg(l.minGrams), unitGrams: String(l.unitGrams),
    ...(keepDates ? { availableFrom: dayText(l.availableFrom), availableUntil: dayText(l.availableUntil), acceptUntil: toJstInput(l.acceptUntil), replyUntil: toJstInput(l.replyUntil) } : {}),
    courier: l.courier ? "on" : "", courierTemp: l.courierTemp ?? "normal", courierDays: String(l.courierDays ?? 1), courierPrefs: l.courierPrefs.join(","), courierQuote: l.courierQuote ? "on" : "",
    ...Object.fromEntries(bands.flatMap((b, i) => [[`band${i + 1}Kg`, g2kg(b.upToGrams)], [`band${i + 1}Fee`, String(b.feeYen)]])),
    delivery: l.delivery ? "on" : "", deliveryFeeYen: l.deliveryFeeYen === null ? "" : String(l.deliveryFeeYen), deliveryMaxOrders: l.deliveryMaxOrders ? String(l.deliveryMaxOrders) : "", deliveryPrefs: l.deliveryPrefs.join(","),
    deliveryQuote: l.deliveryQuote ? "on" : "", deliveryWeekdays: l.deliveryWeekdays.join(","),
    pickup: l.pickup ? "on" : "", pickupPref: l.pickupPref ?? "", pickupCity: l.pickupCity ?? "",
  };
}
