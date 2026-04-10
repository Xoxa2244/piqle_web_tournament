# Club Intelligence Module — Integration Guide

## Overview

This guide walks through integrating the Club Intelligence module into your existing Piqle tournament platform. The module adds AI-powered club management features: session management, AI slot filling, weekly planning, and member reactivation.

## What Was Created

### New Files in the Project

**Pages (already in app/ directory):**
- `app/clubs/[id]/intelligence/page.tsx` — Club admin AI dashboard
- `app/clubs/[id]/intelligence/slot-filler/page.tsx` — AI slot filler recommendations
- `app/clubs/[id]/intelligence/reactivation/page.tsx` — Member reactivation page
- `app/play/page.tsx` — Player dashboard with weekly plan
- `app/play/weekly-plan/page.tsx` — Detailed weekly plan view
- `app/play/preferences/page.tsx` — Player preference settings
- `app/play/my-bookings/page.tsx` — Booking management

**In `piqle-club-intelligence/` reference folder:**
- `prisma/schema-additions.prisma` — New Prisma models to add to schema
- `migrations/add-club-intelligence.sql` — Raw SQL migration
- `scripts/seed-intelligence.ts` — Demo seed data
- `lib/ai/slot-filler.ts` — Slot filler scoring engine
- `lib/ai/weekly-planner.ts` — Weekly plan generation
- `lib/ai/reactivation.ts` — Reactivation scoring
- `lib/ai/scoring.ts` — Shared scoring utilities
- `lib/ai/index.ts` — Barrel exports
- `types/intelligence.ts` — TypeScript types
- `server/api/routers/sessions.ts` — Session CRUD procedures
- `server/api/routers/bookings.ts` — Booking procedures
- `server/api/routers/intelligence.ts` — AI recommendation procedures

## Step-by-Step Integration

### Step 1: Database Schema (Day 1)

1. Open `prisma/schema.prisma`

2. Add these relations to the existing `User` model (before the closing `}`):
```prisma
  // Club Intelligence
  playSessionBookings     PlaySessionBooking[] @relation("PlaySessionBookings")
  playSessionWaitlist     PlaySessionWaitlist[] @relation("PlaySessionWaitlist")
  playPreferences         UserPlayPreference[] @relation("PlayPreferences")
  aiRecommendationLogs    AIRecommendationLog[] @relation("AIRecommendationLogs")
  playSessionsHosted      PlaySession[] @relation("PlaySessionHost")
```

3. Add these relations to the existing `Club` model:
```prisma
  // Club Intelligence
  clubCourts              ClubCourt[] @relation("ClubCourts")
  playSessions            PlaySession[] @relation("PlaySessions")
  userPlayPreferences     UserPlayPreference[] @relation("UserPlayPreferences")
  aiRecommendationLogs    AIRecommendationLog[] @relation("AIRecommendationLogs")
```

4. Copy all new models and enums from `piqle-club-intelligence/prisma/schema-additions.prisma` to the end of your schema file

5. Run the migration:
```bash
# Option A: Using Prisma migrate
npx prisma migrate dev --name add-club-intelligence

# Option B: Run raw SQL directly (for Supabase)
# Copy content from piqle-club-intelligence/migrations/add-club-intelligence.sql
# Run in Supabase SQL Editor
```

6. Generate Prisma client:
```bash
npx prisma generate
```

### Step 2: Copy AI Engine (Day 1)

Copy the AI library into your project:
```bash
cp -r piqle-club-intelligence/lib/ai/ lib/ai/
cp -r piqle-club-intelligence/types/intelligence.ts types/intelligence.ts
```

### Step 3: Add tRPC Routers (Day 2)

1. Copy router files:
```bash
cp piqle-club-intelligence/server/api/routers/sessions.ts server/api/routers/sessions.ts
cp piqle-club-intelligence/server/api/routers/bookings.ts server/api/routers/bookings.ts
cp piqle-club-intelligence/server/api/routers/intelligence.ts server/api/routers/intelligence.ts
```

2. Register routers in your root router (`server/api/root.ts` or equivalent):
```typescript
import { sessionsRouter } from './routers/sessions';
import { bookingsRouter } from './routers/bookings';
import { intelligenceRouter } from './routers/intelligence';

export const appRouter = createTRPCRouter({
  // ... existing routers
  sessions: sessionsRouter,
  bookings: bookingsRouter,
  intelligence: intelligenceRouter,
});
```

Note: The router files currently export standalone functions. You'll need to wrap them in `createTRPCRouter()` and `protectedProcedure` following your existing patterns. The function signatures and Prisma queries are ready to use.

### Step 4: Seed Demo Data (Day 2)

```bash
npx ts-node piqle-club-intelligence/scripts/seed-intelligence.ts
```

Or copy the seed script into your existing seed infrastructure.

### Step 5: Add Navigation Links (Day 2)

Add a link to Club Intelligence in the club page sidebar/header. In `app/clubs/[id]/page.tsx`, add:
```tsx
<Link href={`/clubs/${id}/intelligence`}>
  <Button variant="outline" className="gap-2">
    <Brain className="h-4 w-4" />
    Club Intelligence
  </Button>
</Link>
```

Add a "Play" link in the main navigation for players.

### Step 6: Connect Mock Data to tRPC (Days 3-5)

The UI pages currently use hardcoded mock data. To connect to the real backend:

1. Replace mock arrays with tRPC queries:
```typescript
// Before (mock):
const sessions = mockSessions;

// After (real):
const { data: sessions, isLoading } = trpc.sessions.list.useQuery({ clubId: id });
```

2. Replace button handlers with tRPC mutations:
```typescript
// Before (mock):
const handleBook = (sessionId: string) => {
  toast({ title: "Booked!" });
};

// After (real):
const bookMutation = trpc.bookings.book.useMutation({
  onSuccess: () => toast({ title: "Booked!" }),
});
const handleBook = (sessionId: string) => {
  bookMutation.mutate({ playSessionId: sessionId, userId: session.user.id });
};
```

## What's Real vs Mocked

| Feature | Status | Notes |
|---------|--------|-------|
| Session CRUD | Ready for backend | Functions written, needs tRPC wrapping |
| Booking flow | Ready for backend | Full logic including waitlist promotion |
| AI Slot Filler | Fully implemented | Scoring engine is real, deterministic |
| AI Weekly Planner | Fully implemented | Real scoring with preference matching |
| AI Reactivation | Fully implemented | Real inactivity detection and scoring |
| Email/SMS invites | Mock (console.log) | Replace with Resend/Twilio |
| CourtReserve sync | Not built | Future: iCal feed → API integration |
| Payments | Not built | Out of MVP scope |
| Real-time updates | Not built | Future: Supabase realtime subscriptions |

## Demo Flow

### Demo 1: Club Admin (2 minutes)
1. Go to `/clubs/{clubId}/intelligence`
2. Show underfilled sessions dashboard
3. Click "Fill with AI" on a session
4. Show AI recommendations with scores and explanations
5. Click "Send Invite" on top recommendations
6. Go to Reactivation page, show inactive member scoring

### Demo 2: Player (2 minutes)
1. Go to `/play`
2. Show AI Weekly Plan with 3 recommended sessions
3. Show scoring breakdown on weekly plan detail page
4. Book a session with one click
5. Go to preferences, adjust settings
6. Show booking management

## Architecture Diagram

```
┌─────────────────────────────────────────────┐
│                 PIQLE PLATFORM              │
├─────────────┬───────────────────────────────┤
│  Tournaments │     Club Intelligence        │
│  (existing)  │     (new module)             │
│              │                              │
│  - RR        │  Club Admin:                 │
│  - MLP       │  - Dashboard                 │
│  - Ladder    │  - Session Management        │
│  - League    │  - AI Slot Filler            │
│              │  - Reactivation              │
│              │                              │
│              │  Player:                     │
│              │  - Weekly Plan               │
│              │  - Session Discovery         │
│              │  - Booking Management        │
│              │  - Preferences               │
├─────────────┴───────────────────────────────┤
│              Shared Layer                    │
│  User, Club, ClubFollower, Auth (existing)  │
│  + ClubCourt, PlaySession, Booking (new)    │
├──────────────────────────────────────────────┤
│              AI Engine                       │
│  Scoring: schedule/skill/format/recency     │
│  Slot Filler | Weekly Planner | Reactivation│
├──────────────────────────────────────────────┤
│  PostgreSQL (Supabase) + Prisma ORM         │
└──────────────────────────────────────────────┘
```

## V2 Roadmap

After the March 13 demo, next priorities:
1. Connect all mock data to real tRPC endpoints
2. iCal integration with CourtReserve
3. Email notifications via Resend
4. SMS reminders via Twilio
5. Real-time session updates (Supabase Realtime)
6. Mobile-responsive PWA wrapper
7. Advanced analytics dashboard
8. Multi-club support for players
9. LLM-powered natural language assistant ("I want to play 3 times this week, mostly evenings")

## Implementation Checklist

- [ ] Database schema updated and migrations applied
- [ ] AI engine library copied to `lib/ai/`
- [ ] TypeScript types imported
- [ ] tRPC routers registered
- [ ] Demo seed data loaded
- [ ] Navigation links added
- [ ] Mock data connected to tRPC endpoints
- [ ] Tested with demo flow (club admin)
- [ ] Tested with demo flow (player)
- [ ] Ready for March 13 presentation

## Support & Questions

For issues during integration:
1. Check that all files from `piqle-club-intelligence/` are copied to their target locations
2. Verify Prisma schema has all new models before running migration
3. Ensure tRPC routers are registered in the root router
4. Run `npx prisma generate` after schema changes
5. Clear Next.js cache: `rm -rf .next/` before testing

Good luck with the integration!
