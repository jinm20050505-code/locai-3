import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import { getDb } from "@/lib/db";
import { applyOrder, approveOrder, declineOrder, cancelOrder, proposeChange, acceptChange, sendMessage } from "@/server/orders";
import { createListing } from "@/server/listings";
import { postListingMessage } from "@/server/threads";
import { markNotificationRead, readNotifications, syncNotifications } from "@/server/notifications";
import { flushPush } from "@/server/push";
const db = getDb(); const users: string[] = [];
const now = new Date();
async function setup() {
  const b = randomUUID(), p = randomUUID(); users.push(b,p);
  await db.user.createMany({ data: [{ id:b, email:`${b}@test.invalid`, name:"通知のお店（架空）", role:"buyer", prefecture:"27" }, { id:p, email:`${p}@test.invalid`, name:"通知の農家（架空）", role:"producer", prefecture:"27" }] });
  const l = await db.listing.create({ data: { producerId:p, name:"通知かぶ", totalGrams:10000, minGrams:500, unitGrams:500, pricePerKg:300, availableFrom:now, availableUntil:new Date(+now+86400000*5), acceptUntil:new Date(+now+86400000), replyUntil:new Date(+now+86400000*2), pickup:true, delivery:false, status:"open" } });
  const input = { listingId:l.id, grams:1000, method:"pickup", useDate:now, requestId:randomUUID() };
  const result = await applyOrder(b,input); if (!result.ok) throw Error(result.problems.join());
  return { b,p,l,id:result.id,input };
}
afterAll(async () => {
  await db.message.deleteMany({where:{senderId:{in:users}}});
  await db.listingMessage.deleteMany({where:{senderId:{in:users}}});
  await db.order.deleteMany({where:{buyerId:{in:users}}});
  await db.listing.deleteMany({where:{producerId:{in:users}}});
  await db.wantedPost.deleteMany({where:{buyerId:{in:users}}});
  await db.user.deleteMany({where:{id:{in:users}}});
});
describe("通知を取引と一緒に保存する", () => {
  it("仮押さえの再送5回でも当事者各1件。第三者には出ず、他人の既読は変えられない", async () => {
    const s=await setup(); await Promise.all(Array.from({length:5},()=>applyOrder(s.b,s.input)));
    const buyer=await readNotifications(s.b), producer=await readNotifications(s.p);
    expect(buyer.items).toHaveLength(1); expect(producer.items).toHaveLength(1);
    expect(buyer.items[0].title).toContain("仮押さえ"); expect(producer.items[0].title).toContain("購入希望");
    expect((await readNotifications(randomUUID())).items).toHaveLength(0);
    expect((await markNotificationRead(s.p,buyer.items[0].id)).count).toBe(0);
    expect((await readNotifications(s.b)).unread).toBe(1);
    await markNotificationRead(s.b,buyer.items[0].id); expect((await readNotifications(s.b)).unread).toBe(0);
  });
  it("承認は販売確定を両者に1件。再承認や無関係な人の操作では増えない", async () => {
    const s=await setup(); expect((await approveOrder(randomUUID(),s.id)).ok).toBe(false);
    expect((await approveOrder(s.p,s.id)).ok).toBe(true); expect((await approveOrder(s.p,s.id)).ok).toBe(false);
    expect(await db.notification.count({where:{userId:s.b,kind:"confirmed"}})).toBe(1);
    expect(await db.notification.count({where:{userId:s.p,kind:"confirmed"}})).toBe(1);
  });
  it("提案→同意、取消、見送りの全てが両者に届く", async () => {
    const s=await setup(); expect((await proposeChange(s.p,s.id,500,"数量変更")).ok).toBe(true);
    expect((await acceptChange(s.b,s.id)).ok).toBe(true);
    expect((await db.notification.findMany({where:{userId:s.b}})).map(n=>n.kind).sort()).toEqual(["changeRequested","confirmed","pending"]);
    const c=await setup(); await cancelOrder(c.b,c.id); expect(await db.notification.count({where:{userId:c.p,kind:"cancelled"}})).toBe(1);
    const d=await setup(); await declineOrder(d.p,d.id); expect(await db.notification.count({where:{userId:d.b,kind:"declined"}})).toBe(1);
  });
  it("閉じていた間の期限切れも反映し、同時確認しても各1件。仮押さえだけ解除", async () => {
    const s=await setup(); const later=new Date(+s.l.replyUntil+1);
    await Promise.all([syncNotifications(s.b,later),syncNotifications(s.p,later),syncNotifications(s.b,later)]);
    const o=await db.order.findUniqueOrThrow({where:{id:s.id}}); expect(o.status).toBe("expired"); expect(o.heldGrams).toBe(0); expect(o.quantityGrams).toBe(1000); expect(o.totalYen).toBe(300);
    expect(await db.notification.count({where:{userId:{in:[s.b,s.p]},kind:"expired"}})).toBe(2);
  });
  it("注文メッセージは受信者だけに届く。再送で増えず、私信を通知本文にコピーしない", async () => {
    const s=await setup(); const rid=randomUUID(); await Promise.all([sendMessage(s.b,s.id,"秘密の本文",rid),sendMessage(s.b,s.id,"秘密の本文",rid)]);
    const notes=await db.notification.findMany({where:{userId:s.p,kind:"message"}}); expect(notes).toHaveLength(1); expect(notes[0].body).not.toContain("秘密"); expect(notes[0].href).toBe(`/orders/${s.id}#messages`);
    expect(await db.notification.count({where:{userId:s.b,kind:"message"}})).toBe(0);
  });
  it("出品への相談と返信も相手だけに届く。第三者による返信は拒否", async () => {
    const s=await setup(); const rid=randomUUID(); await postListingMessage(s.b,s.l.id,s.b,"質問",rid); await postListingMessage(s.b,s.l.id,s.b,"質問",rid);
    await postListingMessage(s.p,s.l.id,s.b,"返信",randomUUID());
    expect((await postListingMessage(randomUUID(),s.l.id,s.b,"不正",randomUUID())).ok).toBe(false);
    expect(await db.notification.count({where:{userId:s.p,kind:"message"}})).toBe(1); expect(await db.notification.count({where:{userId:s.b,kind:"message"}})).toBe(1);
  });
  it("通知の保存に失敗したら、注文と仮押さえも保存しない", async () => {
    const s=await setup(); const count=await db.order.count({where:{buyerId:s.b}});
    const spy=vi.spyOn(db,'$transaction').mockImplementationOnce(async (callback: unknown) => {
      return db.$transaction(async tx => {
        const wrapped=new Proxy(tx,{get(target,key){ if(key==='notification') return { createMany: async()=>{throw Error('notification failure');} }; return Reflect.get(target,key); }});
        return (callback as (t:typeof tx)=>Promise<unknown>)(wrapped);
      });
    });
    await expect(applyOrder(s.b,{...s.input,requestId:randomUUID()})).rejects.toThrow('notification failure'); spy.mockRestore();
    expect(await db.order.count({where:{buyerId:s.b}})).toBe(count);
  });
  it("探していますに応えた出品を店へ通知する", async () => {
    const s=await setup();
    const wanted=await db.wantedPost.create({data:{buyerId:s.b,item:"かぶ",grams:1000,budgetYen:1000,useDate:now,prefecture:"27",city:"大阪市",methods:["pickup"],status:"open"}});
    const { id,producerId,status,createdAt,updatedAt,isDemo,...value }=s.l;
    void [id,producerId,status,createdAt,updatedAt,isDemo];
    const listing=await createListing(s.p,{...value,courierFees:null,wantedPostId:wanted.id},null);
    const note=await db.notification.findFirstOrThrow({where:{userId:s.b,kind:"wanted"}});
    expect(note.href).toBe("/listings/"+listing.id);
    expect(await db.notification.count({where:{userId:s.p,kind:"wanted"}})).toBe(0);
  });
  it("31件以上の通知を重複なく読み進められる", async () => {
    const s=await setup(); await db.notification.createMany({data:Array.from({length:35},(_,i)=>({userId:s.b,eventKey:`page:${i}`,kind:'test',title:'確認',body:'',sender:'LocAI',href:'/notifications'}))});
    const first=await readNotifications(s.b), next=await readNotifications(s.b,first.next!); expect(first.items).toHaveLength(30); expect(next.items).toHaveLength(6); expect(new Set([...first.items,...next.items].map(n=>n.id)).size).toBe(36);
  });
});
describe("プッシュ配信",()=>{
  it("配信の同時実行でも端末へ1回。配信失敗で取引は戻らず、期限切れ端末は削除", async()=>{
    const keys=webpush.generateVAPIDKeys();process.env.WEB_PUSH_PUBLIC_KEY=keys.publicKey;process.env.WEB_PUSH_PRIVATE_KEY=keys.privateKey;
    await flushPush(); await flushPush();
    const s=await setup();
    const sub=await db.pushSubscription.create({data:{userId:s.b,endpoint:`https://fcm.googleapis.com/fcm/send/${randomUUID()}`,p256dh:'fake',auth:'fake',createdAt:new Date(0)}});
    const send=vi.spyOn(webpush,'sendNotification').mockResolvedValue({statusCode:201,headers:{},body:''});
    try {
      await Promise.all([flushPush(),flushPush()]); expect(send).toHaveBeenCalledTimes(1);
      const payload=JSON.parse(String(send.mock.calls[0][1]!));expect(payload.url).toBe('/notifications');expect(payload.body).not.toContain('かぶ');
      await approveOrder(s.p,s.id);send.mockRejectedValueOnce({statusCode:410});await flushPush();expect(await db.pushSubscription.findUnique({where:{id:sub.id}})).toBeNull();expect((await db.order.findUniqueOrThrow({where:{id:s.id}})).status).toBe('confirmed');
    } finally { send.mockRestore();delete process.env.WEB_PUSH_PUBLIC_KEY;delete process.env.WEB_PUSH_PRIVATE_KEY; }
  });
});
