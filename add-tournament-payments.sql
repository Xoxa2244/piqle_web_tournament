-- Stripe payments support for tournaments

<<<<<<< Updated upstream
-- Payment status enum
DO $$ BEGIN
    CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'REFUNDED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Stripe account status enum
DO $$ BEGIN
    CREATE TYPE "StripeAccountStatus" AS ENUM ('PENDING', 'REQUIRE_ONBOARDING', 'ACTIVE');
=======
-- Ensure pgcrypto extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Payment status enum
DO $$ BEGIN
    CREATE TYPE "PaymentIntentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED');
>>>>>>> Stashed changes
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Extend tournaments table
ALTER TABLE tournaments
<<<<<<< Updated upstream
    ADD COLUMN IF NOT EXISTS "isPaid" BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'usd';

-- Tournament payment settings table (Stripe Connect accounts)
CREATE TABLE IF NOT EXISTS tournament_payment_settings (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "tournamentId" TEXT NOT NULL UNIQUE REFERENCES tournaments(id) ON DELETE CASCADE,
    "stripeAccountId" TEXT,
    "stripeAccountStatus" "StripeAccountStatus" NOT NULL DEFAULT 'PENDING',
    "paymentsEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "tournamentId" TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    "divisionId" TEXT REFERENCES divisions(id) ON DELETE SET NULL,
    "teamId" TEXT REFERENCES teams(id) ON DELETE SET NULL,
    "playerId" TEXT REFERENCES players(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'usd',
    status "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "stripePaymentIntentId" TEXT UNIQUE,
    "stripeCheckoutSessionId" TEXT UNIQUE,
    "applicationFeeAmount" INTEGER NOT NULL DEFAULT 0,
    "payoutAmount" INTEGER NOT NULL DEFAULT 0,
    "platformRevenue" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT REFERENCES users(id) ON DELETE SET NULL,
=======
    ADD COLUMN IF NOT EXISTS "paymentsEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS "stripeProductId" TEXT,
    ADD COLUMN IF NOT EXISTS "stripePriceId" TEXT;

-- Extend players table
ALTER TABLE players
    ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

-- Payment intents table
CREATE TABLE IF NOT EXISTS payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tournamentId" UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    "playerId" UUID REFERENCES players(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status "PaymentIntentStatus" NOT NULL DEFAULT 'PENDING',
    "stripePaymentIntentId" TEXT,
    "stripeCheckoutSessionId" TEXT,
>>>>>>> Stashed changes
    metadata JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

<<<<<<< Updated upstream
-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS tournament_payment_settings_tournament_idx ON tournament_payment_settings ("tournamentId");
CREATE INDEX IF NOT EXISTS payments_tournament_idx ON payments ("tournamentId");
CREATE INDEX IF NOT EXISTS payments_player_idx ON payments ("playerId");
CREATE INDEX IF NOT EXISTS payments_team_idx ON payments ("teamId");
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);
CREATE INDEX IF NOT EXISTS payments_stripe_session_idx ON payments ("stripeCheckoutSessionId");
CREATE INDEX IF NOT EXISTS payments_stripe_intent_idx ON payments ("stripePaymentIntentId");
=======
-- Helpful indexes
CREATE INDEX IF NOT EXISTS payment_intents_tournament_idx ON payment_intents ("tournamentId");
CREATE INDEX IF NOT EXISTS payment_intents_player_idx ON payment_intents ("playerId");
>>>>>>> Stashed changes

