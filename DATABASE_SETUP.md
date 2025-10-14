# Database Setup Instructions

## Problem
Supabase database is not created, so when trying to create a tournament, a 404 error occurs.

## Solution

### Option 1: Create New Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Get new credentials:
   - Database URL
   - Supabase URL
   - Anon Key
   - Service Role Key
4. Update environment variables in Vercel

### Option 2: Use Existing Project
If you already have a Supabase project:
1. Go to Supabase Dashboard
2. Open "SQL Editor" section
3. Execute SQL script from file `prisma/migrations/20250101000000_init/migration.sql`
4. Make sure environment variables are configured correctly

### Option 3: Local Setup
1. Create `.env.local` file in project root:
```env
DATABASE_URL="postgresql://postgres:Kwpc75md8!!!@db.angwdmyswzztmlrdzgxm.supabase.co:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://angwdmyswzztmlrdzgxm.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuZ3dkbXlzd3p6dG1scmR6Z3htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NzA3MjgsImV4cCI6MjA3NDQ0NjcyOH0.tCL0LVOPyGYID9_4XftCwXwLqSDiwM9YvtlmTWdrTBo"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuZ3dkbXlzd3p6dG1scmR6Z3htIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODg3MDcyOCwiZXhwIjoyMDc0NDQ2NzI4fQ.o88piotALs9_JHN5KRzZffrFku6fgueLw6Wuu4kBtF8"
```

2. Execute command:
```bash
npx prisma db push
```

## Verification
After database setup:
1. Restart the application
2. Try creating a tournament
3. Verify that data is saved in Supabase

## SQL for Creating Tables
If you need to create tables manually, use SQL from file `prisma/migrations/20250101000000_init/migration.sql`
