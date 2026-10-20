import { describe, expect, it } from "vitest";
import { validPushEndpoint } from "@/lib/push-validation";
describe("端末への通知先",()=>{
 it("既知の各社HTTPSだけを許可",()=>{for(const u of ['https://fcm.googleapis.com/fcm/send/example','https://web.push.apple.com/example','https://updates.push.services.mozilla.com/wpush/v2/example'])expect(validPushEndpoint(u)).toBe(true);});
 it("内部接続・偽装ドメイン・認証情報・別ポートを拒否",()=>{for(const u of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://fcm.googleapis.com.attacker.example/x','https://fcm.googleapis.com@localhost/x','https://user:pass@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x'])expect(validPushEndpoint(u)).toBe(false);});
});
