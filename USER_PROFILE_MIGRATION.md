# Applying User Profile Fields Migration

## Problem
Error when trying to login through Google:
```
The column `users.gender` does not exist in the current database.
```

This means the migration to add `gender`, `city`, and `duprLink` fields to the `users` table has not been applied to the database.

## Solution

### Option 1: Through Supabase Dashboard (Recommended)

1. Open Supabase Dashboard
2. Go to your project
3. Open SQL Editor
4. Execute the following SQL from `add-user-profile-fields-migration.sql`:

```sql
-- Migration: Add user profile fields (gender, city, duprLink)
-- This migration adds fields to support user profile information

-- Add gender field (enum: 'M', 'F', 'X')
ALTER TABLE users ADD COLUMN IF NOT EXISTS "gender" TEXT CHECK ("gender" IN ('M', 'F', 'X'));

-- Add city field
ALTER TABLE users ADD COLUMN IF NOT EXISTS "city" TEXT;

-- Add duprLink field
ALTER TABLE users ADD COLUMN IF NOT EXISTS "duprLink" TEXT;

-- Add comments for documentation
COMMENT ON COLUMN users."gender" IS 'User gender: M (Male), F (Female), X (Other)';
COMMENT ON COLUMN users."city" IS 'User city';
COMMENT ON COLUMN users."duprLink" IS 'Link to user DUPR profile';
```

### Option 2: Through Script (if you have DATABASE_URL access)

1. Make sure you have `pg` installed: `npm install pg`
2. Set `DATABASE_URL` environment variable with production connection string:
   ```bash
   export DATABASE_URL="postgresql://postgres:[password]@db.angwdmyswzztmlrdzgxm.supabase.co:5432/postgres"
   ```
3. Run: `node apply-user-profile-migration.js`

### Option 3: Through Prisma (Local Development)

If you're working locally:
```bash
npx prisma db push
```

Or create and apply a migration:
```bash
npx prisma migrate dev --name add_user_profile_fields
npx prisma migrate deploy
```

## Verification

After applying the migration, verify that:
1. Column `gender` exists in `users` table with type `TEXT` and CHECK constraint
2. Column `city` exists in `users` table with type `TEXT` (nullable)
3. Column `duprLink` exists in `users` table with type `TEXT` (nullable)

You can verify by running:
```sql
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN ('gender', 'city', 'duprLink');
```

## After Migration

Once the migration is applied, the application should work correctly:
- Google login should work without errors
- User profile page should be able to display and edit gender, city, and duprLink fields

