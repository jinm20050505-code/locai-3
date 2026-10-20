import webpush from "web-push";
import { getDb } from "@/lib/db";
import { validPushEndpoint } from "@/lib/push-validation";

/** 通知の保存に失敗すれば送らない。ネットワーク送信は取引の確定後だけ。 */
export async function flushPush() {
  if (!process.env.WEB_PUSH_PUBLIC_KEY || !process.env.WEB_PUSH_PRIVATE_KEY) return;
  try {
    webpush.setVapidDetails("https://locai-3.vercel.app", process.env.WEB_PUSH_PUBLIC_KEY, process.env.WEB_PUSH_PRIVATE_KEY);
    const db = getDb();
    const pending = await db.notification.findMany({ where: { pushQueuedAt: null }, orderBy: { createdAt: "asc" }, take: 50 });
    for (const n of pending) {
      await db.$transaction(async tx => {
        const claimed = await tx.notification.updateMany({ where: { id: n.id, pushQueuedAt: null }, data: { pushQueuedAt: new Date() } });
        if (!claimed.count || n.readAt) return;
        const subs = await tx.pushSubscription.findMany({ where: { userId: n.userId, createdAt: { lte: n.createdAt } }, select: { id: true }, take: 10 });
        await tx.pushDelivery.createMany({ data: subs.map(s => ({ notificationId: n.id, subscriptionId: s.id })), skipDuplicates: true });
      });
    }
    const due = await db.pushDelivery.findMany({ where: { sentAt: null, retryAt: { lte: new Date() }, attempts: { lt: 5 } }, orderBy: { retryAt: "asc" }, take: 15, include: { subscription: true, notification: { select: { readAt: true } } } });
    await Promise.all(due.map(async d => {
      const lease = await db.pushDelivery.updateMany({ where: { id: d.id, sentAt: null, retryAt: { lte: new Date() } }, data: { attempts: { increment: 1 }, retryAt: new Date(Date.now() + 120_000) } });
      if (!lease.count) return;
      try {
        if (!d.notification.readAt && validPushEndpoint(d.subscription.endpoint)) {
          // ロック画面に相手の名前・メッセージ本文・注文の内容を出さない。
          await webpush.sendNotification({ endpoint: d.subscription.endpoint, keys: { auth: d.subscription.auth, p256dh: d.subscription.p256dh } }, JSON.stringify({ title: "LocAIからのお知らせ", body: "新しい通知があります。開いてご確認ください。", tag: d.notificationId, url: "/notifications" }), { TTL: 86400, timeout: 8000, urgency: "normal" });
        }
        await db.pushDelivery.updateMany({ where: { id: d.id }, data: { sentAt: new Date() } });
      } catch (error) {
        const code = (error as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.pushSubscription.deleteMany({ where: { id: d.subscriptionId } });
        // 接続文字列や端末の秘密をログへ出さない。失敗は次の処理で再試行する。
        else await db.pushDelivery.updateMany({ where: { id: d.id }, data: { retryAt: new Date(Date.now() + Math.min(3600, 60 * 2 ** d.attempts) * 1000) } });
      }
    }));
  } catch { console.warn("プッシュ通知の配信を次回に再試行します"); }
}
