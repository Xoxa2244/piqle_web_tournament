# ENGAGE Tier 1 — Summary

> Status as of May 3, 2026. Branch: `rgdev` (commit `a3487703`).
> Backlog map for Krishna sign-off + production rollout decision.

---

## TL;DR

4 of 10 lifecycle email segments from `ENGAGE_MVP_KAMPANII_RU.md` are **shipped end-to-end** on `rgdev` branch. Each segment is a closed loop:

```
detector (SQL) → email send → click tracking → survey response → admin dashboard → admin action
```

Everything builds on **shared infrastructure** — adding the next 6 segments is mostly copy/extend, not from-scratch.

---

## What's shipped

| # | Segment | Window | Email cadence | Rich HTML buttons? | Dashboard widget? |
|---|---|---|---|---|---|
| 1 | **Newcomer** | First 30 days | Day 0 / 5 / 12 (conditional) | ❌ plain text | ✅ + drill-down |
| 4 | **Declining** | Last 30d, was ≥3/mo | Day 1 / 5 / 12 | ✅ | ✅ + drill-down |
| 5 | **Sleeping** | 30–90 days inactive | Day 1 / 14 | ✅ | ✅ + drill-down |
| 8 | **Birthday** | Calendar date | D-7 (single email) | ✅ | ✅ + Pending Gifts queue |

**Test endpoints** for visual review (all hardcoded to `sol@piqle.io`):
- `/api/ai/test-newcomer-email`
- `/api/ai/test-declining-email`
- `/api/ai/test-sleeping-email`
- `/api/ai/test-birthday-email`

---

## How the loop works

### 1. Detector (daily, per club)

A SQL pass identifies who matches the segment criteria. Each segment has its own `lib/ai/<segment>-detector.ts` with a single function.

| Segment | Detector function | Key criteria |
|---|---|---|
| Newcomer | (uses `event-detection.ts`) | Triggered when CR sync sees a new member |
| Declining | `detectDecliningMembers` | ≥3 bookings/mo for 60d, then 0–1 last 30d, last booking <30d ago |
| Sleeping | `detectSleepingMembers` | Last booking 30–90d ago, sub Active, joined ≥60d ago |
| Birthday | `detectBirthdayMembers` | `to_char(MM-DD)` matches now+7d, sub Active |

All detectors:
- Filter out placeholder/demo emails
- Skip members in the segment's cooldown window (typically 60d to avoid double-pings)
- Order by highest-value-at-stake first
- Have a `limit` cap so cron runs are predictable

### 2. Email send

`sendOutreachEmail()` in `lib/email.ts` ships through Mandrill with full IQSport brand chrome (logo, eyebrow pill, footer). Three render paths:

- **Plain-text body** (Newcomer) — text + default Book-a-Session button
- **Rich HTML override** (Declining/Sleeping/Birthday) — pass `bodyHtmlOverride` + `suppressDefaultCta: true`. Use `buildEmailButton` (bulletproof table+VML) for buttons, `buildEmailPanel` for inline cards
- All emails: legacy `bgcolor` attrs + solid hex colors so iOS Mail dark-mode renders correctly

### 3. Survey click capture

Email links go to `/api/surveys/respond?logId=<ARLog.id>&option=<choice>`:

- Validates option against an allowlist (currently 14 options across 4 surveys)
- Derives `surveyType` from log type + reasoning (`onboarding_day12`, `declining_reactivation`, `sleeping_reactivation`, `birthday_gift`)
- Upserts into `micro_survey_responses` table on `log_id` UNIQUE — re-clicks overwrite the choice
- Returns small HTML "Got it" page

### 4. Conditional follow-ups

Multi-step sequences (Newcomer, Declining, Sleeping) check before sending the next step:
- Did the member **book** since the previous email? → exit with `reasoning.exitReason: 'booked'`
- Did the member **click a survey option**? → exit with `reasoning.exitReason: 'survey_responded'`
- Frequency cap (`checkAntiSpam`) — per-day + per-week limits + opt-out

This prevents "spamming someone who already gave us their answer" — the operator's most common complaint with marketing automation.

### 5. Admin dashboard

`/clubs/<id>/intelligence/settings/automation` (admin role only). Stack of cards top-to-bottom:

```
🎂 Birthday gifts to prepare           ← action queue (Tier A)
📋 Newcomer Day 12 survey              ← aggregate + drill-down (Tier B)
📋 Declining Day 1 survey              ← aggregate + drill-down
📋 Sleeping Day 14 survey              ← aggregate + drill-down
📋 Birthday Gift survey                ← aggregate + drill-down
```

Each survey card shows:
- KPI (responses count, response rate %, emails sent)
- Per-option bars + counts + actionable hints
- ⚠️ "ACTION" pill on options requiring per-member operator action
- "View N individual responses" expander → inline list (member name, email, option, date) — amber-highlighted rows for action-required options

The Birthday queue is special — it's a 3-bucket task list:
- **Needs preparation** — chose a gift, not yet fulfilled (with "Mark fulfilled" button)
- **Awaiting member's choice** — email sent, no click yet
- **Already fulfilled** — collapsed log of completed gifts

### 6. Cron orchestration

Single endpoint runs everything daily:
`/api/cron/lifecycle-segments` (vercel.json schedule `0 13 * * *`).

For each club, in order:
1. Newcomer follow-ups (Day 5 + Day 12)
2. Declining detection + Day 1 send + Day 5/12 follow-ups
3. Sleeping detection + Day 1 send + Day 14 follow-up
4. Birthday detection + Day-7 send

Per-club + per-segment failure isolation. Returns aggregate totals for cron observability.

---

## Architecture diagram

```
                ┌──────────────────────────────────────────────────┐
                │  Daily cron (13:00 UTC)                          │
                │  /api/cron/lifecycle-segments                    │
                └──────┬───────────────────────────────────────────┘
                       │
                       ▼
       ┌───────────────────────────────────┐
       │  For each club:                    │
       │   • Newcomer follow-ups            │
       │   • Declining detect + send + fu   │
       │   • Sleeping detect + send + fu    │
       │   • Birthday detect + send         │
       └─────┬─────────────────────────────┘
             │
             ▼
       ┌─────────────────────────┐         ┌──────────────────┐
       │  detect*Members SQL      │ ──→     │  AIRecommend-    │
       │  (filter cooldown, etc.) │         │  ationLog row    │
       └────────────┬─────────────┘         │  (status: sent)  │
                    │                       └────────┬─────────┘
                    ▼                                │
       ┌─────────────────────────┐                   │
       │  sendOutreachEmail       │                   │
       │  (Mandrill, brand HTML) │                   │
       └────────────┬─────────────┘                   │
                    │                                │
                    ▼                                │
       ┌─────────────────────────┐                   │
       │  Member receives email   │                   │
       │  Clicks survey button    │                   │
       └────────────┬─────────────┘                   │
                    │                                │
                    ▼                                │
       ┌─────────────────────────┐                   │
       │  /api/surveys/respond    │                   │
       │  → MicroSurveyResponse   │                   │
       └────────────┬─────────────┘                   │
                    │                                 │
                    ▼                                 ▼
       ┌──────────────────────────────────────────────────────┐
       │  Admin dashboard                                      │
       │  /clubs/<id>/intelligence/settings/automation         │
       │   • Birthday queue (action list, "Mark fulfilled")   │
       │   • 4 survey cards (KPI + breakdown + drill-down)    │
       │   • Action badges on options requiring operator work │
       └──────────────────────────────────────────────────────┘
                    │
                    ▼
       ┌─────────────────────────┐
       │  Operator action         │
       │   (apply discount,       │
       │    prepare gift,         │
       │    invite to session)    │
       └─────────────────────────┘
```

Mandrill webhooks update `AIRecommendationLog.openedAt` / `clickedAt` / `bouncedAt` independently of survey clicks (existing infrastructure, not new).

---

## File map

### Backend (lib/)
- `lib/ai/onboarding-sequence.ts` — Newcomer 3-step + Day 12 conditional
- `lib/ai/declining-detector.ts` + `lib/ai/declining-sequence.ts` — Declining
- `lib/ai/sleeping-detector.ts` + `lib/ai/sleeping-sequence.ts` — Sleeping
- `lib/ai/birthday-gift.ts` — Birthday detector + sender (combined, single-step)
- `lib/ai/anti-spam.ts` — Frequency cap shared by all 4 + slot-filler

### API endpoints
- `/api/cron/lifecycle-segments` — daily orchestrator
- `/api/surveys/respond` — generic survey click handler (all 4 surveys)
- `/api/ai/test-newcomer-email` — visual review
- `/api/ai/test-declining-email`
- `/api/ai/test-sleeping-email`
- `/api/ai/test-birthday-email`

### Dashboard UI
- `app/clubs/[id]/intelligence/_components/MicroSurveyResultsCard.tsx` — generic widget for any surveyType
- `app/clubs/[id]/intelligence/_components/BirthdayPendingGiftsCard.tsx` — Birthday-specific action queue
- `app/clubs/[id]/intelligence/settings/automation/page.tsx` — page mount

### tRPC procedures (server/routers/intelligence.ts)
- `getMicroSurveyResults` — aggregated KPI + breakdown
- `getMicroSurveyResponseDetails` — per-member drill-down list
- `getBirthdayGiftQueue` — Birthday 3-bucket fulfillment queue
- `markBirthdayGiftFulfilled` — admin "Mark fulfilled" mutation

### Database schema
- New AIRecommendationType enum values: `DECLINING_REACTIVATION`, `SLEEPING_REACTIVATION`, `BIRTHDAY_GIFT_OFFER`
- New `MicroSurveyResponse` table — generic survey storage (log_id UNIQUE)
- All migrations applied to **both** prod (`mwdftgazlvpfyvqicovh`) and dev (`angwdmyswzztmlrdzgxm`) DBs

### Tests
- `tests/lib/ai/onboarding-sequence.test.ts` — 17 tests
- `tests/lib/ai/declining-sequence.test.ts` — 21 tests
- `tests/lib/ai/sleeping-sequence.test.ts` — 19 tests
- `tests/lib/ai/birthday-gift.test.ts` — 12 tests

**Total Tier 1 unit tests: 69 passing.** Full suite ~720 passing.

---

## Validation done on prod data (read-only dry-runs)

| Detector | Candidates found | Notes |
|---|---|---|
| Declining | 48 (East 10, South 5, North 33) | Spot-check: power users (12.5/mo) dropped to 1, fresh decline pattern confirmed |
| Sleeping | **819** (East 227, South 169, North 423) | Avg 52–63 days inactive. Massive untapped pool — rate-limit important |
| Birthday | **41 today**, 764 in next 14d | ~21k active members with DOB across all 3 IPC clubs |

No emails sent yet — these are detector dry-runs only.

---

## What's NOT done

### Blocked
- **#9 Subscription expiry** — needs `expires_at` per member from CourtReserve API. Our DB only has `membership_status` (current state). Either extend CR sync (~3h, depends on what CR API returns) or skip in favor of "status moved Active→Expired" event-driven approach.

### Tier 2 backlog (~1.5–2 days each)
- **#6 Ушедший** — split detection (cancelled vs expired) + 2-email winback over 28d. Closes the lifecycle cascade.
- **#7 Trial не конвертировался** — separate funnel (acquisition not retention). Reuse Newcomer pattern.
- **#10 Post-session отзыв** — booking-completion trigger + NPS rating + Google review prompt for happy responses.

### Tier 3 (bigger lift)
- **#3 VIP / Чемпион** — quarterly stats job + NPS NPS infrastructure. ~5–6 hours.
- **#2 Регулярный** — by spec design, no scheduled emails (only event-triggered ones from #8/#9/#10). Effectively "do nothing" until #9 unblocks. No work needed.

### Cross-cutting gaps (nice to have)
- **Free-text follow-up** for `option=other` — currently surveys collect button-only answers. Phase 2.5: send second email to `other`-clickers asking "tell us more" with a free-text reply form.
- **Email engagement timeline per member** — `AIRecommendationLog.openedAt` / `clickedAt` / `bouncedAt` exist but aren't surfaced in the Members page.
- **Daily digest email for admin** — "yesterday: 3 surveys responded, 1 booking attributed, 2 unsubscribes". Operator wakes up to one summary instead of having to check the dashboard.
- **Member-detail integration** — drill-down rows in the survey widget could deep-link to the member's profile page (sequence history + bookings).
- **Per-club incentive override** — Day-12 declining email currently hardcodes "guest pass". Different clubs may want "10% off next month" or "free clinic seat". Move to a club setting.

### Production rollout (NOT done)
The 4 segments live on `rgdev` only. To make them visible on `app.iqsport.ai` (Sol2 production):
1. **Cherry-pick** rgdev commits onto Sol2 (mirror what we did with deviq earlier in the project)
2. **Push Sol2** → Vercel auto-deploys → app.iqsport.ai shows the new widgets (empty, no data yet)
3. **Add QStash schedule** for `/api/cron/lifecycle-segments` (Vercel cron doesn't fire on Sol2 preview alias — same issue we solved for CR sync)
4. **Manual pilot** — trigger orchestrator for one club (IPC South — 5 declining + 169 sleeping rate-limited to 50/day + 0–7 birthdays) and watch widgets fill

The cherry-pick + push is ~10 minutes. QStash schedule is ~5 minutes. Pilot monitoring is 24–48h.

---

## Suggested next moves

### After Krishna sign-off (tomorrow)
1. **Phase 1 — UI only on Sol2** (10 min): cherry-pick + push. Widgets visible on app.iqsport.ai, all empty. Krishna sees what the operator sees.
2. **Phase 2 — Pilot one club** (manual trigger): curl `/api/cron/lifecycle-segments` for IPC South only. Watch widgets fill over 24-48h.
3. **Phase 3 — Full automation** (5 min): add QStash schedule, daily run for all 3 clubs.

### When backlog needs another segment
Tier 2's #6 Ушедший is the natural next step — closes the cascade after Sleeping. ~3 hours using the same pattern.

### When/if CR sync exposes `expires_at`
Unblock #9 Subscription expiry. Highest revenue impact of all remaining segments.

---

## Operational runbook

### How to dry-run a detector (read-only, no emails)
Run the detector SQL directly via Supabase MCP — example for Sleeping:
```sql
WITH active_subs AS (SELECT id AS user_id FROM users WHERE membership_status = 'Active'),
     last_booking AS (...)
SELECT ... FROM ... WHERE ...
```
(Full queries in `lib/ai/<segment>-detector.ts`.)

### How to send a test email to yourself
```bash
curl -X POST https://app.iqsport.ai/api/ai/test-<segment>-email \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"clubName":"IPC Test"}'
```
Recipient is hardcoded to `sol@piqle.io`. No DB writes.

### How to manually trigger production cron
```bash
curl -X POST https://app.iqsport.ai/api/cron/lifecycle-segments \
  -H "Authorization: Bearer $CRON_SECRET"
```
Returns aggregated per-club + per-segment counters.

### Kill switch
The cron endpoint requires `CRON_SECRET`. To pause automation:
1. Remove the QStash schedule (instant)
2. Or rotate `CRON_SECRET` in Vercel env (instant — old secret rejected)
3. Or set status='canceled' on relevant club_connectors (more granular)

### Where data lives
- Email sends: `ai_recommendation_logs` (type, status, openedAt, clickedAt, sequenceStep, parentLogId, reasoning)
- Survey responses: `micro_survey_responses` (log_id, option, responded_at)
- Birthday fulfillment: `ai_recommendation_logs.reasoning.fulfilledAt`

### Where admin acts
`https://app.iqsport.ai/clubs/<club_uuid>/intelligence/settings/automation` (admin role)

---

## Risks + things to know

- **Sleeping pool is huge** (819). Rate limited to 50/club/day so we drain over ~10 days. Monitor Mandrill rate + spam folder placement carefully.
- **Newcomer templates are plain text** (no rich HTML buttons) — pre-date the bulletproof button work. Visually distinct from the other 3 segments. Decide whether to uplift before pilot.
- **Birthday segment requires physical fulfillment** — without admin actually preparing gifts, the feature breaks the promise made in the email. The Pending Gifts widget exists specifically to make this hard to ignore.
- **`#9 Subscription expiry` blocked** but it's the highest-revenue segment. Worth a half-day to investigate CR API for `MembershipExpiresOn` field.
- **No A/B testing** in any of this. Variant optimizer (`lib/ai/variant-optimizer.ts`) exists for slot-filler/check-in but not wired into Tier 1 sequences yet. Conscious scope cut for V1.
- **Dashboard requires Admin role**. Moderator-level club staff will see access-denied panel. May need to soften when Krishna's team uses it.

---

## Related docs
- `ENGAGE_MVP_KAMPANII_RU.md` — original 10-segment spec (Russian, source of truth)
- `ENGAGE_REDESIGN_PLAN.md` — overall Engage section redesign (covers Members / Cohorts / Campaigns pages, separate work)
- `IQSport_PROJECT_CONTEXT.md` — full project context for YC application
