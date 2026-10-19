// 画面の上の案内。役割ごとに、行き先を文字で並べる（アイコンだけにしない）
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "@/app/actions/auth";

const nav = "inline-flex min-h-12 items-center rounded-lg px-3 text-base font-bold text-brand-dark underline-offset-4 hover:underline";

export async function Header() {
  const user = await getCurrentUser();
  const links = !user
    ? [{ href: "/search", label: "野菜を探す" }, { href: "/login", label: "ログイン" }]
    : user.role === "buyer"
      ? [{ href: "/search", label: "野菜を探す" }, { href: "/orders", label: "注文の状況" }, { href: "/account", label: "お店の情報" }]
      : [{ href: "/producer", label: "出品一覧" }, { href: "/producer/orders", label: "購入希望" }, { href: "/account", label: "農園の情報" }];
  return (
    <header className="border-b-4 border-brand bg-white">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-2 px-4 py-2">
        <Link href="/" className="inline-flex min-h-12 items-center gap-2 text-xl font-bold text-ink">
          <span aria-hidden className="inline-block h-7 w-7 rounded-full bg-brand" />
          LocAI <span className="text-base font-normal text-sub">地元の野菜</span>
        </Link>
        {user && <p className="text-base text-sub">{user.name} さん</p>}
      </div>
      <nav aria-label="メニュー" className="mx-auto flex max-w-3xl flex-wrap items-center gap-1 px-2 pb-1">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={nav}>{l.label}</Link>
        ))}
        {user && (
          <form action={logoutAction}>
            <button className={`${nav} text-sub`}>ログアウト</button>
          </form>
        )}
      </nav>
    </header>
  );
}
