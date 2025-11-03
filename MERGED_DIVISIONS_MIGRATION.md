# Applying Merged Divisions Migration to Production Database

## Problem
Error: `500 Internal Server Error` when accessing `/api/trpc/tournament.list` or `/api/trpc/tournament.get`

This means the migration to add `isMerged` and `mergedFromDivisionIds` fields to the `divisions` table has not been applied to the production database.

## Solution

### Option 1: Through Supabase Dashboard (Recommended)

1. Open Supabase Dashboard
2. Go to your project
3. Open SQL Editor
4. Execute the following SQL:

```sql
-- Migration: Add merged divisions support
-- This migration adds fields to support merging two divisions into one temporary merged division

-- Add isMerged boolean field
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS "isMerged" BOOLEAN NOT NULL DEFAULT false;

-- Add mergedFromDivisionIds JSON field to store array of original division IDs
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS "mergedFromDivisionIds" JSONB;
```

### Option 2: Through Script (if you have DATABASE_URL access)

1. Make sure you have `pg` installed: `npm install pg`
2. Set `DATABASE_URL` environment variable with production connection string:
   ```bash
   export DATABASE_URL="postgresql://postgres:[password]@db.angwdmyswzztmlrdzgxm.supabase.co:5432/postgres"
   ```
3. Run: `node apply-merged-divisions-migration.js`

### Option 3: Through Prisma Migrate (if you have direct database access)

```bash
npx prisma migrate deploy
```

## Verification

After applying the migration, verify that:
1. Column `isMerged` exists in `divisions` table with type `BOOLEAN` and default value `false`
2. Column `mergedFromDivisionIds` exists in `divisions` table with type `JSONB` (nullable)

You can verify by running:
```sql
SELECT column_name, data_type, column_default, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'divisions' 
  AND column_name IN ('isMerged', 'mergedFromDivisionIds');
```

## After Migration

Once the migration is applied, the application should work correctly. The new fields will allow:
- Merging two divisions into a temporary combined division for round-robin stage
- Automatically splitting merged divisions back when transitioning to elimination stage

