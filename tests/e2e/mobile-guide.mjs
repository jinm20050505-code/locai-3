// 下の4メニューと案内役。手元のアプリのみ。既存の架空アカウントで閲覧し、取引データは変更しない。
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const base='http://localhost:3004';
const creds=fs.readFileSync(new URL('../../demo-accounts.local.txt',import.meta.url),'utf8');
const browser=await chromium.launch();const failures=[];
const check=(name,ok)=>{console.log(`${ok?'OK':'NG'} ${name}`);if(!ok)failures.push(name);};
const output=new URL('./output/',import.meta.url).pathname;
fs.mkdirSync(output,{recursive:true});
const errors=[];
try{
 const c=await browser.newContext({...devices['iPhone 13'],deviceScaleFactor:1,reducedMotion:'reduce'});const p=await c.newPage();p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));
 for(const width of [320,390,430]){
  await p.setViewportSize({width,height:844});await p.goto(base);await p.getByRole('navigation',{name:'下のメニュー'}).waitFor();
  const menu=p.getByRole('navigation',{name:'下のメニュー'});
  const reopen=p.getByRole('button',{name:'こまめの説明を開く',exact:true});if(await reopen.isVisible())await reopen.click();
  check(`${width}px：下のメニュー4つ`,await menu.getByRole('link').count()===4);
  check(`${width}px：横にはみ出さない`,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check(`${width}px：本文の上に案内を重ねる`,await p.evaluate(()=>document.querySelector('.app-page-region').getBoundingClientRect().bottom>document.querySelector('.komame-guide').getBoundingClientRect().top));
 }
 await p.setViewportSize({width:390,height:844});
 await p.screenshot({path:output+'guide-home-mobile.png',fullPage:true,animations:"disabled",timeout:60000});
 await p.getByRole('button',{name:'こまめの使い方ガイドを開く'}).click();
 const dialog=p.getByRole('dialog');await dialog.waitFor();
 check('チュートリアルが開く',await dialog.getByRole('heading',{name:'こんにちは、こまめだよ'}).isVisible());
 await p.screenshot({path:output+'guide-tutorial-mobile.png',fullPage:true});
 await dialog.getByRole('button',{name:'次へ',exact:true}).click();
 check('2つ目の説明へ進める',await dialog.getByRole('heading',{name:'下の4つから移動しよう'}).isVisible());
 await dialog.getByRole('button',{name:'戻る',exact:true}).click();
 check('前の説明へ戻れる',await dialog.getByRole('heading',{name:'こんにちは、こまめだよ'}).isVisible());
 for(let i=0;i<3;i++)await dialog.getByRole('button',{name:'次へ',exact:true}).click();
 await dialog.getByRole('button',{name:'使ってみる',exact:true}).click();
 check('最後まで進むと閉じ、説明済みを保存',!(await dialog.isVisible())&&await p.evaluate(()=>localStorage.getItem('locai3-guide-seen-v1')==='yes'));
 await p.getByRole('button',{name:'こまめの使い方ガイドを開く'}).click();await p.keyboard.press('Escape');
 check('いつでも開き直し、Escapeで閉じられる',!(await dialog.isVisible()));
 check('動きを減らす設定に対応',await p.locator('.komame-body').first().evaluate(e=>getComputedStyle(e).animationName==='none'));
 await p.getByRole('navigation',{name:'下のメニュー'}).getByRole('link',{name:'探す',exact:true}).click();
 await p.waitForURL(/\/search$/);
 check('現在地が緑の選択状態になる',await p.getByRole('navigation',{name:'下のメニュー'}).getByRole('link',{name:'探す',exact:true}).getAttribute('aria-current')==='page');
 if(await p.getByRole('button',{name:'こまめの説明を開く',exact:true}).isVisible())await p.getByRole('button',{name:'こまめの説明を開く',exact:true}).click();
 check('画面に合った説明へ切り替わる',(await p.locator('#komame-hint').innerText()).includes('送料込み'));
 check('操作する場所は48px以上',await p.locator('.mobile-menu-item, .guide-close, .guide-next, .guide-back, .komame-launcher').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().height>0).every(e=>e.getBoundingClientRect().height>=48)));
 await c.close();
 for(const [name,role]of [['小料理屋みかみ（架空）','buyer'],['坂田農園（架空）','producer']]){
  const match=creds.match(new RegExp(`${name}（(?:農家|お店)）\\n\\s+メール：(\\S+)\\n\\s+パスワード：(\\S+)`));if(!match)throw Error('架空アカウントがありません');
  const context=await browser.newContext({...devices['iPhone 13'],deviceScaleFactor:1});const page=await context.newPage();page.setDefaultTimeout(30000);page.on("pageerror",e=>errors.push(page.url()+": "+e.message));
  await page.goto(base+'/login');await page.getByLabel('メールアドレス').fill(match[1]);await page.getByLabel('パスワード',{exact:true}).fill(match[2]);await page.getByRole('button',{name:'ログインする',exact:true}).click();await page.waitForURL(role==='buyer'?/\/search$/:/\/producer$/);
  const nav=page.getByRole('navigation',{name:'下のメニュー'});await nav.waitFor();
  const hrefs=await nav.getByRole('link').evaluateAll(es=>es.map(e=>e.getAttribute('href')));
  check(`${role}：役割に合う4つのメニュー`,JSON.stringify(hrefs)===JSON.stringify(role==='buyer'?['/search','/orders','/wanted','/account']:['/producer','/producer/orders','/producer/wanted','/account']));
  await nav.getByRole('link',{name:role==='buyer'?'注文':'購入希望',exact:true}).click();await page.waitForURL(role==='buyer'?/\/orders$/:/\/producer\/orders$/);
  check(`${role}：下のメニューから移動できる`,await nav.getByRole('link',{name:role==='buyer'?'注文':'購入希望',exact:true}).getAttribute('aria-current')==='page');
  await page.screenshot({path:output+`guide-${role}-mobile.png`,fullPage:true});await nav.getByRole("link",{name:"マイページ",exact:true}).click();
  await page.locator("main:visible").getByRole("button",{name:"ログアウト",exact:true}).click();await page.waitForURL(/\/$/);
  check(`${role}：マイページからログアウトできる`,await page.getByRole("navigation",{name:"下のメニュー"}).getByRole("link",{name:"ログイン",exact:true}).isVisible());
  await context.close();
 }
 check('画面の実行エラーなし',errors.length===0);if(errors.length)console.log(errors.join('\n'));
 if(failures.length)process.exitCode=1;
}finally{await browser.close();}
