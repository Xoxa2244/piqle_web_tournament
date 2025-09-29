# Настройка переменных окружения в Vercel

## 📋 Переменные для добавления в Vercel Dashboard:

### 1. DATABASE_URL (Transaction pooler - РЕКОМЕНДУЕТСЯ)
```
postgresql://postgres.angwdmyswzztmlrdzgxm:Kwpc75md8!!!@aws-1-us-east-2.pooler.supabase.com:6543/postgres
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

## 🚀 Инструкция по настройке:

1. **Откройте Vercel Dashboard**: https://vercel.com/dashboard
2. **Выберите проект**: `piqle-web-tournament`
3. **Перейдите в Settings** → **Environment Variables**
4. **Добавьте каждую переменную** с Environment: Production, Preview, Development
5. **Перезапустите деплой**: Deployments → Redeploy

## 🔧 Альтернативные варианты DATABASE_URL:

### Direct connection (для локальной разработки):
```
postgresql://postgres:Kwpc75md8!!!@db.angwdmyswzztmlrdzgxm.supabase.co:5432/postgres
```

### Session pooler (альтернатива для IPv4):
```
postgresql://postgres.angwdmyswzztmlrdzgxm:Kwpc75md8!!!@aws-1-us-east-2.pooler.supabase.com:5432/postgres
```

## ✅ Рекомендация:
**Используйте Transaction pooler** - он идеально подходит для Vercel serverless функций и обеспечивает лучшую производительность.
