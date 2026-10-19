// 移行の確認用に、架空の農家さん（坂田農園・架空）として、画面から写真をアップロードする（出品の写真・プロフィールの写真）。
// ログイン情報は demo-accounts.local.txt から読み、表示しない。手元のアプリ（localhost）だけ
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const B = process.env.E2E_BASE_URL ?? "http://localhost:3004";
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(B)) process.exit(1);
const acc = readFileSync(new URL("../../demo-accounts.local.txt", import.meta.url), "utf8");
const m = acc.match(/坂田農園（架空）（農家）\n\s+メール：(\S+)\n\s+パスワード：(\S+)/);
if (!m) { console.log("デモのアカウントが見つかりません（npm run db:seed のあとで実行）"); process.exit(1); }
const OUT = new URL("./output/", import.meta.url).pathname;
const browser = await chromium.launch();
const shot = await (await browser.newContext({ viewport: { width: 1600, height: 1200 } })).newPage();
await shot.setContent('<body style="margin:0;background:radial-gradient(circle,#ffd,#7a3)"><h1 style="font-size:150px;margin:220px">畑の写真（架空）</h1></body>');
writeFileSync(`${OUT}upload-farm.jpg`, await shot.screenshot({ type: "jpeg", quality: 85 }));
const p = await (await browser.newContext()).newPage();
p.setDefaultTimeout(30000);
await p.goto(`${B}/login`);
await p.getByLabel("メールアドレス").fill(m[1]);
await p.getByLabel("パスワード").fill(m[2]);
await p.getByRole("button", { name: "ログインする" }).click();
await p.waitForURL(/\/producer$/);
// プロフィールの写真
await p.goto(`${B}/account`);
await p.getByLabel(/写真（お店に表示されます）/).setInputFiles(`${OUT}upload-farm.jpg`);
await p.getByRole("button", { name: "保存する" }).click();
await p.waitForURL(/done=1/);
// 出品（賀茂茄子）の写真：編集で写真を選び直す
await p.goto(`${B}/producer`);
const card = p.locator("main:visible li", { hasText: "賀茂茄子" }).first();
await card.getByRole("link", { name: "出品を編集する" }).click();
await p.waitForURL(/\/edit$/);
await p.getByLabel(/^写真/).setInputFiles(`${OUT}upload-farm.jpg`);
await p.getByAltText("選んだ写真").waitFor();
await p.getByRole("button", { name: "次へ（量と値段）" }).click();
await p.getByRole("button", { name: "次へ（期限と受け渡し）" }).click();
await p.getByRole("button", { name: "次へ（確認）" }).click();
await p.getByRole("button", { name: "変更を保存する" }).click();
await p.waitForURL(/done=updated/);
console.log("アップロードしました：プロフィールの写真1枚・出品（賀茂茄子）の写真1枚（どちらも架空）");
await browser.close();
