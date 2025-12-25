# Database Connection Guide for Vercel/Serverless

## 🎯 Quick Answer: Use Transaction Pooling (PgBouncer)

For Next.js on Vercel (serverless), **always use Transaction Pooling** to avoid "too many connections" errors.

## 📋 Connection Types Explained

### 1. Transaction Pooling (PgBouncer) - ✅ RECOMMENDED

**Format:**
```
postgresql://postgres.angwdmyswzztmlrdzgxm:PASSWORD@aws-1-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true&prepared_statements=false
```

**Port:** `6543`  
**Host:** `aws-1-us-east-2.pooler.supabase.com` (or `db.xxx.supabase.co` with pooler)  
**Required params:** `?pgbouncer=true&prepared_statements=false`

**✅ Pros:**
- Reuses connections efficiently
- Prevents "too many connections" errors
- Perfect for serverless (Next.js API routes)
- Lower connection overhead

**❌ Cons:**
- No prepared statements (Prisma handles this)
- No LISTEN/NOTIFY
- No session-level features

**When to use:** Always for Vercel/serverless deployments

---

### 2. Session Pooling - For Long Connections

**Format:**
```
postgresql://postgres.angwdmyswzztmlrdzgxm:PASSWORD@aws-1-us-east-2.pooler.supabase.com:5432/postgres
```

**Port:** `5432`  
**Host:** `aws-1-us-east-2.pooler.supabase.com`  
**No special params needed**

**✅ Pros:**
- Full PostgreSQL features
- Prepared statements work
- LISTEN/NOTIFY works

**❌ Cons:**
- Uses more connections
- Higher risk of connection limits in serverless

**When to use:** Long-running processes, background jobs

---

### 3. Direct Connection - ⚠️ NOT for Serverless

**Format:**
```
postgresql://postgres:PASSWORD@db.angwdmyswzztmlrdzgxm.supabase.co:5432/postgres
```

**Port:** `5432`  
**Host:** `db.xxx.supabase.co` (direct, no pooler)

**✅ Pros:**
- Full PostgreSQL features
- No pooling overhead

**❌ Cons:**
- **High risk of "too many connections" in serverless**
- Each serverless function creates new connections
- Can exhaust connection pool quickly

**When to use:** Only for local development or long-running servers

---

## 🔍 How to Check Your Connection

Use the debug endpoint:
```
https://your-domain.com/api/debug/db-connection-test
```

This will show:
- ✅ Connection success/failure
- ✅ Password correctness
- ✅ Database name
- ✅ Table existence (partners table check)

---

## 🚀 Setup for Vercel

1. **Go to Vercel Dashboard** → Your Project → Settings → Environment Variables

2. **Add/Update DATABASE_URL:**
   ```
   postgresql://postgres.angwdmyswzztmlrdzgxm:YOUR_PASSWORD@aws-1-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true&prepared_statements=false
   ```

3. **Important:** 
   - Use port `6543` (Transaction pooling)
   - Include `?pgbouncer=true&prepared_statements=false`
   - Use pooler hostname (not direct `db.xxx.supabase.co`)

4. **Redeploy** after updating environment variables

---

## 🐛 Troubleshooting

### Error: "too many connections"
→ Switch to Transaction Pooling (port 6543)

### Error: "password authentication failed"
→ Check password in Supabase Dashboard → Settings → Database

### Error: "table does not exist"
→ Run migrations in Supabase SQL Editor

### Error: "protocol must be postgresql://"
→ Make sure DATABASE_URL starts with `postgresql://` (not `postgres://`)

---

## 📚 References

- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- [Prisma with PgBouncer](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management#pgbouncer)
- [Vercel Serverless Functions](https://vercel.com/docs/functions/serverless-functions)

