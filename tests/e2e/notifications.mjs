import { chromium } from 'playwright';
import pg from 'pg'; import {randomUUID,randomBytes} from 'node:crypto'; import assert from 'node:assert/strict';
process.loadEnvFile('.env.local');if(!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL??''))throw Error('手元だけで確認します');
const base='http://localhost:3004',db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();const browser=await chromium.launch();const users=[];const errors=[];const password=randomBytes(16).toString('hex');
async function user(role){const ctx=await browser.newContext({viewport:{width:390,height:844}});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));const r=await ctx.request.post(base+'/api/auth/sign-up/email',{data:{email:`notify-${randomUUID()}@test.invalid`,password,name:`通知確認${role}（架空）`,role},headers:{Origin:base}});assert.ok(r.ok());const id=(await r.json()).user.id;users.push(id);await db.query('UPDATE "user" SET prefecture=$1,city=$2 WHERE id=$3',['27','大阪市',id]);return {ctx,p,id};}
try{
 const b=await user('buyer'),s=await user('producer');const lid=randomUUID();const day=new Date(Date.now()+86400000).toISOString().slice(0,10);
 await db.query('INSERT INTO listing (id,"producerId",name,"totalGrams","minGrams","unitGrams","pricePerKg","availableFrom","availableUntil","acceptUntil","replyUntil",pickup,delivery,status,"updatedAt","courierPrefs","deliveryPrefs","deliveryWeekdays") VALUES ($1,$2,$3,10000,500,500,300,$4,$4,now()+interval \'1 day\',now()+interval \'2 days\',true,false,\'open\',now(),ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::integer[])',[lid,s.id,'通知テストかぶ（架空）',day]);
 await b.p.goto(base+'/listings/'+lid);await b.p.getByText(/この出品について農家さんに相談する/).click();await b.p.getByLabel('相談を書く（500文字まで）').fill('受け取りについて教えてください');await b.p.getByRole('button',{name:'送る',exact:true}).click();await b.p.locator('ol>li').filter({hasText:'受け取りについて教えてください'}).waitFor();
 await s.p.goto(base+'/producer');await s.p.getByRole('link',{name:'通知、未読1件',exact:true}).waitFor();await s.p.getByRole('link',{name:'通知、未読1件',exact:true}).click();await s.p.getByRole('heading',{name:'通知',exact:true}).waitFor();await s.p.getByText(/メッセージが届きました/).waitFor();
 for(const width of [320,390,1280]){await s.p.setViewportSize({width,height:844});assert.ok(await s.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await s.p.setViewportSize({width:390,height:844});await s.p.screenshot({path:'tests/e2e/output/notifications-mobile.png'});
 await s.p.getByRole('button').filter({hasText:'メッセージが届きました'}).click();await s.p.waitForURL('**/producer/listings/*/messages');await s.p.getByLabel('返信を書く（500文字まで）').fill('午前中に受け取れます');await s.p.getByRole('button',{name:'送る',exact:true}).click();await s.p.locator('ol>li').filter({hasText:'午前中に受け取れます'}).waitFor();
 await s.p.goto(base+'/notifications');await s.p.getByText('未読 0件',{exact:true}).waitFor();
 await b.p.goto(base+'/notifications');await b.p.getByText(/メッセージが届きました/).waitFor();await b.p.getByRole('button').filter({hasText:'メッセージが届きました'}).click();await b.p.waitForURL('**/listings/*#consultation');await b.p.getByText('午前中に受け取れます',{exact:true}).waitFor();
 // API：認証・CSRF・通知の持ち主をサーバーが確認する。
 const privateNote=(await db.query('SELECT id FROM notification WHERE "userId"=$1',[s.id])).rows[0].id;
 await s.p.request.post(base+'/api/notifications',{data:{read:privateNote},headers:{Origin:base}});
 await db.query('UPDATE notification SET "readAt"=NULL WHERE id=$1',[privateNote]);
 const forged=await b.p.request.post(base+'/api/notifications',{data:{read:privateNote},headers:{Origin:base}});assert.ok(forged.ok());assert.equal((await db.query('SELECT "readAt" FROM notification WHERE id=$1',[privateNote])).rows[0].readAt,null);
 assert.equal((await b.p.request.post(base+'/api/notifications',{data:{},headers:{Origin:'https://wrong.invalid'}})).status(),403);
 const anon=await browser.newContext();assert.equal((await anon.request.post(base+'/api/notifications',{data:{},headers:{Origin:base}})).status(),401);
 assert.equal((await anon.request.get(base+'/api/cron/notifications')).status(),401);
 // 実ブラウザでService Workerの登録と起動を確認。受信イベントは単体テストで検証。
 await b.ctx.grantPermissions(['notifications'],{origin:base});await b.p.goto(base+'/notifications');
 await b.p.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
 assert.ok(await b.p.evaluate(async()=>Boolean((await navigator.serviceWorker.ready).active)));
 // 許可ボタンで端末登録→停止。Pushサービスの接続部分はブラウザの代役で検証（実機配信の確認とは別）。
 await b.p.evaluate(()=>{window.Notification.requestPermission=async()=> 'granted';PushManager.prototype.subscribe=async function(){const endpoint='https://fcm.googleapis.com/fcm/send/ui-test';const data={endpoint,keys:{p256dh:'B'.repeat(87),auth:'A'.repeat(22)}};return {endpoint,toJSON:()=>data,unsubscribe:async()=>true};};});
 await b.p.getByRole('button',{name:'通知を許可する',exact:true}).click();await b.p.getByText('通知をオンにしました。アプリを閉じていてもお知らせが届きます。',{exact:true}).waitFor();assert.equal((await db.query('SELECT count(*)::int n FROM push_subscription WHERE "userId"=$1',[b.id])).rows[0].n,1);
 // 実際の購読がない代役なので停止APIで所有権も確認する。
 const endpoint='https://fcm.googleapis.com/fcm/send/ui-test';await s.p.request.delete(base+'/api/push',{data:{endpoint},headers:{Origin:base}});assert.equal((await db.query('SELECT count(*)::int n FROM push_subscription WHERE "userId"=$1',[b.id])).rows[0].n,1);await b.p.request.delete(base+'/api/push',{data:{endpoint},headers:{Origin:base}});
 assert.deepEqual(errors,[]);console.log('OK：相談→ベル→既読→返信、3サイズ、API認証・他人の既読拒否・CSRF、サービスワーカー登録、許可ボタン→端末登録・停止の所有権');
}finally{await browser.close();await db.query('DELETE FROM listing_message WHERE "senderId"=ANY($1::text[])',[users]);await db.query('DELETE FROM listing WHERE "producerId"=ANY($1::text[])',[users]);await db.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[users]);await db.end();}
