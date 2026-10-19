// 移行先での確認：登録済みのデータと写真が画面に出るか（架空のデモのアカウントでログインする。パスワードは表示しない）
import { readFileSync } from "node:fs";
import { chromium, devices } from "playwright";

const B = process.env.E2E_BASE_URL ?? "http://localhost:3004";
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(B)) process.exit(1);
const acc = readFileSync(new URL("../../demo-accounts.local.txt", import.meta.url), "utf8");
const cred = (name) => { const m = acc.match(new RegExp(`${name}（(?:農家|お店)）\\n\\s+メール：(\\S+)\\n\\s+パスワード：(\\S+)`)); return { email: m[1], password: m[2] }; };
const res = [];
const ok = (l, c) => res.push(`${c ? "OK" : "NG"}  ${l}`);
const browser = await chromium.launch();
async function login(name, opts) {
  const p = await (await browser.newContext(opts)).newPage();
  p.setDefaultTimeout(30000);
  const c = cred(name);
  await p.goto(`${B}/login`);
  await p.getByLabel("メールアドレス").fill(c.email);
  await p.getByLabel("パスワード").fill(c.password);
  await p.getByRole("button", { name: "ログインする" }).click();
  await p.waitForLoadState("networkidle");
  return p;
}
const loaded = (p, sel) => p.locator(sel).evaluateAll((imgs) => imgs.filter((i) => i.complete && i.naturalWidth > 0).length);
try {
  const bp = await login("小料理屋みかみ（架空）", devices["Pixel 7"]);
  ok("お店（架空）が、移行前のパスワードでログインできる", bp.url().endsWith("/search"));
  await bp.goto(`${B}/orders`);
  await bp.getByRole("heading", { name: /今週の確保済み食材/ }).waitFor();
  ok("マイページ：移行前の注文（今週の確保済み食材の万願寺唐辛子）が出る", (await bp.locator("main:visible").innerText()).includes("万願寺唐辛子"));
  await bp.goto(`${B}/search?go=1&mode=exact&q=${encodeURIComponent("賀茂茄子")}&kg=1&budget=5000&date=${new Date(Date.now() + 9 * 3_600_000 + 4 * 86_400_000).toISOString().slice(0, 10)}&pref=27&city=${encodeURIComponent("大阪市")}&methods=courier&methods=delivery&methods=pickup`);
  await bp.waitForLoadState("networkidle");
  ok("検索：移行前の出品（賀茂茄子）が写真つきで出る", (await loaded(bp, "main:visible li img")) >= 1);
  const href = await bp.locator("main:visible li a", { hasText: "賀茂茄子" }).first().getAttribute("href");
  await bp.goto(B + href);
  const shown = async (alt) => { const img = bp.locator("main:visible").getByAltText(alt).first(); await img.waitFor(); await img.evaluate((i) => i.complete || new Promise((r) => i.addEventListener("load", r, { once: true }))); return img.evaluate((i) => i.naturalWidth > 0); };
  ok("詳細：アップロードした出品の写真と、生産者のプロフィール写真が表示される", (await shown("なすの写真")) && (await shown("坂田農園（架空）の写真")));
  const pp = await login("坂田農園（架空）", { viewport: { width: 1280, height: 900 } });
  await pp.goto(`${B}/producer/orders`);
  await pp.getByText(/販売可能 30kg／購入希望/).waitFor();
  ok("農家：移行前の購入希望と集計（販売可能30kg）が出る", true);
} catch (e) {
  ok(`確認の途中で止まりました：${String(e.message).split("\n")[0]}`, false);
} finally {
  console.log(res.join("\n"));
  await browser.close();
}
