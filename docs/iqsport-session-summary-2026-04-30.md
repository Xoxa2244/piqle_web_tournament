# IQSport.ai — Session Summary (2026-04-27 → 2026-05-01)

Long working session split across 4 major workstreams. Touches 3 git
branches: `Sol2` (production app.iqsport.ai), `solapp-rebuild` →
force-pushed to `Solapp` (demo.iqsport.ai), `rgdev` (Engage redesign
preview).

---

## 1. Demo build for client meeting (Solapp)

**Goal:** make demo.iqsport.ai a fully working showcase with 1,500 members
and all key surfaces functional on mocks. Started with Solapp frozen
at April 10 (`b438ecfd` "feat: demo mode"), 215 commits behind Sol2.

### What shipped

**Branch operations:**
- Backed up old Solapp as tag `solapp-archived-2026-04-27` (pushed to
  origin). Roll-back recipe: `git push -f origin solapp-archived-2026-04-27:Solapp`.
- Created local `solapp-rebuild` branch from current Sol2 HEAD.
- Force-pushed `solapp-rebuild` → `origin/Solapp` with `--force-with-lease`.

**Mock data scaling (`app/clubs/[id]/intelligence/_data/mock.ts`):**
- `mockDashboard`: 127 → **1,500** members, 284 → 3,420 bookings,
  $1,260 → $14,820 lost revenue.
- `mockDashboardV2`: scaled trends, sparklines, byDay/byTimeSlot/
  byFormat, players bySkillLevel + byFormat, activeCount=1050,
  inactiveCount=450, newThisMonth=94.
- `mockMemberHealth`: hand-crafted 50 members + procedurally
  generated 1,450 synthetic members (deterministic LCG seed,
  realistic 65/18/12/5 healthy/watch/at-risk/critical split).
  Critically: each row gets a populated `segment` field so
  MembersIQ trend/value/activity badges render without the
  "improving → trendColors[undefined]" crash that broke the page
  initially.
- New mocks added: `mockCohorts` (8 hand-curated segments —
  VIP Power Players 87, At-Risk Regulars 64, New Members 94,
  Tuesday Morning 38, Beginners 218, Lapsed Trials 41, Weekend
  Warriors 156, Senior League 73), `mockCohortDataCoverage`,
  `mockOccupancyHeatmap` (7×15 with realistic peak pattern),
  `mockClubInsights` (5 prioritized recommendations),
  `mockSessionPlayers`, `mockPlayerProfile`, `mockFrequentPartners`.

**New page `DemoAdvisorIQ.tsx`** (no LLM):
- 12 canned Q→A scenarios with regex matching: pending approvals,
  agent activity today, kill switch, churn risk, Tuesday morning
  analysis, revenue +20% breakdown, 3 quick wins, first-booking
  outreach, member counts, occupancy snapshot, programming.
- Suggestion chips, typing dots animation, action cards with
  confirm/skip, "Demo mode" disclosure footer.
- Wired into `advisor/page.tsx` via `searchParams.get('demo')` check.

**UI wiring for new IQ pages in demo mode:**
- `SessionDetailIQ` — passes mock players + slot-filler recs.
- `PlayerProfileIQ` + `FrequentPartnersCard` — falls back to
  mockPlayerProfile / mockFrequentPartners when isDemo.
- `DashboardIQ` — uses mockClubInsights + mockOccupancyHeatmap;
  AI-Attributed Revenue tile **hidden** in demo (the "91.5× ROI on
  $47.20 spend" math reads as a stunt with mock numbers).
- `CohortsIQ` — uses mockCohorts + mockCohortDataCoverage.
- `CampaignsIQ` — Agent Campaign Layer hero **hidden** in demo
  (zero counts read as broken AI to a viewer).

**Sidebar (`IQSidebar.tsx`):**
- Added `isDemo` parameter to `buildNavSections()`.
- Hides Launch + Email Domain in demo (require live tRPC + auth).
- Renamed `Cohorts` → `Segments` (URL `/cohorts` unchanged).

### Known caveats

- `mockMemberHealth` originally broke the Members page on
  `trendColors[member.engagementTrend].bg` because the synthetic
  generator emitted `'improving'` (not in the trendColors map).
  Fixed by populating `segment.trend` with valid `'growing'`/
  `'stable'`/`'declining'`/`'churning'` values.
- `mockReferralSnapshot.summary.funnel` had to be aliased from
  `outcomeFunnel` because MembersIQ:2586 reads `.funnel.summary`
  (typo never caught because real data path didn't fire on demos
  before).

---

## 2. Sol2 production fixes (app.iqsport.ai)

### Cohorts → Segments rename
**Commit:** `6ec06847` (combined with insights fix below).

User-facing label only — URL `/cohorts` unchanged, internal tRPC
procedures (`listCohorts`, `createCohort`, etc.) and DB tables
unchanged. Touches:
- Sidebar nav label (`IQSidebar.tsx`)
- Page heading (`CohortsIQ.tsx`)
- "Create Cohort" buttons in header + builder modal + submit
- Empty-state copy

### AI Insights bug — silent prod breakage since launch
**Commits:** `6ec06847` (drops `::uuid` casts), `6a3c488e` (rewrites
4 membership generators).

**Root cause:** all 19 SQL queries in `lib/ai/insights-engine.ts`
cast `$1` to `::uuid` (e.g. `WHERE ps."clubId" = $1::uuid`), but
every clubId/userId column on prod is `text`, not `uuid`:
- `play_sessions.clubId / courtId` — text
- `club_courts.clubId` — text
- `club_followers.club_id` — text
- `document_embeddings.club_id / source_id` — text
- `users.id` — text

Postgres rejects text=uuid implicitly, so each generator threw
`ERROR: 42883: operator does not exist: text = uuid`. The endpoint
wraps generators in `Promise.allSettled`, swallowing failures, so
`getClubInsights` returned `[]` silently. The AI Insights panel on
`/clubs/[id]/intelligence` had been showing "All good!" for every
club since the engine shipped.

Verified by running queries against IPC North (prod, club
`6427f742-8f59-4f93-8f17-69a139b0e66f`):
- With `::uuid`: ERROR text=uuid
- Without `::uuid`: real court/booking data

Same root cause as `launch-preflight.ts` bug fixed earlier in
`d373f026`.

**4 membership-based generators rewritten** (P2-equivalent for
insights engine): `vipMembersAtRisk`, `guestPassUpsell`,
`suspendedWinback`, `newMemberOnboarding`. They previously read
membership metadata from `document_embeddings WHERE
source_table='csv_import'` — a stale source not populated for
most clubs. Now query `users.membership_status / membership_type`
directly (same fix pattern as the chat-tools commit `29c202f4`).
For VIP dues, parsing `$49.99/Month` out of CourtReserve labels
via SUBSTRING regex.

**Verified live for IPC North (prod):**
| Generator | Result |
|-----------|--------|
| underutilizedCourts | All courts 75-97% (no insight, healthy) |
| peakHourOverflow | 4 slots >80%: 1pm 100%, 9am 93%, 5pm 92%, 6pm 89% |
| vipMembersAtRisk | **551 VIPs at risk = $28,284/mo at risk** (high) |
| guestPassUpsell | 24 ready to convert (avg 6.8 bookings) |
| suspendedWinback | 61 suspended, 8 recently active |
| formatMismatch | All formats 56-87%, no extreme — null |
| dayOfWeekGap | runs against real data |
| newMemberOnboarding | 229 new members need follow-up |
| skillProgression | runs against real data |
| emptyEveningSlots | runs against real data |

10/10 generators now work on real data.

**Caveat for newMemberOnboarding:** uses first-booking date as
proxy for join date because `club_followers.created_at` is
bulk-import timestamp for IPC clubs (everyone "joined" in last 30
days). Doesn't catch members who joined-but-never-played
(`never_played` always 0). Real fix would be a separate
`original_join_date` column populated at CourtReserve sync time.

### Documentation produced

- `/Users/shats/Downloads/iqsport-ai-insights-how-it-works.md`
  (17K, 312 lines) — full architecture doc covering all 10
  generators, data sources, limitations, and how to add new ones.

---

## 3. AI Insights — 3-persona wishlist research

Spawned 3 parallel agents role-playing as **Marketer / Ops / Owner**
to gather what insights they'd want from AI. Cross-cutting themes:

- **All three asked for:** comparisons (vs last week / MoM / YoY),
  snooze-with-reason for AI learning, drill-down with bulk
  actions, push notifications instead of dashboard polling
  (different cadences per role).
- **Owner-specific:** cohort retention curves with anomaly alerts,
  contribution margin per format/court, LTV/CAC by acquisition
  channel, revenue concentration risk, cash flow forecast,
  competitive intel.
- **Marketer-specific:** churn risk score for ALL members (not
  just VIP), referral champion detection, member fatigue / over-
  contact tracking, format crossover potential.
- **Ops-specific:** today's no-show forecast, instructor
  overbookings, equipment shortage alerts, weather impact on
  outdoor courts, front-desk queue spike warning.
- **Universal complaint:** current 10 insights aren't role-tagged,
  so half of each persona's view is irrelevant. Add `role:
  'owner' | 'marketer' | 'ops'` tag + filter.

### "If I could have ONE more insight tomorrow"
- **Marketer:** Churn Risk Score for all active members + dollar
  impact + one-click win-back launch.
- **Ops:** No-show forecast for today, available by 7am.
- **Owner:** Cohort retention curve with anomaly alert.

Top-15 backlog of new insights documented in conversation
(reference: spawn-agent results from session).

---

## 4. Engage P1 — Campaign send queue (rgdev)

Branch `rgdev` (preview at
`piqle-web-tournament-git-rgdev-rodion-gorins-projects.vercel.app`).
DB: `angwdmyswzztmlrdzgxm` (piqle_web_tournament dev project, NOT
prod iqsport-prod).

**Spec source:** `/Users/shats/Downloads/ENGAGE_PRIORITY1_SPEC.md`
(read at start of P1 work).

### P1.1 — Launch mutation + Active Campaigns query ✅
**Commit:** `7f57d3c4` (Rodion, prior to this session). Verified
in audit:
- `intelligence.launchCampaign` mutation creates Campaign row
  with `cohortSnapshot.userIds` frozen, status=running/scheduled.
- `intelligence.listActiveCampaigns` reads real Campaign rows.
- Wizard's Launch button wired.

### P1.2 — Send queue cron + per-minute Vercel schedule ✅
**Commit:** `34a6959f`.

**Migration `migrations/add-campaign-send-fanout.sql`** (applied
via `mcp__supabase__apply_migration` to `angwdmyswzztmlrdzgxm`):
- `ai_recommendation_logs.campaign_id` UUID, FK → `campaigns.id`,
  ON DELETE SET NULL
- `ai_recommendation_logs.sent_at` TIMESTAMPTZ (was already
  present from a prior partial migration; IF NOT EXISTS no-op)
- `ai_recommendation_logs.retry_count` INT NOT NULL DEFAULT 0
- Partial index `(campaign_id, "createdAt") WHERE sent_at IS NULL
  AND campaign_id IS NOT NULL` — hot path for cron's batch claim
- `AIRecommendationType` enum: `CAMPAIGN_SEND` value added
- `campaigns.clicked_count` INT NOT NULL DEFAULT 0 — symmetry
  with delivered/opened, populated by webhook in P1.3

**Prisma schema updates:** added `campaignId` + `sentAt` +
`retryCount` + `Campaign` relation to `AIRecommendationLog`,
added `clickedCount` + `recipientLogs` relation to `Campaign`,
added `CAMPAIGN_SEND` enum value.

**`launchCampaign` amend** — eager fan-out: after creating
Campaign row, calls `createMany` to insert one
`AIRecommendationLog` row per recipient with
`type='CAMPAIGN_SEND'`, `status='pending'`, `campaignId` set,
`reasoning={campaignName, goal}`. Rows exist immediately even
for status='scheduled' campaigns so progress UI shows "0 / N"
the moment Launch is clicked.

**New cron `app/api/cron/campaign-sends/route.ts`:**
- Auth: `Bearer ${CRON_SECRET}` (matches health-snapshot pattern)
- Selects campaigns where `status='running'` AND
  `(scheduledAt IS NULL OR <= now)`
- For each: resolves `outreachSend.mode` via
  `resolveAgentControlPlane(club.automationSettings)`. Skips
  campaign if `mode !== 'live'` OR `killSwitch=true`
  (defense-in-depth; UI also blocks Launch when not live).
- Atomic claim of MAX_BATCH=50 pending logs via raw SQL:
  ```sql
  UPDATE ai_recommendation_logs SET sent_at=NOW()
   WHERE id IN (SELECT id FROM ai_recommendation_logs
                 WHERE campaign_id=$1 AND sent_at IS NULL
                 ORDER BY "createdAt" ASC LIMIT 50
                 FOR UPDATE SKIP LOCKED)
   RETURNING id, "userId", retry_count
  ```
  Concurrent ticks safe via SKIP LOCKED.
- For each claimed row: hydrate user.email, render `{{name}}`
  substitution, call `sendOutreachEmail` with metadata={logId,
  clubId, userId} for Mandrill webhook correlation.
- On success: store externalMessageId + bump
  `Campaign.sent_count`.
- On failure: revert sent_at=NULL + increment retry_count. At
  MAX_RETRIES=3 set bouncedAt + bounceType='retry_exhausted'
  and bump `Campaign.failed_count`.
- Pre-flight `isBlockedEmail` check counts as failed_count with
  `bounceType='blocked_domain'` (explicit, not silent).
- After batch: if `(sent_count + failed_count >= total)`, flip
  `status='completed'` + `completedAt=now`.

**`vercel.json` cron schedule:** `* * * * *` (every minute).

### P1.3 — Mandrill webhook → Campaign counter rollup ✅
**Commit:** `73197ee2`.

**Gap found:** existing webhook (`app/api/webhooks/mandrill/
route.ts`) updated `AIRecommendationLog` timestamps but never
bumped per-Campaign counters. Active Campaigns table would have
sat at "0 opens / 0 clicks" forever even when Mandrill events
arrived.

**Added:**
- `'send'` event handler — sets `log.deliveredAt` + bumps
  `Campaign.deliveredCount` (Mandrill 'send' = "handed to
  receiving SMTP", closest signal to delivered without inbox
  confirmation).
- Per-Campaign counter bumps on first `'open'` →
  `openedCount`, first `'click'` → `clickedCount`, first
  `'hard_bounce'` or `'reject'` → `failedCount`.
- Soft bounces deliberately do NOT bump `failedCount` — they
  may recover; cron's retry exhaustion path catches truly dead
  rows.

**Idempotency:** bumps fire only when the relevant log timestamp
was NULL pre-update. Mandrill is allowed to re-deliver webhooks
(and does on transient failures), so repeated open/click events
on the same row are absorbed without double-counting.

**Filter:** bumps only happen when `log.campaignId` is set —
i.e. for CAMPAIGN_SEND rows specifically, not for one-off
CHECK_IN/REACTIVATION/SLOT_FILLER recommendations that share
the table.

### P1.4 — Live Mode cron-layer gate ✅
Code already shipped in P1.2 cron via `resolveAgentControlPlane`
check. **Verified live with toggle test:**

| Cron tick | mode | killSwitch | Cron response |
|-----------|------|------------|---------------|
| 02:47:27 | shadow | false | `liveModeSkipped:1, totalSent:0`, 126ms |
| 02:48:34 | live | false | `totalSent:1`, dispatch ✓ (Mandrill `d09c86b7d14...`) |
| 02:49:38 | live | true (kill) | `liveModeSkipped:1, totalSent:0`, 123ms |

All 3 gating scenarios behave correctly. No DB side effects when
skipped (recipient log stays `pending`, sent_at=NULL).

### P1.5 — Active Campaigns refetchInterval ✅
**Commit:** `f3ad821e`.

Added `refetchInterval=30s` to `useListActiveCampaigns` so the
table's `sent_count` / `opened_count` / `clicked_count` /
`failed_count` tick up in real time as cron + webhooks land
counter bumps. Without this, an admin who launched a campaign
and stayed on the page would have to manually reload.

`staleTime` lowered from 60s → 30s to match. `refetchInterval`
honors the existing `options.enabled` escape hatch so background
sections don't poll uselessly. `refetchOnWindowFocus` left at
default — tab switches don't fire extra requests, only the timer
does.

### P1.6 — Test send (single-recipient preview) ✅
**Commit:** `2d39d67f`.

**New mutation `intelligence.testSendCampaign`** (server router):
- Inputs: `clubId, subject, body, channels, optional to`
- Auth: `requireClubAdmin`
- Resolves recipient: explicit `to` → caller's session email →
  error
- Subject prefixed with `[TEST]` so it never gets confused for
  a real send
- `{{name}}` substitution against caller's display name
- Reuses same `sendOutreachEmail` template the cron uses, so
  preview reads exactly like a real send
- **Critically does NOT:** create Campaign row, create
  AIRecommendationLog row, bump counters, or honor/block on
  Live Mode (it's a QA tool, not member outreach).

**`Step4Message.tsx` UI wire:** replaces the disabled placeholder
button with real mutation call. Loading spinner, disabled
input/button while in flight, success banner ("✓ Sent to … —
check it in a minute"), inline error banner. Empty `testEmail` →
falls back to session email (label hints).

### Live verification — full P1 E2E

Full path proven with real Mandrill emails to `ds@piqle.io` and
`sol@piqle.io` (2 launch'd campaigns + 2 test-send'd previews).
Diana confirmed delivery; Sol confirmed both real and test
emails arrived.

```
Wizard Launch → tRPC mutation → Campaign row + eager AIRecommendationLog fan-out
       ↓
Vercel cron (/api/cron/campaign-sends, manual trigger via Bearer CRON_SECRET)
       ↓
Live Mode gate (resolveAgentControlPlane) — skip if mode !== 'live' or killSwitch
       ↓
Atomic claim (FOR UPDATE SKIP LOCKED, batch of 50)
       ↓
sendOutreachEmail → Mandrill API → real SMTP → recipient inbox
       ↓
externalMessageId stored, sent_count++, status='completed' when batch done
       ↓
[user opens email]
       ↓
Mandrill webhook (signed HMAC-SHA1) → /api/webhooks/mandrill
       ↓
log.openedAt set + Campaign.openedCount++ (idempotent via NULL guard)
       ↓
Active Campaigns table (30s refetchInterval) → admin sees count tick up
```

**Hard evidence (sample from session):**

| Campaign | Recipient | Mandrill messageId | Result |
|----------|-----------|--------------------|--------|
| `511491a6-...` "P1.2 smoke test" | Diana | `03f440cea8c446c1bb9e730ee27a5ac7` | sent → opened (sim) → clicked (sim) → opened_count=1, clicked_count=1 |
| `29489bd7-...` "P1.2 smoke test — Sol" | Sol | `7d754094a76c4c388c7c447164c9afba` | sent → 'send' event (sim) → delivered_count=1 |
| `50a2c324-...` "P1.4 Live Mode test" | Sol | `d09c86b7d14d438ea07fcc75d710644d` | shadow-skipped, then dispatched after live flip |
| `8269874e-...` "P1.4 killSwitch test" | Sol | — | killSwitch-skipped, never sent |
| (test-send 1) | Sol (`[TEST]`) | `07012b5a6d254b359ddacd0266beda12` | preview, no DB rows |
| (test-send 2) | Sol (`[TEST]`) | `006638d4d86c48a8a6ff3495fc82de3a` | preview, no DB rows |

### Known limitations (documented in commit messages)

- **Stuck-claim recovery:** if a tick crashes after `sent_at=NOW()`
  but before `externalMessageId` update, the row reads as "sent"
  with no Mandrill ack. Sweeper (`sent_at < NOW-5min AND no
  externalMessageId → revert NULL`) is left for P1.3 follow-up
  if it surfaces.
- **Multi-channel** (email + sms simultaneously) — P1.2 picks
  primary channel only. Per-(userId, channel) fan-out lands when
  SMS sender ships.
- **`{{name}}` is the only substitution.** Variant rendering /
  per-row personalization beyond first-name lands later.
- **All campaign emails use `sendOutreachEmail` template** which
  embeds a hardcoded "Book a Session" CTA → club page. For
  retention/win-back universal, but for upgrade/event flows the
  CTA reads odd. Fix proposal: add `cta_label` + `cta_url` to
  Campaign model + Wizard Step 4 (P2 candidate).

---

## Commits pushed across the session

| Branch | Commit | Title |
|--------|--------|-------|
| `Solapp` (force-push) | `77d9ecec` | demo: rebuild Solapp on top of Sol2 — 1500 members + canned Advisor |
| `Solapp` | `ab00e24e` | demo: hide AI-Attributed Revenue + wire SessionDetailIQ to mocks |
| `Solapp` | `95a0482c` | demo: wire PlayerProfileIQ + FrequentPartners to mocks |
| `Solapp` | `6e8a0b7c` | demo: wire AI Insights + Occupancy Heatmap to mocks |
| `Solapp` | `03b7a5f7` | demo: hide Agent Campaign Layer hero on Campaigns page |
| `Solapp` | `4f4b8db5` | demo: rename Cohorts → Segments + seed 8 mock segments |
| `Sol2` | `6ec06847` | fix(insights): drop ::uuid casts (silent prod breakage) + rename Cohorts → Segments |
| `Sol2` | `6a3c488e` | fix(insights): rewrite 4 membership-based generators to use users table |
| `rgdev` | `34a6959f` | feat(engage P1.2): campaign send queue + per-minute Vercel cron |
| `rgdev` | `73197ee2` | feat(engage P1.3): roll up Mandrill webhook events to Campaign counters |
| `rgdev` | `f3ad821e` | feat(engage P1.5): periodic refresh on Active Campaigns table |
| `rgdev` | `2d39d67f` | feat(engage P1.6): test send (single-recipient preview) in wizard |

---

## Documents produced

| File | Size | Purpose |
|------|------|---------|
| `/Users/shats/Downloads/iqsport-ai-insights-how-it-works.md` | 17K | Architecture doc covering all 10 AI Insights generators, data sources, limitations, and how to add new ones. |

---

## Open items going forward

### Immediate-ish

1. **Custom CTA in Campaign emails** — extend Campaign model with
   `cta_label` + `cta_url`, surface in Wizard Step 4. Currently
   all sends carry "Book a Session" → club page.
2. **rgdev → main merge** — once a green light to merge, Vercel
   cron auto-registers `* * * * *` schedule for `/api/cron/
   campaign-sends` on production. Until then cron only runs when
   manually triggered with `CRON_SECRET`.
3. **AI Insights role-tagging** — backlog from persona research.
   Add `role: 'owner' | 'marketer' | 'ops'` to each Insight,
   filter UI by role. Avoids flooding owner with "underutilized
   courts" (ops problem) and marketer with "VIP at risk" they
   can't act on without ops.

### Engage Priority 2 (per spec §6)

- Campaign History real data + drilldown card + per-campaign
  attribution view.

### Engage Priority 3+

- Sequence engine (admin-authored multi-message series).
- Recurring campaigns ("every Monday") — needs cron expression
  parser + recurring runner.
- Dead-state cleanup in `CampaignsIQ.tsx` (unused hooks left
  after legacy block removal).
- Send Volume chart sizing in Insights drawer.

### Top 15 new AI Insights from persona research (when prioritized)

1. Churn risk score for all members (not just VIP) + dollar impact.
2. Cohort retention curve + anomaly alerts.
3. Weather impact forecast for outdoor courts.
4. Member fatigue / over-contact tracking.
5. No-show risk forecast for today (ops).
6. Contribution margin per format / per court (owner).
7. LTV / CAC by acquisition channel (owner).
8. Revenue concentration risk (owner).
9. Cash flow forecast 60-90 days (owner).
10. Pricing power signal (owner).
11. Competitive intel — new club opened in your ZIP, churn drift.
12. Membership tier downgrade trend (leading indicator of churn).
13. Referral champions (members whose guests convert).
14. Instructor utilization low (ops).
15. Equipment shortage forecast for tomorrow (ops).

### Sol2 newMemberOnboarding caveat

Currently uses first-booking date as proxy for join date because
`club_followers.created_at` is bulk-import timestamp for IPC
clubs (everyone "joined" in last 30 days). Doesn't catch members
who joined-but-never-played. Real fix would be a separate
`original_join_date` column populated at CourtReserve sync time.

---

## Reference IDs (for next session)

- **iqsport-prod Supabase project:** `mwdftgazlvpfyvqicovh`
- **piqle-web-tournament dev Supabase project:** `angwdmyswzztmlrdzgxm`
- **IPC North club (prod):** `6427f742-8f59-4f93-8f17-69a139b0e66f`
- **test iq2 club (dev):** `bbdfc056-40c9-449f-8297-0fa48383cebb`
- **rgdev preview URL:** `piqle-web-tournament-git-rgdev-rodion-gorins-projects.vercel.app`
- **Sol2 prod URL:** `app.iqsport.ai` + `stest.piqle.io`
- **Solapp demo URL:** `demo.iqsport.ai`
- **Solapp backup tag:** `solapp-archived-2026-04-27` (reverts to `b438ecfd`)
- **Vercel project ID (piqle-web-tournament):** `prj_YOFdvaM5oNZmi3C20h7rmpZZGxJK` (Rodion's team `team_NX8OxNWn0VJ02b0Iqtd5O5hL`)
