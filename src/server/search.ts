// 条件での検索（サーバー側だけ）。並び順はアプリの決まりで決め、AI には決めさせない（仕様「AIの役割と公平な候補表示」）。
// - 対象：受付中で、数量・送料込み予算・使用日・受け取り方法・地域がすべて合う出品だけ
// - 3つに分ける：リピート候補（前に販売確定した農家）／条件に合う候補／新しい農家の候補
// - 並び：適合度の高い順。同じくらいなら、表示された回数の少ない農家を先にし、さらに日ごとに順番を入れ替える
// - 同じ農家の出品は、1つの区分に2件まで（残りは「この農家のほかの出品」）
// 適合度の重み・「新しい農家」の日数・2件までの数は、アプリで決めた仮の値
import { createHash } from "node:crypto";
import { sameGroup } from "@/lib/alternatives";
import { todayText } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { methodFee, type Method } from "@/lib/delivery";
import { matches, searchTerms } from "@/lib/kana";
import { subtotalYen } from "@/lib/money";
import { quantityProblem, stockOf } from "@/lib/order-rules";
import { ORDER_TOTAL_MAX } from "./orders";

export type SearchMode = "exact" | "alt" | "any";
export type SearchInput = { mode: SearchMode; q: string; usage: string; grams: number; budgetYen: number; useDate: Date; pref: string; city: string; methods: Method[] };
export const PER_PRODUCER = 2;
export const NEWCOMER_DAYS = 60;
const GROUPS = ["repeat", "match", "newcomer"] as const;
export type Group = (typeof GROUPS)[number];
export const GROUP_LABEL: Record<Group, string> = { repeat: "リピート候補（前に取引した農家さん）", match: "条件に合う候補", newcomer: "新しい農家さんの候補" };

const DAY = 86_400_000;

export async function search(input: SearchInput, viewerId: string | null, now: Date) {
  const db = getDb();
  const rows = await db.listing.findMany({
    where: { status: "open", acceptUntil: { gt: now }, replyUntil: { gt: now } },
    include: {
      orders: { where: { status: { in: ["pending", "changeRequested", "confirmed"] } }, select: { status: true, replyDeadline: true, quantityGrams: true, heldGrams: true } },
      photo: { select: { listingId: true } },
      producer: { select: { id: true, name: true, prefecture: true, city: true, intro: true, isDemo: true, createdAt: true, photo: { select: { userId: true } } } },
    },
  });
  const terms = input.mode === "any" ? [] : searchTerms(input.q);
  const group = input.mode === "alt" ? sameGroup(input.q) : null;
  const altTerms = group ? group.items.flatMap(searchTerms) : [];
  const reasonCount = new Map<string, number>();
  const count = (r: string) => reasonCount.set(r, (reasonCount.get(r) ?? 0) + 1);

  const candidates = rows.flatMap(({ orders, photo, ...l }) => {
    const direct = input.mode === "any" || matches(terms, l.name, l.variety);
    const alternative = !direct && input.mode === "alt" && altTerms.length > 0 && matches(altTerms, l.name, l.variety);
    if (!direct && !alternative) return [];
    const stock = stockOf(l.totalGrams, orders, now);
    const reasons: string[] = [];
    if (stock.availableGrams < input.grams) reasons.push("残りの量が足りない");
    else if (quantityProblem(input.grams, l)) reasons.push(l.allowPartial ? "販売単位に合わない" : "全量での購入だけ");
    if (input.useDate < l.availableFrom) reasons.push("使用日までに納品できない");
    const options = input.methods.map((m) => ({ m, f: methodFee(l, m, input.pref, input.grams) }));
    const okOptions = options.filter((o) => o.f.ok).map((o) => ({ method: o.m, feeYen: (o.f as { feeYen: number }).feeYen, arrives: o.m === "courier" ? new Date(l.availableFrom.getTime() + (l.courierDays ?? 1) * DAY) : l.availableFrom }));
    const usable = okOptions.filter((o) => o.arrives <= input.useDate);
    if (okOptions.length === 0) reasons.push("受け取り方法・地域が合わない");
    else if (usable.length === 0 && !reasons.includes("使用日までに納品できない")) reasons.push("使用日までに納品できない");
    const sub = subtotalYen(l.pricePerKg, input.grams);
    const best = (usable.length ? usable : okOptions).sort((a, b) => a.feeYen - b.feeYen)[0];
    const total = sub + (best?.feeYen ?? 0);
    if (best && total > input.budgetYen) reasons.push("送料込みの予算を超える");
    if (total > ORDER_TOTAL_MAX) reasons.push("注文合計の上限（100,000円）を超える");
    if (reasons.length) { reasons.forEach(count); return []; }
    // 適合度（0〜1）：予算の余裕・使用日に近い納品・選んだ受け取り方法の順
    const slack = (input.budgetYen - total) / input.budgetYen;
    const gapDays = Math.max(0, (input.useDate.getTime() - best!.arrives.getTime()) / DAY);
    const methodRank = input.methods.indexOf(best!.method);
    const fit = 0.5 * Math.min(1, slack * 2) + 0.3 / (1 + gapDays) + 0.2 * (1 - methodRank / Math.max(1, input.methods.length));
    return [{ ...l, hasPhoto: !!photo, producerHasPhoto: !!l.producer.photo, stock, grams: input.grams, subtotalYen: sub, method: best!.method, feeYen: best!.feeYen, totalYen: total, alternative, fit, fitBand: Math.round(fit * 5) }];
  });

  // 区分を決めるための数（販売確定の実績・前の取引・表示の回数）
  const producerIds = [...new Set(candidates.map((c) => c.producerId))];
  const [sales, repeats, shows] = await Promise.all([
    db.order.groupBy({ by: ["producerId"], where: { producerId: { in: producerIds }, status: "confirmed" }, _count: true }),
    viewerId ? db.order.groupBy({ by: ["producerId"], where: { producerId: { in: producerIds }, buyerId: viewerId, status: "confirmed" }, _count: true }) : Promise.resolve([]),
    db.impression.groupBy({ by: ["producerId"], where: { producerId: { in: producerIds }, createdAt: { gt: new Date(now.getTime() - 7 * DAY) } }, _count: true }),
  ]);
  const sold = new Map(sales.map((x) => [x.producerId, x._count]));
  const repeat = new Set(repeats.map((x) => x.producerId));
  const shown = new Map(shows.map((x) => [x.producerId, x._count]));
  const day = todayText(now);
  const rotate = (id: string) => createHash("sha256").update(id + day).digest().readUInt32BE(0);

  const items = candidates.map((c) => ({
    ...c,
    group: (repeat.has(c.producerId) ? "repeat" : !sold.get(c.producerId) || now.getTime() - c.producer.createdAt.getTime() < NEWCOMER_DAYS * DAY ? "newcomer" : "match") as Group,
    shownThisWeek: shown.get(c.producerId) ?? 0,
  }));
  const order = (a: (typeof items)[number], b: (typeof items)[number]) => b.fitBand - a.fitBand || a.shownThisWeek - b.shownThisWeek || rotate(a.id) - rotate(b.id);
  const result = Object.fromEntries(GROUPS.map((g) => {
    const list = items.filter((x) => x.group === g).sort(order);
    const per = new Map<string, number>();
    const shownList: typeof list = [];
    const more: typeof list = [];
    for (const x of list) {
      const n = per.get(x.producerId) ?? 0;
      (n < PER_PRODUCER ? shownList : more).push(x);
      per.set(x.producerId, n + 1);
    }
    return [g, { shown: shownList, more }];
  })) as Record<Group, { shown: typeof items; more: typeof items }>;

  // 表示した記録（露出の偏りを確かめる・次の並びで表示の少ない農家を先にするため）
  const records = GROUPS.flatMap((g) => result[g].shown.map((x, i) => ({ listingId: x.id, producerId: x.producerId, viewerId, grp: g, position: i })));
  if (records.length) await db.impression.createMany({ data: records });
  return { groups: result, total: items.length, reasonCount: [...reasonCount.entries()].sort((a, b) => b[1] - a[1]), alternativeGroup: group?.group ?? null };
}

/** 前回の条件を保存する（飲食店ごとに1件） */
export async function savePreset(userId: string, conditions: Record<string, string>) {
  await getDb().searchPreset.upsert({ where: { userId }, create: { userId, conditions }, update: { conditions } });
}
export async function loadPreset(userId: string) {
  const p = await getDb().searchPreset.findUnique({ where: { userId } });
  return (p?.conditions as Record<string, string> | undefined) ?? null;
}
