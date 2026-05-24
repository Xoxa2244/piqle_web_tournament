# IQSport Project Context

> Generated 2026-05-03 from a working snapshot of `Sol2`/`deviq`/`rgdev` branches in
> `Xoxa2244/piqle_web_tournament`. The repo is shared with a legacy product
> (Piqle tournaments) on `main`; everything below is scoped to **IQSport**
> (the Sol2-branch product served at `app.iqsport.ai`).

---

## 1. One-line description

IQSport is an AI revenue-optimisation platform for racquet-sport clubs (currently pickleball) that pulls live booking + member data from court-management systems (CourtReserve), segments members, and automates targeted email/SMS outreach to fill empty sessions and retain at-risk members.

---

## 2. Product overview

**What it is.** A B2B SaaS console plugged into a club's existing booking system (CourtReserve today; PodPlay CSV import also supported). Once connected, it ingests every member, session, booking, payment and waitlist record and runs a continuous AI loop on top:

- detects underfilled sessions and recommends who to invite (Slot-Filler)
- detects at-risk members (Reactivation / health snapshots)
- detects programming gaps and suggests new session times/formats (Programming IQ)
- scores members on behaviour to feed personalised outreach
- schedules and sends the actual emails/SMS via Mandrill + Twilio with click attribution back to bookings
- tracks AI-attributed revenue per club

**The user.** Club operations manager / owner / GM logs into a multi-page dashboard at `app.iqsport.ai/clubs/[id]/intelligence/...`. They see KPIs, AI insights, can launch campaigns, configure automation policies, and watch attribution roll in. Members never log into IQSport directly — they receive emails with deep-link "Book this session" URLs that bounce through Mandrill click-tracking back to CourtReserve.

**The problem solved.** Racquet clubs run on session-based pricing where empty courts = lost revenue every hour, and member churn is high. Most clubs have ~22k member records and zero capacity to do per-member outreach manually. CourtReserve is a system of record — not a system of action. IQSport is the action layer.

---

## 3. Target users

**Primary (paying customer):**
- **Independent racquet/pickleball club operators** — the person who manages day-to-day session programming, member retention, and revenue. Title varies (owner / GM / director of racquets).

**Secondary (end-recipient of the work):**
- **Members of those clubs** — receive personalised email/SMS invitations to underfilled sessions, reactivation messages when they go quiet, welcome sequences when they join.

**Inside the platform UI we see role gating for:**
- `ADMIN` (full Settings → Automation, agent autonomy controls)
- `MODERATOR` (read access)
- per-club `clubRole` enforced in tRPC procedures

**Not in scope (per code):**
- Athletes, coaches, parents, academies, scouts — none of these are first-class entities. The `User` model + booking/session models are pickleball-club-centric.
- Not a marketplace, not a recruiting tool, not direct-to-consumer.

---

## 4. Core user workflows

**1. Club onboarding** (`app/clubs/[id]/intelligence/onboarding/`)
- CSV/Excel schedule import (PodPlay format supported via `lib/connectors/podplay-csv-import.ts`)
- CourtReserve credentials connect (encrypted in `ClubConnector.credentialsEncrypted`)
- Auto-detection of operating hours, peak times, formats from imported data (`lib/ai/csv-schedule-analyzer.ts`)
- Launch preflight checklist (`launch/page.tsx`)

**2. Daily club-manager use** (`app/clubs/[id]/intelligence/page.tsx` + sub-pages)
- Open dashboard → see overnight changes (KPI deltas, new at-risk members, sessions filled)
- Review AI Recommendations on Members page; launch a Campaign Wizard (4 steps: Audience → Goal → Message → Schedule)
- Approve / reject AgentDraft items (autonomous outreach proposals)
- Watch Active Campaigns table (sent / delivered / opened / clicked / attributed bookings)

**3. AI advisor chat** (`app/clubs/[id]/intelligence/advisor/`)
- Conversational interface over club data, RAG over `document_embeddings` (pgvector 1536-dim)
- Streaming LLM responses via `@ai-sdk/react`
- Suggestions to take ops actions

**4. Background automation** (cron, no human in loop)
- CourtReserve sync every 15 min (Upstash QStash → fan-out → 3 parallel Vercel functions)
- Daily health snapshot at 03:00 (`/api/cron/health-snapshot`)
- Slot-Filler campaigns: lastminute (every 2h), tomorrow (12:00 daily)
- Newcomer onboarding sequence (Day 0 / 5 / 12, conditional Day 12 micro-survey)
- Attribution backfill every 15 min, member profile generation 03:00

**5. Payments / subscriptions**
- Stripe checkout for club subscription (free / starter / pro / enterprise tiers)
- Stripe webhook at `/api/stripe/webhook` updates `Subscription` table
- Per-plan usage gates (e.g. campaigns/month) enforced in `server/routers/intelligence.ts`

**6. Admin flows**
- Superadmin pages at `app/superadmin/` — agent rollout controls, integration ops, partner logs, players cross-club view
- Settings → Automation: live mode kill switch, agent autonomy mode, allowlists

---

## 5. Product features

**Already implemented (live in production on app.iqsport.ai):**
- CourtReserve integration: full member/session/booking sync every 15 min, fan-out architecture, URL inheritance for direct-link emails
- Slot-Filler: AI-ranked invitations to underfilled sessions, Mandrill click attribution
- Reactivation: at-risk member detection + outreach (existing pre-Engage-redesign)
- Programming IQ: 16-field BehaviorProfile, 5 strategy presets, regenerate-with-LLM hint, Live Review system
- AI Advisor: conversational chat with RAG over club docs
- Members page: KPI strip with deltas, list/card toggle, filter drawer, AI Insight ribbon, Member detail drawer, churn chart
- Cohorts: 3 AI-suggested cohort generators (Renewal-in-14d, Lost Evening Players, New & Engaged), Cohort Builder with 8 fields, Save+Campaign bridge
- Campaigns: Wizard (4 steps), Mandrill send queue, Active Campaigns table with engagement metrics, per-campaign CTA override, test send (single recipient preview)
- Automation Settings: agent autonomy modes, kill switch, micro-survey results dashboard
- Newcomer welcome sequence (Day 0 / 5 / 12, conditional micro-survey on Day 12)
- Attribution: 3-method matching (deep-link 72h, direct-session-match 72h, time-window per-type)
- Stripe subscription billing
- Email + SMS: Mandrill + Twilio with webhook-driven open/click/bounce tracking
- Sentry error tracking + Pino structured logging

**Partially implemented:**
- Engage Redesign Phases 0–5 shipped, Priority 1 polish closed (per CLAUDE.md May 1, 2026)
- Newcomer micro-survey: Phase 1 + 2 just landed (endpoint, dashboard widget); Phase 2.5 follow-up "tell us more" for free-text not yet built
- 6 of 7 ENGAGE_MVP segments still in backlog (Регулярный, VIP, Снижение активности, Спящий, Ушедший, Trial-not-converted) — only Newcomer is shipped end-to-end
- Per-club RLS policies: documented in `docs/RLS_STRATEGY.md`, defence-in-depth on 40+ tables; not all tables covered yet
- Programming IQ has 4 presets in backlog (MAX_REVENUE, RETENTION_FIRST, FILL_NO_SHOW_GAPS, CONVERT_WEEKEND_DEMAND)

**Visible in code but not productionised:**
- Tournament AI sub-pages (analytics, live, player-insights, predictions, promotion, recommender, setup) — pages exist under `app/clubs/[id]/intelligence/tournament/` but unclear if used by current 3 clubs
- Marketplace page (`marketplace/page.tsx`) — placeholder
- DUPR rating storage on User exists but no live DUPR API ingestion (only OAuth token field)
- Multi-language: not evident from repo (English-only copy in templates)

---

## 6. Technical architecture

**Frontend**
- Next.js 15.0.5 App Router, TypeScript
- shadcn/ui, Radix UI, Tailwind CSS, Lucide icons
- TanStack React Query 4.36.1 for server state
- React Hook Form + Zod for forms
- Recharts for charts, @dnd-kit for drag-drop
- @ai-sdk/react 3.0.118 for streaming LLM responses

**Backend**
- tRPC 10.45.0 with `protectedProcedure` (NextAuth session gate)
- 34 router files in `server/routers/` — biggest are `intelligence.ts` (~417 KB / ~9700 lines), `club.ts` (~102 KB), `stands.ts` (~92 KB)
- API routes in `app/api/` for webhooks, cron, file upload, OAuth callback

**Database**
- Postgres on Supabase (project `mwdftgazlvpfyvqicovh` for prod, `angwdmyswzztmlrdzgxm` for dev)
- Prisma 6.16.2, schema 2231 lines, ~85 models
- pgvector for RAG embeddings (1536-dim, HNSW index)
- Migration policy: SQL-only files in `migrations/`; never `prisma db push` (schema ↔ DB types diverge — `users.id` is TEXT, `clubs.id` is UUID in prod, both TEXT in dev)

**Auth**
- NextAuth 4.24.12 with Prisma adapter
- Providers: Google OAuth + Email OTP (custom magic-link via Mandrill)
- Session token: JWE in `__Secure-next-auth.session-token`

**Storage**
- Supabase Storage for document uploads (service-role client in `/api/upload-*`)
- pgvector for semantic search

**External APIs**
- **Anthropic** + **OpenAI** (`@ai-sdk/anthropic` 3.0.58, `@ai-sdk/openai` 3.0.41) — provider routing in `lib/ai/llm/provider.ts`, models configurable via env (`AI_PRIMARY_MODEL`, `AI_FALLBACK_MODEL`, `AI_PREMIUM_MODEL`)
- **Stripe** (`@stripe/stripe-js` 20.3.0) — subscription billing + webhook
- **Mandrill** (Mailchimp Transactional) — all transactional email + click tracking webhook at `/api/webhooks/mailchimp`
- **Twilio** 5.12.2 — SMS outreach + delivery webhook
- **Upstash Redis** + **QStash** — rate limiting and the CourtReserve sync trigger
- **Sentry** 10.47.0 — error tracking
- **CourtReserve** REST API — booking/member/session/court sync (`lib/connectors/courtreserve-*.ts`)
- **PodPlay CSV** import (no live API)

**Deployment**
- Vercel — `app.iqsport.ai` is served by Sol2 branch as a preview alias (not standard production target). 19 native Vercel cron jobs in `vercel.json`. CourtReserve sync triggered by Upstash QStash (external) because Vercel cron only fires on `target: production` deployments and IQSport is currently a preview alias.
- CI: GitHub Actions on `Sol2` and `deviq` branches (typecheck + vitest run, 10-min timeout). `rgdev` and `main` not in CI trigger list.

**Mobile/web**
- Web only. No React Native, Flutter, iOS, Android, or PWA-mobile-specific code in repo.

---

## 7. Repository structure

(Excluded: `node_modules/`, `.git/`, `.next/`, `dist/`, `build/`, `prisma/migrations/` autogen, generated files. Piqle-specific paths called out as such.)

```
.
├── app/                              # Next.js App Router
│   ├── api/                          # HTTP endpoints (REST/webhooks/cron)
│   │   ├── ai/                       # AI utilities (test endpoints, generators)
│   │   ├── agent/                    # Agent autonomy ops (events, admin reminders)
│   │   ├── auth/                     # NextAuth + email OTP + signup
│   │   ├── campaigns/                # Campaign cron jobs (slot-filler, weekly summary, etc.)
│   │   ├── connectors/courtreserve/  # CR sync orchestrator + worker (fan-out)
│   │   ├── cron/                     # AI budget check, attribution backfill, health snapshot
│   │   ├── stripe/webhook/           # Stripe subscription events
│   │   ├── surveys/respond/          # ENGAGE micro-survey response landing
│   │   ├── upload-*/                 # Service-role file uploads to Supabase Storage
│   │   └── webhooks/mailchimp/       # Mandrill open/click/bounce tracking
│   ├── clubs/[id]/intelligence/      # MAIN PRODUCT UI (33+ pages)
│   │   ├── page.tsx                  # Dashboard (KPI, quick actions)
│   │   ├── slot-filler/              # AI session-fill recommendations
│   │   ├── members/                  # Member 360°, health, segmentation
│   │   ├── cohorts/                  # AI cohorts + manual builder
│   │   ├── campaigns/                # Campaign wizard + active table
│   │   ├── advisor/                  # Conversational AI chat
│   │   ├── agent/                    # Autonomous outreach control
│   │   ├── programming/              # Court scheduling AI
│   │   ├── analytics/                # 6 cross-data insights
│   │   ├── revenue/                  # Occupancy + ROI by time/format
│   │   ├── reactivation/             # (legacy, marked for removal)
│   │   ├── settings/automation/      # Live mode + agent policies + survey results
│   │   ├── integrations/             # CR connector status
│   │   ├── billing/                  # Stripe subscription dashboard
│   │   ├── tournament/               # Tournament AI (6 sub-pages, possibly unused)
│   │   ├── _components/              # Shared widgets (cards, charts, drawers)
│   │   ├── _hooks/                   # use-intelligence + per-feature hooks
│   │   └── _data/mock.ts             # Demo data (?demo=true)
│   ├── superadmin/                   # Cross-club ops (agent rollout, partners, players)
│   └── (legacy Piqle pages excluded — admin/, scoreboard/, tournaments/, players/)
│
├── lib/
│   ├── ai/                           # ~130 files: scoring, prompts, sequences, attribution
│   │   ├── llm/                      # Provider routing, prompts, usage tracker, evals
│   │   ├── onboarding-sequence.ts    # Newcomer Day 0/5/12 (just shipped)
│   │   ├── slot-filler.ts            # Underfilled-session ranking
│   │   ├── reactivation.ts           # At-risk outreach
│   │   ├── attribution.ts            # 3-method booking-to-recommendation matcher
│   │   ├── campaign-engine.ts        # Daily orchestrator
│   │   ├── sequence-runner.ts        # Generic multi-step chain
│   │   ├── anti-spam.ts              # Per-persona frequency cap
│   │   ├── intelligence-service.ts   # Top-level service layer
│   │   └── …(persona, scoring, weekly-planner, programming presets, etc.)
│   ├── connectors/
│   │   ├── courtreserve-sync.ts      # Main sync (3 syncs: members, sessions, bookings)
│   │   ├── courtreserve-client.ts    # REST client (auth, request shaping)
│   │   ├── courtreserve-types.ts     # Type defs
│   │   └── podplay-csv-import.ts     # CSV import
│   ├── email.ts                      # Mandrill wrapper
│   ├── prisma.ts                     # Singleton Prisma client
│   ├── auth.ts                       # NextAuth config
│   ├── logger.ts                     # Pino + child loggers
│   ├── platform-base-url.ts          # URL helper (env-aware)
│   └── …(payment, subscription, rate-limit, attribution-lookup, etc.)
│
├── server/routers/                   # 34 tRPC routers
│   ├── intelligence.ts               # ~9700 lines, the bulk of read APIs
│   ├── club.ts                       # Club CRUD, settings, members
│   ├── stands.ts                     # Sessions/bookings/courts (poorly named)
│   ├── tournament.ts                 # (Piqle leftover)
│   └── …
│
├── prisma/
│   └── schema.prisma                 # 85 models, 2231 lines
│
├── migrations/                       # SQL-only files (chronological)
│   ├── add-courtreserve-event-urls.sql
│   ├── backfill-courtreserve-event-urls.sql
│   ├── add-micro-survey-responses.sql
│   └── …(50+ migrations)
│
├── tests/                            # Vitest, ~85 test files
│   ├── server/                       # Integration via tRPC test caller
│   ├── lib/ai/                       # Unit tests for AI logic
│   ├── lib/connectors/               # CR sync parsing tests
│   ├── api/                          # Endpoint tests (webhooks, surveys)
│   └── ai-eval/                      # Manual eval suite (separate npm script)
│
├── docs/                             # Internal product/eng docs
│   ├── ENGAGE_REDESIGN_PLAN.md       # Why + what for current redesign
│   ├── ENGAGE_REDESIGN_SPEC.md       # 35 atomic tasks with acceptance criteria
│   ├── DEPLOY_CHECKLIST.md           # Pre/post-flight ceremony
│   ├── CRON_SETUP.md                 # QStash + Vercel cron documentation
│   ├── RLS_STRATEGY.md               # Multi-tenant defence-in-depth
│   ├── DISASTER_RECOVERY.md          # Runbook
│   └── ENGAGE_PRIORITY1_SPEC.md      # Closed Apr 30 — campaign wizard polish
│
├── components/                        # Shared shadcn/ui re-exports + small pieces
├── hooks/                             # Cross-page hooks
├── types/intelligence.ts              # TypeScript interfaces for intelligence module
├── public/                            # Static assets
├── .github/workflows/ci.yml           # GitHub Actions CI
├── vercel.json                        # 19 cron entries + framework config
├── next.config.js                    # experimental.after, headers, Sentry
├── package.json                       # Deps (current name still "piqle-web-tournament")
├── CLAUDE.md                          # Working notes (loaded as context)
└── README.md                          # (Piqle-era — not IQSport-current)
```

**Note:** the repo is named `piqle-web-tournament` for legacy reasons. The `README.md` describes Piqle (the predecessor product). **The IQSport product is on the Sol2 branch and not represented in README.md.**

---

## 8. Key files and modules

| File | Role |
|---|---|
| `prisma/schema.prisma` | All 85 data models, 2231 lines. The single source of truth for the data shape. |
| `server/routers/intelligence.ts` | The biggest router, ~9700 lines. All read APIs for the intelligence module: KPI strips, cohort generators, campaign creation, AI insights, micro-survey results. |
| `lib/ai/intelligence-service.ts` | Service layer between router and core logic — DB queries + AI scoring composition. |
| `lib/ai/campaign-engine.ts` | Daily cron orchestrator. Detects member risk-level transitions, calls sequence-runner. |
| `lib/ai/sequence-runner.ts` | Generic multi-step outreach chain. Step 0/1/2/3 with parentLogId tracking. Reused by Newcomer welcome, retention sequences, etc. |
| `lib/ai/onboarding-sequence.ts` | Newcomer Day 0/5/12 sequence (just extended to ENGAGE_MVP spec, conditional Day 12 micro-survey). |
| `lib/ai/attribution.ts` | 3-method booking-to-recommendation linking (deep-link 72h, direct-session-match 72h, time-window per-type). Source of "AI-attributed revenue". |
| `lib/ai/anti-spam.ts` | Per-persona frequency cap (24h + 7d limits + cross-type cooldown). Every outreach passes through this. |
| `lib/connectors/courtreserve-sync.ts` | The main CR ingest. Sync members, sessions, bookings, courts. Includes Sprint 1.5/1.6 URL-inheritance + auto-backfill. |
| `app/api/connectors/courtreserve/sync/route.ts` | Orchestrator endpoint. Triggered by QStash every 15 min, fans out via fetch to per-connector workers. |
| `app/api/connectors/courtreserve/sync-worker/route.ts` | Per-connector worker. Each gets its own 5-min Vercel function budget. |
| `app/api/webhooks/mailchimp/route.ts` | Mandrill webhook handler. Records opens/clicks/bounces back onto AIRecommendationLog rows for engagement metrics + attribution. |
| `app/api/surveys/respond/route.ts` | ENGAGE micro-survey response landing. Upserts MicroSurveyResponse on log_id (idempotent). |
| `lib/email.ts` | Mandrill wrapper. Houses `sendOutreachEmail`, `sendSlotFillerInviteEmail`, `sendReactivationEmail`, `sendOtpEmail`, etc. |
| `lib/auth.ts` | NextAuth config. Google + email OTP. Prisma adapter. JWE session. |
| `lib/ai/llm/provider.ts` | LLM router. Selects between OpenAI and Anthropic based on env (`AI_PRIMARY_MODEL` / `AI_FALLBACK_MODEL` / `AI_PREMIUM_MODEL`). |
| `vercel.json` | 19 cron entries + Vercel framework config. |
| `docs/ENGAGE_REDESIGN_PLAN.md` | The product narrative for the current major effort (Members → Cohorts → Campaigns funnel). |

---

## 9. Data model

Schema has ~85 models in `prisma/schema.prisma`. Grouping by domain:

**User / membership / club**
- `User` — NextAuth + member fields (email, DUPR rating, Stripe customer ID, `membershipStatus` enum)
- `Account`, `Session`, `VerificationToken`, `EmailOtp` — NextAuth + custom OTP
- `Club` — multi-tenant root. `automationSettings` JSON for per-club agent config.
- `ClubAdmin`, `ClubFollower`, `ClubJoinRequest`, `ClubBan` — membership state
- `Subscription` — Stripe-backed (`plan: free|starter|pro|enterprise`, `status`, trial dates)

**Sessions / bookings / courts** (the IQSport core)
- `PlaySession` — a club-hosted session (Open Play, Clinic, Group, etc.). `externalUrl` + `memberSsoUrl` from CourtReserve.
- `PlaySessionBooking` — a member's confirmed booking (one-to-many on session)
- `PlaySessionWaitlist` — waitlist seats
- `ClubCourt` — physical courts

**AI / intelligence**
- `AIRecommendationLog` — every recommendation/email/sms. Stores type, channel, status, sequence chain (`parentLogId`, `sequenceStep`), attribution (`bookingId`, `linkedBookingValue`, `attributionMethod`), and Mandrill webhook fields (`openedAt`, `clickedAt`, `bouncedAt`).
- `MemberHealthSnapshot` — daily `(clubId, date, userId, healthScore, riskLevel)` — written by the 03:00 health cron.
- `MemberAiProfile` — generated per-member persona, behaviour profile, preferences (LLM-generated)
- `UserPlayPreference` — derived from booking history (`detectedPersona`, `notificationsOptOut`, etc.)
- `DocumentEmbedding` — 1536-dim vectors for RAG retrieval

**Campaigns / engagement** (current Engage redesign)
- `Campaign` — name, cohort, channel, status, ctaLabel/ctaUrl override, per-message attribution roll-up
- `Cohort`, `ClubSuggestedCohortCache` — saved + AI-suggested segments
- `MicroSurveyResponse` — embedded survey responses (just shipped: log_id UNIQUE, surveyType, option, free_text)

**Agent autonomy** (newer initiative)
- `AgentDraft` — proposed actions awaiting club-admin approval
- `AgentDecisionRecord`, `AgentAdminTodoDecision`, `OpsSessionDraft`

**Integrations**
- `ClubConnector` — encrypted CourtReserve credentials per club, sync status, `lastSyncAt`, `lastSyncResult`
- `ExternalIdMapping` — CR external ID → internal entity (used for upsert)
- `ImportJob` — CSV/Excel import progress

**Tournaments** (Piqle legacy — present in schema but out-of-scope for IQSport business case)
- `Tournament`, `Division`, `Player`, `Match`, `MatchDay`, `Team`, `TeamPlayer`, `TournamentAccess`

**Audit / launch**
- `ClubLaunchAudit` — every Live Mode toggle + preflight checklist snapshot

**Not evident from repo:** an explicit `Revenue` table, a `Coach` model, a `Family` model, anything athlete/recruiting/scouting-shaped.

---

## 10. Current product maturity

**MVP+, leaning toward production-ready** — caveat: customer footprint is small (3 clubs).

Concrete signals from the repo:

**Pro-maturity signals:**
- 22.5k member records across 3 active clubs (per CLAUDE.md, confirmed by DB queries during this session)
- Real CourtReserve syncs running every 15 min on prod (verified live during this session)
- `AIRecommendationLog` table actively written (we sent test email through `sendSlotFillerInviteEmail` to `sol@piqle.io` and it landed)
- Stripe subscriptions integrated end-to-end (subscription model, webhook, per-plan usage gates)
- Mandrill click tracking wired with attribution back to bookings
- `docs/DEPLOY_CHECKLIST.md` + `docs/DISASTER_RECOVERY.md` exist (deployment ceremony documented)
- Sentry + Pino structured logging
- 882 vitest tests passing (we just verified)
- Migration discipline (SQL-only; no `prisma db push`)
- RLS strategy defined and being implemented (`docs/RLS_STRATEGY.md`)
- Multiple branches with codified workflow (Sol2 = stable, deviq = next, rgdev = active redesign)

**Anti-maturity signals:**
- 3 customers is "design-partner" stage, not "GTM at scale"
- `app.iqsport.ai` is served by a preview deployment alias, not a Vercel production target — this is unusual and was the root cause of the cron-not-firing issue we resolved this session
- No mobile app
- README.md still describes the predecessor product (Piqle)
- Repo name `piqle-web-tournament` not yet renamed
- Some Engage features still marked `_legacy_` and waiting for redesign rollout (Reactivation page)
- `tests/ai-eval/` exists but appears manual (not in CI)
- No feature-flag platform; releases gated by env vars + brand checks
- Several pages (`marketplace/`, `tournament/*`) appear unused by current 3 clubs

**Verdict:** **Production-running for 3 design-partner clubs**. The plumbing (data sync, AI loop, attribution, billing, deploy ceremony) is mature. The product surface (UI + new Engage Redesign + new segments) is still in active rebuild — Phase 0 of the post-MVP redesign was closed last week.

---

## 11. Evidence of traction or usage

**Real users (clubs):**
- 3 named clubs in production database: **IPC East, IPC South, IPC North** (Indiana Pickleball Center chain inferred from naming)
- ~22.5k member records spread across them
- Real CourtReserve credentials stored encrypted in `club_connectors` (verified from DB during this session)

**Real syncs running:**
- CourtReserve sync executing every 15 min via QStash (verified live this session — we watched all 3 clubs sync in parallel)
- Last sync timestamps confirmed in DB: all 3 clubs `last_sync_at` within minutes of each other on the */15 schedule
- `last_sync_result` JSON shows real counts (e.g. IPC East: 7,566 sessions, 36,801 bookings, 6,855 members ingested)

**Real outreach activity:**
- `AIRecommendationLog` table referenced throughout code as the write surface for every email/SMS sent. Includes Mandrill webhook capture (open/click/bounce timestamps).
- We executed a live test email to `sol@piqle.io` during this session via `sendSlotFillerInviteEmail` — Mandrill returned message ID `4825e026ddb548708c2e1e0b7bb92e81`.

**Attribution running:**
- `lib/ai/attribution.ts` + cron `attribution-backfill` (every 15 min) actively links bookings to recommendations
- `linkedBookingValue` field is populated and rolls into "AI-attributed revenue"

**Production config:**
- 19 Vercel cron jobs in `vercel.json` — multiple are running every 10-15 min in production
- Sentry DSN configured (optional, but plumbing is in)
- Stripe live keys (env-driven; values not in repo)
- Mandrill production webhook receives events

**Customer onboarding artefacts:**
- `app/clubs/[id]/intelligence/onboarding/` flow wired end-to-end
- `launch/` page with preflight checklist
- `docs/DEPLOY_CHECKLIST.md` + post-deploy 24h monitoring window documented

**What's NOT visible:**
- No public landing page in this repo (`iq-sport-landing` is a separate Vercel project)
- No analytics tooling like Mixpanel/Amplitude/PostHog detected in deps
- No CRM integration
- No public waitlist signup form
- No reviews/testimonials/case studies in repo

---

## 12. Business model clues

**Subscription-based B2B SaaS for clubs.**

From `prisma/schema.prisma` `Subscription` model:
- `plan` enum: free, starter, pro, enterprise
- `status` enum: trialing, active, past_due, canceled
- Stripe-backed (`stripeCustomerId`, `stripeSubscriptionId`, `stripePriceId`)

From `server/routers/intelligence.ts` and `lib/subscription.test.ts`:
- Per-plan usage limits enforced (campaigns/month, cohort generations/month, etc.)
- `enforceCampaignUsageLimits()` blocks overage sends

From `lib/payment.ts`:
- Stripe fee constants: 2.9% + $0.30 per charge — IQSport tracks Stripe payment processing fees, suggesting the app may also handle club-side payment (member purchases routed through the platform, not just the subscription itself)

From `app/api/stripe/webhook/route.ts`:
- Subscription lifecycle events handled (customer.subscription.created, .updated, .deleted, invoice.payment_succeeded)

**Freemium hint:** `plan: free` exists with a `trialEndsAt` field, suggesting a self-serve trial path (though no public signup form is in the repo — onboarding looks salesperson-assisted).

**Marketplace:** `marketplace/page.tsx` exists but is empty/placeholder. Not a marketplace product currently.

**Commission/take-rate:** Not evident from repo. Stripe fee constants are for cost accounting, not for taking a cut of member transactions.

**B2B vs B2C:** Pure B2B. Members never log into IQSport — they receive emails. The buyer is the club operator.

---

## 13. Competitive positioning clues

**What looks unique in the code:**

1. **Deep CourtReserve integration with real-time sync.** Most retention-marketing tools don't have a native sync into the system of record. Sprint 1.5/1.6 (URL inheritance, auto-backfill) shows attention to the actual operator pain that emails should deep-link into the booking flow, not bounce a member to a generic page.

2. **Closed-loop attribution.** `lib/ai/attribution.ts` does 3-tier matching (deep-link 72h, direct-session-match 72h, time-window per-type) and the `linkedBookingValue` field snapshots the revenue at link time. This is the kind of feature that lets a club operator see "IQSport drove $X this month" — rare in the segment.

3. **Conditional sequencing on actual behaviour.** Newcomer Day 12 branches between congratulating (≥1 booking) vs micro-surveying (0 bookings) — most welcome-email tools fire a static cadence. The `bookingsAtBranch` is captured in `AIRecommendationLog.reasoning` so the dashboard can show what worked.

4. **Programming IQ.** `lib/ai/programming-iq-scheduler.ts` plus 5 strategy presets (BALANCE_THE_WEEK, etc.) is a court-scheduling AI that proposes new session times/formats based on observed demand. Not just retention — also supply-side optimisation. This is unusual.

5. **Agent autonomy with human-in-loop.** `AgentDraft` + Settings → Automation gives the operator graduated control: the AI proposes, the human approves, then later the AI runs autonomously. Most tools are either fully manual or fully automated.

**What's NOT visible (and would be table-stakes for adjacent positioning):**

- No youth/junior sports infrastructure (no Family / Parent / Minor models)
- No coach scheduling / 1:1 lesson booking
- No recruiting / scouting / college-prep features
- No AI coaching (video analysis, etc.) — purely admin/marketing AI
- No team management for travel/league teams (only club-level)
- No marketplace, no equipment, no pro-shop
- No multi-sport beyond pickleball/racquet (the `sport` field exists but all live data is pickleball)
- No mobile app

**Most likely positioning:** Operator-side AI revenue optimisation for the racquet-club category. Closest analogues would be CRM/marketing-automation tools built specifically for clubs (Mindbody Marketing Suite, ClubReady) — but those are general fitness, not racquet-specific, and don't have native CourtReserve sync.

---

## 14. YC application relevance

**What looks strong for YC:**

- **Real production deployment with real customers and real data flowing.** Not a demo. 3 clubs, 22.5k members, syncs running every 15 min, attribution closing the loop. We literally watched it work today.
- **Closed-loop attribution.** "AI-attributed revenue" is the metric YC will care about most. The plumbing exists and writes to DB.
- **Solo-founder velocity.** Looking at git log: ~67 commits in 30 days, including landing 3 production-architecture migrations (CR sync fan-out, QStash, Newcomer segment end-to-end with DB migration + endpoint + dashboard). For a seed-stage solo founder this is high signal.
- **Codified product strategy.** `docs/ENGAGE_REDESIGN_PLAN.md` reads like a real product spec, not a wishlist. Phase 0–5 of the redesign is shipped and labelled.
- **Real engineering discipline.** SQL-only migrations, Sentry, structured logging, anti-spam helpers, multi-method attribution, health snapshots, RLS strategy, deploy checklist. This is the polish that 2-month-old YC startups usually don't have.
- **Defensible integration moat.** CourtReserve integration is non-trivial and the system of record for thousands of US racquet clubs.

**What looks weak / undermined:**

- **3 customers is design-partner stage.** YC will ask: "what's the conversion rate on a cold pitch to a new club?" — no evidence of unsolicited inbound or self-serve conversion.
- **Repo name is still `piqle-web-tournament`.** A reviewer cloning the repo would think they were looking at a tournament app. README is the wrong product. Easy fix but currently confusing.
- **No public marketing site in this repo.** Need to confirm `iq-sport-landing` exists and tells the story.
- **`app.iqsport.ai` runs as a preview deployment alias, not a production target.** This is an internal-only smell — not user-visible — but a YC technical reviewer might notice.
- **All data is pickleball, all customers are one chain (IPC East/South/North).** Need to demonstrate that the playbook generalises beyond a single design partner.
- **No mobile app.** The category often has mobile expectations (members book sessions on phones).

**Questions YC will almost certainly ask:**
- "What's your monthly contracted revenue today and 6-month projection?"
- "What's the time-to-value: a club signs up → first attributed booking by IQSport?"
- "How do you acquire clubs — outbound, inbound, partnership with CourtReserve?"
- "What does CourtReserve think of you? Are they a partner, indifferent, or potential competitor?"
- "If pickleball as a category cools, what's your pivot?"
- "Who else is doing this?" (You'll want to name CRMs / Mindbody / ClubReady and explain why they don't fit.)
- "Why now?"

**Metrics to prepare:**
- Total ARR (or MRR) and growth rate over last 3-6 months
- AI-attributed revenue per club per month (you can pull this from `linkedBookingValue` aggregation)
- Time from CR sync to first session-fill email sent
- Email engagement rates (open / click / book) — you have this data
- Retention curve of clubs (only 3, so this will be small N)
- Cost per club to operate (LLM API + Mandrill + Twilio + Vercel + Supabase)

**What to explain simply:**
- The product as "Marketing automation that actually drives bookings, plumbed into the booking system, with the receipt to prove it"
- Don't lead with "AI" — lead with "fills empty courts and prevents churn"
- Don't show the agent autonomy / Settings → Automation page first — it's brilliant but it'll confuse YC partners who want to understand the customer's job-to-be-done

---

## 15. Risks and gaps

**Product / market**
- **Single-vertical risk.** Everything in code is racquet/pickleball-shaped. If the category cools, pivot is non-trivial.
- **Single-integration dependency.** CourtReserve is the only live connector (PodPlay is import-only). If CR changes API, deprecates partner programme, or builds the same thing themselves, IQSport has a problem. Sprint 1.5/1.6 work shows the API is fragile (event series vs instances are returned interleaved).
- **3-club concentration.** Likely a single chain (IPC East/South/North = Indiana Pickleball Center). If they leave, it's an existential issue.

**Go-to-market**
- **No self-serve.** Onboarding flow exists in code but appears salesperson-assisted (no public signup form in repo).
- **No marketing site in this repo.** Separate `iq-sport-landing` Vercel project exists but its content is unknown from this codebase.
- **Repo branding still says Piqle.** Wrong README, wrong repo name. Quick fix but currently confusing.

**Technical**
- **`app.iqsport.ai` runs as a preview deployment alias.** Vercel cron doesn't fire on preview, which is exactly the bug we discovered and routed around with QStash this session. The right long-term fix is splitting Vercel projects (Uровень 1 in this session's discussion) — that hasn't happened yet.
- **Repo is shared with the legacy Piqle product on `main`.** Cherry-picks and merges are required to keep IQSport (Sol2) and Piqle (main) from cross-contaminating. Adds risk that a shared file change (e.g. `prisma/schema.prisma`) breaks the other product.
- **34 tRPC routers, one of them is 9700 lines.** `intelligence.ts` is the source of truth for almost every read API and is a refactor magnet.
- **Schema type drift** (`users.id` is TEXT, `clubs.id` is UUID in prod) is documented but is the kind of thing that bites later. We saw it cause silent prod breakage in AI Insights this session (`::uuid` casts).
- **Some tests still mismatched with prod code on `rgdev`** (we cherry-picked `a1f13406` to fix).
- **Initial CR sync isn't truly incremental** (`created: N, updated: 0` pattern means full re-fetch every time). We noted this as a future optimisation that would let cron return to native Vercel cron.
- **Duplicates in `play_sessions`** (~6-7%) due to series + instance both being stored. Auto-backfill works around but analytics may double-count.

**Privacy / safety**
- No minors-specific code path detected (no Family / Parent / Minor models). If clubs include junior programmes (likely), this could be a future obligation.
- RLS strategy is documented and partially implemented; not all tables covered yet (anti-pattern: defence-in-depth half-applied).
- Mandrill / Twilio outbound: opt-out flag exists (`UserPlayPreference.notificationsOptOut`) but no central preference centre UI surfaced.
- No GDPR data-export tooling visible.

**People**
- **Solo founder.** YC will ask "how do you scale engineering?" Answer needs to acknowledge the AI-co-pilot workflow and the bus factor.

---

## 16. Suggested YC narrative

### Variant A — "Closed-loop AI revenue for racquet clubs"
- **One-liner.** IQSport plugs into CourtReserve and runs the marketing automation racquet clubs don't have time to run themselves — with the booking receipt to prove every dollar attributed.
- **Problem.** Independent racquet clubs run on session-based pricing where empty courts = lost revenue every hour and member churn is high. The system of record (CourtReserve) doesn't take action; the operator has no time to do per-member outreach manually.
- **Solution.** Continuous AI loop: sync every 15 min → score every member → personalise outreach → close the loop with click-tracked attribution. "You filled 14 sessions this month because of IQSport — here's the booking IDs."
- **Why now.** Pickleball is the fastest-growing sport in the US (cite). New clubs opening every month. CourtReserve has thousands of US clubs and an open API. AI cost per outreach has collapsed in the last 12 months — making per-member personalisation economically viable for the first time.
- **Why this team.** Solo technical founder shipping production at 4-5 commits/week with codified product strategy and operating discipline that's rare at this stage.
- **Market.** US racquet clubs (~5-10k pickleball-capable clubs by 2027 estimates), then expand to tennis (CourtReserve covers both).
- **Traction.** 3 clubs, 22.5k members, real ARR (insert), AI-attributed revenue (insert from `linkedBookingValue`). [Need actual numbers from founder.]
- **Insight.** Most retention-marketing tools live outside the system of record and can't deep-link into the booking flow. IQSport lives inside it — the email's "Book this session" button goes straight to a CourtReserve checkout, not a generic landing page. Close-rate is 3-5× higher.

### Variant B — "The operator co-pilot for racquet clubs"
- **One-liner.** A single dashboard for racquet-club operators that turns booking data into action — fill empty sessions, save at-risk members, design better programming — without hiring a marketing person.
- **Problem.** Independent club operators wear 8 hats. They want analytics + decisions + execution in one place, and they want it to do work for them.
- **Solution.** Three pillars: Members (who are they) → Cohorts (who to talk to) → Campaigns (what to say). Plus Programming IQ (what sessions to add). All AI-driven, all attributable.
- **Why now / why us / market** — same as A.
- **Insight.** The operator doesn't want "an AI feature." They want their job done. IQSport is a co-pilot that ships finished work (drafted emails, ranked recommendations, completed reports) — they approve or override.

### Variant C — "Attribution-first marketing for high-frequency consumer SaaS"
- **One-liner.** IQSport proves which marketing actions caused which bookings — and uses that loop to learn what works for this specific club.
- **Problem.** Most marketing automation can't attribute outcomes back to specific actions. Operators waste budget on what doesn't work.
- **Solution.** 3-method attribution (deep-link, direct session match, time-window) + per-club learning loop. Every send is logged with the booking it produced or didn't.
- **Why this is venture-scale.** Once attribution is built, it's a moat — switching cost grows over time as the model learns each club's patterns.
- **Variant C is the "pitch to a YC partner who likes B2B SaaS with strong unit economics."** A and B are easier to land if the partner doesn't know the racquet space.

**Recommendation:** Lead with **Variant A** in the application essay (concrete + measurable), be ready to switch to **Variant B** if YC partner asks "tell me about the customer" (more empathetic), and use **Variant C** in the technical/financial section to anchor the moat conversation.

---

## 17. Open questions for founder

Before finalising the YC application, please confirm:

**Customer + revenue**
1. **Are all 3 clubs (IPC East/South/North) one chain (Indiana Pickleball Center)?** If so, this is one logo / one decision-maker — YC will weight that very differently from 3 independent clubs.
2. **What's current MRR/ARR? Trajectory over last 3 months?**
3. **What's the contract structure — flat subscription, usage-based, or hybrid? Discount for annual?**
4. **What does pricing look like for each plan (free / starter / pro / enterprise)?** I see the model in code but no concrete numbers.
5. **Do clubs pay you monthly recurring, or is it a setup fee + ongoing?**
6. **Have you booked any AI-attributed revenue yet? What's the dollar amount, and over what window?** (This will be a key slide.)

**Go-to-market**
7. **Where do clubs come from? Outbound, inbound, partnership with CourtReserve, referral from current customers?**
8. **What's your relationship with CourtReserve formally?** Are you a listed partner / integration, or just using their public API?
9. **What's the sales cycle length and CAC?**
10. **Is `iq-sport-landing` (the separate Vercel project) the production marketing site? What's the URL, and how does it position the product?**
11. **Do you have a self-serve signup, or is everything sales-assisted today?**

**Product**
12. **Why is `app.iqsport.ai` running as a Vercel preview alias, not as a dedicated production project?** Is this intentional or historical accident? (Affects how technical YC reviewers will interpret the deploy story.)
13. **Tournament AI sub-pages (analytics, live, predictions, player-insights) — are these used by current clubs, or shelved? Should we leave them in the YC narrative or remove?**
14. **Mobile app on the roadmap? If yes, when. If no, why not (i.e. is the email-first model intentional)?**
15. **Multi-sport ambition — staying pickleball, expanding to tennis/squash/badminton, or staying racquet only?**

**Team**
16. **Are you currently solo, or is anyone else (engineer, designer, sales) involved part-time?**
17. **YC asks "why this team" — what's the founder story you want to lead with?** (technical depth, sport-domain expertise, prior operator experience, etc.)
18. **What's the founding vision in one sentence — including a 5-year ambition, not just "make clubs more money"?**

**Financial / operational**
19. **What's the monthly burn including LLM API + Mandrill + Twilio + Vercel + Supabase + your salary?**
20. **Do you have a target CAC and LTV per club? What's your gut on payback period?**
21. **Runway as of today and what you'd raise at YC?**

**Competition**
22. **Who do you compete with directly?** (Mindbody Marketing Suite, ClubReady, native CourtReserve features, manual operator effort?)
23. **What would make a club *not* choose IQSport?**
24. **Has CourtReserve ever expressed interest in building this themselves? Are you a thread or a complement?**

**Risk**
25. **GDPR / minors data — do any of the 3 clubs have junior programmes? If yes, what's your data-handling story?**
26. **What's the bus factor right now? If you're hit by a bus next week, who can keep IQSport running?**

Answers to 1-6 (revenue + customer concentration) and 22-23 (competition) are the highest-priority — the YC essay can't be drafted credibly without them.
