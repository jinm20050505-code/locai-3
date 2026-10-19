// ログイン中の利用者（サーバー側だけ）。画面では <Suspense> の中で呼ぶ
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { getDb } from "./db";
import { ROLE_HOME, type Role } from "./roles";

export type CurrentUser = { id: string; name: string; role: Role; prefecture: string | null; city: string | null };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = await getDb().user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, role: true, prefecture: true, city: true } });
  return u ? { ...u, role: u.role as Role } : null;
}

/** 指定の役割でなければ、ログイン画面か自分のホームへ */
export async function requireRole(role: Role, next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  if (user.role !== role) redirect(ROLE_HOME[user.role]);
  return user;
}
