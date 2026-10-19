"use server";

// 登録・ログイン・ログアウト（サーバー側で実行）
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { isPlace } from "@/lib/regions";
import { ROLE_HOME, ROLES, type Role } from "@/lib/roles";

export type AuthState = { errors?: Record<string, string>; values?: Record<string, string> };
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim().slice(0, 200);
/** 戻り先は、このサイトの中だけ */
const safeNext = (v: string) => (v.startsWith("/") && !v.startsWith("//") ? v : "");

export async function signupAction(_: AuthState, fd: FormData): Promise<AuthState> {
  const values = { role: s(fd, "role"), name: s(fd, "name"), prefecture: s(fd, "prefecture"), city: s(fd, "city"), email: s(fd, "email"), next: s(fd, "next") };
  const password = String(fd.get("password") ?? "");
  const errors: Record<string, string> = {};
  if (!ROLES.includes(values.role as Role)) errors.role = "「お店」か「農家」を選んでください";
  if (!values.name) errors.name = values.role === "producer" ? "農園の名前を入れてください" : "お店の名前を入れてください";
  else if (values.name.length > 40) errors.name = "40文字以内にしてください";
  if (!isPlace(values.prefecture, values.city)) errors.place = "府県と市区町村を選んでください";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = "メールアドレスの形が正しくありません（例：mikami@example.com）";
  if (password.length < 8) errors.password = "パスワードは8文字以上にしてください";
  else if (password.length > 128) errors.password = "パスワードは128文字以内にしてください";
  if (Object.keys(errors).length) return { errors, values };
  try {
    const r = await getAuth().api.signUpEmail({ body: { email: values.email, password, name: values.name, role: values.role as Role }, headers: await headers() });
    await getDb().user.update({ where: { id: r.user.id }, data: { prefecture: values.prefecture, city: values.city } });
  } catch (e) {
    const msg = (e as { body?: { code?: string } }).body?.code === "USER_ALREADY_EXISTS" || /exist/i.test(String((e as Error).message)) ? "このメールアドレスは登録済みです。ログインしてください" : "登録できませんでした。少し待ってから、もう一度お試しください";
    return { errors: { email: msg }, values };
  }
  redirect(safeNext(values.next) || ROLE_HOME[values.role as Role]);
}

export async function loginAction(_: AuthState, fd: FormData): Promise<AuthState> {
  const values = { email: s(fd, "email"), next: s(fd, "next") };
  const password = String(fd.get("password") ?? "");
  if (!values.email || !password) return { errors: { form: "メールアドレスとパスワードを入れてください" }, values };
  let role: Role;
  try {
    const r = await getAuth().api.signInEmail({ body: { email: values.email, password }, headers: await headers() });
    role = (r.user as { role: Role }).role;
  } catch {
    return { errors: { form: "メールアドレスかパスワードが違います。もう一度入れてください" }, values };
  }
  redirect(safeNext(values.next) || ROLE_HOME[role]);
}

export async function logoutAction() {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/");
}
