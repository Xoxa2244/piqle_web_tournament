# Partner Development Guide

## Quick Start

```bash
# 1. Clone your fork
git clone <your-fork-url>
cd piqle-club-intelligence/piqle_web_tournament

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env.local
# Fill in your own API keys in .env.local

# 4. Generate Prisma client
npx prisma generate

# 5. Run dev server
npm run dev
# App runs at http://localhost:3000
```

---

## Project Architecture

### Multi-Brand System
One Next.js app serves two brands based on hostname:
- **piqle.io** — tournament management (pickleball/tennis)
- **iqsport.ai** — AI intelligence for fitness clubs

Brand detection: `piqle_web_tournament/lib/brand.ts`
Route filtering: `piqle_web_tournament/middleware.ts`

### Tech Stack
- **Next.js 15** (App Router) + TypeScript
- **tRPC** — type-safe API layer (`server/routers/`)
- **Prisma** — ORM + PostgreSQL (Supabase)
- **shadcn/ui** + Tailwind CSS — UI components
- **Recharts** — charts, **motion/react** — animations

---

## Your Work Zone

### Files you CAN modify and create

| Area | Path | Description |
|------|------|-------------|
| **Fitness pages** | `app/clubs/[id]/intelligence/` | All page.tsx files, new pages |
| **IQ components** | `app/clubs/[id]/intelligence/_components/iq-pages/` | UI components |
| **Data hooks** | `app/clubs/[id]/intelligence/_hooks/` | Data fetching hooks |
| **Theme** | `app/clubs/[id]/intelligence/iqsport-theme.css` | CSS variables |
| **tRPC router** | `server/routers/intelligence.ts` | Backend API procedures |
| **New files** | Anywhere in the above directories | New components, hooks, utils |
| **New DB tables** | `prisma/schema.prisma` | Add new models (via migrations only!) |

### Files you must NOT modify

| Area | Path | Why |
|------|------|-----|
| **Brand logic** | `lib/brand.ts` | Controls multi-brand routing |
| **Middleware** | `middleware.ts` | Route filtering, demo mode |
| **tRPC core** | `server/trpc.ts`, `server/utils/` | Shared infrastructure |
| **Root layout** | `app/layout.tsx` | App-wide providers |
| **Brand provider** | `components/BrandProvider.tsx` | Client-side brand detection |
| **Auth** | `api/auth/` | Authentication system |
| **Payments** | Stripe-related files | Payment processing |
| **Tournament code** | `admin/`, `play/`, `players/`, `tournaments/`, `scoreboard/` | Piqle-specific features |
| **Chat** | `chats/`, `clubChat/`, `tournamentChat/` | Messaging system |

---

## Database Rules

### Creating new tables
Add new models to `prisma/schema.prisma`, then:
```bash
npx prisma migrate dev --name describe-your-change
```

### NEVER do this
```bash
# NEVER use db push — it will break type synchronization
npx prisma db push  # <-- DO NOT RUN
```

### Modifying existing tables
If you need to change an existing table (add column, change type, etc.) — **coordinate with the team first**. Existing tables have production data.

### Type notes
- `clubs.id` = UUID
- `users.id` = TEXT
- All `clubId` foreign keys = UUID
- All `userId`/`hostId` foreign keys = TEXT

---

## Demo Mode

Pages support a demo mode with mock data:
- URL: `http://localhost:3000/clubs/any-id/intelligence?demo=true`
- Hooks in `_hooks/` return mock data when `?demo=true` is in URL
- Mock data defined in `_data/mock.ts`

---

## Syncing with upstream

To get latest changes from the original repo:
```bash
# Add upstream remote (one time)
git remote add upstream <original-repo-url>

# Fetch and merge updates
git fetch upstream
git merge upstream/Sol2
```

If you want to contribute changes back — open a **Pull Request** from your fork.

---

## Key CSS Variables (Theme)

```css
--card-bg       /* Card background */
--heading       /* Heading color */
--t1, --t2, --t3, --t4  /* Text hierarchy */
--subtle        /* Muted text */
--chart-grid    /* Chart grid lines */
```

Defined in `iqsport-theme.css`. Use these for consistent dark theme styling.
