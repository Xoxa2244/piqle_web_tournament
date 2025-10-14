# Applying Migration to Production Database

## Problem
Error: `The column 'isPaid' does not exist in the current database`

This means the migration to update the Player model has not been applied to the production database.

## Solution

### Option 1: Through Supabase Dashboard (Recommended)

1. Open Supabase Dashboard
2. Go to your project
3. Open SQL Editor
4. Execute the following SQL:

```sql
-- Migration to update Player model with new fields
-- Add new fields to players table

ALTER TABLE players 
ADD COLUMN IF NOT EXISTS dupr_rating DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_waitlist BOOLEAN DEFAULT false;

-- Update existing dupr field from DECIMAL to VARCHAR
-- First, create a temporary column
ALTER TABLE players ADD COLUMN IF NOT EXISTS dupr_temp VARCHAR;

-- Copy data from old dupr column to new temp column
UPDATE players SET dupr_temp = dupr::text WHERE dupr IS NOT NULL;

-- Drop the old dupr column
ALTER TABLE players DROP COLUMN IF EXISTS dupr;

-- Rename the temp column to dupr
ALTER TABLE players RENAME COLUMN dupr_temp TO dupr;

-- Add comment to clarify the change
COMMENT ON COLUMN players.dupr IS 'DUPR ID as string identifier';
COMMENT ON COLUMN players.dupr_rating IS 'DUPR rating from 0.00 to 5.00';
COMMENT ON COLUMN players.is_paid IS 'Payment status of the player';
COMMENT ON COLUMN players.is_waitlist IS 'Whether player is on waitlist';
```

### Option 2: Through Script (if you have DATABASE_URL access)

1. Install pg: `npm install pg`
2. Set DATABASE_URL environment variable with production connection string
3. Run: `node apply-production-migration.js`

## Verification

After applying the migration, verify that:
1. Columns `is_paid` and `is_waitlist` exist in `players` table
2. Column `dupr` has type VARCHAR
3. Column `dupr_rating` has type DECIMAL(3,2)

## Alternative Solution

If migration doesn't work, you can temporarily remove new fields from code:

1. In `server/routers/player.ts` remove `isPaid` and `isWaitlist` from create/update mutations
2. In components remove these fields from forms
3. Apply migration later
