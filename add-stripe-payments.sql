-- Add entry fee cents/currency to tournaments
ALTER TABLE "tournaments"
  ADD COLUMN IF NOT EXISTS "entry_fee_cents" INTEGER,
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'usd';

-- Add Stripe Connect fields to users
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "organizer_stripe_account_id" TEXT,
  ADD COLUMN IF NOT EXISTS "stripe_onboarding_complete" BOOLEAN NOT NULL DEFAULT false;

-- Payment status enum for Prisma compatibility
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentStatus') THEN
    CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED', 'FAILED');
  END IF;
END
$$;

-- Payments table
CREATE TABLE IF NOT EXISTS "payments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tournament_id" UUID NOT NULL,
  "player_id" UUID NOT NULL,
  "team_id" UUID,
  "slot_index" INTEGER,
  "entry_fee_amount" NUMERIC(10, 2) NOT NULL,
  "platform_fee_amount" NUMERIC(10, 2) NOT NULL,
  "stripe_fee_amount" NUMERIC(10, 2) NOT NULL,
  "total_amount" NUMERIC(10, 2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "stripe_checkout_session_id" TEXT,
  "stripe_payment_intent_id" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "payments_tournament_id_fkey"
    FOREIGN KEY ("tournament_id") REFERENCES "tournaments" ("id") ON DELETE CASCADE,
  CONSTRAINT "payments_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players" ("id") ON DELETE CASCADE,
  CONSTRAINT "payments_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "teams" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "payments_tournament_player_idx"
  ON "payments" ("tournament_id", "player_id");
CREATE INDEX IF NOT EXISTS "payments_status_idx"
  ON "payments" ("status");

-- Optional backfill: entry_fee_cents from entry_fee
UPDATE "tournaments"
SET "entry_fee_cents" = ROUND("entryFee" * 100)::INT
WHERE "entry_fee_cents" IS NULL AND "entryFee" IS NOT NULL;
