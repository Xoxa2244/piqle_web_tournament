# Applying User Profile Fields Migration

## Problem
Error when trying to login through Google:
```
The column `users.gender` does not exist in the current database.
```

This means the migration to add `gender`, `city`, and `duprLink` fields to the `users` table has not been applied to the production database.

## Solution

### Option 1: Through Supabase Dashboard (Recommended)

1. Open Supabase Dashboard
2. Go to your project
3. Open SQL Editor
4. Execute the SQL from `add-user-profile-fields-migration.sql` or copy-paste:

```sql
-- Migration: Add user profile fields (gender, city, duprLink)
-- This migration adds fields to support user profile information

-- Create Gender enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE "Gender" AS ENUM ('M', 'F', 'X');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add gender column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS gender "Gender";

-- Add city column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS city VARCHAR(255);

-- Add duprLink column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS "duprLink" VARCHAR(255);

-- Add comments for clarity
COMMENT ON COLUMN users.gender IS 'User gender: M (Male), F (Female), X (Other)';
COMMENT ON COLUMN users.city IS 'User city/location';
COMMENT ON COLUMN users."duprLink" IS 'Link to DUPR profile';
```

### Option 2: Through Script (if you have DATABASE_URL access)

1. Make sure you have `pg` installed: `npm install pg`
2. Set `DATABASE_URL` environment variable with production connection string:
   ```bash
   export DATABASE_URL="postgresql://postgres:[password]@db.angwdmyswzztmlrdzgxm.supabase.co:5432/postgres"
   ```
3. Run: `node apply-user-profile-fields-migration.js`

### Option 3: Through Prisma Migrate (if you have direct database access)

```bash
npx prisma db push
```

Or create a proper migration:
```bash
npx prisma migrate dev --name add_user_profile_fields
npx prisma migrate deploy
```

## Verification

After applying the migration, verify that:
1. Enum type `Gender` exists with values 'M', 'F', 'X'
2. Column `gender` exists in `users` table with type `Gender` (nullable)
3. Column `city` exists in `users` table with type `VARCHAR(255)` (nullable)
4. Column `duprLink` exists in `users` table with type `VARCHAR(255)` (nullable)

You can verify by running:
```sql
-- Check enum exists
SELECT typname, typtype 
FROM pg_type 
WHERE typname = 'Gender';

-- Check columns exist
SELECT column_name, data_type, udt_name, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN ('gender', 'city', 'duprLink');
```

## After Migration

Once the migration is applied, you should be able to:
1. Login through Google successfully
2. Access the profile page
3. Edit profile fields (name, gender, city)
4. See the DUPR link field (currently disabled/muted)

## Troubleshooting

If you still get errors after applying the migration:
1. Make sure Prisma Client is regenerated: `npx prisma generate`
2. Restart your application server
3. Clear any cached Prisma client instances

