// 出品の入力の確かめ（サーバー側で必ず使う）。エラーは「どの欄で・どう直すか」を返す
import { dayStartJst, parseDateTime, parseDay } from "./dates";
import { kgTextToGrams, yenTextToInt } from "./money";
import { isPlace, PREFECTURES } from "./regions";

export const UNIT_CHOICES = [250, 500, 1000] as const;
export const REPLY_HOURS = [12, 24, 48] as const;
export const LIMITS = { maxTotalGrams: 1_000_000, maxPricePerKg: 100_000, maxFeeYen: 50_000, nameMax: 30, descMax: 300 };

export type ListingInput = Record<string, string | string[] | undefined>;
export type ListingValue = {
  name: string; variety: string | null; description: string | null;
  totalGrams: number; minGrams: number; unitGrams: number; pricePerKg: number;
  availableFrom: Date; availableUntil: Date; acceptUntil: Date; replyHours: number;
  pickup: boolean; pickupPref: string | null; pickupCity: string | null;
  delivery: boolean; deliveryFeeYen: number | null; deliveryPrefs: string[];
};
export type FieldErrors = Record<string, string>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);
// 文字だけを受け付ける（制御文字は除く）
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");

export function validateListing(input: ListingInput, now: Date): { ok: true; value: ListingValue } | { ok: false; errors: FieldErrors } {
  const e: FieldErrors = {};
  const name = clean(str(input.name));
  if (!name) e.name = "野菜の名前を入れてください（例：なす）";
  else if (name.length > LIMITS.nameMax) e.name = `${LIMITS.nameMax}文字以内にしてください`;
  const variety = clean(str(input.variety));
  if (variety.length > LIMITS.nameMax) e.variety = `${LIMITS.nameMax}文字以内にしてください`;
  const description = clean(str(input.description));
  if (description.length > LIMITS.descMax) e.description = `${LIMITS.descMax}文字以内にしてください（今 ${description.length}文字）`;

  const totalGrams = kgTextToGrams(str(input.totalKg));
  if (totalGrams === null || totalGrams <= 0) e.totalKg = "出品する量を kg で入れてください（例：30）";
  else if (totalGrams > LIMITS.maxTotalGrams) e.totalKg = "1回の出品は 1,000kg までです";
  const pricePerKg = yenTextToInt(str(input.pricePerKg));
  if (pricePerKg === null || pricePerKg <= 0) e.pricePerKg = "1kg あたりの値段を円で入れてください（例：800）";
  else if (pricePerKg > LIMITS.maxPricePerKg) e.pricePerKg = "1kg あたり 100,000円 までです";
  const unitGrams = Number(str(input.unitGrams));
  if (!UNIT_CHOICES.includes(unitGrams as (typeof UNIT_CHOICES)[number])) e.unitGrams = "注文の単位を選んでください";
  const minGrams = kgTextToGrams(str(input.minKg));
  if (minGrams === null || minGrams <= 0) e.minKg = "いちばん少ない注文量を kg で入れてください（例：1）";
  else if (totalGrams && minGrams > totalGrams) e.minKg = "出品する量より少なくしてください";
  else if (!e.unitGrams && minGrams % unitGrams !== 0) e.minKg = `注文の単位（${unitGrams < 1000 ? `${unitGrams}g` : "1kg"}）の倍数にしてください`;

  const availableFrom = parseDay(str(input.availableFrom));
  const availableUntil = parseDay(str(input.availableUntil));
  const today = parseDay(new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10))!;
  if (!availableFrom) e.availableFrom = "受け渡しできる最初の日を選んでください";
  else if (availableFrom < today) e.availableFrom = "今日以降の日を選んでください";
  if (!availableUntil) e.availableUntil = "受け渡しできる最後の日を選んでください";
  else if (availableFrom && availableUntil < availableFrom) e.availableUntil = "最初の日と同じか、それより後の日にしてください";
  else if (availableFrom && availableUntil.getTime() - availableFrom.getTime() > 30 * 86_400_000) e.availableUntil = "受け渡しの期間は30日以内にしてください";
  const acceptUntil = parseDateTime(str(input.acceptUntil));
  if (!acceptUntil) e.acceptUntil = "受付の締め切りの日時を選んでください";
  else if (acceptUntil <= now) e.acceptUntil = "今より後の日時にしてください";
  else if (availableUntil && acceptUntil > new Date(dayStartJst(availableUntil).getTime() + 86_400_000)) e.acceptUntil = "受け渡しの最後の日までにしてください";
  const replyHours = Number(str(input.replyHours));
  if (!REPLY_HOURS.includes(replyHours as (typeof REPLY_HOURS)[number])) e.replyHours = "返事をするまでの時間を選んでください";

  const pickup = str(input.pickup) === "on";
  const delivery = str(input.delivery) === "on";
  if (!pickup && !delivery) e.methods = "受け取り方法を1つ以上選んでください";
  const pickupPref = str(input.pickupPref), pickupCity = str(input.pickupCity);
  if (pickup && !isPlace(pickupPref, pickupCity)) e.pickupPlace = "引き取りの場所（府県と市区町村）を選んでください";
  let deliveryFeeYen: number | null = null;
  const deliveryPrefs = arr(input.deliveryPrefs).filter((c) => PREFECTURES.some((p) => p.code === c));
  if (delivery) {
    deliveryFeeYen = yenTextToInt(str(input.deliveryFeeYen));
    if (deliveryFeeYen === null) e.deliveryFeeYen = "送料を円で入れてください（無料なら 0）";
    else if (deliveryFeeYen > LIMITS.maxFeeYen) e.deliveryFeeYen = "送料は 50,000円 までです";
    if (deliveryPrefs.length === 0) e.deliveryPrefs = "お届けできる府県を1つ以上選んでください";
  }
  if (Object.keys(e).length) return { ok: false, errors: e };
  return {
    ok: true,
    value: {
      name, variety: variety || null, description: description || null,
      totalGrams: totalGrams!, minGrams: minGrams!, unitGrams, pricePerKg: pricePerKg!,
      availableFrom: availableFrom!, availableUntil: availableUntil!, acceptUntil: acceptUntil!, replyHours,
      pickup, pickupPref: pickup ? pickupPref : null, pickupCity: pickup ? pickupCity : null,
      delivery, deliveryFeeYen: delivery ? deliveryFeeYen : null, deliveryPrefs: delivery ? deliveryPrefs : [],
    },
  };
}
