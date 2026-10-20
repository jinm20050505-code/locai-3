// 「探しています」（サーバー側だけ）。飲食店が条件を地域の生産者に公開する。
// 生産者に見せるのは、地域（府県・市区町村）と条件だけ。店名・住所・アカウントの番号は渡さない
import { getDb } from "@/lib/db";
import { parseDay, todayText } from "@/lib/dates";
import { METHODS, type Method } from "@/lib/delivery";
import { kgTextToGrams, yenTextToInt } from "@/lib/money";
import { isPlace } from "@/lib/regions";

export type WantedErrors = Record<string, string>;
const DAILY_LIMIT = 5; // 1日に公開できる数（アプリで決めた仮の値）

export function validateWanted(f: Record<string, string | string[]>, now: Date) {
  const e: WantedErrors = {};
  const s = (k: string) => (typeof f[k] === "string" ? (f[k] as string).trim() : "");
  const mode = s("mode") === "any" ? "any" : s("mode") === "alt" ? "alt" : "exact";
  const item = s("q").slice(0, 30);
  if (mode !== "any" && !item) e.q = "食材を入れてください（決めていなければ「種類を問わない」を選ぶ）";
  const grams = kgTextToGrams(s("kg"));
  if (!grams || grams < 500 || grams > 1_000_000) e.kg = "希望数量は 0.5kg から 1,000kg までで入れてください";
  const budgetYen = yenTextToInt(s("budget"));
  if (!budgetYen || budgetYen > 100_000) e.budget = "予算は 1円 から 100,000円 までで入れてください";
  const useDate = parseDay(s("date"));
  if (!useDate || s("date") < todayText(now)) e.date = "使用日を今日以降で選んでください";
  const pref = s("pref"), city = s("city");
  if (!isPlace(pref, city)) e.place = "届け先の地域（府県と市区町村）を選んでください";
  const methods = (Array.isArray(f.methods) ? f.methods : [f.methods]).filter((m): m is Method => METHODS.includes(m as Method));
  if (methods.length === 0) e.methods = "受け取り方法を1つ以上選んでください";
  const usage = s("usage").slice(0, 500);
  if (Object.keys(e).length) return { ok: false as const, errors: e };
  return { ok: true as const, value: { item: mode === "any" ? null : item, altOk: mode === "alt", grams: grams!, budgetYen: budgetYen!, useDate: useDate!, prefecture: pref, city, methods, usage: usage || null } };
}

export async function createWanted(buyerId: string, v: Extract<ReturnType<typeof validateWanted>, { ok: true }>["value"], now = new Date()) {
  const db = getDb();
  if ((await db.wantedPost.count({ where: { buyerId, createdAt: { gt: new Date(now.getTime() - 86_400_000) } } })) >= DAILY_LIMIT) return { ok: false as const, problem: "「探しています」は1日5件までです" };
  const w = await db.wantedPost.create({ data: { ...v, buyerId, status: "open" }, select: { id: true } });
  return { ok: true as const, id: w.id };
}

/** 自分の「探しています」と、応えてくれた出品 */
export function listOwnWanted(buyerId: string) {
  return getDb().wantedPost.findMany({ where: { buyerId }, orderBy: { createdAt: "desc" }, include: { listings: { where: { status: "open" }, select: { id: true, name: true, variety: true, pricePerKg: true, producer: { select: { name: true } } } } } });
}

export async function closeWanted(buyerId: string, id: string) {
  return (await getDb().wantedPost.updateMany({ where: { id, buyerId, status: "open" }, data: { status: "closed" } })).count === 1;
}

const PUBLIC = { id: true, item: true, altOk: true, grams: true, budgetYen: true, useDate: true, prefecture: true, city: true, methods: true, usage: true, isDemo: true, createdAt: true } as const;

/** 生産者が見る「探しています」の一覧（公開中で、使用日が今日以降のもの）。畑と同じ府県のものを先に */
export async function listOpenWanted(producerPref: string | null, now = new Date()) {
  const today = parseDay(todayText(now))!;
  const rows = await getDb().wantedPost.findMany({ where: { status: "open", useDate: { gte: today } }, orderBy: { useDate: "asc" }, take: 100, select: { ...PUBLIC, _count: { select: { listings: true } } } });
  return rows.sort((a, b) => Number(b.prefecture === producerPref) - Number(a.prefecture === producerPref));
}

export function getPublicWanted(id: string) {
  return getDb().wantedPost.findFirst({ where: { id, status: "open" }, select: PUBLIC });
}

/** 通報（出品・探しています）。同じ人の同じ相手への通報は1回 */
export async function report(reporterId: string, targetType: "listing" | "wanted", targetId: string, reason: string) {
  const r = reason.trim().slice(0, 500);
  if (!r) return { ok: false as const, problem: "通報の理由を書いてください" };
  return getDb().$transaction(async (tx) => {
    // 同じ人の同時送信も、利用者の行をロックして回数を数える。
    await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${reporterId} FOR UPDATE`;
    const target = targetType === "listing"
      ? await tx.listing.findUnique({ where: { id: targetId }, select: { producerId: true, status: true } })
      : await tx.wantedPost.findUnique({ where: { id: targetId }, select: { buyerId: true, status: true } });
    if (!target || target.status !== "open") return { ok: false as const, problem: "公開中の対象が見つかりません" };
    const owner = "producerId" in target ? target.producerId : target.buyerId;
    if (owner === reporterId) return { ok: false as const, problem: "自分の投稿は通報できません" };
    const latest = await tx.report.findFirst({ where: { reporterId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    if (latest && Date.now() - latest.createdAt.getTime() < 6_000) return { ok: false as const, problem: "通報が続いています。少し待ってください" };
    const recent = await tx.report.count({ where: { reporterId, createdAt: { gt: new Date(Date.now() - 60_000) } } });
    if (recent >= 10) return { ok: false as const, problem: "通報が続いています。1分ほど待ってください" };
    await tx.report.upsert({ where: { reporterId_targetType_targetId: { reporterId, targetType, targetId } }, create: { reporterId, targetType, targetId, reason: r }, update: { reason: r, createdAt: new Date() } });
    return { ok: true as const };
  });
}
