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
const day = (n) => new Date(Date.now() + 9 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);
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
// 相談の一覧に出た文。送信中は入力欄にも同じ文が残り getByText が一致してしまうため、一覧（ol）の中だけを見る
const posted = (p, text) => main(p).locator("ol > li").filter({ hasText: text });
async function signup(p, role, name, pref, city) {
  await p.goto(`${B}/signup`);
  await p.getByLabel(role === "buyer" ? /お店（飲食店）/ : /農家（生産者）/).check();
  await p.getByLabel(role === "buyer" ? "お店の名前" : "農園の名前").fill(name);
  await p.getByLabel(/のある場所（府県）/).selectOption({ label: pref });
  await p.getByLabel(/のある場所（市区町村）/).selectOption({ label: city });
  await p.getByLabel("メールアドレス").fill(`e2e-${role}-${randomBytes(4).toString("hex")}-${stamp}@example.com`);
  await p.getByLabel("パスワード（8文字以上）").fill(pw);
  await p.getByRole("button", { name: "登録する" }).click();
  await p.waitForURL(new RegExp(role === "buyer" ? "/search$" : "/account\\?welcome=1$"));
  if (role === "producer") await p.goto(`${B}/producer`);
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
  ok("農家：登録すると出品一覧が開き、主な操作は「新しく出品する」", await pp.getByRole("link", { name: "新しく出品する" }).first().isVisible());
  await pp.getByRole("link", { name: "新しく出品する" }).first().click();
  await pp.waitForURL(/listings\/new/);
  const shot = await page({ viewport: { width: 1600, height: 1200 } });
  await shot.setContent('<body style="margin:0;background:radial-gradient(circle,#fff,#7a3);"><h1 style="font-size:160px;margin:200px">かぶ</h1></body>');
  const photo = `${OUT}e2e-photo.jpg`;
  writeFileSync(photo, await shot.screenshot({ type: "jpeg", quality: 85 }));
  await pp.getByLabel(/食材の名前/).fill(ITEM);
  await pp.getByLabel(/^写真/).setInputFiles(photo);
  await pp.getByAltText("選んだ写真").waitFor();
  await pp.screenshot({ path: `${OUT}wizard-1.png`, fullPage: true });
  await pp.getByRole("button", { name: "次へ（量と値段）" }).click();
  await pp.getByLabel(/販売できる総量/).fill("10");
  await pp.getByLabel(/1kg あたりの値段/).fill("abc"); // わざと間違える
  await pp.getByRole("button", { name: "次へ（期限と受け渡し）" }).click();
  await pp.getByRole("button", { name: "次へ（確認）" }).click();
  await pp.getByRole("button", { name: "出品する" }).click();
  await pp.getByText(/1kg あたりの値段を円で入れてください/).waitFor();
  ok("出品：サーバーのエラーは、その欄のある手順に戻って欄の近くに出し、ほかの入力は残る", (await pp.getByLabel(/販売できる総量/).inputValue()) === "10");
  await pp.getByLabel(/1kg あたりの値段/).fill("600");
  await pp.getByRole("button", { name: "次へ（期限と受け渡し）" }).click();
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
  // 必須の項目が空なら、欄の近くに理由が出て、入力は残る
  await bp.getByLabel("食材の名前").fill(ITEM);
  await bp.getByRole("button", { name: "仕入れ候補を探す" }).click();
  await bp.getByText("希望数量を入れてください").waitFor();
  ok("検索：必須の項目（数量・予算・使用日）が空なら理由が出て、食材の名前は残る", (await bp.getByLabel("食材の名前").inputValue()) === ITEM && (await bp.getByText("予算を入力してください").count()) === 1);
  await bp.getByLabel("希望数量（kg）").fill("1");
  await bp.getByLabel("予算（送料込み・円）").fill("5000");
  await bp.getByLabel("使用日").fill(day(3));
  await bp.getByRole("button", { name: "仕入れ候補を探す" }).click();
  await bp.getByRole("heading", { name: "仕入れ候補：1件" }).waitFor();
  const card = bp.getByRole("link", { name: new RegExp(ITEM) }).first();
  const ct = await card.innerText();
  ok("一覧：写真・合計金額（商品代＋送料）・単価と販売単位・受付期限と回答期限・出品量が出る", ct.includes("合計 600円") && ct.includes("1kg 600円・1kgから500gずつ") && ct.includes("受付") && ct.includes("回答") && ct.includes("出品 10kg") && (await card.locator("img").count()) >= 1);
  ok("一覧：始めたばかりの農家さんは「新しい農家さんの候補」に入る", await bp.getByRole("heading", { name: /新しい農家さんの候補（1件）/ }).isVisible());
  await card.click();
  await bp.waitForURL(/\/listings\//);
  await bp.getByLabel("希望数量", { exact: true }).selectOption({ label: "3kg（商品代 1,800円）" });
  ok("詳細：合計金額（目安）が数量に合わせて変わる", (await main(bp).innerText()).includes("1,800円"));
  await bp.screenshot({ path: `${OUT}detail-mobile.png`, fullPage: true });
  await bp.getByRole("button", { name: "内容を確認する" }).click();
  const t1 = await main(bp).innerText();
  ok("確認：「購入希望を送っただけでは、まだ確定しません」と、承認で販売確定になることを示す", t1.includes("購入希望を送っただけでは、まだ確定しません") && t1.includes("この数量・合計金額・受け取り条件で「販売確定」"));
  await bp.screenshot({ path: `${OUT}confirm-mobile.png`, fullPage: true });
  await bp.getByRole("button", { name: "購入希望を送る" }).dblclick();
  await bp.waitForURL(/\/orders\/.+done=sent/);
  const O1 = new URL(bp.url()).pathname.split("/").pop();
  await bp.getByText("回答待ち（まだ確定していません）").first().waitFor();
  ok("送ると注文の画面で「回答待ち（まだ確定していません）」と出る。連打しても1件", (await main(bp).innerText()).includes("回答待ち（まだ確定していません）") && (await db.query(`SELECT count(*)::int n FROM "order" WHERE "listingId" = $1`, [L.id])).rows[0].n === 1);
  await bp.screenshot({ path: `${OUT}order-pending-mobile.png`, fullPage: true });

  // メッセージ（文字のまま表示）
  await bp.getByLabel(/メッセージを書く/).fill("<b>よろしく</b>お願いします（架空）");
  await bp.getByRole("button", { name: "メッセージを送る" }).click();
  await bp.waitForURL(/done=message/);

  // ---- 農家：承認
  await pp.goto(`${B}/producer/orders`);
  await pp.getByText(/販売可能 10kg／購入希望 3kg・1店舗／全件承認した場合の残量 7kg/).waitFor();
  ok("農家：出品ごとの集計（販売可能／購入希望・店舗数／全件承認した場合の残量）と、商品代・送料の合計が別々に出る", (await main(pp).innerText()).includes("送料と配達料の合計"));
  await pp.getByRole("link", { name: /くわしく見る・注文ごとに/ }).first().click();
  await pp.getByText("<b>よろしく</b>お願いします（架空）").waitFor();
  ok("農家：メッセージは文字のまま届く（タグとして動かない）", (await pp.locator("main:visible b", { hasText: "よろしく" }).count()) === 0);
  await pp.screenshot({ path: `${OUT}producer-order-desktop.png`, fullPage: true });
  await pp.getByRole("button", { name: "承認する（販売確定）" }).click();
  await pp.waitForURL(/done=approved/);
  await bp.goto(`${B}/orders/${O1}`);
  await bp.getByText(/販売確定です。次に/).waitFor().catch(() => {});
  ok("承認すると、お店の画面も「販売確定」で、次の手順（支払い・発送の相談）が出る", (await main(bp).innerText()).includes("支払い方法・支払期限・発送予定"));

  // ---- 2件目：農家が数量を変えて提案 → お店が同意
  const apply = async (label) => {
    await bp.goto(`${B}/listings/${L.id}`);
    await bp.getByLabel("希望数量", { exact: true }).selectOption({ label });
    await bp.getByRole("button", { name: "内容を確認する" }).click();
    await bp.getByRole("button", { name: "購入希望を送る" }).click();
    await bp.waitForURL(/done=sent/);
    return new URL(bp.url()).pathname.split("/").pop();
  };
  const O2 = await apply("4kg（商品代 2,400円）");
  await pp.goto(`${B}/orders/${O2}`);
  await pp.getByText("条件を変えて提案する（数量・送料）").click();
  await pp.getByLabel(/提案する数量/).fill("2");
  await pp.getByLabel(/ひとこと/).fill("今週は2kgなら用意できます（架空）");
  await pp.getByRole("button", { name: "この条件で提案する" }).click();
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
  const O3 = await apply("1kg（商品代 600円）");
  await bp.getByRole("button", { name: "この購入希望を取り消す" }).click();
  await bp.waitForURL(/done=cancelled/);
  const O4 = await apply("1kg（商品代 600円）");
  await pp.goto(`${B}/orders/${O4}`);
  await pp.getByRole("button", { name: "今回は見送る" }).click();
  await pp.waitForURL(/done=declined/);
  await pp.goto(`${B}/producer`);
  const stock = await pp.locator('dl[aria-label="量の内訳"]').first().innerText();
  ok("出品一覧の内訳：出品10kg・販売確定5kg（3＋2）・取り置き0kg・残り5kg", /販売可能（出品総量）\s*10kg[\s\S]*販売確定\s*5kg[\s\S]*仮押さえ）\s*0g[\s\S]*申し込める量）\s*5kg/.test(stock));
  void O3;

  // ---- 全件承認：2件まとめて承認
  const O5 = await apply("1kg（商品代 600円）");
  const O6 = await apply("1.5kg（商品代 900円）");
  await pp.goto(`${B}/producer/orders`);
  await pp.getByRole("button", { name: "全件承認する（2件）" }).click();
  await pp.getByText(/✓ 承認しました/).first().waitFor();
  const st = (await db.query(`SELECT status FROM "order" WHERE id = ANY($1)`, [[O5, O6]])).rows.map((r) => r.status);
  ok("全件承認：回答待ちの2件がまとめて販売確定になる", st.length === 2 && st.every((x) => x === "confirmed"));

  // ---- 今週の確保済み食材
  await bp.goto(`${B}/orders`);
  await bp.getByRole("heading", { name: /今週の確保済み食材/ }).waitFor();
  ok("お店：「今週の確保済み食材」に販売確定した食材が出る", (await bp.getByRole("region", { name: /今週の確保済み食材/ }).innerText()).includes(ITEM));

  // ---- 出品の編集：値段を変え、配達（配達料は見積もり）を加える。既存の注文の値段は変わらない
  await pp.goto(`${B}/producer`);
  await pp.getByRole("link", { name: "出品を編集する" }).first().click();
  await pp.waitForURL(/\/edit$/);
  await pp.getByRole("button", { name: "次へ（量と値段）" }).click();
  await pp.getByLabel(/1kg あたりの値段/).fill("650");
  await pp.getByRole("button", { name: "次へ（期限と受け渡し）" }).click();
  await pp.getByLabel(/農家さんが配達（自分で届ける）/).check();
  await pp.getByLabel("配達料が分からないので、注文ごとに見積もる").check();
  await pp.getByRole("group", { name: "配達できる府県" }).getByLabel("大阪府").check();
  await pp.getByRole("button", { name: "次へ（確認）" }).click();
  await pp.getByText("すでに届いている購入希望の条件は変わりません").first().waitFor();
  await pp.getByRole("button", { name: "変更を保存する" }).click();
  await pp.waitForURL(/done=updated/);
  const kept = (await db.query(`SELECT "pricePerKg" FROM "order" WHERE id = $1`, [O1])).rows[0].pricePerKg;
  ok("出品を編集しても、既存の注文の値段は申し込んだときのまま（600円）", kept === 600 && (await db.query(`SELECT "pricePerKg" FROM listing WHERE id = $1`, [L.id])).rows[0].pricePerKg === 650);

  // ---- 出品への相談：お店が質問 → 農家さんが返信 → お店に届く
  await bp.goto(`${B}/listings/${L.id}`);
  await bp.getByText(/この出品について農家さんに相談する/).click();
  await bp.getByLabel("相談を書く（500文字まで）").fill("葉っぱも付いていますか（架空）");
  await bp.getByRole("button", { name: "送る" }).click();
  await posted(bp, "葉っぱも付いていますか（架空）").waitFor();
  await pp.goto(`${B}/producer/listings/${L.id}/messages`);
  await posted(pp, "葉っぱも付いていますか（架空）").waitFor();
  await pp.getByLabel("返信を書く（500文字まで）").fill("付いています（架空）");
  await pp.getByRole("button", { name: "送る" }).click();
  await posted(pp, "付いています（架空）").waitFor();
  await bp.goto(`${B}/listings/${L.id}`);
  await posted(bp, "付いています（架空）").waitFor().catch(() => {});
  ok("出品への相談：お店の質問に農家さんが返信でき、お店の画面に出る", (await posted(bp, "付いています（架空）").count()) === 1);

  // ---- 見積相談：配達料が見積もりの購入希望 → 農家さんが送料を提示 → お店が同意して販売確定
  await bp.goto(`${B}/listings/${L.id}`);
  await bp.getByLabel("希望数量", { exact: true }).selectOption({ label: "1kg（商品代 650円）" });
  await bp.getByLabel(/農家さんが配達/).check();
  ok("見積もりの方法を選ぶと、合計は「未確定」と出る", (await main(bp).innerText()).includes("未確定（送料は見積もり）"));
  await bp.getByRole("button", { name: "内容を確認する" }).click();
  await bp.getByText("送料・配達料は見積もりです").waitFor();
  await bp.getByRole("button", { name: "購入希望を送る" }).click();
  await bp.waitForURL(/done=sent/);
  const OQ = new URL(bp.url()).pathname.split("/").pop();
  await pp.goto(`${B}/orders/${OQ}`);
  await pp.getByText("送料を決めて提案する").waitFor();
  ok("見積もりの注文には「承認する」が出ず、送料を決めて提案する", (await pp.getByRole("button", { name: "承認する（販売確定）" }).count()) === 0);
  await pp.getByLabel(/送料・配達料（円・必ず入れる）/).fill("900");
  await pp.getByRole("button", { name: "この条件で提案する" }).click();
  await pp.waitForURL(/done=proposed/);
  await bp.goto(`${B}/orders/${OQ}`);
  await bp.getByRole("button", { name: "この変更に同意する（販売確定）" }).click();
  await bp.waitForURL(/done=accepted/);
  const q = (await db.query(`SELECT status, "feeYen", "totalYen", "feePending" FROM "order" WHERE id = $1`, [OQ])).rows[0];
  ok("見積相談：お店が総額に同意すると販売確定（商品代650円＋送料900円＝1,550円）", q.status === "confirmed" && q.feeYen === 900 && q.totalYen === 1550 && !q.feePending);

  // ---- 前回の条件（ワンタップ）
  await bp.goto(`${B}/search`);
  await bp.getByRole("link", { name: /前回の条件で探す/ }).waitFor().catch(() => {});
  ok("お店：検索の画面に「前回の条件で探す」が出る", await bp.getByRole("link", { name: new RegExp(`前回の条件で探す（${ITEM}・1kg`) }).isVisible());
  await bp.getByRole("link", { name: /前回の条件で探す/ }).click();
  await bp.getByRole("heading", { name: /仕入れ候補：/ }).waitFor();
  ok("前回の条件をワンタップで呼び出して探せる", (await main(bp).getByLabel("食材の名前").inputValue()) === ITEM);

  // ---- 下書き：入力の途中で閉じても、次に開くと再開を聞く
  await bp.goto(`${B}/search`);
  await bp.getByLabel("食材の名前").fill("下書きのかぶ");
  await bp.waitForTimeout(300);
  await bp.goto(`${B}/search`);
  await bp.getByText("前回の続きから再開しますか？").waitFor();
  await bp.getByRole("button", { name: "再開する" }).click();
  ok("下書き：次に開いたとき「前回の続きから再開しますか？」と出て、再開すると入力が戻る", (await bp.getByLabel("食材の名前").inputValue()) === "下書きのかぶ");

  // ---- 探しています：見つからない → 公開 → 農家が応えて出品 → お店に表示
  const WANT = `探し中ねぎ${stamp}`;
  await bp.goto(`${B}/search?go=1&mode=exact&q=${encodeURIComponent(WANT)}&kg=2&budget=4000&date=${day(3)}&pref=27&city=${encodeURIComponent("大阪市")}&methods=courier&methods=delivery&methods=pickup`);
  await bp.getByText("条件に合う候補は見つかりませんでした").waitFor();
  await bp.getByRole("link", { name: "この条件を「探しています」として公開する" }).click();
  await bp.waitForURL(/\/wanted\/new/);
  await main(bp).getByText("店名・住所は公開しません").first().waitFor();
  ok("探しています：検索の条件を引き継ぎ、店名・住所は公開しないと案内する", (await main(bp).getByLabel("食材の名前").inputValue()) === WANT && (await main(bp).innerText()).includes("店名・住所は公開しません"));
  await bp.getByRole("button", { name: "「探しています」を公開する" }).click();
  await bp.waitForURL(/\/wanted\?done=created/);
  await pp.goto(`${B}/producer/wanted`);
  const wcard = pp.locator("main:visible li", { hasText: WANT }).first();
  await wcard.waitFor();
  ok("農家：地域の「探しています」が見え、店名は出ない", !(await wcard.innerText()).includes("確認食堂") && (await wcard.innerText()).includes("大阪府 大阪市"));
  await wcard.getByRole("link", { name: "これに応えて出品する" }).click();
  await pp.getByText("お店の「探しています」に応えて出品します").waitFor();
  ok("応えて出品：食材の名前と量が入った状態で始まる", (await pp.getByLabel(/食材の名前/).inputValue()) === WANT);
  await pp.getByRole("button", { name: "次へ（量と値段）" }).click();
  await pp.getByLabel(/1kg あたりの値段/).fill("800");
  await pp.getByRole("button", { name: "次へ（期限と受け渡し）" }).click();
  await pp.getByRole("button", { name: "次へ（確認）" }).click();
  await pp.getByRole("button", { name: "出品する" }).click();
  await pp.waitForURL(/done=created/);
  await bp.goto(`${B}/wanted`);
  await bp.getByText("応えてくれた出品：1件").waitFor();
  ok("お店：「探しています」の画面に、応えてくれた出品が出る", (await bp.locator("main:visible li", { hasText: WANT }).first().innerText()).includes("1kg 800円"));

  // ---- ログアウトすると、このブラウザの下書きが消える
  await bp.goto(`${B}/search`);
  await bp.getByLabel("食材の名前").fill("消える下書き");
  await bp.waitForTimeout(300);
  await bp.getByRole("button", { name: "ログアウト" }).click();
  await bp.waitForURL(/\/$/);
  ok("ログアウトすると、下書きが消える", (await bp.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("locai3:draft:")).length)) === 0);

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
  await db.query(`DELETE FROM "listing_message" WHERE "senderId" = ANY($1)`, [ids]);
  await db.query(`DELETE FROM "order" WHERE "buyerId" = ANY($1) OR "producerId" = ANY($1)`, [ids]);
  await db.query(`DELETE FROM "impression" WHERE "producerId" = ANY($1)`, [ids]);
  await db.query(`DELETE FROM "listing" WHERE "producerId" = ANY($1)`, [ids]);
  await db.query(`DELETE FROM "wanted_post" WHERE "buyerId" = ANY($1)`, [ids]);
  await db.query(`DELETE FROM "search_preset" WHERE "userId" = ANY($1)`, [ids]);
  await db.query(`DELETE FROM "user" WHERE id = ANY($1)`, [ids]);
  ok(`後片付け：確認用の架空のアカウント ${ids.length}件とその出品・注文を消した`, true);
  ok(`画面のエラーなし（${errs.length}件）`, errs.length === 0);
  await db.end();
  console.log(res.join("\n"));
  if (errs.length) console.log(errs.slice(0, 5).join("\n"));
  await browser.close();
}
