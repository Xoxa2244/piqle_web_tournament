# Engage Redesign — Implementation Spec

> **Companion to:** [`ENGAGE_REDESIGN_PLAN.md`](./ENGAGE_REDESIGN_PLAN.md) (the "what / why")
> This doc is the "how / where / acceptance" — implementation-grade.
>
> **Owner:** Rodion + AI co-pilot
> **Branch:** `rgdev` (do not push to `deviq` directly)
> **Scope:** Engage section refactor — Members, Cohorts, Campaigns + new Settings → Automation page.
> **Out of scope:** Dashboard redesign (deferred, see PLAN §11), brand-routing changes, payments.

---

## 0. How to read this spec

Every task has the format:

```
### <PHASE>-T<N>: <title>
**Files**: paths touched (NEW = create, DELETE = remove)
**Depends on**: prerequisite tasks
**Effort**: rough hours
**Acceptance**:
  - [ ] checklist of pass criteria
**Risk / notes**: gotchas
```

Tasks are atomic — each one mergeable on its own to `rgdev`.

---

## 1. Decisions locked

These resolve PLAN §14 + reality-check blockers. Override here if context changes.

| ID | Decision | Rationale |
|---|---|---|
| **D1** | **`MemberHealthSnapshot` reused as-is** for KPI deltas. No new table, no migration. Daily cron deferred to Phase 5. | Table already exists at `prisma/schema.prisma:2025` with `date`, `healthScore`, `riskLevel` and `(clubId,date)` index. Written on session import via `lib/ai/session-importer.ts:334`. PLAN §9 just used wrong name. |
| **D2** | **IQSport brand only** for Phases 1–5. Legacy brand untouched. | All paying clubs + pipeline are iqsport. Legacy = non-paying. Halves scope. Branch on `brand.key === 'iqsport'` already exists in code. |
| **D3** | **Member Detail = side-drawer** with shallow URL `?member=<userId>`. Not a separate route. | Native list↔drawer UX, shareable link, no full reload, browser back works. |
| **D4** | **Phase 3 ships 3 of 6 AI-cohorts:** `Renewal in 14d`, `Lost Evening Players`, `New & Engaged`. | Highest $-impact + simplest queries + mix of retention/growth. Other 3 (`VIP Power Users`, `Birthday`, `Declining Casuals`) — Phase 4+ if useful. |
| **D5** | **Active Campaigns table is lightweight in Phase 4** (name, cohort, channel, sent count, status). $-impact + open % deferred to Phase 5 (needs attribution). | Better than empty state; doesn't block wizard delivery. |
| **D6** | **"Generate AI profiles" auto-runs when cohort ≤ 50 members**, becomes an explicit button when >50. | Auto = "wow moment" on small cohorts; button = LLM cost discipline on big ones. |
| **D7** | **Cohort Builder v1 ships 8 fields:** Health Score · Risk Level · Membership tier · Last play (days ago) · Sessions/month · LTV · Joined date · Birthday month. | Covers all 3 Phase-3 AI cohorts and the 3 deferred ones. Skill/gender/location → v2. |

---

## 2. Phase 0 — Prerequisites

> **Goal:** Land the structural skeletons that Phase 1+ depends on.
> **Total effort:** 1.5–2.5 days.

### P0-T1: Commit the plan + spec to `rgdev`
**Files**:
- `docs/ENGAGE_REDESIGN_PLAN.md` (already exists, untracked)
- `docs/ENGAGE_REDESIGN_SPEC.md` (this file)

**Effort**: 5 min
**Acceptance**:
- [ ] Both files committed to `rgdev` with message `docs: lock engage redesign plan + spec`
- [ ] `git status` clean

**Risk**: None.

---

### P0-T2: Create `Settings → Automation` page skeleton (empty, admin-gated) ✅ DONE
**Files** (actual paths after audit):
- `app/clubs/[id]/intelligence/settings/automation/page.tsx` — NEW (NOTE: under `intelligence/`, not directly under `[id]/`)
- `app/clubs/[id]/intelligence/_components/iq-layout/IQSidebar.tsx` — extend `buildNavSections(isMembership, isAdmin)` and conditionally append `Automation` item to SYSTEM section when `clubRole === 'ADMIN'`

**Depends on**: none
**Effort**: 2–3h (actual: ~1h)
**Acceptance**:
- [x] Route `/clubs/{id}/intelligence/settings/automation` renders for club admin
- [x] Non-admin sees `Admin access required` panel (not 404 — better UX, data already protected at tRPC layer)
- [x] Page contains `<h1>Automation</h1>` + descriptive placeholder listing what arrives in P1-T3
- [x] IQSidebar SYSTEM section shows "Automation" entry only when `intelligenceSettings?.clubRole === 'ADMIN'`
- [x] No new TypeScript errors introduced (baseline 901, post-change 901)

**Findings during P0-T2**:
- Settings page lives at `intelligence/settings/page.tsx`, not `[id]/settings/`. Spec paths corrected.
- No `SettingsNav` component exists; Settings is a single page with internal sections. Sub-nav added via main IQSidebar entry instead.
- Admin role exposed via existing `intelligenceSettings.clubRole` (`'ADMIN' | 'MODERATOR' | null`) from `useIntelligenceSettings(clubId)` — same hook used elsewhere.
- This is the first admin-only sidebar entry; pattern established: filter inside `buildNavSections`.

**Risk**: Resolved.

---

### P0-T3: Audit Live Mode badge location
**Files**: read-only investigation across:
- `app/clubs/[id]/intelligence/dashboard/page.tsx`
- `app/clubs/[id]/intelligence/campaigns/page.tsx` (`outreachModeStyle`, lines ~763–772)
- `lib/ai/agent-control-plane.ts`
- `lib/ai/agent-outreach-rollout.ts`

**Depends on**: none
**Effort**: 1h
**Acceptance**:
- [ ] Document in PR description: where Live Mode state lives (DB field, context, hook, server query)
- [ ] Decide: lift to a global hook `useLiveMode()` in `app/clubs/[id]/intelligence/_hooks/use-live-mode.ts` — yes/no
- [ ] No code changes in this task — just the audit note

**Risk**: If Live Mode is per-trigger (not per-club), global badge needs an "any-trigger-live" reducer.

---

### P0-T4: Add tRPC procedure stubs (signatures only)
**Files**:
- `server/routers/intelligence.ts`

Add procedures (return mock data initially, real impl in later phases):
- `getMemberHealthDeltas({ clubId, period: 'week'|'month'|'quarter' })` → `{ activeCount, activeDelta, avgHealth, avgHealthDelta, atRiskCount, atRiskDelta, ltvTotal, ltvDelta, vipCount, packageCount }`
- `listSuggestedCohorts({ clubId })` → array of `{ id, name, description, memberCount, estImpactCents, suggestedAction, suggestedTemplateKey }`
- `previewCohort({ clubId, conditions })` → `{ count, sampleUsers: [...] }`
- `listActiveCampaigns({ clubId })` → array of `{ id, name, cohortId, channel, sentCount, status }`

**Depends on**: none
**Effort**: 1–2h
**Acceptance**:
- [ ] All four procedures present, typed, return mock data
- [ ] `npm run typecheck` passes
- [ ] Frontend can `useQuery` them without errors

**Risk**: Existing intelligence router is large (>1000 lines) — make sure new procedures are placed in a logical group, not appended randomly.

---

### P0-T5: Decision note on Legacy vs IQSport in `CLAUDE.md`
**Files**: `CLAUDE.md`

Add a brief note under "Intelligence Module Structure":

> **Engage Redesign Scope (April 2026):** The Engage redesign (Members/Cohorts/Campaigns/Settings→Automation) targets **IQSport brand only**. Legacy brand pages (`Legacy*Page` components) remain as-is. All redesign work is gated behind `brand.key === 'iqsport'` checks where dual code paths exist. See `docs/ENGAGE_REDESIGN_SPEC.md` for full plan.

**Depends on**: P0-T1
**Effort**: 5 min
**Acceptance**:
- [ ] CLAUDE.md updated, committed
- [ ] Future agents reading CLAUDE.md know not to redesign legacy code

**Risk**: None.

---

## 3. Phase 1 — Cleanup

> **Goal:** Visual structure of new Engage emerges. Reactivation gone. AC Layer moved. AI-Recommended on top.
> **Total effort:** 1–2 days. Low risk.

### P1-T1: Remove Reactivation menu item from sidebar
**Files**:
- `app/clubs/[id]/intelligence/_components/iq-layout/IQSidebar.tsx` (line 61)

**Depends on**: none
**Effort**: 10 min
**Acceptance**:
- [ ] Sidebar ENGAGE section shows only Members / Cohorts / Campaigns
- [ ] Visual regression test: existing screenshots match except Reactivation row gone
- [ ] Direct URL `/clubs/{id}/intelligence/reactivation` still works (page handled separately in P1-T2)

**Risk**: None.

---

### P1-T2: Delete Reactivation page (iqsport branch only)
**Files**:
- `app/clubs/[id]/intelligence/reactivation/page.tsx` — modify: `LegacyReactivationPage` keeps rendering for legacy brand; iqsport branch returns `redirect('/clubs/{id}/intelligence/members?at_risk=1')` or 404
- `app/clubs/[id]/intelligence/_components/iq-pages/ReactivationIQ.tsx` — delete (only used by iqsport)

**Depends on**: P1-T1
**Effort**: 30 min
**Acceptance**:
- [ ] `/clubs/{id}/intelligence/reactivation` on iqsport brand redirects to Members with `?at_risk=1` filter pre-applied
- [ ] Same URL on legacy brand still renders LegacyReactivationPage
- [ ] No imports of `ReactivationIQ` remain (`grep -r ReactivationIQ` returns 0)
- [ ] tRPC procedures used only by ReactivationIQ are NOT deleted yet (referenced in P3, P4)

**Risk**:
- Some procedures used by ReactivationIQ are reused later. **Don't delete them.** Track in P5-T5 cleanup pass.
- `?at_risk=1` filter requires P2-T1 already shipped — if P1 ships before P2, redirect to plain Members.

---

### P1-T3: Move Agent Campaign Layer block to Settings → Automation
**Files**:
- `app/clubs/[id]/intelligence/_components/iq-pages/CampaignsIQ.tsx` — delete block (lines ~751–843, the 3-column "Agent Campaign Layer")
- `app/clubs/[id]/settings/automation/page.tsx` — render moved block here

**Depends on**: P0-T2 (skeleton page)
**Effort**: 2–3h
**Acceptance**:
- [ ] `CampaignsIQ` no longer renders Draft Queue / Live Rollout / Live Pilot Health
- [ ] `Settings → Automation` page renders all three columns with full functionality
- [ ] Outreach Mode + Pilot Health header badges (lines 761–773 of CampaignsIQ) **stay on Campaigns** — only the big 3-column block moves
- [ ] Admin gate enforced (non-admin gets 404)

**Risk**:
- The block likely calls tRPC procedures used elsewhere. Don't move the queries — keep them in same router; only the rendering moves.

---

### P1-T4: Lift "AI-Recommended Campaigns" to top of Campaigns page
**Files**:
- `app/clubs/[id]/intelligence/_components/iq-pages/CampaignsIQ.tsx`

**Depends on**: P1-T3
**Effort**: 1–2h
**Acceptance**:
- [ ] AI-Recommended section is the first content block below page header
- [ ] Each card now shows: name, member count, **$ impact estimate**, channel icons, **Preview & Launch button** (label change from current implicit CTA)
- [ ] Cards sorted by $ impact descending (placeholder sort key in P1; real sort wired in P3-T1 when generators land)
- [ ] Existing "Agent Quick Starts" section deleted (per PLAN §6.6 — duplicates AI-Recommended)

**Risk**: $-impact estimate not yet computed → use placeholder strings (`"~$960/mo"`) until P3-T1 wires real values.

---

### P1-T5: Remove duplicate "Automation: Paused — 0/4 triggers active" banner
**Files**:
- `app/clubs/[id]/intelligence/_components/iq-pages/CampaignsIQ.tsx`

**Depends on**: P1-T3
**Effort**: 30 min
**Acceptance**:
- [ ] Banner no longer rendered on Campaigns page
- [ ] Equivalent state visible in Settings → Automation page (already covered by P1-T3)
- [ ] No regression in functionality — pausing automation still works via Settings

**Risk**: None.

---

## 4. Phase 2 — Members rework

> **Goal:** Members page becomes a scannable workhorse with story (KPI strip + AI Insight + List view).
> **Total effort:** 3–4 days.

### P2-T1: KPI strip reframe
**Files**:
- `app/clubs/[id]/intelligence/_components/iq-pages/MembersIQ.tsx` (KPI render area — locate by `MetricCard` usage)
- `server/routers/intelligence.ts` (`getMemberHealthDeltas` real impl, replacing P0-T4 stub)
- `lib/ai/intelligence-service.ts` (delta computation helpers)

**Depends on**: P0-T4
**Effort**: 6–8h
**Acceptance**:
- [ ] Old KPI tiles `Guests` and `Drop-Ins 0` removed
- [ ] New tiles in order: `Active / of N · ↗Δ`, `Avg Health · ↗Δ`, `At-Risk · ↗Δ`, `LTV total · $Δ`, `VIP / Package counts`
- [ ] Each delta computed via `getMemberHealthDeltas` reading `MemberHealthSnapshot` for "30 days ago" comparison
- [ ] When no historical snapshot exists (new club), delta shows `—` instead of `+100%`
- [ ] Period selector (Week / Month / Quarter) drives `period` arg

**Risk**:
- `MemberHealthSnapshot` written event-driven (on session import) — quiet days have gaps. Mitigate by comparing **average over period** rather than point-in-time. P5-T1 cron solves the rest.
- For "Active" delta, `membershipStatus` is current state, not historical — need to query `member_health_snapshots` for the lifecycle stage at past date, OR accept that Active delta is "last 30d new actives" and label accordingly.

---

### P2-T2: List view as default + view-mode toggle
**Files**:
- `app/clubs/[id]/intelligence/_components/iq-pages/MembersIQ.tsx`
- `app/clubs/[id]/intelligence/_components/MemberRow.tsx` — NEW (compact row component)

**Depends on**: none (can run parallel to P2-T1)
**Effort**: 6–8h
**Acceptance**:
- [ ] Default view = List (compact rows, 1 row per member)
- [ ] Toggle `[List] [Grid] [Cards]` in upper-right of list area, persists to `localStorage` per user
- [ ] List row layout: `Avatar · Name · HealthBar · SegmentBadges · Sessions/mo · LastPlay · $LTV · ActionMenu (⋯)`
- [ ] Click on row opens Member Detail drawer (P2-T5)
- [ ] List supports pagination (25 / page) or virtualized scroll for >100 rows
- [ ] Existing Grid/Cards views remain functional via toggle

**Risk**: Grid view today renders large cards — may need re-tuning to fit 12-col grid cleanly when toggled.

---

### P2-T3: Filter pills consolidation + bulk select
**Files**:
- `app/clubs/[id]/intelligence/_components/iq-pages/MembersIQ.tsx`

**Depends on**: P2-T2
**Effort**: 4–6h
**Acceptance**:
- [ ] Old tabs `At-Risk (1)` and `Reactivation (6)` removed (per reality check, today they're already filter pills — confirm and unify)
- [ ] Filter pills grouped into a single sticky left panel: `Activity`, `Risk`, `Trend`, `Value`, `Membership`
- [ ] Each row gets a checkbox at left
- [ ] Bulk toolbar appears when ≥1 row selected: `Add to cohort ▾`, `Send campaign ▾`, `Clear selection`
- [ ] "Add to cohort ▾" opens cohort picker dropdown (lists existing user cohorts + "Create new cohort" option that pre-fills cohort builder with selected userIds)

**Risk**: "Send campaign" shortcut needs Phase 4 wizard — until then, button is disabled with tooltip "Available in Phase 4".

---

### P2-T4: Member Detail side-drawer
**Files**:
- `app/clubs/[id]/intelligence/_components/MemberDetailDrawer.tsx` — NEW
- `app/clubs/[id]/intelligence/_components/iq-pages/MembersIQ.tsx` (wire row click + URL param)

**Depends on**: P2-T2
**Effort**: 8–10h
**Acceptance**:
- [ ] Click on any member row → side-drawer slides in from right
- [ ] URL updates to `?member=<userId>` (shallow update, no reload)
- [ ] Direct URL with `?member=<id>` opens drawer on page load
- [ ] Drawer shows: avatar, name, contact, health timeline (last 30d), session history, revenue contribution, suggested action, "Send message" CTA
- [ ] Browser back button closes drawer (URL param removed)
- [ ] Single source of truth — Reactivation/Cohorts/Campaigns row clicks (later phases) reuse this drawer

**Risk**:
- Drawer fetches a heavy member detail query — make sure it's lazy (`enabled: !!memberId`).
- Existing tRPC for member detail might already exist. Search before re-adding.

---

### P2-T5: AI Insight ribbon (rules-based v1)
**Files**:
- `app/clubs/[id]/intelligence/_components/AIInsightRibbon.tsx` — NEW
- `server/routers/intelligence.ts` (`getMembersAIInsight` procedure)
- `lib/ai/insights-engine.ts` (extend if needed)

**Depends on**: P2-T1
**Effort**: 6–8h
**Acceptance**:
- [ ] Ribbon at top of Members list, below KPI strip
- [ ] Renders one insight at a time: title + cause + suggested action button
- [ ] V1 rules (no LLM yet):
  - Detect ≥3 members shifted Healthy→Watch in last 7d → "X members shifted from Healthy → Watch this week"
  - Detect ≥5 at-risk members with same primary feature drop (e.g. evening sessions) → cluster narrative
  - Suggest action: `[Create cohort "<auto-name>"]` button that pre-fills cohort builder
- [ ] Dismiss button hides for 7 days (stored in `localStorage`)
- [ ] If no insight, ribbon is hidden (not shown empty)

**Risk**:
- LLM-narrative version is nice-to-have for Phase 3+. V1 must work with deterministic rules only.
- Cluster detection requires reading `MemberHealthSnapshot.features` JSON — confirm features field is populated.

---

### P2-T6: Add Churn trend chart next to "How Members Play"
**Files**:
- `app/clubs/[id]/intelligence/_components/iq-pages/MembersIQ.tsx`
- `app/clubs/[id]/intelligence/_components/charts/ChurnTrendChart.tsx` — NEW (or reuse from `ReactivationIQ` if extractable)

**Depends on**: P1-T2 (Reactivation removed first to avoid orphan code paths)
**Effort**: 3–4h
**Acceptance**:
- [ ] Chart renders churn rate over period (line) + reactivation count (bar overlay) — same metric ReactivationIQ used to show
- [ ] Side-by-side with "How Members Play" chart (50/50 split)
- [ ] Period selector at top of Members controls both charts

**Risk**: If chart code in ReactivationIQ is iqsport-specific and tightly coupled, easier to reimplement than extract.

---

### P2-T7: Move Agent Actions block off Members page
**Files**:
- `app/clubs/[id]/intelligence/_components/iq-pages/MembersIQ.tsx` (delete block, lines ~3600–3643)

**Depends on**: P3 ready to receive (P3-T2 implements destination)
**Effort**: 30 min
**Acceptance**:
- [ ] Block removed from Members page
- [ ] Agent Actions cards land in Cohorts page as part of AI-Suggested visualizations (P3-T2)

**Risk**: Don't ship P2-T7 before P3-T2 — Agent Actions disappears with no destination.

---

## 5. Phase 3 — Cohorts AI

> **Goal:** Cohorts page becomes an actively useful workspace — AI suggestions on top, builder below, real cohorts listed.
> **Total effort:** 5–7 days.

### P3-T1: Backend — 3 AI cohort generators (per D4)
**Files**:
- `server/routers/intelligence.ts` (`listSuggestedCohorts` real impl)
- `lib/ai/cohort-generators/` — NEW directory
  - `renewal-in-14d.ts`
  - `lost-evening-players.ts`
  - `new-and-engaged.ts`
  - `index.ts` (registry)

**Depends on**: P0-T4
**Effort**: 8–12h
**Acceptance**:
- [ ] Each generator is a pure function `(clubId, db) => Promise<{ name, description, userIds, estImpactCents, suggestedAction }>`
- [ ] Cached for 24h per club via Prisma table `ClubSuggestedCohortCache` (or simple in-memory if low traffic — confirm with team)
- [ ] `listSuggestedCohorts` returns array sorted by estImpactCents desc
- [ ] Generators tested with mock data — 22-member demo club returns expected cohorts
- [ ] `estImpactCents` formula consistent with PLAN §8.4 — placeholder formula in P3, locked in P5

**Risk**:
- "Lost Evening Players" requires session × time-of-day join — verify `PlaySessionBooking` schema supports this.
- 24h cache needs a refresh mechanism — for now, expire on cache write timestamp; manual refresh button in UI.

---

### P3-T2: AI-Suggested Cohorts UI section on Cohorts page
**Files**:
- `app/clubs/[id]/intelligence/_components/iq-pages/CohortsIQ.tsx`
- `app/clubs/[id]/intelligence/_components/SuggestedCohortCard.tsx` — NEW

**Depends on**: P3-T1
**Effort**: 4–6h
**Acceptance**:
- [ ] Section "🤖 AI-Suggested Cohorts" appears above "Your Cohorts"
- [ ] Each card: emoji, name, member count, description, est $ impact, suggested action label
- [ ] Two buttons per card: `[Create cohort]` (saves cohort to user list) + `[→ Campaign]` (opens P4 wizard pre-filled)
- [ ] Empty state: "Generating suggestions… check back tomorrow" if cache empty
- [ ] Refresh button manually re-runs generators (admin only)

**Risk**: `[→ Campaign]` button requires Phase 4. In P3, button text says "Coming soon" or is disabled.

---

### P3-T3: Cohort Builder drawer with live preview (8 fields per D7)
**Files**:
- `app/clubs/[id]/intelligence/_components/CohortBuilderDrawer.tsx` — NEW
- `server/routers/intelligence.ts` (`previewCohort` real impl)

**Depends on**: P0-T4
**Effort**: 10–14h
**Acceptance**:
- [ ] Drawer opens via "+ Create Cohort" button on Cohorts page
- [ ] Drawer also opens from "Add to cohort > Create new" in Members bulk toolbar (pre-fills userIds)
- [ ] Field set (per D7): Health Score (range slider) · Risk Level (multi-select pills) · Membership tier (multi-select) · Last play (days ago dropdown) · Sessions per month (range slider) · LTV (range slider) · Joined date (date range picker) · Birthday month (single select 1–12)
- [ ] AND/OR conditions builder: stack multiple conditions, default AND, toggle to OR per row
- [ ] Live preview: count + "Show list" button shows up-to-10 sample members
- [ ] Preview debounced 300ms on field change
- [ ] Bottom buttons: `[Cancel] [Save cohort] [Save + Create campaign →]`
- [ ] Validation: cohort name required, ≥1 condition required

**Risk**:
- "Sessions per month" needs aggregation over `PlaySessionBooking` — verify intelligence-service has helper or build one.
- Live preview can be slow on large clubs — set max 1000 members evaluated, show "1000+ matches" if exceeded.

---

### P3-T4: "Save + Create campaign →" bridge
**Files**:
- `app/clubs/[id]/intelligence/_components/CohortBuilderDrawer.tsx`

**Depends on**: P3-T3, P4-T1 (wizard skeleton)
**Effort**: 1–2h
**Acceptance**:
- [ ] Clicking "Save + Create campaign →" saves cohort, then opens Campaign Wizard (P4) with `cohortId` pre-set in Step 1
- [ ] If P4 wizard not yet shipped: button shows "Save & Continue to Campaigns" → saves + redirects to Campaigns page

**Risk**: Order with P4 — ship first as redirect, upgrade to wizard call when P4 lands.

---

### P3-T5: Risk Distribution donut as helper in Builder
**Files**:
- `app/clubs/[id]/intelligence/_components/CohortBuilderDrawer.tsx`
- `app/clubs/[id]/intelligence/_components/charts/RiskDistributionDonut.tsx` — NEW (or extracted from ReactivationIQ if recoverable)

**Depends on**: P3-T3
**Effort**: 2–3h
**Acceptance**:
- [ ] Donut visible in drawer right pane when Risk Level field is being edited
- [ ] Slices: Healthy / Watch / At-Risk / Critical, hover shows count + %
- [ ] Click on slice toggles that risk level into the filter

**Risk**: None significant.

---

### P3-T6: "Your Cohorts" section polish
**Files**:
- `app/clubs/[id]/intelligence/_components/iq-pages/CohortsIQ.tsx`

**Depends on**: P3-T2
**Effort**: 2–3h
**Acceptance**:
- [ ] User cohorts shown as cards: name, count, criteria summary, last edited, `[Edit]` `[Send campaign]` buttons
- [ ] "+ Create empty" card at end of list — opens empty Cohort Builder
- [ ] Each card shows badge "Auto-refresh" if it's a dynamic cohort, "Static" if frozen

**Risk**: `dynamic vs static cohort` field may not exist in `ClubCohort` schema today — add `isDynamic Boolean @default(true)` if missing.

---

## 6. Phase 4 — Campaign Wizard

> **Goal:** "+ New Campaign" opens a clear 4-step flow. Active campaigns visible.
> **Total effort:** 7–10 days.

### P4-T1: Wizard skeleton (4-step modal/drawer)
**Files**:
- `app/clubs/[id]/intelligence/_components/CampaignWizard/index.tsx` — NEW
- `app/clubs/[id]/intelligence/_components/CampaignWizard/Step1Audience.tsx` — NEW
- `app/clubs/[id]/intelligence/_components/CampaignWizard/Step2Goal.tsx` — NEW
- `app/clubs/[id]/intelligence/_components/CampaignWizard/Step3Message.tsx` — NEW
- `app/clubs/[id]/intelligence/_components/CampaignWizard/Step4Schedule.tsx` — NEW

**Depends on**: none
**Effort**: 6–8h
**Acceptance**:
- [ ] Wizard opens as drawer (full height) from "+ New Campaign" button
- [ ] Stepper at top: 1 Audience → 2 Goal → 3 Message → 4 Schedule
- [ ] "Next" / "Back" navigation, can't skip ahead
- [ ] State persisted in URL params or in-memory (lost on close OK in v1)
- [ ] Closing wizard prompts "Discard draft?" if any field touched

**Risk**: None significant.

---

### P4-T2: Step 1 Audience picker
**Files**:
- `CampaignWizard/Step1Audience.tsx`

**Depends on**: P4-T1, P3-T3 (cohort builder reusable)
**Effort**: 4–6h
**Acceptance**:
- [ ] Three radio options: `Pick from saved cohorts` / `Pick from AI-suggested` / `Build new cohort`
- [ ] Saved cohorts dropdown lists user cohorts with member counts
- [ ] AI-suggested dropdown lists Phase 3 generators with $ impact
- [ ] "Build new cohort" → embeds Cohort Builder inline (reuse P3-T3 component)
- [ ] "Show list" reveals up-to-25 sample members in the chosen cohort

**Risk**: Embedding builder inside wizard step requires clean component API — ensure CohortBuilderDrawer can render in non-drawer mode.

---

### P4-T3: Step 2 Goal selector
**Files**:
- `CampaignWizard/Step2Goal.tsx`
- `lib/ai/campaign-templates/` — NEW directory with 6 templates

**Depends on**: P4-T1
**Effort**: 4–6h
**Acceptance**:
- [ ] Six goal cards: Reactivate dormant · Onboard new · Promote event · Upsell tier · Renewal reminder · Custom
- [ ] Each card has icon, name, description, channel suggestion
- [ ] Selected goal stored, drives Step 3 default template
- [ ] "Custom" goal proceeds to Step 3 with empty message

**Risk**: None.

---

### P4-T4: Step 3 Message editor with AI generation + auto profiles (per D6)
**Files**:
- `CampaignWizard/Step3Message.tsx`
- `lib/ai/campaign-engine.ts` (extend or wrap existing message generator)

**Depends on**: P4-T2, P4-T3
**Effort**: 8–12h
**Acceptance**:
- [ ] AI-generated subject + body shown on Step 3 entry, based on goal + cohort
- [ ] Editable in-line (rich text or markdown)
- [ ] `[Regenerate with AI]` button re-runs generator with current params
- [ ] `[A/B test]` toggle → splits cohort 50/50, generates 2 variants
- [ ] Per-recipient personalization (per D6):
  - If selected cohort ≤ 50 members: auto-runs `Generate AI profiles` on Step 3 entry, shows progress bar
  - If selected cohort > 50 members: explicit `[Generate AI profiles for this cohort]` button
- [ ] Preview pane shows rendered message with sample member's data substituted

**Risk**:
- LLM generation latency — ≤5s acceptable, longer needs streaming UI
- AI profiles generation can be expensive — cap per cohort at 200 members in v1

---

### P4-T5: Step 4 Schedule + channel + send
**Files**:
- `CampaignWizard/Step4Schedule.tsx`

**Depends on**: P4-T1
**Effort**: 4–6h
**Acceptance**:
- [ ] Three radio: Send now / Schedule for [date+time] / Trigger when [condition]
- [ ] Channel toggles: Email (always on if cohort has emails), SMS (only if opted-in members exist; shows count)
- [ ] `[Preview]` shows full rendered message
- [ ] `[Send to test address]` field (admin email) for QA before launch
- [ ] `[✅ Launch]` button — disabled if Live Mode = OFF (with tooltip "Switch Live Mode on to send")
- [ ] On launch, campaign appears in Active Campaigns table (P4-T6)

**Risk**: Trigger conditions in v1 — limit to 3 simple triggers (member becomes at-risk, cohort exceeds threshold, scheduled date). Custom expressions = v2.

---

### P4-T6: Active Campaigns lightweight table (per D5)
**Files**:
- `app/clubs/[id]/intelligence/_components/iq-pages/CampaignsIQ.tsx`
- `app/clubs/[id]/intelligence/_components/ActiveCampaignsTable.tsx` — NEW

**Depends on**: P4-T5
**Effort**: 3–4h
**Acceptance**:
- [ ] New section "Active Campaigns" on Campaigns page, between AI-Recommended and Campaign History
- [ ] Columns: Name · Cohort · Channel · Sent · Status · Actions
- [ ] No open % or $ booked yet (P5)
- [ ] "Pause", "Resume", "Stop" actions per row (only Stop is destructive — confirmation modal)
- [ ] "View all" link if >5 campaigns

**Risk**: Campaign model in DB unverified — check schema for `Campaign` / `CampaignInstance`. If absent, this is a P0 schema task moved into P4. Verify in P0-T4 stub design.

---

### P4-T7: Wire all wizard entry points
**Files**:
- `app/clubs/[id]/intelligence/_components/iq-pages/CampaignsIQ.tsx` (`+ New Campaign` button)
- `app/clubs/[id]/intelligence/_components/iq-pages/CohortsIQ.tsx` (`Save + Create campaign` from builder)
- `app/clubs/[id]/intelligence/_components/iq-pages/CohortsIQ.tsx` (`→ Campaign` from AI-Suggested cards)
- `app/clubs/[id]/intelligence/_components/iq-pages/MembersIQ.tsx` (bulk toolbar `Send campaign`)
- `app/clubs/[id]/intelligence/_components/AIInsightRibbon.tsx` (`Create cohort + campaign`)

**Depends on**: P4-T1 through P4-T5
**Effort**: 2–3h
**Acceptance**:
- [ ] All 5 entry points open wizard with appropriate pre-filled state
- [ ] Each entry sets the correct Step 1 selection (saved cohort / AI-suggested / build new)

**Risk**: Conflicts in pre-fill state logic — define one shared `WizardLaunchOptions` type early.

---

## 7. Phase 5 — Closing the loop

> **Goal:** Real attribution numbers flow. Cohort↔Campaign relationship tracked. Daily snapshots run.
> **Total effort:** 3–5 days.

### P5-T1: Daily MemberHealthSnapshot cron
**Files**:
- `app/api/cron/health-snapshot/route.ts` — NEW
- `vercel.json` (add cron schedule)
- `lib/ai/member-health.ts` (extend with `snapshotAllActiveMembers(clubId)`)

**Depends on**: none (can run anytime in P5)
**Effort**: 3–4h
**Acceptance**:
- [ ] Vercel cron runs daily at 03:00 UTC, hits `/api/cron/health-snapshot`
- [ ] Endpoint loops all clubs, snapshots every active member's healthScore + riskLevel + lifecycleStage
- [ ] Idempotent — re-running same day overwrites today's row, doesn't duplicate
- [ ] Rate-limit guard: skip clubs with no member changes since last snapshot (saves DB writes)
- [ ] Logged to existing observability (Vercel logs)

**Risk**:
- Vercel cron auth — protect endpoint with `CRON_SECRET` header
- Performance for clubs with 5K+ members — batch in 500-member chunks

---

### P5-T2: Cohort↔Campaign linkage in DB
**Files**:
- `prisma/schema.prisma` — add `Campaign` model (if absent) with `cohortId` FK and `attribution` JSON field
- SQL migration script (manual, since CLAUDE.md prohibits `prisma db push`)

**Depends on**: P4-T6 (Active Campaigns surfaces this)
**Effort**: 4–6h
**Acceptance**:
- [ ] Each campaign row has `cohortId` (nullable for legacy) + `cohortSnapshot` JSON (members at send time)
- [ ] `Cohort` row has computed `campaignCount` and `lastCampaignAt` (or via aggregate query)
- [ ] SQL migration in `prisma/migrations/` directory (manual file naming, run via `psql`)
- [ ] Backfill: existing campaigns get `cohortId = NULL`, no-op

**Risk**:
- Schema may already have Campaign model — verify before adding. If present, just add fields.
- SQL migration must respect UUID-vs-TEXT divergence noted in CLAUDE.md.

---

### P5-T3: $ attribution pipeline
**Files**:
- `lib/ai/attribution.ts` (already exists — extend)
- `server/routers/intelligence.ts` (`getCampaignAttribution` procedure)

**Depends on**: P5-T2
**Effort**: 6–8h
**Acceptance**:
- [ ] For each active/past campaign: compute `$ booked from this campaign` via attribution rule (last-touch within 14d window — confirm with team)
- [ ] AI-Suggested cohorts use same `estImpactCents` formula = projected attribution × member count × win rate
- [ ] Money Story widget on Dashboard (deferred but pipeline ready) reads from same source
- [ ] Tested on Chris Club historical data — produces sensible numbers

**Risk**: Attribution model is tricky — locking on "last-touch within 14d" is a simplification. Document in code that this is v1.

---

### P5-T4: Active Campaigns table — real metrics
**Files**:
- `app/clubs/[id]/intelligence/_components/ActiveCampaignsTable.tsx`
- `server/routers/intelligence.ts` (extend `listActiveCampaigns` with metrics)

**Depends on**: P5-T3
**Effort**: 3–4h
**Acceptance**:
- [ ] Columns: Name · Cohort · Channel · Sent · **Open %** · **Booked $** · Status · Actions
- [ ] Numbers update in real-time (poll every 60s or via tRPC subscription if available)
- [ ] Hover on Booked $ shows breakdown (members who booked + amount each)

**Risk**: Open rate requires email tracking pixel — confirm existing send infrastructure supports this. If not, drop Open % from v1 metrics.

---

### P5-T5: Campaign History collapsed accordion + dead code cleanup
**Files**:
- `app/clubs/[id]/intelligence/_components/iq-pages/CampaignsIQ.tsx`
- Cleanup: `grep -r "ReactivationIQ\|reactivation" app/ lib/ server/` — remove all dead references

**Depends on**: all P5
**Effort**: 2–3h
**Acceptance**:
- [ ] Campaign History section renders as collapsed accordion at bottom of Campaigns page
- [ ] Header: "9 past campaigns · $X total revenue attributed"
- [ ] Expand reveals table of past campaigns sorted by recency
- [ ] All Reactivation-only tRPC procedures with no remaining callers — delete
- [ ] Final `git grep -i reactivation` shows only intentional references (e.g., goal name in wizard templates)

**Risk**: Don't delete tRPC procedures used by Phase 4 wizard or P3 generators. Check all callers before each deletion.

---

## 8. Cross-cutting

### CC-1: Live Mode global badge
**Owner phase**: Phase 1 (P1-T6, optional add-on after P0-T3 audit)
**Files**:
- `app/clubs/[id]/intelligence/_components/iq-layout/IQHeader.tsx` (or equivalent)
- `app/clubs/[id]/intelligence/_hooks/use-live-mode.ts` — NEW

**Acceptance**:
- [ ] Badge visible in header on all Engage pages: yellow `🟡 Live mode: OFF` or green `🟢 Live mode: ON`
- [ ] Click shows quick toggle modal (admin only)
- [ ] State sourced from a single hook, used by Wizard Step 4 launch button (P4-T5)

---

### CC-2: Member Detail drawer single source of truth
**Owner phase**: Phase 2 ships it (P2-T4), Phase 3+ reuses
**Acceptance**:
- [ ] All member-row clicks across Members / Cohorts (preview list) / Campaigns (cohort drilldown) use the same `<MemberDetailDrawer />`
- [ ] No duplicate "member detail" components anywhere

---

### CC-3: $ attribution single formula
**Owner phase**: Phase 5 (P5-T3)
**Acceptance**:
- [ ] One function `computeEstImpactCents({ memberIds, action, period })` in `lib/ai/attribution.ts`
- [ ] Used by: AI-Suggested cohorts, AI-Recommended campaigns, Wizard preview, Active Campaigns table, Money Story widget

---

## 9. Schema changes summary

Per CLAUDE.md: **never `prisma db push`**. All migrations are SQL only.

| Phase | Change | File |
|---|---|---|
| P3 | New table `ClubSuggestedCohortCache` (cache of generator output) | `prisma/migrations/202604_add_suggested_cohort_cache.sql` |
| P3 | Add `isDynamic Boolean @default(true)` on `ClubCohort` | `prisma/migrations/202604_add_cohort_isdynamic.sql` |
| P5 | `Campaign` model fields: `cohortId UUID NULL`, `cohortSnapshot JSONB`, `attribution JSONB` | `prisma/migrations/202604_campaign_cohort_link.sql` |

After each SQL migration: update `prisma/schema.prisma` to match, then `prisma generate` (NOT push). Type drift between schema.prisma and DB tracked via `prisma migrate status` only.

---

## 10. Acceptance criteria per phase (release gates)

A phase merges to `rgdev` when ALL its task ACs pass + the phase-level gate below.

### Phase 0 gate
- `npm run build` passes
- `npm run typecheck` passes
- `Settings → Automation` page accessible to admin, blocked for director

### Phase 1 gate
- Reactivation menu item gone
- Settings → Automation contains AC Layer with full functionality
- Campaigns page top section is AI-Recommended (not AC Layer)
- Visual smoke: 5 screenshots before/after — Reactivation off, Settings populated, Campaigns reordered

### Phase 2 gate
- Members default view = List
- All 5 KPIs render with correct deltas (or `—` if no history)
- Bulk select + "Add to cohort" works end-to-end
- Member Detail drawer opens via row click + URL param

### Phase 3 gate
- 3 AI-suggested cohorts visible on Cohorts page with $ impact
- Cohort Builder saves cohort with ≥2 conditions
- "Save + Create campaign" handoff works (redirect or wizard)

### Phase 4 gate
- "+ New Campaign" opens wizard
- Full happy-path: pick AI-suggested cohort → reactivate goal → AI-generated message → schedule → Live Mode ON → Launch
- Active Campaigns table shows the launched campaign

### Phase 5 gate
- Daily cron writes snapshots for ≥1 day
- Active Campaigns shows Open % and Booked $
- `git grep -i reactivation` is clean of dead code

---

## 11. Risk register

| ID | Risk | Phase | Mitigation |
|---|---|---|---|
| R1 | `MemberHealthSnapshot` event-driven gaps cause noisy deltas | P2 | Compare period averages, not point-in-time. Cron in P5 closes gap. |
| R2 | Settings page structure unverified — admin gate may not exist | P0 | P0-T2 starts with read-only audit before writing |
| R3 | Campaign model in schema unverified | P4 | P0-T4 stub design surfaces this; promote to P0 task if absent |
| R4 | LLM cost spike from auto-Generate AI profiles | P4 | D6 caps at 50 members auto, button >50 |
| R5 | Legacy brand users discover broken Reactivation link | P1 | P1-T2 keeps legacy page rendering; only iqsport branch redirects |
| R6 | Bulk send campaign before P4 wizard exists | P2 | P2-T3 disables `Send campaign` button with tooltip until P4 |
| R7 | Cohort Builder slow preview on 5K+ member clubs | P3 | Cap evaluation at 1000, show "1000+ matches" |
| R8 | Open rate tracking pixel not in current send pipeline | P5 | Drop Open % from v1 if absent, ship Booked $ alone |
| R9 | "Save + Create campaign →" before P4 lands | P3 | P3-T4 ships as redirect first, upgrades to wizard call |
| R10 | Reactivation tRPC procedures get deleted while still referenced | P5 | P5-T5 final cleanup runs `grep` before each delete |

---

## 12. File-touch matrix

> Quick lookup: for each file, which tasks touch it. Helps spot merge conflicts during parallel development.

| File | Phases / Tasks |
|---|---|
| `app/clubs/[id]/intelligence/_components/iq-pages/MembersIQ.tsx` | P2-T1, P2-T2, P2-T3, P2-T4, P2-T6, P2-T7, P4-T7 |
| `app/clubs/[id]/intelligence/_components/iq-pages/CohortsIQ.tsx` | P3-T2, P3-T6, P4-T7 |
| `app/clubs/[id]/intelligence/_components/iq-pages/CampaignsIQ.tsx` | P1-T3, P1-T4, P1-T5, P4-T6, P4-T7, P5-T5 |
| `app/clubs/[id]/intelligence/reactivation/page.tsx` | P1-T2 |
| `app/clubs/[id]/intelligence/_components/iq-pages/ReactivationIQ.tsx` | P1-T2 (delete) |
| `app/clubs/[id]/intelligence/_components/iq-layout/IQSidebar.tsx` | P1-T1 |
| `app/clubs/[id]/settings/automation/page.tsx` | P0-T2, P1-T3 |
| `server/routers/intelligence.ts` | P0-T4, P2-T1, P2-T5, P3-T1, P3-T3, P5-T3, P5-T4 |
| `lib/ai/intelligence-service.ts` | P2-T1, P2-T5 |
| `lib/ai/campaign-engine.ts` | P4-T4 |
| `lib/ai/attribution.ts` | P5-T3 |
| `lib/ai/cohort-generators/*` | P3-T1 |
| `lib/ai/campaign-templates/*` | P4-T3 |
| `lib/ai/member-health.ts` | P5-T1 |
| `prisma/schema.prisma` | P3 (cohort cache + isDynamic), P5 (Campaign linkage) |
| `app/api/cron/health-snapshot/route.ts` | P5-T1 (NEW) |
| `vercel.json` | P5-T1 |
| `CLAUDE.md` | P0-T5 |

---

## 13. Open items / future work (out of this spec)

- Dashboard redesign (PLAN §11) — separate spec when Phase 5 lands
- LLM-narrative AI Insight ribbon v2 (P2-T5 ships rules-based v1)
- A/B test analytics module (Phase 4 ships toggle, deeper analytics later)
- Custom trigger expressions in Wizard Step 4 (v1 = 3 hardcoded options)
- Sequence Chains visualization (currently in CampaignsIQ, may need to move into Wizard or Campaigns secondary tab)
- Lookalike Audience Export — currently on Cohorts page; decide in Phase 3 whether to keep, move, or hide

---

**End of spec.**
