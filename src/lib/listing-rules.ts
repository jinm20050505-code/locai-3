// 出品の入力の確かめ（サーバー側で必ず使う）。エラーは「どの欄で・どう直すか」を返す。
// 仕様の範囲：数量 0.5〜1,000kg、自由記述 500文字以内（5章）。値段・送料の上限はアプリで決めた仮の値
import { dayStartJst, parseDateTime, parseDay } from "./dates";
import type { FeeBand } from "./delivery";
import { kgTextToGrams, yenTextToInt } from "./money";
import { isPlace, PREFECTURES } from "./regions";

export const UNIT_CHOICES = [250, 500, 1000] as const;
export const SURPLUS_CHOICES = ["規格外", "豊作", "その他"] as const;
export const LIMITS = { maxTotalGrams: 1_000_000, minTotalGrams: 500, maxPricePerKg: 100_000, maxFeeYen: 50_000, nameMax: 30, textMax: 500, maxBands: 3 };

export type ListingInput = Record<string, string | string[] | undefined>;
export type ListingValue = {
  name: string; variety: string | null; description: string | null; surplusReason: string | null;
  totalGrams: number; minGrams: number; unitGrams: number; pricePerKg: number; allowPartial: boolean;
  availableFrom: Date; availableUntil: Date; acceptUntil: Date; replyUntil: Date;
  pickup: boolean; pickupPref: string | null; pickupCity: string | null;
  delivery: boolean; deliveryFeeYen: number | null; deliveryPrefs: string[]; deliveryMaxOrders: number | null; deliveryQuote: boolean; deliveryWeekdays: number[];
  courier: boolean; courierPrefs: string[]; courierFees: FeeBand[] | null; courierTemp: string | null; courierDays: number | null; courierQuote: boolean;
  wantedPostId: string | null;
};
export type FieldErrors = Record<string, string>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? v.split(",") : []);
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
const prefsOf = (v: unknown) => arr(v).filter((c) => PREFECTURES.some((p) => p.code === c));

export function validateListing(input: ListingInput, now: Date): { ok: true; value: ListingValue } | { ok: false; errors: FieldErrors } {
  const e: FieldErrors = {};
  const name = clean(str(input.name));
  if (!name) e.name = "野菜の名前を入れてください（例：なす）";
  else if (name.length > LIMITS.nameMax) e.name = `${LIMITS.nameMax}文字以内にしてください`;
  const variety = clean(str(input.variety));
  if (variety.length > LIMITS.nameMax) e.variety = `${LIMITS.nameMax}文字以内にしてください`;
  const description = clean(str(input.description));
  if (description.length > LIMITS.textMax) e.description = `${LIMITS.textMax}文字以内にしてください（今 ${description.length}文字）`;
  let surplusReason: string | null = str(input.surplusReason) || null;
  if (surplusReason === "その他") surplusReason = clean(str(input.surplusOther)) || "その他";
  if (surplusReason && surplusReason.length > 50) e.surplusReason = "余剰理由は50文字以内にしてください";

  const totalGrams = kgTextToGrams(str(input.totalKg));
  if (totalGrams === null || totalGrams <= 0) e.totalKg = "出品する量を kg で入れてください（例：30）";
  else if (totalGrams < LIMITS.minTotalGrams || totalGrams > LIMITS.maxTotalGrams) e.totalKg = "出品する量は 0.5kg から 1,000kg までです";
  const pricePerKg = yenTextToInt(str(input.pricePerKg));
  if (pricePerKg === null || pricePerKg <= 0) e.pricePerKg = "1kg あたりの値段を円で入れてください（例：800）";
  else if (pricePerKg > LIMITS.maxPricePerKg) e.pricePerKg = "1kg あたり 100,000円 までです";
  const allowPartial = str(input.allowPartial) !== "no";
  const unitGrams = Number(str(input.unitGrams));
  if (!UNIT_CHOICES.includes(unitGrams as (typeof UNIT_CHOICES)[number])) e.unitGrams = "注文の単位を選んでください";
  let minGrams = allowPartial ? kgTextToGrams(str(input.minKg)) : totalGrams;
  if (allowPartial) {
    if (minGrams === null || minGrams <= 0) e.minKg = "いちばん少ない注文量を kg で入れてください（例：1）";
    else if (totalGrams && minGrams > totalGrams) e.minKg = "出品する量より少なくしてください";
    else if (!e.unitGrams && minGrams % unitGrams !== 0) e.minKg = `注文の単位（${unitGrams < 1000 ? `${unitGrams}g` : "1kg"}）の倍数にしてください`;
  }
  if (!minGrams) minGrams = 0;

  const availableFrom = parseDay(str(input.availableFrom));
  const availableUntil = parseDay(str(input.availableUntil));
  const today = parseDay(new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10))!;
  if (!availableFrom) e.availableFrom = "納品できる最初の日を選んでください";
  else if (availableFrom < today) e.availableFrom = "今日以降の日を選んでください";
  if (!availableUntil) e.availableUntil = "納品できる最後の日を選んでください";
  else if (availableFrom && availableUntil < availableFrom) e.availableUntil = "最初の日と同じか、それより後の日にしてください";
  else if (availableFrom && availableUntil.getTime() - availableFrom.getTime() > 30 * 86_400_000) e.availableUntil = "納品の期間は30日以内にしてください";
  const acceptUntil = parseDateTime(str(input.acceptUntil));
  if (!acceptUntil) e.acceptUntil = "購入希望の受付期限を選んでください";
  else if (acceptUntil <= now) e.acceptUntil = "今より後の日時にしてください";
  const replyUntil = parseDateTime(str(input.replyUntil));
  const lastDay = availableUntil ? new Date(dayStartJst(availableUntil).getTime() + 86_400_000) : null;
  if (!replyUntil) e.replyUntil = "回答期限を選んでください";
  else if (acceptUntil && replyUntil < acceptUntil) e.replyUntil = "受付期限と同じか、それより後にしてください";
  else if (lastDay && replyUntil > lastDay) e.replyUntil = "納品できる最後の日までにしてください（納品に間に合うように）";

  const pickup = str(input.pickup) === "on";
  const delivery = str(input.delivery) === "on";
  const courier = str(input.courier) === "on";
  if (!pickup && !delivery && !courier) e.methods = "受け渡し方法を1つ以上選んでください";
  const pickupPref = str(input.pickupPref), pickupCity = str(input.pickupCity);
  if (pickup && !isPlace(pickupPref, pickupCity)) e.pickupPlace = "引き取りの場所（府県と市区町村）を選んでください";
  let deliveryFeeYen: number | null = null, deliveryMaxOrders: number | null = null;
  const deliveryPrefs = prefsOf(input.deliveryPrefs);
  const deliveryQuote = delivery && str(input.deliveryQuote) === "on";
  const deliveryWeekdays = delivery ? [...new Set(arr(input.deliveryWeekdays).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort() : [];
  if (delivery) {
    if (!deliveryQuote) {
      deliveryFeeYen = yenTextToInt(str(input.deliveryFeeYen));
      if (deliveryFeeYen === null) e.deliveryFeeYen = "配達料を円で入れてください（無料なら 0。分からなければ「見積もる」を選ぶ）";
      else if (deliveryFeeYen > LIMITS.maxFeeYen) e.deliveryFeeYen = "配達料は 50,000円 までです";
    }
    if (deliveryPrefs.length === 0) e.deliveryPrefs = "配達できる府県を1つ以上選んでください";
    const m = str(input.deliveryMaxOrders);
    if (m) {
      deliveryMaxOrders = /^\d{1,3}$/.test(m) && Number(m) > 0 ? Number(m) : null;
      if (deliveryMaxOrders === null) e.deliveryMaxOrders = "受けられる件数は 1〜999 の数字で入れてください（上限がなければ空のまま）";
    }
  }
  const courierPrefs = prefsOf(input.courierPrefs);
  let courierFees: FeeBand[] | null = null, courierTemp: string | null = null, courierDays: number | null = null;
  const courierQuote = courier && str(input.courierQuote) === "on";
  if (courier) {
    if (courierPrefs.length === 0) e.courierPrefs = "宅配発送できる府県を1つ以上選んでください";
    const bands: FeeBand[] = [];
    for (let i = 1; i <= LIMITS.maxBands; i++) {
      const kg = str(input[`band${i}Kg`]), fee = str(input[`band${i}Fee`]);
      if (!kg && !fee) continue;
      const g = kgTextToGrams(kg), y = yenTextToInt(fee);
      if (!g || y === null || y > LIMITS.maxFeeYen) { e.courierFees = `送料の${i}段目を直してください（重さは kg、送料は円の数字）`; break; }
      bands.push({ upToGrams: g, feeYen: y });
    }
    if (!e.courierFees && bands.length === 0 && !courierQuote) e.courierFees = "送料を1段以上入れてください（例：5kg まで 900円）。分からなければ「見積もる」を選ぶ";
    courierFees = courierQuote ? null : bands.sort((a, b) => a.upToGrams - b.upToGrams);
    courierTemp = str(input.courierTemp) === "chilled" ? "chilled" : "normal";
    const d = str(input.courierDays);
    courierDays = /^\d$/.test(d) ? Number(d) : null;
    if (courierDays === null || courierDays < 1) e.courierDays = "届くまでの目安を 1〜9 日で入れてください";
  }
  const wantedPostId = /^[0-9a-f-]{36}$/.test(str(input.wantedPostId)) ? str(input.wantedPostId) : null;
  if (Object.keys(e).length) return { ok: false, errors: e };
  return {
    ok: true,
    value: {
      name, variety: variety || null, description: description || null, surplusReason,
      totalGrams: totalGrams!, minGrams, unitGrams, pricePerKg: pricePerKg!, allowPartial,
      availableFrom: availableFrom!, availableUntil: availableUntil!, acceptUntil: acceptUntil!, replyUntil: replyUntil!,
      pickup, pickupPref: pickup ? pickupPref : null, pickupCity: pickup ? pickupCity : null,
      delivery, deliveryFeeYen: delivery ? deliveryFeeYen : null, deliveryPrefs: delivery ? deliveryPrefs : [], deliveryMaxOrders: delivery ? deliveryMaxOrders : null, deliveryQuote, deliveryWeekdays,
      courier, courierPrefs: courier ? courierPrefs : [], courierFees: courier ? courierFees : null, courierTemp, courierDays, courierQuote,
      wantedPostId,
    },
  };
}
