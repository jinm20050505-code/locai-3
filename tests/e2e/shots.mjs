// 画面の見た目の確認（スマホとパソコンの幅でスクリーンショットを撮る）。手元のアプリ（localhost）だけ
import { chromium, devices } from "playwright";
const B = process.env.E2E_BASE_URL ?? "http://localhost:3004";
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(B)) process.exit(1);
const OUT = new URL("./output/", import.meta.url).pathname;
const browser = await chromium.launch();
const errs = [];
const pages = (process.argv[2] ?? "/,/search,/search?q=なす&kg=3").split(",");
for (const [label, opts] of [["mobile", devices["Pixel 7"]], ["desktop", { viewport: { width: 1280, height: 900 } }]]) {
  const p = await (await browser.newContext(opts)).newPage();
  p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  for (const path of pages) {
    await p.goto(B + path);
    await p.waitForLoadState("networkidle");
    const name = path.replace(/[^a-z0-9]+/gi, "_") || "top";
    await p.screenshot({ path: `${OUT}${label}${name}.png`, fullPage: true });
    // 文字の大きさの確認：本文が16px未満の要素がないか
    const small = await p.evaluate(() => [...document.querySelectorAll("main *, header *, footer *")].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => `${e.tagName}:${e.textContent.trim().slice(0, 20)}`));
    const smallBtn = await p.evaluate(() => [...document.querySelectorAll("main button, main a[class*='min-h-12'], main input[type=radio], main select")].filter((e) => e.getBoundingClientRect().height > 0 && e.tagName !== "INPUT" && e.getBoundingClientRect().height < 47.5).map((e) => `${e.tagName}:${e.textContent.trim().slice(0, 20)}:${Math.round(e.getBoundingClientRect().height)}`));
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    console.log(`${label} ${path}：16px未満の文字 ${small.length}件${small.length ? `（${small.slice(0, 3).join("／")}）` : ""}・48px未満のボタン ${smallBtn.length}件${smallBtn.length ? `（${smallBtn.slice(0, 3).join("／")}）` : ""}・横はみ出し ${overflow ? "あり" : "なし"}`);
  }
}
console.log(`画面のエラー：${errs.length}件 ${errs.slice(0, 3).join(" / ")}`);
await browser.close();
