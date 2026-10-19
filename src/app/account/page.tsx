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
  const u = await getDb().user.findUniqueOrThrow({ where: { id: user.id }, select: { intro: true } });
  return (
    <>
      <h1 className="text-2xl font-bold">{user.role === "producer" ? "農園の情報" : "お店の情報"}</h1>
      {sp.done && <Notice kind="ok" title="保存しました" />}
      <AccountForm role={user.role} name={user.name} pref={user.prefecture ?? ""} city={user.city ?? ""} intro={u.intro ?? ""} />
    </>
  );
}
