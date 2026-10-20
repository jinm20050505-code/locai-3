import { z } from "zod";
import type { Listing } from "@/generated/prisma/client";
import { parseDay, todayText } from "./dates";
import { deliveryDayOk, methodFee, METHODS, type Method } from "./delivery";
import { matches, searchTerms } from "./kana";
import { quantityProblem } from "./order-rules";
import { subtotalYen } from "./money";
export const ChatInput = z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(1000) })).min(1).max(12) });
export type ChatMessage = z.infer<typeof ChatInput>["messages"][number];
export const KomamePlan = z.object({ reply: z.string().min(1).max(800), vegetables: z.array(z.string().min(1).max(30)).max(8), date: z.string().nullable(), kg: z.number().min(0.5).max(1000).nullable(), budgetYen: z.number().int().min(1).max(100000).nullable(), pref: z.enum(["25", "26", "27", "28", "29", "30"]).nullable(), method: z.enum(METHODS).nullable() });
export type KomamePlan = z.infer<typeof KomamePlan>;
export type KomameListing = Listing & { availableGrams: number; hasPhoto: boolean; place: string };
export type KomameCard = { id: string; name: string; hasPhoto: boolean; place: string; availableGrams: number; grams: number; pricePerKg: number; subtotalYen: number; totalYen: number | null; method: Method | null; notes: string[]; useDate: string | null; isDemo: boolean };
// 金額・残量・URLをAIに作らせず、実在の出品で条件を照合する。
export function komameCards(rows: KomameListing[], plan: KomamePlan, profilePref: string | null, now = new Date()): KomameCard[] {
  const useDate = plan.date ? parseDay(plan.date) : null;
  if (plan.date && (!useDate || plan.date < todayText(now))) return [];
  const pref = plan.pref ?? profilePref;
  const cards = rows.flatMap(l => {
    if (l.status !== "open" || l.acceptUntil <= now || l.replyUntil <= now || l.availableGrams <= 0) return [];
    if (!plan.vegetables.some(v => matches(searchTerms(v), l.name, l.variety))) return [];
    const grams = plan.kg === null ? l.minGrams : Math.round(plan.kg * 1000);
    if (quantityProblem(grams, l) || grams > l.availableGrams || (!l.allowPartial && grams !== l.totalGrams)) return [];
    const methods = plan.method ? [plan.method] : [...METHODS];
    const options = methods.flatMap(method => {
      const fee = methodFee(l, method, pref, grams);
      if (!fee.ok) return [];
      const start = Math.max(l.availableFrom.getTime(), parseDay(todayText(now))!.getTime());
      const end = Math.min(l.availableUntil.getTime(), useDate?.getTime() ?? l.availableUntil.getTime());
      if (method === "delivery") {
        let found = false;
        for (let day = start; day <= end; day += 86400000) if (deliveryDayOk(l.deliveryWeekdays, new Date(day))) { found = true; break; }
        if (!found) return [];
      } else if (start > end || (method === "courier" && useDate && start + (l.courierDays ?? 1) * 86400000 > useDate.getTime())) return [];
      const certain = !!plan.method && (method === "pickup" || !!pref) && !fee.quote;
      const total = certain ? subtotalYen(l.pricePerKg, grams) + fee.feeYen : null;
      if (total !== null && (total > 100000 || (plan.budgetYen !== null && total > plan.budgetYen))) return [];
      return [{ method, total, quote: fee.quote }];
    });
    if (!options.length) return [];
    const best = options.sort((a,b) => (a.total ?? Infinity) - (b.total ?? Infinity))[0];
    const sub = subtotalYen(l.pricePerKg, grams);
    if (sub > 100000 || (plan.budgetYen !== null && sub > plan.budgetYen)) return [];
    const notes: string[] = [];
    if (plan.kg === null) notes.push("数量未定：最少の注文量で表示。人数から量を決めつけていません");
    if (!useDate) notes.push("使う日を確認してください");
    if (!plan.method) notes.push("受け取り方法を確認してください");
    if (!pref && plan.method !== "pickup") notes.push("届け先の府県を確認してください");
    if (best.quote) notes.push("送料は農家さんの見積もり待ちです");
    if (plan.budgetYen !== null) notes.push("予算はこの商品1件ごとの比較です。料理全体の合計ではありません");
    return [{ id: l.id, name: l.name, hasPhoto: l.hasPhoto, place: l.place, availableGrams: l.availableGrams, grams, pricePerKg: l.pricePerKg, subtotalYen: sub, totalYen: best.total, method: plan.method, notes, useDate: plan.date, isDemo: l.isDemo, producerId: l.producerId }];
  }).sort((a,b) => (a.totalYen ?? a.subtotalYen) - (b.totalYen ?? b.subtotalYen) || a.id.localeCompare(b.id));
  const per = new Map<string,number>();
  return cards.filter(c => { const n = per.get(c.producerId) ?? 0; per.set(c.producerId, n+1); return n < 2; }).slice(0,6).map(({producerId: _, ...c}) => { void _; return c; });
}
export const INPUT_HELP: Record<string,string> = {
  name: "野菜の名前を短く書こう。品種は別の欄に書けるよ。", totalKg: "今回出品する量を書こう。注文が入った分はアプリが数えるよ。", pricePerKg: "1kgの値段を入れよう。値段を決めるのは農家さんだよ。", minKg: "お店が注文できる、いちばん少ない量だよ。", unitGrams: "500gずつ、1kgずつなど、注文できる量の刻みだよ。", description: "育て方やおすすめの料理を、短く書いてみよう。相談から文章作りも手伝えるよ。", deliveryFeeYen: "配達料を入れると、お店が合計金額を確認できるよ。", kg: "その野菜を何kgほしいか入れよう。人数だけでは必要な量は決められないよ。", grams: "選べる量の中から、使い切れる量を選ぼう。", budget: "送料も含めて使える金額を入れよう。", date: "野菜を使う日・受け取る日を確かめよう。", useDate: "使う日に間に合うか、受け取り日と一緒に確かめよう。", photo: "野菜の様子が分かる写真を選ぼう。顔や住所が写っていないかも確認してね。"
};
