-- Migration: Add Stripe Connect fields to User model
-- This migration adds Stripe Connect account fields to users table

-- Add Stripe fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS "stripeAccountId" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "stripeAccountStatus" "StripeAccountStatus" DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS "paymentsEnabled" BOOLEAN DEFAULT false;

-- Add comments for clarity
COMMENT ON COLUMN users."stripeAccountId" IS 'Stripe Connect account ID for receiving payments';
COMMENT ON COLUMN users."stripeAccountStatus" IS 'Status of Stripe Connect account (PENDING, REQUIRE_ONBOARDING, ACTIVE, RESTRICTED, DISABLED)';
COMMENT ON COLUMN users."paymentsEnabled" IS 'Whether user can receive payments through Stripe';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_stripe_account_id ON users("stripeAccountId");

-- Verify the changes
SELECT 
    column_name, 
    data_type, 
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'users' 
AND column_name IN ('stripeAccountId', 'stripeAccountStatus', 'paymentsEnabled')
ORDER BY column_name;

