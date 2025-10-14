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

### Direct connection (for local development):
```
postgresql://postgres:Kwpc75md8!!!@db.angwdmyswzztmlrdzgxm.supabase.co:5432/postgres
```

### Session pooler (alternative for IPv4):
```
postgresql://postgres.angwdmyswzztmlrdzgxm:Kwpc75md8!!!@aws-1-us-east-2.pooler.supabase.com:5432/postgres
```

## ✅ Recommendation:
**Use Transaction pooler** - it's ideal for Vercel serverless functions and provides better performance.
