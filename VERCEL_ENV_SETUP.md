# Vercel Environment Variables Setup

## 📋 Variables to Add in Vercel Dashboard:

### 1. DATABASE_URL (Transaction pooler - RECOMMENDED)
```
postgresql://postgres.angwdmyswzztmlrdzgxm:Kwpc75md8!!!@aws-1-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true&prepared_statements=false
```

### 2. NEXT_PUBLIC_SUPABASE_URL
```
https://angwdmyswzztmlrdzgxm.supabase.co
```

### 3. NEXT_PUBLIC_SUPABASE_ANON_KEY
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuZ3dkbXlzd3p6dG1scmR6Z3htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NzA3MjgsImV4cCI6MjA3NDQ0NjcyOH0.tCL0LVOPyGYID9_4XftCwXwLqSDiwM9YvtlmTWdrTBo
```

### 4. SUPABASE_SERVICE_ROLE_KEY
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuZ3dkbXlzd3p6dG1scmR6Z3htIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODg3MDcyOCwiZXhwIjoyMDc0NDQ2NzI4fQ.o88piotALs9_JHN5KRzZffrFku6fgueLw6Wuu4kBtF8
```

## 🚀 Setup Instructions:

1. **Open Vercel Dashboard**: https://vercel.com/dashboard
2. **Select project**: `piqle-web-tournament`
3. **Go to Settings** → **Environment Variables**
4. **Add each variable** with Environment: Production, Preview, Development
5. **Restart deployment**: Deployments → Redeploy

## 🔧 Alternative DATABASE_URL Options:

### 1. Transaction Pooling (PgBouncer) - ✅ RECOMMENDED for Vercel/Serverless
```
postgresql://postgres.angwdmyswzztmlrdzgxm:Kwpc75md8!!!@aws-1-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true&prepared_statements=false
```
**Why:** Best for serverless (Next.js API routes). Reuses connections, prevents "too many connections" errors.

### 2. Session Pooling - For long-running connections
```
postgresql://postgres.angwdmyswzztmlrdzgxm:Kwpc75md8!!!@aws-1-us-east-2.pooler.supabase.com:5432/postgres
```
**Why:** Full PostgreSQL features, but uses more connections. Not ideal for serverless.

### 3. Direct Connection - ⚠️ NOT recommended for serverless
```
postgresql://postgres:Kwpc75md8!!!@db.angwdmyswzztmlrdzgxm.supabase.co:5432/postgres
```
**Why:** Full features but high risk of "too many connections" in serverless environments. Use only for local development.

## ✅ Recommendation:
**Use Transaction pooler (port 6543)** - it's ideal for Vercel serverless functions and provides better performance while preventing connection limit issues.
