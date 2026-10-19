-- データの決まりを DB 側でも守る（アプリの不具合があっても、ありえない値は保存しない）
ALTER TABLE "listing"
  ADD CONSTRAINT listing_amounts_check CHECK ("totalGrams" > 0 AND "minGrams" > 0 AND "unitGrams" > 0 AND "minGrams" <= "totalGrams" AND "pricePerKg" > 0 AND "replyHours" > 0),
  ADD CONSTRAINT listing_dates_check CHECK ("availableFrom" <= "availableUntil"),
  ADD CONSTRAINT listing_status_check CHECK (status IN ('open', 'paused', 'closed')),
  ADD CONSTRAINT listing_method_check CHECK (pickup OR delivery),
  ADD CONSTRAINT listing_fee_check CHECK (NOT delivery OR ("deliveryFeeYen" IS NOT NULL AND "deliveryFeeYen" >= 0));
ALTER TABLE "order"
  ADD CONSTRAINT order_status_check CHECK (status IN ('pending', 'changeRequested', 'confirmed', 'declined', 'cancelled', 'expired')),
  ADD CONSTRAINT order_method_check CHECK (method IN ('pickup', 'delivery')),
  ADD CONSTRAINT order_amounts_check CHECK ("quantityGrams" > 0 AND "heldGrams" >= 0 AND "subtotalYen" >= 0 AND "feeYen" >= 0 AND "totalYen" = "subtotalYen" + "feeYen"),
  ADD CONSTRAINT order_hold_check CHECK ((status IN ('pending', 'changeRequested')) OR "heldGrams" = 0);
ALTER TABLE "user" ADD CONSTRAINT user_role_check CHECK (role IN ('buyer', 'producer'));
