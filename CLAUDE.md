# IQSport.ai (formerly Piqle) — AI Intelligence Module

## Project Context
AI-powered revenue optimization platform for racquet sports clubs. Built on existing tournament platform (Piqle).

## Tech Stack
- **Framework**: Next.js 15 App Router, TypeScript
- **API**: tRPC with `protectedProcedure`
- **DB**: Prisma 6.16.2 + PostgreSQL (Supabase)
- **UI**: shadcn/ui, Radix UI, Tailwind CSS, Lucide icons
- **Deploy**: Vercel, branch `Sol2` → stest.piqle.io
- **Repo**: github.com/Xoxa2244/piqle_web_tournament

## Intelligence Module Structure

### Pages (app/clubs/[id]/intelligence/)
- `layout.tsx` — shared tab nav (Overview / Slot Filler / Reactivation / Revenue)
- `page.tsx` — dashboard with metrics, quick actions, underfilled sessions
- `slot-filler/page.tsx` — AI recommendations to fill empty slots
- `reactivation/page.tsx` — inactive member detection + outreach
- `revenue/page.tsx` — occupancy analytics by time/day/format

### Shared Components (_components/)
- `skeleton.tsx` — loading skeletons
- `empty-state.tsx` — empty state with icon, title, CTA
- `metric-card.tsx` — colored metric cards (default/danger/success/warning)
- `charts.tsx` — HorizontalBarChart, VerticalBarChart, OccupancyBadge, OccupancyBar

### Demo Mode (_data/ + _hooks/)
- `_data/mock.ts` — realistic mock data (127 members, 6 courts, sessions, recommendations)
- `_hooks/use-intelligence.ts` — hooks that return mock data when `?demo=true` in URL
- All pages use hooks instead of direct tRPC calls
- Demo URL: stest.piqle.io/clubs/any-id/intelligence?demo=true

### Backend
- `server/routers/intelligence.ts` — tRPC router
- `server/routers/_app.ts` — includes intelligenceRouter
- `lib/ai/intelligence-service.ts` — service layer with DB queries + AI scoring
- `lib/ai/slot-filler.ts`, `reactivation.ts`, `weekly-planner.ts`, `scoring.ts`, `persona.ts`
- `types/intelligence.ts` — TypeScript interfaces

### Database (prisma/schema.prisma)
New models: ClubCourt, PlaySession, PlaySessionBooking, PlaySessionWaitlist, UserPlayPreference, AIRecommendationLog
**Migration NOT yet run** — needs DATABASE_URL in .env (ask Rodion for Supabase password)

## Current Status
- ✅ All 4 pages built with proper UX components
- ✅ Demo mode working (?demo=true)
- ✅ ?demo=true preserved across navigation
- ⏳ Prisma migration pending (needs DB password)
- ⏳ Seed script for dev/staging not yet created

## Git Workflow
- Branch: `Sol2`
- Push to origin triggers Vercel deploy to stest.piqle.io
- Commit convention: conventional commits (feat:, fix:, etc.)
- Co-author: `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
