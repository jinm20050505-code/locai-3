-- AlterTable
ALTER TABLE "listing" ADD COLUMN     "courierQuote" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deliveryQuote" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deliveryWeekdays" INTEGER[];

-- AlterTable
ALTER TABLE "order" ADD COLUMN     "feePending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proposedFeeYen" INTEGER,
ADD COLUMN     "receiveSlot" TEXT;

-- CreateTable
CREATE TABLE "listing_message" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_message_listingId_buyerId_createdAt_idx" ON "listing_message"("listingId", "buyerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "listing_message_senderId_requestId_key" ON "listing_message"("senderId", "requestId");

-- AddForeignKey
ALTER TABLE "listing_message" ADD CONSTRAINT "listing_message_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_message" ADD CONSTRAINT "listing_message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 見積もりのときは、送料の段・配達料がなくてもよい
ALTER TABLE "listing" DROP CONSTRAINT listing_courier_check;
ALTER TABLE "listing" ADD CONSTRAINT listing_courier_check CHECK (NOT courier OR ("courierTemp" IN ('normal', 'chilled') AND ("courierQuote" OR "courierFees" IS NOT NULL)));
ALTER TABLE "listing" DROP CONSTRAINT listing_fee_check;
ALTER TABLE "listing" ADD CONSTRAINT listing_fee_check CHECK (NOT delivery OR "deliveryQuote" OR ("deliveryFeeYen" IS NOT NULL AND "deliveryFeeYen" >= 0));
ALTER TABLE "order" ADD CONSTRAINT order_slot_check CHECK ("receiveSlot" IS NULL OR "receiveSlot" IN ('morning', 'afternoon', 'evening'));
