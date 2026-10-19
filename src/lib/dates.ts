// 日付の表示と読み取り（日本時間で扱う）
const JST = 9 * 3_600_000;
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

/** Date → 「10月22日(木)」 */
export function formatDay(d: Date): string {
  const j = new Date(d.getTime() + JST);
  return `${j.getUTCMonth() + 1}月${j.getUTCDate()}日(${WEEK[j.getUTCDay()]})`;
}
/** Date → 「10月22日(木) 18:00」 */
export function formatDateTime(d: Date): string {
  const j = new Date(d.getTime() + JST);
  return `${formatDay(d)} ${j.getUTCHours()}:${String(j.getUTCMinutes()).padStart(2, "0")}`;
}
/** 「2026-10-22」→ その日の 0:00（日本時間）。DB の日付の列にはこの値を入れる */
export function parseDay(text: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const d = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text ? null : d;
}
/** DB の日付（UTC の 0:00）→「2026-10-22」 */
export const dayText = (d: Date) => d.toISOString().slice(0, 10);
/** 今日（日本時間）を「2026-10-22」で */
export const todayText = (now = new Date()) => new Date(now.getTime() + JST).toISOString().slice(0, 10);
/** 日付の列（UTC 0:00）を、日本時間のその日の 0:00 の瞬間に */
export const dayStartJst = (d: Date) => new Date(d.getTime() - JST);
/** 「2026-10-22T18:00」（日本時間）→ Date */
export function parseDateTime(text: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return null;
  const d = new Date(`${text}:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
