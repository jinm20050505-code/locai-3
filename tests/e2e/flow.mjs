// 画面での一連の流れの確認（架空のアカウント・架空の出品。パスワードは毎回ランダムで表示しない）。手元のアプリ（localhost:3004）だけ
import { chromium, devices } from "playwright";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

process.loadEnvFile(new URL("../../.env.local", import.meta.url));
const B = process.env.E2E_BASE_URL ?? "http://localhost:3004";
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(B) || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL)) process.exit(1);
const OUT = new URL("./output/", import.meta.url).pathname;
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const stamp = Date.now().toString(36);
const pw = randomBytes(12).toString("base64url");
const ITEM = `確認かぶ${stamp}`;
const res = [];
const ok = (l, c) => res.push(`${c ? "OK" : "NG"}  ${l}`);
const browser = await chromium.launch();
const errs = [];
async function page(opts) {
  const p = await (await browser.newContext(opts)).newPage();
  p.setDefaultTimeout(30000);
  p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  p.on("dialog", (d) => d.accept());
  p.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  return p;
}
const main = (p) => p.locator("main:visible").first();
async function signup(p, role, name, pref, city) {
  await p.goto(`${B}/signup`);
  await p.getByLabel(role === "buyer" ? /お店（飲食店）/ : /農家（生産者）/).check();
  await p.getByLabel(role === "buyer" ? "お店の名前" : "農園の名前").fill(name);
  await p.getByLabel(/のある場所（府県）/).selectOption({ label: pref });
  await p.getByLabel(/のある場所（市区町村）/).selectOption({ label: city });
  await p.getByLabel("メールアドレス").fill(`e2e-${role}-${randomBytes(4).toString("hex")}-${stamp}@example.com`);
  await p.getByLabel("パスワード（8文字以上）").fill(pw);
  await p.getByRole("button", { name: "登録する" }).click();
  await p.waitForURL(new RegExp(role === "buyer" ? "/search$" : "/producer$"));
}
const created = [];
try {
  // ---- 登録：エラーのときも入力が残る
  const bp = await page(devices["Pixel 7"]);
  await bp.goto(`${B}/signup`);
  await bp.getByLabel(/お店（飲食店）/).check();
  await bp.getByLabel("お店の名前").fill("入力が残るか確認（架空）");
  await bp.getByLabel("メールアドレス").fill("まちがい");
  await bp.getByRole("button", { name: "登録する" }).click();
  await bp.getByText(/メールアドレスの形が正しくありません/).waitFor();
  ok("登録：エラーは欄の近くに理由と直し方が出て、入力した名前は残る", (await bp.getByLabel("お店の名前").inputValue()) === "入力が残るか確認（架空）" && (await bp.getByText("府県と市区町村を選んでください").count()) === 1);

  // ---- 農家：登録 → 出品（写真つき）
  const pp = await page({ viewport: { width: 1280, height: 900 } });
  await signup(pp, "producer", `テスト確認農園${stamp}（架空）`, "京都府", "南丹市");
  ok("農家：登録すると出品一覧が開き、主な操作は「野菜を出品する」", await pp.getByRole("link", { name: "野菜を出品する" }).first().isVisible());
  await pp.getByRole("link", { name: "野菜を出品する" }).first().click();
  await pp.waitForURL(/listings\/new/);
  const shot = await page({ viewport: { width: 1600, height: 1200 } });
  await shot.setContent('<body style="margin:0;background:radial-gradient(circle,#fff,#7a3);"><h1 style="font-size:160px;margin:200px">かぶ</h1></body>');
  const photo = `${OUT}e2e-photo.jpg`;
  writeFileSync(photo, await shot.screenshot({ type: "jpeg", quality: 85 }));
  await pp.getByLabel(/野菜の名前/).fill(ITEM);
  await pp.getByLabel(/^写真/).setInputFiles(photo);
  await pp.getByAltText("選んだ写真").waitFor();
  await pp.screenshot({ path: `${OUT}wizard-1.png`, fullPage: true });
  await pp.getByRole("button", { name: "次へ（量と値段）" }).click();
  await pp.getByLabel(/出品する量/).fill("10");
  await pp.getByLabel(/1kg あたりの値段/).fill("abc"); // わざと間違える
  await pp.getByRole("button", { name: "次へ（受け取り方法と期間）" }).click();
  await pp.getByRole("button", { name: "次へ（確認）" }).click();
  await pp.getByRole("button", { name: "出品する" }).click();
  await pp.getByText(/1kg あたりの値段を円で入れてください/).waitFor();
  ok("出品：サーバーのエラーは、その欄のある手順に戻って欄の近くに出し、ほかの入力は残る", (await pp.getByLabel(/出品する量/).inputValue()) === "10");
  await pp.getByLabel(/1kg あたりの値段/).fill("600");
  await pp.getByRole("button", { name: "次へ（受け取り方法と期間）" }).click();
  await pp.getByRole("button", { name: "次へ（確認）" }).click();
  await pp.screenshot({ path: `${OUT}wizard-4.png`, fullPage: true });
  await pp.getByRole("button", { name: "出品する" }).click();
  await pp.waitForURL(/done=created/);
  const L = (await db.query(`SELECT l.id, (p."listingId" IS NOT NULL) AS photo, (SELECT length(data) FROM listing_photo WHERE "listingId" = l.id) AS size FROM listing l LEFT JOIN listing_photo p ON p."listingId" = l.id WHERE l.name = $1`, [ITEM])).rows[0];
  created.push(L.id);
  ok(`出品できた（写真は端末で縮めて保存：${Math.round(L.size / 1024)}KB）`, L.photo && L.size < 1_500_000);
  await pp.screenshot({ path: `${OUT}producer-list.png`, fullPage: true });

  // ---- お店：登録 → 探す → 詳細 → 確認 → 送る（連打）
  await signup(bp, "buyer", `テスト確認食堂${stamp}（架空）`, "大阪府", "大阪市");
  await bp.getByLabel("野菜の名前").fill(ITEM);
  await bp.getByRole("button", { name: "この条件で探す" }).click();
  await bp.getByRole("heading", { name: new RegExp(`「${ITEM}」：1件`) }).waitFor();
  const card = bp.getByRole("link", { name: new RegExp(ITEM) }).first();
  ok("一覧：写真・送料込みの総額・残りの量が出る", (await card.innerText()).includes("600円") && (await card.innerText()).includes("残り 10kg") && (await card.locator("img").count()) === 1);
  await card.click();
  await bp.waitForURL(/\/listings\//);
  await bp.getByLabel("数量").selectOption({ label: "3kg（1,800円）" });
  ok("詳細：送料込みの総額（目安）が数量に合わせて変わる", (await main(bp).innerText()).includes("1,800円"));
  await bp.screenshot({ path: `${OUT}detail-mobile.png`, fullPage: true });
  await bp.getByRole("button", { name: "内容を確認する" }).click();
  const t1 = await main(bp).innerText();
  ok("確認：「購入希望を送っただけでは、まだ確定しません」と、承認で販売確定になることを示す", t1.includes("購入希望を送っただけでは、まだ確定しません") && t1.includes("承認すると「販売確定」"));
  await bp.screenshot({ path: `${OUT}confirm-mobile.png`, fullPage: true });
  await bp.getByRole("button", { name: "購入希望を送る" }).dblclick();
  await bp.waitForURL(/\/orders\/.+done=sent/);
  const O1 = new URL(bp.url()).pathname.split("/").pop();
  await bp.getByText("農家さんの返事待ち（まだ確定していません）").waitFor();
  ok("送ると注文の画面で「返事待ち（まだ確定していません）」と出る。連打しても1件", (await main(bp).innerText()).includes("農家さんの返事待ち（まだ確定していません）") && (await db.query(`SELECT count(*)::int n FROM "order" WHERE "listingId" = $1`, [L.id])).rows[0].n === 1);
  await bp.screenshot({ path: `${OUT}order-pending-mobile.png`, fullPage: true });

  // メッセージ（文字のまま表示）
  await bp.getByLabel(/メッセージを書く/).fill("<b>よろしく</b>お願いします（架空）");
  await bp.getByRole("button", { name: "メッセージを送る" }).click();
  await bp.waitForURL(/done=message/);

  // ---- 農家：承認
  await pp.goto(`${B}/producer/orders`);
  await pp.getByRole("heading", { name: /返事が必要（1件）/ }).waitFor();
  await pp.getByRole("link", { name: new RegExp(ITEM) }).first().click();
  await pp.getByText("<b>よろしく</b>お願いします（架空）").waitFor();
  ok("農家：メッセージは文字のまま届く（タグとして動かない）", (await pp.locator("main:visible b", { hasText: "よろしく" }).count()) === 0);
  await pp.screenshot({ path: `${OUT}producer-order-desktop.png`, fullPage: true });
  await pp.getByRole("button", { name: "承認する（販売確定）" }).click();
  await pp.waitForURL(/done=approved/);
  await bp.goto(`${B}/orders/${O1}`);
  await bp.getByText(/販売確定です。受け渡しの日時/).waitFor().catch(() => {});
  ok("承認すると、お店の画面も「販売確定」", (await main(bp).innerText()).includes("販売確定です。受け渡しの日時"));

  // ---- 2件目：農家が数量を変えて提案 → お店が同意
  const apply = async (label) => {
    await bp.goto(`${B}/listings/${L.id}`);
    await bp.getByLabel("数量").selectOption({ label });
    await bp.getByRole("button", { name: "内容を確認する" }).click();
    await bp.getByRole("button", { name: "購入希望を送る" }).click();
    await bp.waitForURL(/done=sent/);
    return new URL(bp.url()).pathname.split("/").pop();
  };
  const O2 = await apply("4kg（2,400円）");
  await pp.goto(`${B}/orders/${O2}`);
  await pp.getByText("数量を変えて提案する").click();
  await pp.getByLabel(/提案する数量/).fill("2");
  await pp.getByLabel(/ひとこと/).fill("今週は2kgなら用意できます（架空）");
  await pp.getByRole("button", { name: "この数量で提案する" }).click();
  await pp.waitForURL(/done=proposed/);
  await bp.goto(`${B}/orders/${O2}`);
  await bp.getByText("農家さんからの変更の提案").waitFor();
  const t2 = await main(bp).innerText();
  ok("提案：お店に、変更前と変更後の数量・総額が並ぶ", t2.includes("4kg → 2kg") && t2.includes("2,400円 → 1,200円"));
  await bp.screenshot({ path: `${OUT}proposal-mobile.png`, fullPage: true });
  await bp.getByRole("button", { name: "この変更に同意する（販売確定）" }).click();
  await bp.waitForURL(/done=accepted/);
  ok("同意すると販売確定（2kg・1,200円）", (await main(bp).innerText()).includes("2kg") && (await db.query(`SELECT status, "totalYen" FROM "order" WHERE id = $1`, [O2])).rows[0].totalYen === 1200);

  // ---- 3件目：お店が取り消す、4件目：農家が見送る
  const O3 = await apply("1kg（600円）");
  await bp.getByRole("button", { name: "この購入希望を取り消す" }).click();
  await bp.waitForURL(/done=cancelled/);
  const O4 = await apply("1kg（600円）");
  await pp.goto(`${B}/orders/${O4}`);
  await pp.getByRole("button", { name: "今回は見送る" }).click();
  await pp.waitForURL(/done=declined/);
  await pp.goto(`${B}/producer`);
  const stock = await pp.locator('dl[aria-label="量の内訳"]').first().innerText();
  ok("出品一覧の内訳：出品10kg・販売確定5kg（3＋2）・取り置き0kg・残り5kg", /出品した量\s*10kg[\s\S]*販売確定\s*5kg[\s\S]*取り置き）\s*0g[\s\S]*申し込める量）\s*5kg/.test(stock));
  void O3;

  // ---- 他人の注文は見えない・役割の違う画面は開けない
  const xp = await page(devices["Pixel 7"]);
  await signup(xp, "buyer", `テスト別の店${stamp}（架空）`, "大阪府", "堺市");
  await xp.goto(`${B}/orders/${O1}`);
  ok("ほかのお店は、注文の画面を開けない（見つかりません）", await xp.getByText("ページが見つかりません").isVisible());
  await xp.goto(`${B}/producer`);
  await xp.waitForURL(/\/search$/);
  ok("お店のアカウントで農家の画面を開くと、自分の画面に戻る", xp.url().endsWith("/search"));
  await pp.goto(`${B}/orders`);
  await pp.waitForURL(/\/producer$/);
  ok("農家のアカウントでお店の注文一覧を開くと、自分の画面に戻る", pp.url().endsWith("/producer"));
  const anon = await page();
  await anon.goto(`${B}/listings/${L.id}`);
  await anon.getByRole("link", { name: "ログインして申し込む" }).waitFor().catch(() => {});
  ok("ログインしていない人には「ログインして申し込む」が出る（購入希望は送れない）", await anon.getByRole("link", { name: "ログインして申し込む" }).isVisible());
} finally {
  // 作った架空のデータを消す
  const ids = (await db.query(`SELECT id FROM "user" WHERE name LIKE $1`, [`%${stamp}（架空）`])).rows.map((r) => r.id);
  await db.query(`DELETE FROM "message" WHERE "senderId" = ANY($1)`, [ids]);
  await db.query(`DELETE FROM "order" WHERE "buyerId" = ANY($1) OR "producerId" = ANY($1)`, [ids]);
  await db.query(`DELETE FROM "listing" WHERE "producerId" = ANY($1)`, [ids]);
  await db.query(`DELETE FROM "user" WHERE id = ANY($1)`, [ids]);
  ok(`後片付け：確認用の架空のアカウント ${ids.length}件とその出品・注文を消した`, true);
  ok(`画面のエラーなし（${errs.length}件）`, errs.length === 0);
  await db.end();
  console.log(res.join("\n"));
  if (errs.length) console.log(errs.slice(0, 5).join("\n"));
  await browser.close();
}
