// 購入希望（注文）の決まり。画面とサーバーの両方で使う。
// 流れ：返事待ち →（生産者が承認）→ 販売確定
//        返事待ち →（生産者が条件を変える）→ 条件変更の確認待ち →（飲食店が同意）→ 販売確定
//        返事待ち／条件変更の確認待ち →（生産者が見送る）→ 見送り、（飲食店がやめる）→ 取消、（期限が過ぎる）→ 期限切れ
// 販売確定・見送り・取消・期限切れは終わりの状態で、ほかには変わらない。

export const ORDER_STATUSES = ["pending", "changeRequested", "confirmed", "declined", "cancelled", "expired"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ACTIVE: readonly OrderStatus[] = ["pending", "changeRequested"];

/** 状態の名前（色だけに頼らず、必ず文字で出す） */
/** 状態の名前（仕様の言葉。色だけに頼らず、必ず文字で出す） */
export const STATUS_SHORT: Record<OrderStatus, string> = {
  pending: "回答待ち",
  changeRequested: "条件変更の確認待ち",
  confirmed: "販売確定",
  declined: "見送り",
  cancelled: "取消",
  expired: "期限切れ",
};
/** 状態の説明つきの名前 */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "回答待ち（まだ確定していません）",
  changeRequested: "条件変更の確認待ち（あなたの同意で確定します）",
  confirmed: "販売確定",
  declined: "見送り（今回は売れません）",
  cancelled: "取消",
  expired: "期限切れ（回答期限までに返事がありませんでした）",
};

type OrderLike = { status: string; replyDeadline: Date };

/** 今の本当の状態（返事の期限を過ぎた返事待ちは、期限切れとして扱う） */
export function effectiveStatus(o: OrderLike, now: Date): OrderStatus {
  const s = o.status as OrderStatus;
  if (ACTIVE.includes(s) && now.getTime() >= o.replyDeadline.getTime()) return "expired";
  return s;
}

/** 仮押さえ中か（期限内の返事待ち・条件変更の確認待ち） */
export const isHolding = (o: OrderLike, now: Date) => ACTIVE.includes(effectiveStatus(o, now));

/**
 * 出品の量の内訳。申し込める量 = 出品した量 − 販売確定 − 仮押さえ中（期限内のもの）
 * （絶対に守るルール1：売りすぎない）
 */
export function stockOf(totalGrams: number, orders: { status: string; replyDeadline: Date; quantityGrams: number; heldGrams: number }[], now: Date) {
  let sold = 0;
  let held = 0;
  for (const o of orders) {
    const s = effectiveStatus(o, now);
    if (s === "confirmed") sold += o.quantityGrams;
    else if (ACTIVE.includes(s)) held += o.heldGrams;
  }
  return { totalGrams, soldGrams: sold, heldGrams: held, availableGrams: Math.max(0, totalGrams - sold - held) };
}

/** 注文できる量か（いちばん少ない量以上・単位の倍数）。問題があれば直し方つきで返す */
export function quantityProblem(grams: number, l: { minGrams: number; unitGrams: number }): string | null {
  if (!Number.isInteger(grams) || grams <= 0) return "数量を入れてください";
  if (grams < l.minGrams) return `いちばん少ない注文量は ${fmt(l.minGrams)} です。${fmt(l.minGrams)} 以上にしてください`;
  if ((grams - l.minGrams) % l.unitGrams !== 0) {
    const lower = grams - ((grams - l.minGrams) % l.unitGrams);
    return `数量は ${fmt(l.unitGrams)} ずつ選べます。${fmt(lower)} か ${fmt(lower + l.unitGrams)} にしてください`;
  }
  return null;
}
const fmt = (g: number) => (g < 1000 ? `${g}g` : `${Number((g / 1000).toFixed(3))}kg`);

/** 選べる数量の一覧（画面の選択肢。最大 maxGrams まで） */
export function quantityChoices(l: { minGrams: number; unitGrams: number }, maxGrams: number, limit = 60): number[] {
  const out: number[] = [];
  for (let g = l.minGrams; g <= maxGrams && out.length < limit; g += l.unitGrams) out.push(g);
  return out;
}

