import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
function worker() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const notification = vi.fn(async () => undefined);
  const navigate=vi.fn(async()=>undefined), focus=vi.fn(async()=>undefined),openWindow=vi.fn();
  const self = { addEventListener: (name: string, handler: (e: unknown) => void) => { handlers[name]=handler; }, registration: { showNotification: notification }, location: { origin: "https://locai-3.vercel.app" }, clients: { matchAll: async()=>[{url:"https://locai-3.vercel.app/search",navigate,focus}],openWindow } };
  runInNewContext(readFileSync("public/sw.js","utf8"),{self,URL});
  return {handlers,notification,navigate,focus,openWindow};
}
it("Push受信で表示する。私信・外部URL・偽タイトルを画面へ出さない", async()=>{
 const w=worker();let pending: Promise<unknown> | undefined;
 w.handlers.push({data:{json:()=>({title:"偽タイトル",body:"秘密の私信",tag:"notification-id",url:"https://wrong.invalid"})},waitUntil:(p:Promise<unknown>)=>{pending=p;}});await pending;
 const [title,options]=w.notification.mock.calls[0] as unknown as [string,{body:string;data:{url:string};tag:string}];
 expect(title).toBe("LocAIからのお知らせ");expect(options.body).not.toContain("秘密");expect(options.data.url).toBe("/notifications");expect(options.tag).toBe("notification-id");
});
it("通知クリックは自分のサイトの通知一覧に移動してフォーカスする",async()=>{
 const w=worker();let pending: Promise<unknown>|undefined;const close=vi.fn();
 w.handlers.notificationclick({notification:{close},waitUntil:(p:Promise<unknown>)=>{pending=p;}});await pending;
 expect(close).toHaveBeenCalledTimes(1);expect(w.navigate).toHaveBeenCalledWith("/notifications");expect(w.focus).toHaveBeenCalledTimes(1);expect(w.openWindow).not.toHaveBeenCalled();
});
