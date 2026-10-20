"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { KomameChat } from "./komame-chat";
import { INPUT_HELP } from "@/lib/komame";
import type { Role } from "@/lib/roles";

// 案内の現在地はブラウザ側で確定してから表示する。
// 遷移中に古いURLの説明がストリームされても、サーバーの文章と食い違わない。
const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

type Icon = "home" | "search" | "orders" | "wanted" | "account" | "add" | "login";
function MenuIcon({ name }: { name: Icon }) {
  const paths: Record<Icon, string> = {
    home: "m3 11 9-8 9 8M5 10v11h5v-7h4v7h5V10",
    search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    orders: "M6 4h12v18H6zM9 2h6v4H9zM9 11h6M9 15h6",
    wanted: "M4 5h16v12H9l-5 4V5Zm4 4h8M8 13h5",
    account: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M3 22v-3a9 7 0 0 1 18 0v3",
    add: "M4 4h16v16H4zM12 8v8M8 12h8",
    login: "M14 3h7v18h-7M3 12h13m-5-5 5 5-5 5",
  };
  return <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

/** 軽いSVGの案内役。動きを減らす設定ではCSSでアニメーションを止める。 */
export function Komame() {
  return (
    <svg className="komame" viewBox="0 0 100 110" aria-hidden="true" focusable="false">
      <ellipse cx="50" cy="101" rx="25" ry="5" fill="#d3eadd" />
      <g className="komame-body">
        <path d="M35 86 30 99M65 86l6 13" stroke="#336c43" strokeWidth="5" strokeLinecap="round" />
        <path className="komame-hand" d="M76 61q18-16 15-24" fill="none" stroke="#36894d" strokeWidth="7" strokeLinecap="round" />
        <path d="M24 62 12 76" stroke="#36894d" strokeWidth="7" strokeLinecap="round" />
        <path d="M20 49C20 23 81 24 81 49c0 28-13 45-31 45S20 77 20 49Z" fill="#fffdf0" stroke="#218046" strokeWidth="3" />
        <g className="komame-leaf"><path d="M49 33C20 31 20 8 22 5c24 1 32 14 27 28Z" fill="#06b64f" /><path d="M48 34C43 9 66 3 80 10c-2 21-12 28-32 24Z" fill="#78c844" /><path d="m49 34 9-15" stroke="#278245" strokeWidth="3" strokeLinecap="round" /></g>
        <g className="komame-eyes" fill="#224d34"><ellipse cx="37" cy="54" rx="3.3" ry="4.5" /><ellipse cx="63" cy="54" rx="3.3" ry="4.5" /></g>
        <ellipse cx="29" cy="65" rx="6" ry="3.4" fill="#f3afa6" /><ellipse cx="71" cy="65" rx="6" ry="3.4" fill="#f3afa6" />
        <path d="M42 65q8 10 16 0" fill="#f7bb9a" stroke="#30633f" strokeWidth="2.5" strokeLinecap="round" />
        <path d="m43 84 5 3 7-3" fill="none" stroke="#b6d9b8" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function hint(path: string, role: Role | null) {
  if (path.includes("/listings/new")) return "野菜、量、受け渡し、確認。4つの手順で出品できるよ。";
  if (path.includes("/edit")) return "値段や量を直したら、最後に内容を確認して保存しよう。";
  if (path.includes("/messages")) return "気になることは、ここでお店と相談できるよ。";
  if (path.startsWith("/producer/orders")) return "届いた購入希望を確認しよう。承認すると販売確定になるよ。";
  if (path.startsWith("/producer/wanted")) return "お店が欲しい野菜を探せるよ。条件が合えば出品で応えよう。";
  if (path.startsWith("/producer")) return "ここは自分の出品一覧。新しい野菜は「新しく出品する」から。";
  if (path.startsWith("/listings/")) return "量と送料込みの金額を確認しよう。送るだけでは、まだ確定しないよ。";
  if (path.startsWith("/orders")) return "注文の状況を文字で確認できるよ。相談は注文のメッセージから。";
  if (path.startsWith("/wanted")) return "欲しい野菜が見つからなければ、希望を農家さんに伝えてみよう。";
  if (path.startsWith("/search")) return "欲しい量、予算、使う日を入れよう。送料込みで探せるよ。";
  if (path.startsWith("/signup")) return "お店か農家かを選んで登録しよう。役割はあとから変えられないよ。";
  if (path.startsWith("/login")) return "登録したメールアドレスとパスワードを入れてね。";
  if (path.startsWith("/account")) return role === "producer" ? "農園の地域や育てている野菜を書いて、お店に伝えよう。" : "お店の名前や地域を確認・変更できるよ。";
  return "案内役のこまめだよ。ここを押すと、使い方を短く説明するよ。";
}

export function MobileExperience({ role }: { role: Role | null }) {
  const path = usePathname();
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  const dialog = useRef<HTMLDialogElement>(null);
  const avatar = useRef<HTMLButtonElement>(null);
  useEffect(() => { document.querySelector(".app-page-region")?.scrollTo(0, 0); }, [path]);
  const [step, setStep] = useState(0);
  const [seen, setSeen] = useState(true);
  const [collapsed, setCollapsed] = useState(true);
  const [temporarilyHidden, setTemporarilyHidden] = useState(false);
  const bubbleHidden = collapsed || temporarilyHidden;
  const [chatOpen, setChatOpen] = useState(false);
  const [pageHint, setPageHint] = useState("");
  const [fieldHint, setFieldHint] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 画面が変わったら前の入力欄の説明を消す
    setFieldHint("");
    const region = document.querySelector(".app-page-region");
    if (!region) return;
    const update = () => setPageHint(region.querySelector<HTMLElement>("[data-komame-cue]")?.dataset.komameCue ?? "");
    const focus = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) || !region.contains(t)) return;
      setTemporarilyHidden(true);
      const key = t.name || t.id;
      setFieldHint(key === "name" && !path.includes("/listings/") ? "表示するお店・農園の名前を入れよう。" : INPUT_HELP[key] ?? "");
    };
    const blur = () => { /* こまめを押したときも直前の欄の説明を読めるように残す */ };
    const quiet = () => setTemporarilyHidden(true);
    const invalid = () => setFieldHint("入力欄の近くに直し方が出ているよ。内容を直してから、もう一度進もう。");
    const observer = new MutationObserver(update);
    observer.observe(region, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-komame-cue"] });
    update();
    region.addEventListener("pointerdown", quiet); region.addEventListener("scroll", quiet);
    region.addEventListener("focusin", focus); region.addEventListener("focusout", blur); region.addEventListener("invalid", invalid, true);
    return () => { observer.disconnect(); region.removeEventListener("pointerdown", quiet); region.removeEventListener("scroll", quiet); region.removeEventListener("focusin", focus); region.removeEventListener("focusout", blur); region.removeEventListener("invalid", invalid, true); };
  }, [path]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 初回の案内表示だけ、ブラウザ内の保存を読む
    try { setSeen(localStorage.getItem("locai3-guide-seen-v1") === "yes"); } catch { setSeen(false); }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 説明バーを閉じた設定をブラウザから復元する
    try { setCollapsed(localStorage.getItem("locai3-guide-collapsed-v1") !== "no"); } catch { /* 保存不可なら説明を表示 */ }
  }, []);
  const toggleExplanation = (hide: boolean) => {
    setCollapsed(hide);
    try { localStorage.setItem("locai3-guide-collapsed-v1", hide ? "yes" : "no"); } catch { /* 保存不可でも開閉はできる */ }
    if (hide) avatar.current?.focus();
  };
  const openTutorial = () => { setStep(0); dialog.current?.showModal(); };
  const finish = () => {
    try { localStorage.setItem("locai3-guide-seen-v1", "yes"); } catch { /* 保存不可でも案内は使える */ }
    setSeen(true);
    dialog.current?.close();
  };
  const nav: { href: string; label: string; icon: Icon }[] = role === "producer" ? [
    { href: "/producer", label: "出品", icon: "add" }, { href: "/producer/orders", label: "購入希望", icon: "orders" },
    { href: "/producer/wanted", label: "募集", icon: "wanted" }, { href: "/account", label: "マイページ", icon: "account" },
  ] : role === "buyer" ? [
    { href: "/search", label: "探す", icon: "search" }, { href: "/orders", label: "注文", icon: "orders" },
    { href: "/wanted", label: "募集", icon: "wanted" }, { href: "/account", label: "マイページ", icon: "account" },
  ] : [
    { href: "/", label: "ホーム", icon: "home" }, { href: "/search", label: "探す", icon: "search" },
    { href: "/signup", label: "登録", icon: "add" }, { href: "/login", label: "ログイン", icon: "login" },
  ];
  const steps = [
    { title: "こんにちは、こまめだよ", text: "地元の野菜を、必要な量だけ。むずかしい言葉を使わず、いっしょに進めよう。", tip: "いつでも、このキャラクターを押してね。" },
    { title: "下の4つから移動しよう", text: role === "producer" ? "「出品」で野菜を登録。「購入希望」でお店からの申し込み。「募集」でお店の希望。「マイページ」で農園の情報を見られるよ。" : role === "buyer" ? "「探す」で野菜を検索。「注文」で状況を確認。「募集」で欲しい野菜を伝える。「マイページ」でお店の情報を見られるよ。" : "まずは「探す」で野菜を見てみよう。使ってみたくなったら「登録」。登録済みなら「ログイン」から始めよう。", tip: "緑になっているのが、今いる場所だよ。" },
    { title: role === "producer" ? "出品は4つの短い手順" : "欲しい量と予算で探そう", text: role === "producer" ? "野菜と写真、量と値段、期限と受け渡し、最後に確認。戻っても入力は残るよ。" : "野菜の名前、欲しい量、送料込みの予算、使う日と受け取り方を入れよう。候補からくわしい内容を確認できるよ。", tip: "分からない欄は、近くの説明を読んでね。" },
    { title: "送っただけでは、まだ確定しないよ", text: role === "producer" ? "購入希望が届いたら条件を確認して回答しよう。「承認」で販売確定。条件を変えたときは、お店の同意を待つよ。" : "購入希望を送ったら、農家さんの回答を待とう。「販売確定」の表示が出たら、支払い・受け渡しをメッセージで相談しよう。", tip: "このサイトはデモ。実際の売買や支払いはしないでね。" },
  ];
  const active = (href: string) => path === href || (href === "/producer" ? path.startsWith("/producer/listings/") : href !== "/" && path.startsWith(href + "/"));
  if (!ready) return null;
  return (
    <>
      <nav className="mobile-navigation" aria-label="下のメニュー">
        {nav.map(item => <Link key={item.href} href={item.href} aria-current={active(item.href) ? "page" : undefined} className={active(item.href) ? "mobile-menu-item is-current" : "mobile-menu-item"}><MenuIcon name={item.icon} /><span>{item.label}</span></Link>)}
      </nav>
      <aside className={bubbleHidden ? "komame-guide is-collapsed" : "komame-guide"} aria-label="こまめの使い方案内">
        <button ref={avatar} type="button" className="komame-avatar" aria-label={bubbleHidden ? "こまめの説明を開く" : "こまめに相談する"} onClick={() => { if (bubbleHidden) { setTemporarilyHidden(false); toggleExplanation(false); } else setChatOpen(v => !v); }}><Komame /></button>
        {!bubbleHidden && !chatOpen && <div className="komame-bubble">
          <div className="komame-bubble-heading"><b>{seen ? "こまめのひとこと" : "はじめての方へ"}</b><button type="button" className="komame-dismiss" aria-label="こまめの説明バーを閉じる" onClick={() => toggleExplanation(true)}>閉じる <span aria-hidden="true">×</span></button></div>
          <button type="button" className="komame-launcher" aria-label="こまめの使い方ガイドを開く" aria-describedby="komame-hint" onClick={openTutorial}><span id="komame-hint">{fieldHint || pageHint || hint(path, role)}</span><span className="komame-call">タップで使い方を見る ›</span></button>
          <button type="button" className="komame-consult" onClick={() => setChatOpen(true)}>料理・野菜を相談する</button>
        </div>}
      </aside>
      <KomameChat role={role} open={chatOpen} onClose={() => { setChatOpen(false); requestAnimationFrame(() => avatar.current?.focus()); }} />
      <dialog ref={dialog} className="komame-tutorial" aria-labelledby="komame-title" onCancel={finish}>
        <div className="guide-modal-content">
          <div className="flex items-center justify-between gap-3"><p className="font-bold text-brand-dark">こまめの使い方ガイド</p><button type="button" className="guide-close" onClick={finish} aria-label="案内を閉じる">閉じる</button></div>
          <div className="guide-character"><Komame /></div>
          <div className="guide-progress" aria-label={`全4つのうち${step + 1}つ目`}>{steps.map((_, i) => <span key={i} className={i === step ? "current" : ""} />)}<span className="guide-step-number">{step + 1} / 4</span></div>
          <section aria-live="polite" aria-atomic="true"><h2 id="komame-title" className="text-xl font-bold">{steps[step].title}</h2><p className="mt-3">{steps[step].text}</p><p className="guide-tip">{steps[step].tip}</p></section>
          <div className="guide-actions">{step > 0 && <button type="button" className="guide-back" onClick={() => setStep(s => s - 1)}>戻る</button>}<button type="button" className="guide-next" onClick={step === 3 ? finish : () => setStep(s => s + 1)}>{step === 3 ? "使ってみる" : "次へ"}</button></div>
        </div>
      </dialog>
    </>
  );
}
