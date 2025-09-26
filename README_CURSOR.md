# Cursor — Quick Introduction

## How to Use Tech Spec and User Stories

* **PROMPT.md** — main tech spec. Follow milestones M1…M6 and Acceptance Criteria sections.
* **docs/td-user-stories.md** — TD scenarios. Use them as basis for e2e tests (Playwright) and checklists.
* Work cycle:

  1. Implement nearest milestone from PROMPT.md.
  2. Cover key stories from corresponding epics (A–J).
  3. Run end-to-end: import → RR (including merged) → Start Elimination → play-in/bracket → public board.
* UI/UX: desktop-first, minimal scrolling, DnD on `@dnd-kit`, live updates via Supabase Realtime.

## Repository and Deploy

* **GitHub repo:** `piqle_web_tournament` (branch `main`).
* **Vercel:** connected to this repository; auto-deploy on push.

## Environment Variables (locally and on Vercel)

> IMPORTANT: do not commit keys to Git. Store in `.env.local` (locally) and in **Vercel → Project Settings → Environment Variables**.

### 1) Database (Supabase Postgres / Prisma)

* `DATABASE_URL` — database connection string:

  ```
  postgresql://postgres:Kwpc75md8!!!@db.angwdmyswzztmlrdzgxm.supabase.co:5432/postgres
  ```

  (this is test; will be rotated later)

### 2) Supabase (client and server)

* `NEXT_PUBLIC_SUPABASE_URL` — `https://angwdmyswzztmlrdzgxm.supabase.co`
* `NEXT_PUBLIC_SUPABASE_ANON_KEY` —
  `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuZ3dkbXlzd3p6dG1scmR6Z3htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NzA3MjgsImV4cCI6MjA3NDQ0NjcyOH0.tCL0LVOPyGYID9_4XftCwXwLqSDiwM9YvtlmTWdrTBo`
* `SUPABASE_SERVICE_ROLE_KEY` (server-only!) —
  `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuZ3dkbXlzd3p6dG1scmR6Z3htIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODg3MDcyOCwiZXhwIjoyMDc0NDQ2NzI4fQ.o88piotALs9_JHN5KRzZffrFku6fgueLw6Wuu4kBtF8`

### 3) Complete `.env.local` Example (Local Development)

```env
# Postgres / Prisma
DATABASE_URL="postgresql://postgres:Kwpc75md8!!!@db.angwdmyswzztmlrdzgxm.supabase.co:5432/postgres"

# Supabase (client)
NEXT_PUBLIC_SUPABASE_URL="https://angwdmyswzztmlrdzgxm.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuZ3dkbXlzd3p6dG1scmR6Z3htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NzA3MjgsImV4cCI6MjA3NDQ0NjcyOH0.tCL0LVOPyGYID9_4XftCwXwLqSDiwM9YvtlmTWdrTBo"

# Supabase (server-only)
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuZ3dkbXlzd3p6dG1scmR6Z3htIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODg3MDcyOCwiZXhwIjoyMDc0NDQ2NzI4fQ.o88piotALs9_JHN5KRzZffrFku6fgueLw6Wuu4kBtF8"
```

> **On Vercel** add the same variables (in Development/Preview/Production sections). `SUPABASE_SERVICE_ROLE_KEY` is not available on client: use only in server handlers (tRPC/route handlers).

## Quick Start (Commands for Cursor)

```bash
# 1) Initialize dependencies
npm i

# 2) Prisma
npx prisma init         # if /prisma folder doesn't exist yet
# (Schema from PROMPT.md → /prisma/schema.prisma)
npx prisma migrate dev --name init

# 3) Run locally
npm run dev

# 4) Tests
npm run test            # unit
npm run test:e2e        # e2e (Playwright)

# 5) Deploy
git add . && git commit -m "feat: M1 scaffolding" && git push origin main
# Vercel will auto-deploy
```

## What to Include in Project Immediately

* `PROMPT.md` (tech spec v2 with merged RR)
* `docs/td-user-stories.md` (TD stories)
* `README_CURSOR.md` (this file)
* Basic scaffolding: Next.js + TS, Tailwind + shadcn/ui, tRPC, Prisma, Supabase client.
* Empty page stubs:

  * `/admin` (tournament list),
  * `/admin/[tid]` (wizard),
  * `/t/[slug]` (public board, read-only, no login).

## Security Rules

* **Never** commit `.env*` and keys to repository.
* `SUPABASE_SERVICE_ROLE_KEY` — server only, prevent leakage to client bundle.
* After test completion, project owner **rotates** database password and keys in Supabase.
