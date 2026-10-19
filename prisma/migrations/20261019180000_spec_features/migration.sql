-- 出品：返事までの時間 → 回答期限（日時）。既存の行は「受付の締め切り＋返事までの時間」にする
ALTER TABLE "listing" ADD COLUMN "replyUntil" TIMESTAMP(3);
UPDATE "listing" SET "replyUntil" = "acceptUntil" + make_interval(hours => "replyHours");
ALTER TABLE "listing" ALTER COLUMN "replyUntil" SET NOT NULL;
ALTER TABLE "listing" DROP CONSTRAINT listing_amounts_check;
ALTER TABLE "listing" DROP COLUMN "replyHours",
ADD COLUMN     "allowPartial" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "courier" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "courierDays" INTEGER,
ADD COLUMN     "courierFees" JSONB,
ADD COLUMN     "courierPrefs" TEXT[],
ADD COLUMN     "courierTemp" TEXT,
ADD COLUMN     "deliveryMaxOrders" INTEGER,
ADD COLUMN     "surplusReason" TEXT,
ADD COLUMN     "wantedPostId" TEXT;

-- CreateTable
CREATE TABLE "user_photo" (
    "userId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_photo_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "search_preset" (
    "userId" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_preset_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "wanted_post" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "item" TEXT,
    "altOk" BOOLEAN NOT NULL DEFAULT false,
    "grams" INTEGER NOT NULL,
    "budgetYen" INTEGER NOT NULL,
    "useDate" DATE NOT NULL,
    "prefecture" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "methods" TEXT[],
    "usage" TEXT,
    "status" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wanted_post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impression" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "viewerId" TEXT,
    "grp" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "impression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wanted_post_status_useDate_idx" ON "wanted_post"("status", "useDate");

-- CreateIndex
CREATE INDEX "impression_producerId_createdAt_idx" ON "impression"("producerId", "createdAt");

-- CreateIndex
CREATE INDEX "impression_listingId_createdAt_idx" ON "impression"("listingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "report_reporterId_targetType_targetId_key" ON "report"("reporterId", "targetType", "targetId");

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_wantedPostId_fkey" FOREIGN KEY ("wantedPostId") REFERENCES "wanted_post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_photo" ADD CONSTRAINT "user_photo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_preset" ADD CONSTRAINT "search_preset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wanted_post" ADD CONSTRAINT "wanted_post_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impression" ADD CONSTRAINT "impression_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- データの決まり（DB 側でも守る）
ALTER TABLE "listing"
  ADD CONSTRAINT listing_amounts_check CHECK ("totalGrams" > 0 AND "minGrams" > 0 AND "unitGrams" > 0 AND "minGrams" <= "totalGrams" AND "pricePerKg" > 0),
  ADD CONSTRAINT listing_reply_check CHECK ("replyUntil" >= "acceptUntil"),
  ADD CONSTRAINT listing_courier_check CHECK (NOT courier OR ("courierFees" IS NOT NULL AND "courierTemp" IN ('normal', 'chilled'))),
  ADD CONSTRAINT listing_delivery_max_check CHECK ("deliveryMaxOrders" IS NULL OR "deliveryMaxOrders" > 0);
ALTER TABLE "listing" DROP CONSTRAINT listing_method_check;
ALTER TABLE "listing" ADD CONSTRAINT listing_method_check CHECK (pickup OR delivery OR courier);
ALTER TABLE "order" DROP CONSTRAINT order_method_check;
ALTER TABLE "order" ADD CONSTRAINT order_method_check CHECK (method IN ('courier', 'delivery', 'pickup'));
ALTER TABLE "wanted_post"
  ADD CONSTRAINT wanted_amounts_check CHECK (grams > 0 AND "budgetYen" > 0),
  ADD CONSTRAINT wanted_status_check CHECK (status IN ('open', 'closed'));
