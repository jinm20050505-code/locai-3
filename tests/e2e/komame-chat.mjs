// 手元だけ：既存の架空アカウントで相談する。注文・在庫は変更しない。
import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base = 'http://localhost:3004';
const creds = fs.readFileSync(new URL('../../demo-accounts.local.txt',import.meta.url),'utf8');
const browser = await chromium.launch();
const errors=[];
async function login(p,name,role){const m=creds.match(new RegExp(`${name}（(?:農家|お店)）\\n\\s+メール：(\\S+)\\n\\s+パスワード：(\\S+)`));if(!m)throw Error('架空アカウントなし');await p.goto(base+'/login');await p.getByLabel('メールアドレス').fill(m[1]);await p.getByLabel('パスワード',{exact:true}).fill(m[2]);await p.getByRole('button',{name:'ログインする',exact:true}).click();await p.waitForURL(role==='buyer'?/\/search$/:/\/producer$/);}
async function open(p){await p.locator('.komame-guide').waitFor();const reopen=p.getByRole('button',{name:'こまめの説明を開く',exact:true});if(await reopen.isVisible())await reopen.click();await p.getByRole('button',{name:'料理・野菜を相談する',exact:true}).click();await p.getByRole('dialog',{name:'こまめに相談',exact:true}).waitFor();}
async function ask(p,text,n){await p.getByLabel('こまめへの相談',{exact:true}).fill(text);await p.getByRole('button',{name:'相談を送る',exact:true}).click();await Promise.race([p.locator('.komame-chat-turn:not(.from-user)').nth(n-1).waitFor({timeout:60000}),p.locator('.komame-chat-compose [role=alert]').waitFor({timeout:60000}).then(async()=>{throw new Error(await p.locator('.komame-chat-compose [role=alert]').innerText());})]);}
try{
 if(process.env.KOMAME_FARMER_ONLY!=='1'){
 const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(30000);
 await p.goto(base);await open(p);assert.ok(await p.getByText('料理や野菜のAI相談は、ログインすると使えるよ。',{exact:true}).isVisible());await p.getByRole('button',{name:'相談を閉じる',exact:true}).click();console.log('OK 未ログインの案内・閉じる');
 await login(p,'小料理屋みかみ（架空）','buyer');await open(p);
 await ask(p,'カレーに使う野菜を探したい。なすはどう？量と日付と予算はまだ決めていません。',1);
 assert.ok((await p.locator('.komame-chat-turn:not(.from-user)').last().innerText()).includes('聞き取った条件'));
 await ask(p,'やっぱりスープにしたい。にんじんやじゃがいもはどう？野菜ごとに1kgで、1商品2000円まで。受け取り方はまだ未定。',2);
 assert.equal(await p.locator('.komame-chat-turn.from-user').count(),2);
 for(const w of [320,390,430]){await p.setViewportSize({width:w,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await p.locator('.komame-chat').evaluate(e=>e.getBoundingClientRect().left>=0&&e.getBoundingClientRect().right<=innerWidth&&e.getBoundingClientRect().top>=0));}
 await p.setViewportSize({width:390,height:844});fs.mkdirSync(new URL('./output/',import.meta.url),{recursive:true});await p.screenshot({path:new URL('./output/komame-chat.png',import.meta.url).pathname,animations:'disabled',timeout:60000});
 await p.getByRole('button',{name:'相談を閉じる',exact:true}).click();await p.getByLabel('希望数量（kg）',{exact:false}).count().catch(()=>0);await open(p);assert.equal(await p.locator('.komame-chat-turn.from-user').count(),2);console.log('OK 実際のAI応答・会話継続・商品候補・スマホ3幅・閉じても会話保持');
 await p.getByRole('button',{name:'新しい相談',exact:true}).click();assert.equal(await p.locator('.komame-chat-turn').count(),0);
 await ctx.setOffline(true);await p.getByLabel('こまめへの相談',{exact:true}).fill('通信が切れたときの相談');await p.getByRole('button',{name:'相談を送る',exact:true}).click();await p.locator('.komame-chat-compose [role=alert]').waitFor();assert.equal(await p.getByLabel('こまめへの相談',{exact:true}).inputValue(),'通信が切れたときの相談');await ctx.setOffline(false);await p.getByRole('button',{name:'相談を閉じる',exact:true}).click();console.log('OK 新しい相談・通信失敗で入力保持');
 await ctx.close();
 }
 const farmer=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});farmer.on('pageerror',e=>errors.push(e.message));await login(farmer,'坂田農園（架空）','producer');await farmer.goto(base+'/producer/listings/new');await farmer.getByLabel('食材の名前（必ず入れる）',{exact:true}).fill('なす');await farmer.getByLabel('食材の名前（必ず入れる）',{exact:true}).focus();await farmer.getByRole('button',{name:'こまめの説明を開く',exact:true}).click();assert.ok((await farmer.locator('#komame-hint').innerText()).includes('野菜の名前'));await open(farmer);await ask(farmer,'なすをカレーに使う紹介文を考えて。育て方や農薬については書かないで。',1);console.log('OK 農家の入力ヘルプ・AIの文章相談');
 assert.deepEqual(errors,[]);console.log('OK ブラウザの実行エラーなし');
}finally{await browser.close();}
