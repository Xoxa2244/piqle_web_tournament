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
10 Intelligence models: ClubCourt, PlaySession, PlaySessionBooking, PlaySessionWaitlist, UserPlayPreference, AIRecommendationLog, DocumentEmbedding, AIConversation, AIMessage, MemberHealthSnapshot

**DB Type Notes** (critical for future migrations):
- `clubs.id` = UUID in DB, `users.id` = TEXT in DB
- All `clubId` FK columns = UUID, all `userId`/`hostId` FK columns = TEXT
- ⚠️ **NEVER run `prisma db push`** — schema ↔ DB types diverge. All migrations via SQL only.
- pgvector: `document_embeddings.embedding` = `vector(1536)`, HNSW index, `match_documents()` RPC

### AI Features
- `lib/ai/inferred-preferences.ts` — infer player preferences from booking history (≥5 bookings, 30% threshold)
- `lib/ai/onboarding-schema.ts` — Zod validation for club onboarding wizard
- `lib/ai/csv-schedule-analyzer.ts` — auto-extract operating hours, peak times from CSV
- `lib/ai/llm/prompts.ts` — `buildClubContextPrompt()` for AI Advisor system prompt

## Current Status
- ✅ All 4 pages built with proper UX components
- ✅ Demo mode working (?demo=true)
- ✅ ?demo=true preserved across navigation
- ✅ Intelligence tables created in Supabase (10 tables, 6 enums, pgvector)
- ✅ DATABASE_URL + DIRECT_URL configured in .env / .env.local
- ✅ Prisma Client generated
- ✅ Vercel env vars configured (DATABASE_URL on Vercel since 163 days ago)
- ✅ Seed script created (scripts/seed-intelligence.ts — 22 members, 15 sessions)

## Active Initiatives

### Engage Redesign (April 2026 — Phases 0–5 shipped, polish phase)
- **Plan:** `docs/ENGAGE_REDESIGN_PLAN.md` (the why/what)
- **Spec:** `docs/ENGAGE_REDESIGN_SPEC.md` (35 atomic tasks, file:line, acceptance criteria)
- **Scope:** Members / Segments (formerly "Cohorts") / Campaigns + Settings → Automation. Reactivation page removed.
- **Brand:** **IQSport only**. Legacy brand pages (`Legacy*Page` components) remain as-is. All work gated behind `brand.key === 'iqsport'` checks where dual paths exist.
- **Branch:** `rgdev` (do not push to `deviq` directly)
- **Phase status:**
  - ✅ Phase 0 — Prerequisites (Settings/Automation skeleton, tRPC stubs, Live Mode audit)
  - ✅ Phase 1 — Cleanup (Reactivation removed, Agent Campaign moved, AI campaigns lifted)
  - ✅ Phase 2 — Members rework (KPI strip, list/card toggle, filter drawer, AI Insight, Member detail drawer, churn chart)
  - ✅ Phase 3 — Cohorts AI (3 generators, Builder drawer, Save+Campaign bridge, polish)
  - ✅ Phase 4 — Campaign Wizard (4-step, AI message gen, Active Campaigns table, all entry points wired)
  - ✅ Phase 5 — Closing the loop (cron, schema, attribution, cleanup)
  - ✅ **Priority 1 (post-Phase-5 polish) — closed 2026-05-01.** All 6 substeps shipped (`7f57d3c4`, `34a6959f`, `73197ee2`, `f3ad821e`, `2d39d67f`). Campaign Wizard Launch now sends real Mandrill emails end-to-end; verified live with 6 real sends + Live Mode/killSwitch toggle test. See `docs/ENGAGE_PRIORITY1_SPEC.md` for full status, evidence table, and known limitations.

**Last session (Apr 27 → May 1, 2026)** — full log in `docs/iqsport-session-summary-2026-04-30.md`. Four parallel workstreams:
1. **Solapp demo rebuild** (`demo.iqsport.ai`) — force-pushed fresh Solapp on Sol2 base, 1500 mock members, new DemoAdvisorIQ with 12 canned scenarios.
2. **Sol2 production fix** — silent breakage in AI Insights since launch (`::uuid` casts on text columns) found and fixed (`6ec06847`, `6a3c488e`). 4 generators rewritten to read from `users` table. 10/10 generators now work on prod.
3. **Persona research for AI Insights** — 3 parallel agents (Marketer/Ops/Owner) produced 15-item backlog of new insights. Universal complaint: insights not role-tagged.
4. **Engage Priority 1** — closed (see above).

**Next on Engage rgdev:** see §6 of `docs/ENGAGE_PRIORITY1_SPEC.md`. Three immediate items: (a) merge gate to main (run migration on prod Supabase first), (b) custom CTA in Campaign emails, (c) AI Insights role-tagging. Then Priority 2 (Campaign History real data + drilldown).

When working on Engage section, **always consult SPEC first** for the specific task ID (e.g. `P2-T3`) before writing code. The spec defines acceptance criteria and risk notes per task. For post-spec polish work, look for "Priority N.N" pattern in recent commits to find current sequence.

## Git Workflow
- Branch: `Sol2` (legacy default) / `rgdev` (current Engage redesign work)
- Push to origin triggers Vercel deploy to stest.piqle.io
- Commit convention: conventional commits (feat:, fix:, etc.)
- Co-author: `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
