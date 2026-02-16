-- Phase 2: Saved cards for auto-charge on registration deadline

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "stripe_customer_id" TEXT,
  ADD COLUMN IF NOT EXISTS "stripe_default_payment_method_id" TEXT,
  ADD COLUMN IF NOT EXISTS "stripe_default_card_brand" TEXT,
  ADD COLUMN IF NOT EXISTS "stripe_default_card_last4" TEXT;

CREATE INDEX IF NOT EXISTS "users_stripe_customer_id_idx"
  ON "users" ("stripe_customer_id");
