# Applying Tournament Ratings Migration

## Problem
Error when trying to like/dislike a tournament:
```
type "public.RatingType" does not exist
```

This means the migration to create the `tournament_ratings` table and `RatingType` enum has not been applied to the production database.

## Solution

### Option 1: Through Supabase Dashboard (Recommended)

1. Open Supabase Dashboard
2. Go to your project
3. Open SQL Editor
4. Execute the SQL from `prisma/migrations/add-tournament-ratings.sql` or copy-paste:

```sql
-- Create RatingType enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE "RatingType" AS ENUM ('LIKE', 'DISLIKE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Drop table if it exists with wrong schema (it should be empty if just created)
DROP TABLE IF EXISTS "tournament_ratings" CASCADE;

-- Create TournamentRating table for likes/dislikes
CREATE TABLE "tournament_ratings" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" "RatingType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_ratings_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint for one rating per user per tournament
CREATE UNIQUE INDEX "tournament_ratings_userId_tournamentId_key" ON "tournament_ratings"("userId", "tournamentId");

-- Create foreign key constraints
ALTER TABLE "tournament_ratings" ADD CONSTRAINT "tournament_ratings_tournamentId_fkey" 
    FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tournament_ratings" ADD CONSTRAINT "tournament_ratings_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS "tournament_ratings_tournamentId_idx" ON "tournament_ratings"("tournamentId");
CREATE INDEX IF NOT EXISTS "tournament_ratings_userId_idx" ON "tournament_ratings"("userId");
```

### Option 2: Through Script (if you have DATABASE_URL access)

1. Make sure you have `pg` installed: `npm install pg`
2. Set `DATABASE_URL` environment variable with production connection string:
   ```bash
   export DATABASE_URL="postgresql://postgres:[password]@db.angwdmyswzztmlrdzgxm.supabase.co:5432/postgres"
   ```
3. Run: `node apply-tournament-ratings-migration.js`

### Option 3: Through Prisma Migrate (if you have direct database access)

```bash
npx prisma migrate deploy
```

Or create a proper migration:
```bash
npx prisma migrate dev --name add_tournament_ratings
```

## Verification

After applying the migration, verify that:
1. Enum type `RatingType` exists with values `'LIKE'` and `'DISLIKE'`
2. Table `tournament_ratings` exists with the correct schema
3. Column `rating` has type `RatingType` (not TEXT)

You can verify by running:
```sql
-- Check if enum exists
SELECT typname, typtype 
FROM pg_type 
WHERE typname = 'RatingType';

-- Check table structure
SELECT column_name, data_type, udt_name
FROM information_schema.columns 
WHERE table_name = 'tournament_ratings';
```

## Important Notes

⚠️ **Warning**: The migration script uses `DROP TABLE IF EXISTS` which will delete the table if it already exists. This is safe if the table was just created and is empty, but if there are any existing ratings, they will be lost. 

If you have existing data in the table, you should modify the migration to preserve the data by converting the column type instead of dropping the table.

