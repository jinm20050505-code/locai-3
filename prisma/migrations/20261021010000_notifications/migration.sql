CREATE TABLE "notification" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "eventKey" TEXT NOT NULL, "kind" TEXT NOT NULL, "title" TEXT NOT NULL,
 "body" TEXT NOT NULL, "href" TEXT NOT NULL, "sender" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "pushQueuedAt" TIMESTAMP(3), "readAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "notification_userId_eventKey_key" ON "notification"("userId", "eventKey");
CREATE INDEX "notification_userId_createdAt_id_idx" ON "notification"("userId", "createdAt", "id");
CREATE INDEX "notification_userId_readAt_idx" ON "notification"("userId", "readAt");

CREATE TABLE "push_subscription" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "endpoint" TEXT NOT NULL, "p256dh" TEXT NOT NULL, "auth" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "push_subscription_endpoint_key" ON "push_subscription"("endpoint");
CREATE INDEX "push_subscription_userId_idx" ON "push_subscription"("userId");
CREATE TABLE "push_delivery" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "notificationId" TEXT NOT NULL REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "subscriptionId" TEXT NOT NULL REFERENCES "push_subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "attempts" INTEGER NOT NULL DEFAULT 0, "retryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "sentAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "push_delivery_notificationId_subscriptionId_key" ON "push_delivery"("notificationId", "subscriptionId");
CREATE INDEX "push_delivery_sentAt_retryAt_idx" ON "push_delivery"("sentAt", "retryAt");
