// ブラウザの下書き（同じブラウザだけに保存。ログアウトのときに消す）。仕様 5章「中断」
export const DRAFT_PREFIX = "locai3:draft:";

export function loadDraft<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(DRAFT_PREFIX + key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
export function saveDraft(key: string, value: unknown) {
  try {
    localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(value));
  } catch {
    // 保存できない（プライベートモードなど）ときは何もしない
  }
}
export function clearDraft(key?: string) {
  try {
    if (key) localStorage.removeItem(DRAFT_PREFIX + key);
    else Object.keys(localStorage).filter((k) => k.startsWith(DRAFT_PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch {
    // 何もしない
  }
}
