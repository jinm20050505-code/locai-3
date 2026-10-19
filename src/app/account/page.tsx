import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AccountForm } from "@/components/auth/account-form";
import { Notice } from "@/components/ui";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <main className="space-y-5">
      <Suspense fallback={<p>読み込んでいます…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
async function Body({ searchParams }: { searchParams: PageProps<"/account">["searchParams"] }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  const sp = await searchParams;
  const u = await getDb().user.findUniqueOrThrow({ where: { id: user.id }, select: { intro: true, items: true, photo: { select: { userId: true } } } });
  return (
    <>
      <h1 className="text-2xl font-bold">{user.role === "producer" ? "生産者プロフィール" : "お店の情報"}</h1>
      {sp.done && <Notice kind="ok" title="保存しました" />}
      {sp.welcome && user.role === "producer" && <Notice title="登録ありがとうございます。まず生産者プロフィールを作りましょう">写真・栽培している品目・こだわりは、お店の候補の画面に表示されます。あとからでも書けます。保存したら「出品一覧」から出品できます。</Notice>}
      <AccountForm role={user.role} name={user.name} pref={user.prefecture ?? ""} city={user.city ?? ""} intro={u.intro ?? ""} items={u.items ?? ""} hasPhoto={!!u.photo} userId={user.id} />
    </>
  );
}
