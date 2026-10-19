// トップ画面。押すボタンは役割ごとに1つ（緑）
import { Suspense } from "react";
import { LinkButton } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";

export default function Home() {
  return (
    <main className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-bold">地元の農家さんの野菜を、必要な量だけ</h1>
        <p>関西の農家さんが出品した野菜を、お店が必要な量だけ申し込めます。</p>
      </section>
      <Suspense fallback={<div className="h-40" />}>
        <MainAction />
      </Suspense>
      <section aria-labelledby="flow" className="space-y-3 rounded-2xl bg-brand-soft p-5">
        <h2 id="flow" className="text-xl font-bold">売り買いが決まるまで</h2>
        <ol className="space-y-3">
          {[
            ["1", "お店が「購入希望」を送る", "この時点では、まだ確定していません。量は取り置き（仮押さえ）されます。"],
            ["2", "農家さんが返事をする", "「売ります」「量を変えて提案」「今回は見送り」のどれかです。"],
            ["3", "双方が条件に合意すると「販売確定」", "量・金額・受け取り方法が決まります。支払いと受け渡しはアプリの外で行います。"],
          ].map(([n, t, d]) => (
            <li key={n} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-strong text-lg font-bold text-white">{n}</span>
              <span><b className="block text-lg">{t}</b><span className="text-base">{d}</span></span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

async function MainAction() {
  const user = await getCurrentUser();
  if (user?.role === "producer") {
    return (
      <div className="space-y-3">
        <LinkButton href="/producer/listings/new">野菜を出品する</LinkButton>
        <LinkButton href="/producer/orders" kind="secondary">届いた購入希望を見る</LinkButton>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <LinkButton href="/search">野菜を探す</LinkButton>
      {user ? (
        <LinkButton href="/orders" kind="secondary">注文の状況を見る</LinkButton>
      ) : (
        <div className="space-y-2">
          <LinkButton href="/signup" kind="secondary">はじめての方（登録する）</LinkButton>
          <p className="text-center text-base text-sub">農家さんは、登録して出品できます。</p>
        </div>
      )}
    </div>
  );
}
