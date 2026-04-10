# IQSport.ai Session Handoff — March 29, 2026

## What is this project?
IQSport.ai — AI-powered intelligence dashboard for pickleball clubs. Built on Next.js 15 + tRPC + Prisma + Supabase PostgreSQL.

The main client is **IPC (Indianapolis Pickleball Club)** — a **membership-based** club (members pay monthly, not per session). They have two locations: **IPC South** (8 courts, data imported) and **IPC North** (20 courts, NO data yet).

## Current state

### Navigation (7 items)
```
ANALYTICS:   Dashboard, Sessions
AI TOOLS:    AI Advisor, Court Optimizer
ENGAGE:      Members, Campaigns
SYSTEM:      Billing, Integrations
```

### Data in DB (club: IPC E = 1d3c150b-09ed-40c6-83fe-08bdeb17f594)
- **1,368 members** (club followers) with membership embeddings (status, type, dates)
- **6,602 sessions** from CourtReserve (ReservationReport + EventRegistrantsReport)
- **31,176 bookings** (player-session links)
- **12 courts** (8 IPC South + Badminton 1-3 + Court #9)
- Membership breakdown: 1,213 Active / 61 Suspended / 101 No Membership / 4 Expired

### Key architecture decisions
- **Occupancy = court-hours booked / available hours** (6AM-11PM = 17hrs/day), NOT registered/capacity
- **isMembership** defaults to `true` when `pricingModel` not set (most clubs are membership)
- **Health scoring** uses tier-adjusted weights: Guest Pass (0.7x), Monthly (0.9x), VIP (1.0x)
- **Event sessions** split per court (multi-court events create N sessions for accurate occupancy)
- **No mock data** — all removed. Empty state shown when no real data

### What works
- **Dashboard**: KPIs (Active Members, Court Occupancy, Player Sessions, Not Active), Player Health Overview, AI Weekly Summary, Period Comparison with calendar picker
- **Sessions**: Period filter (Week/Month/Quarter/Custom), Format filter, real KPIs (hours-based occupancy), Weekly/Hourly charts, Court Performance, Format Breakdown — all real data
- **Members**: Subtabs (All / At-Risk / Reactivation), Membership status KPIs (Active/Suspended/No Membership/Expired), Membership filter, health scores with tier-adjusted churn prediction, suggested actions per membership type
- **AI Advisor**: 6 tools (getMemberHealth, getUpcomingSessions, getClubMetrics, getReactivationCandidates, getCourtOccupancy with formats, getMembershipBreakdown). Forced to cite specific numbers
- **Court Optimizer**: Heatmap (hourly slots), underfilled session list, player match recommendations, real invite sending via mutation
- **Import**: Delete All Club Data button, per-file import with progress, maxDuration 300s for Vercel Pro
- **Campaigns**: Shows real outreach_logs from DB (no mocks)

### What's broken / needs work
1. **Slot Filler recommendations**: returns 0 matches for sessions. `useSlotFillerRecommendations` hook works but engine may not find matching players. Need to debug
2. **Campaigns**: "Send Campaign" not connected to real backend. Shows outreach history but can't create new campaigns
3. **Court deduplication**: each import creates new courts. Need upsert by name
4. **Import markers**: each import creates new markers. Need to consolidate or prevent duplicates
5. **DB connection pool**: `idle in transaction` connections accumulate (from AI profile generation during import). Need to add connection timeout or fix the generator
6. **IPC North**: no data imported. Files exist at `/Users/vasilykozlov/Downloads/ReservationReport_2026-03-26_05-26-PM.xlsx` (contains North courts #11-#20)
7. **Active Members KPI**: shows 1366 always. `csvPlayerCount` computation may need revisiting

### Key files
- `app/clubs/[id]/intelligence/_components/iq-layout/IQSidebar.tsx` — navigation
- `app/clubs/[id]/intelligence/_components/iq-pages/DashboardIQ.tsx` — main dashboard (~1400 lines)
- `app/clubs/[id]/intelligence/_components/iq-pages/SessionsIQ.tsx` — sessions + events
- `app/clubs/[id]/intelligence/_components/iq-pages/MembersIQ.tsx` — members + reactivation
- `app/clubs/[id]/intelligence/_components/iq-pages/SlotFillerIQ.tsx` — court optimizer
- `app/clubs/[id]/intelligence/_components/iq-pages/UtilizationIQ.tsx` — (removed from nav, but file still exists)
- `server/routers/intelligence.ts` — main backend (~2500 lines, getDashboardV2, getMemberHealth, getOccupancyHeatmap, etc.)
- `lib/ai/member-health.ts` — health scoring with tier adjustment
- `lib/ai/chat-tools.ts` — AI Advisor tools (6 tools)
- `lib/ai/llm/prompts.ts` — AI Advisor system prompt
- `lib/connectors/courtreserve-excel-import.ts` — Excel parser + import pipeline

### Git
- Branch: `deviq` → deploys to `dev.iqsport.ai`
- Branch: `Sol2` → production (do NOT merge deviq into Sol2 without testing)
- Latest commit: `813fbb51` on deviq

### Club IDs
- IPC: `36cef9d6-82ec-4d3e-a626-080dae9b3841` (empty, was cleaned)
- IPC E: `1d3c150b-09ed-40c6-83fe-08bdeb17f594` (active, has all data)

### Import files location
`/Users/vasilykozlov/Downloads/IPC_Import_Clean/` — 3 anon files for IPC South

### Common gotchas
- `npx tsx -e '...'` sometimes can't find `@prisma/client` — must run from project root: `cd /Users/vasilykozlov/Documents/GitHub/piqle-club-intelligence/piqle_web_tournament && npx tsx -e '...'`
- Vercel deploys `deviq` as Preview, not Production. `dev.iqsport.ai` is mapped to deviq preview
- `pricingModel` stored in `club.automationSettings.intelligence.pricingModel` — IPC E has "membership"
- DB: `clubs.id` = UUID, `users.id` = TEXT. Never run `prisma db push`
- Session `startTime` = "00:00" means time wasn't parsed (usually EventRegistrantsReport pre-fix)
