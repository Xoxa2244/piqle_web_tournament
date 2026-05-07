# Programming IQ — Scoring & Pipeline Refactor

> **Branch:** `rgdev` (caught up to Sol2 as of `3c462de4`).
> **Goal:** rebuild the Programming IQ scheduler from idea-driven to slot-driven, and replace the current scoring math with a model that actually optimises the stated business goal: *maximise player attendance and engagement*.
> **Status:** design brief, no code yet.

---

## 0. Why this exists

### Original symptom
A 24-court club running "Fill idle hours" preset got **14 suggestions**. With ~150 idle court-hours per week, that's ~9% slot coverage. Operator interpretation: "the AI gave up". Engineering interpretation, after digging: the scoring + selection pipeline systematically **stops trying** when the easy candidates run out, and never asks "what about the empty courts I haven't filled yet?".

### Quick fixes already shipped (Sol2)
- **Шатса pass:** aggressive deltas on `FILL_IDLE_HOURS` preset (`selectionScoreFloor -4`, `experimentalScoreFloor -8`, `maxExperimentalSlots 5`, several penalty relaxations). Took IPC East from **7 → 17 suggestions** in Auto mode, and from a default 14 toward more ideas with the preset on.
- **Risk pass (mine):** second pass after greedy selection promotes weak-but-plausible candidates (score in `[riskScoreFloor, selectionScoreFloor)`) to a new `risk` cell kind, capped at `maxRiskCells`. Surfaced as amber "Backup ideas" in UI. Score is computed against an empty `selected` array so diversity penalty doesn't kill candidates the pass exists to save.

### Why these aren't enough
Both fixes are calibration patches. They live on top of the same **idea-driven greedy** architecture and the same **scoring formula** which:
- starts from a list of "ideas the planner already generated" — never from "empty slots that need filling"
- terminates with `if (bestScore < floor) break` on the global candidate set
- weights signals that don't correlate with the business goal
- carries hard blockers that prevent natural patterns like "run the same hot session in parallel on 4 courts"

This document spells out everything we found and proposes a clean refactor target.

---

## 1. Deep audit of the current scoring math

All references are to file/line on `lib/ai/programming-iq-scheduler.ts` and `lib/ai/programming-iq-strategy.ts` and `lib/ai/advisor-programming.ts` as of commit `3c462de4`.

### 1.1 Pipeline shape today

```
buildAdvisorProgrammingPlan (advisor-programming.ts)
  ├── 7-signal scoring across history + interest + audience + ...
  ├── buildExpandPeakProposals  → top-12 "expand existing demand"
  └── buildGapFillProposals     → up to 132 "fill empty slots"
                                  → MUST PASS:
                                    demand >= behaviorProfile.fillGapMinDemand (3)
                                    AND (no supply OR supply.avgOccupancy >= 68)
            ↓
buildWeeklyGrid (programming-iq-scheduler.ts:1431)
  ├── strategyProfile = goal weights + behavior thresholds (preset deltas applied)
  ├── plan.proposals → rankedProposals (after diversifyAgainstPreviousSuggestions)
  ├── expanded = duplicates + same-slot variants
  ├── selectBalancedProposals (greedy, score floor)         ← Step 3
  ├── risk pass [mine, 2026-05-06]                          ← Step 3.5
  ├── assignCourtsToProposals (bin-pack)                    ← Step 4
  └── emit cells (suggested / risk / conflict)              ← Step 5
```

### 1.2 The score function — full breakdown

`getGreedySelectionScore(proposal, selected, context)` returns a weighted sum:

```
total = (
  demandFit          × 24 +
  utilization        × 18 +
  audienceProtection × 18 +
  portfolioBalance   × 14 +
  operationalFit     × 18 +
  adminIntent        × 0    // 0 unless pinned or admin prompt
) / 100

⇒ Σweights = 92 (max possible ~92, "floor" 62 = 67% of max)
```

Each goal expanded:

```
demandFit = clamp(0..100,
    proposal.confidence       × 0.6 +
    proposal.projectedOccupancy × 0.2 +
    interestPressure          × 0.2 +
    gapBehaviorAdjustment            // only when source='fill_gap'
)

utilization = clamp(0..100,
    proposal.projectedOccupancy × 0.7
    + (source === 'fill_gap' ? 16 : 6)
    + (isOffPeak ? 8 : 0)
    + gapBehaviorAdjustment × 0.45
)

audienceProtection = clamp(0..100,
    100 - conflictPenalty × 1.4
        - (portfolioPenalty >= BLOCKED ? 55 : portfolioPenalty × 0.6)
)

portfolioBalance = clamp(0..100,
    100 - (portfolioPenalty >= BLOCKED ? 60 : portfolioPenalty × 1.1)
)

operationalFit = clamp(0..100,
    100 - conflictPenalty × 1.2
)

adminIntent = pinned ? 100 : matchScoreAgainstAdminPrompt
```

### 1.3 Findings — 8 distinct issues

#### F1. Signal collinearity → 6 goals are really 3 axes
`projectedOccupancy` lives in **demandFit (×0.2)** and **utilization (×0.7)**. Combined weight share = (24×0.2 + 18×0.7) / 92 = **19% of total** for one input.

`conflictPenalty` lives in **audienceProtection (×1.4)** and **operationalFit (×1.2)**. Combined weight share ≈ **36% of total**.

`portfolioPenalty` lives in **audienceProtection (×0.6)** and **portfolioBalance (×1.1)**. Combined weight share ≈ **31% of total**.

The "6 goals × ~17% each" UI suggests pluralistic optimisation. The math says: **3 collinear axes** (occupancy, conflicts, dedup) wearing 6 hats. Tuning weights without consolidating them is mostly cosmetic.

#### F2. The business goal — *engagement* — is not in the formula
The stated goal is "maximise player attendance and **engagement**". Engagement, properly modelled, includes:
- **Acquisition** — does this session attract new / probationary / inactive members?
- **Retention** — does it keep at-risk members from churning?
- **Frequency uplift** — does it raise sessions-per-month for a member?
- **Skill progression** — does it move beginners → intermediate → competitive?
- **LTV / revenue** — does the session class drive paid clinic / league signups?

Today's score uses **none** of these. It optimises *expected immediate occupancy*, which is a proxy for **attendance** but not for **engagement**. Choosing between (A) Open Play with 8 regulars and (B) Beginner Clinic with 6 attendees including 3 first-timers, the formula picks A — but B is the engagement-better option.

The data exists (`MemberHealthSnapshot.riskLevel`, `User.joinedAt`-equivalent, booking history per member, attribution events) — it just doesn't reach the scorer.

#### F3. Subtractive baseline pumps neutral ideas through the floor
Three of the six goals start at `100 - penalty`:
```
audienceProtection : 100 - conflict*1.4 - portfolio*0.6
portfolioBalance   : 100 - portfolio*1.1
operationalFit     : 100 - conflict*1.2
```

A proposal with **zero conflicts and zero portfolio dedup** scores `100 + 100 + 100` on these three axes, contributing `(100+100+100) × (18+14+18) / 100 = 50` to the total **for free**.

So a candidate with zero demand signal that simply doesn't conflict with anything starts at **50**, needs only **12 more points** from demand+utilization to clear the **62 floor**. With `noSupplyHistoricalScore = 50` baseline kicking in for fill_gap candidates, that 12 is trivial. **The floor is much weaker than it looks** — and yet the pipeline still fails to fill empty slots, which tells you the binding constraint isn't the score floor at all (see F4).

#### F4. Hard pre-filters in the candidate generator block fill-idle by design
In `buildGapFillProposals` (advisor-programming.ts:1247–1248):
```ts
if (demand < minDemand) continue            // minDemand = 3 (default)
if (supply && supply.sessionCount > 0 && slotAvgOccupancy < minExistingOccupancy)
  continue                                   // minExistingOccupancy = 68 (default)
```

**Translation:**
1. A slot with fewer than 3 historical demand signals is **dropped before scoring**.
2. A slot that previously hosted under-attended sessions (avg < 68% occupancy) is also **dropped before scoring**.

For the very clubs we want to help — thin history, under-utilised courts — this filters out **most of the empty grid**. The "Fill idle hours" preset pushes `fillGapMinDemand` from 3 to 1 and `existingSlotMinOccupancy` from 68 to 54, but candidates that fail these filters never enter the score function at all. **Score weights are debating ideas that the generator already declined to produce.**

#### F5. `canShareWindow` blocks parallel sessions in the same time window
`getPortfolioPenalty` calls `canShareWindow` (line 955). It returns `false` (= blocked) when another selected proposal occupies the same `(dayOfWeek, timeSlot)` window — except via narrow exceptions:
- A second slot copy is allowed only if `projectedOccupancy ≥ secondCourtDuplicationThreshold` (default 92)
- Pinned proposals get a window slot regardless
- Non-pinned proposals **cannot share the window with anything already selected**

On a 24-court club with 4.0 Open Play hot at Tuesday 7pm, the natural answer is "run it on 4 courts". The scheduler answers "we have it once, the other 3 courts can be empty". `secondCourtDuplicationThreshold = 92` means we only ever duplicate on demand near saturation — exactly the case where the *first* court is already fine and duplicating is least valuable.

#### F6. Hard constraints (operating hours, court availability) live downstream of scoring
Scoring runs first → `assignCourtsToProposals` runs second → if no court works, the proposal becomes a `conflict` cell ("This idea could not be placed because every active court already has a conflicting live or suggested session in that window.").

Two problems:
- The score function lies about feasibility. A proposal can score 85 and then fail placement.
- We can't use feasibility as a hard gate inside the scorer (e.g. "min(constraints) × demand_score") because feasibility isn't known yet.

The bin-packer should either run before scoring (score only over feasible candidates) or hard constraints should be precomputed per (slot × court) into a lookup the scorer can consult.

#### F7. `audienceProtection` doesn't protect the audience
The variable name promises "don't over-target the same members". The math is `100 - conflictPenalty - portfolioPenalty` — only *grid-level* conflicts and dedup. Actual member-level saturation (e.g. "this member already received 4 invites this week") lives in `supplyDemandCheck` which runs in **Step 7** of the pipeline, *after* cells are emitted, and only flags cells with warnings — it doesn't re-rank or remove them.

The naming hides this. Operators reading "audience protection: 95%" think the audience is protected. It isn't, in any member-level sense.

#### F8. Magic numbers, no calibration
Every threshold is asserted, not learned:
- `selectionScoreFloor: 62`
- `experimentalScoreFloor: 56`
- `maxExperimentalSlots: 0` (baseline) / `5` (FILL_IDLE_HOURS)
- `riskScoreFloor: 42`
- `secondCourtDuplicationThreshold: 92`
- `fillGapMinDemand: 3`
- `existingSlotMinOccupancy: 68`
- weight ratios `24 / 18 / 18 / 14 / 18 / 0`

There is no recorded calibration against historical attendance / engagement outcomes. If a session published last year actually filled 60%, did it score 70 in this formula at the time? We don't know — the relationship between the score and any real outcome was never measured.

---

## 2. What we want instead — design target

### 2.1 Goal restated mathematically

```
maximize over (week schedule W):
    Σ (over slots s in W)  attendance(s) × engagement_quality(s)
subject to:
    feasibility(s) holds for each placed slot
    member_saturation(W) <= invite_cap_per_member
```

Where:
- `attendance(s)` ≈ `projectedOccupancy(s) × maxPlayers(s)` — already roughly modelled
- `engagement_quality(s)` is composite: `α × P(new_member_attends) + β × P(at-risk_attends) + γ × P(frequency_uplift) + δ × revenue_per_attendee`. Coefficients α…δ to be calibrated.
- `feasibility(s)` is a hard 0/1: court available, hours match, instructor (if needed), equipment.
- `member_saturation` is the Σ-of-invites-per-member view that today only triggers warnings post-hoc.

### 2.2 Pipeline shape — slot-driven, not idea-driven

```
buildWeeklyGrid v2:
  [1] Compute the GRID:
        for each (court, day, hour-bucket):
          status = LIVE / SUGGESTED-by-prev-pass / EMPTY
        feasibility cache: which (slot, format, skill) combos are physically possible
                            (operating hours, court type, instructor availability)
  [2] Generate candidate space (UNFILTERED, no minDemand gate):
        for each format × skill × time-bucket × day:
          one "shape" — does not have to have history
        cardinality bounded by ~6 formats × 5 skills × 14 hours × 7 days × 24 courts
        ≈ 706k shapes, but indexed by slot key, never enumerated naively
  [3] For each EMPTY slot in the grid:
        candidates_for_slot = shapes feasible for this (court, day, hour)
        rank candidates by score_v2(candidate, slot, context)
        if best_score >= primary_floor:    emit as 'suggested'
        elif best_score >= risk_floor:     emit as 'risk'
        elif best_score >= explore_floor:  emit as 'explore' (new tier?)
        else:                               leave empty + record reason
        update member_saturation tally so next slot decisions account for it
  [4] (optional) Greedy local-search swap pass:
        try k random swaps; keep if total objective increases
  [5] Emit cells with full provenance
```

Two big shifts:
- **Iteration unit changes from proposal → empty slot.** "How do I fill this slot?" is the per-iteration question, not "is this idea good enough overall?".
- **The score function compares candidates *for the same slot*.** Cross-slot comparisons happen at the schedule-objective level, not the per-decision level.

### 2.3 Scoring v2 — three-axis form, business-aligned

Replace the 6-goal weighted sum with three orthogonal dimensions:

```
score_v2(candidate, slot, context) =

    feasibility_gate(candidate, slot)           // 0 or 1, hard
    × demand_value(candidate, slot)             // 0..100, expected attendance
    × engagement_multiplier(candidate, slot)    // 0.6..1.4, up- or down-weights
                                                  by acquisition / retention /
                                                  frequency / LTV signals

  - portfolio_dedup_penalty(candidate, schedule_so_far)  // subtractive
  - member_saturation_penalty(candidate, schedule_so_far) // subtractive
```

Properties of this form:
- `feasibility_gate × X` is a hard gate. Infeasible candidates score 0 cleanly. No more "scored 85, failed placement".
- `demand_value` keeps the existing signal (history-derived projected occupancy + interest backlog), free of double-counting.
- `engagement_multiplier` is the new ingredient. It pushes up sessions that bring new players, retain at-risk, raise frequency, drive paid conversions. It pushes down sessions that just re-serve existing regulars who'd play anyway.
- Penalties are subtractive at the **schedule level**, not the proposal level. Once a candidate is placed, the next slot's scoring sees a higher portfolio penalty for similar shapes (encouraging diversity *across* the week without blocking parallel sessions in *the same* hot slot).

### 2.4 Configurable presets — strategy as algorithm, not weight tweak

Today `FILL_IDLE_HOURS` etc. are weight deltas on the same algorithm. After refactor:

- **Auto mode** = balanced run of the slot-driven pipeline with default thresholds.
- **Fill idle hours** = aggressive `risk` and `explore` floors; relax `engagement_multiplier` lower bound; bias toward off-peak slots.
- **Follow member demand** = tight floor; engagement_multiplier ignored; pure attendance maximisation. Smallest, safest schedule.
- **Balance the week** = cross-slot diversity bonus (no two same-shape slots within N hours/days).
- **Test new ideas** = engagement_multiplier weighted higher; explore-tier output preferred even when suggested-tier exists.
- **Protect audience** = tight `member_saturation_penalty` even if demand is high.

Each preset is a **named pipeline configuration**, not a magic-number tweak. Documented, A/B-testable, individually unit-tested.

### 2.5 New cell tiers

Today: `live` / `suggested` / `risk` / `conflict` / `saturation` / `empty`.

After refactor:
- `live` — unchanged
- `suggested` — high score, recommend for publish
- `risk` — middle score, surfaced with caveat (already exists, expand semantics)
- `explore` — *new*. Below risk floor but above explore floor. Surfaced with explicit "experimental — try and measure" framing. Different visual; admin sees "we don't know if this works, but the slot was empty and the data hints it's worth testing."
- `empty` — leave intentionally empty + reason ("no feasible candidate", "all candidates over saturation cap", "outside operating hours"). Admin sees *why* a slot is blank.
- `conflict` — unchanged, off-grid pile of candidates that lost placement.

The `empty` tier is important: it transforms the grid from "unfilled = bug" to "unfilled = decision". Operators currently squint at empty cells and assume the AI failed. The new mode says: "we considered this slot and chose not to fill it because X."

---

## 3. Data we need that we don't fully have

For `engagement_multiplier` and `member_saturation_penalty` to mean anything, we need to feed real signals into them. Inventory of what's there vs what isn't:

| Signal | Source today | Status |
|--------|--------------|--------|
| Historical attendance per (format, skill, time) | `play_session_bookings` | ✅ rich |
| Member health / risk level | `member_health_snapshots` | ✅ rich (since the recent fix to generators) |
| Member play preferences | `user_play_preferences` | ⚠️ sparse on real clubs (often 0) — implicit-from-bookings fallback needed (we already have this pattern in cohort generators) |
| Interest requests | `session_interest_requests` | ⚠️ sparse |
| Audience profile aggregate | `audience_profile` (advisor-programming) | ⚠️ depends on prefs |
| New-member flag | `users.createdAt` + `club_followers.createdAt` | ✅ available (some prod columns are camelCase, see uuid-cast saga) |
| Per-member booking frequency | derived from bookings | ✅ derivable |
| Revenue / LTV per session | `play_sessions.pricePerSlot` × bookings | ✅ derivable, currently unused in scoring |
| Conversion rate (suggested → published → attended) | none today | ❌ **need new tracking** |
| Engagement outcome by session class (return rate after first attend) | none aggregated | ❌ **need backfill query + new aggregator** |

The two missing pieces are the most valuable for calibration. Without them we ship an opinionated `engagement_multiplier` and tune by eye. With them we run a backtest: "if scoring v2 had been live 6 months ago, would the sessions it picked have outperformed the ones we actually ran?"

---

## 4. Implementation plan — phased, on `rgdev`

### Phase A — Instrumentation (no behaviour change)

**Why first:** without it we have no objective way to know whether v2 is better than v1.

- **A.1** Add `programming_iq_decision_log` table. One row per (slot, candidate considered, score breakdown, chosen / rejected, reason). Persist a sample (e.g. 10% of decisions) on every `buildWeeklyGrid` call.
- **A.2** Add `programming_iq_outcome_log` aggregator. Daily cron: for each published Programming IQ suggestion that's now in the past, record actual attendance / no-show count / new-vs-regular split.
- **A.3** Surface a `programmingIQDiagnostics` tRPC procedure that returns: per-club, last 90 days, aggregate of suggestion-level outcomes (precision = % of suggestions that hit ≥ 50% capacity, recall proxy = % of empty slots covered).

**Acceptance:** running buildWeeklyGrid produces a decision log entry. Daily cron writes outcome rows for last week's already-played sessions. Diagnostics endpoint returns non-zero numbers on a club with real history.

### Phase B — Pipeline inversion (slot-driven, scoring unchanged)

- **B.1** Introduce `buildEmptySlotMap(courts, week, liveSessions, timezone)`: returns `Set<(courtId, dayOfWeek, hourBucket)>` of EMPTY slots after subtracting live sessions.
- **B.2** Introduce `buildFeasibilityCache(courts, historicalSessions)`: per slot, the set of `(format, skill)` combinations that are feasible (operating hours, court type).
- **B.3** Rewrite `buildWeeklyGrid` to iterate over empty slots. For each slot: pull candidates whose `(dayOfWeek, timeSlot)` matches, rank them by **the existing** `getGreedySelectionScore` against an empty selected set (see fix shipped in `4d7f67d7` — reuse the same insight). Apply the existing floor → suggested. Below floor and above riskFloor → risk. Below riskFloor → leave empty.
- **B.4** Bin-packer becomes a no-op for the new path (slots are already court-assigned by step B.1). Old path retained for now behind a feature flag for easy rollback.
- **B.5** Add `kind: 'explore'` and `kind: 'empty-with-reason'` cell types end-to-end (server → tRPC → UI). Risk pass collapses into the new explore tier.

**Acceptance:** on IPC East with FILL_IDLE_HOURS, total cells emitted ≥ 30% of empty slots (vs current single-digit %). Existing tests still pass; new tests cover slot iteration order, feasibility cache correctness, and the empty-with-reason path.

### Phase C — Scoring v2 (engagement multiplier)

- **C.1** Implement `engagement_multiplier(candidate, slot, context)` returning 0.6..1.4. Initial heuristic version (no calibration yet):
  - +0.1 for each of: targets a segment with ≥ N at-risk members; new-member-attractive format (Beginner / Open Play 2.5–3.0); off-peak in a calendar where a similar slot has converted before.
  - -0.1 for each of: serves only existing regulars (no new-member uplift); same-shape session within 24 hours on the same week; class with declining historical attendance.
- **C.2** Replace the 6-goal weighted sum with the new three-axis form: `feasibility_gate × demand_value × engagement_multiplier - penalties`.
- **C.3** Wire member-saturation as a real penalty (currently a post-hoc warning). Each placed slot increments expected invites for matching segments; subsequent slots see higher penalty. Cap from `inviteCapPerMemberPerWeek` becomes hard.
- **C.4** Migrate presets from "weight deltas" to "named pipeline configurations" (FILL_IDLE_HOURS = lower risk floor + lower explore floor + off-peak bonus, etc.).

**Acceptance:** on a synthetic test club with skewed member health, scoring v2 selects ≥ 30% more sessions targeting at-risk members compared to v1, without dropping aggregate projected attendance.

### Phase D — Calibration backtest

- **D.1** Backtest harness: feed `buildWeeklyGrid_v2` a frozen 6-month-old club state and compare its picks to what was actually published + attended.
- **D.2** Tune coefficients (α, β, γ, δ inside `engagement_multiplier`) to maximise correlation with observed outcomes (precision @ ≥ 50% capacity, retention curve of attendees over next 60 days).
- **D.3** Lock the calibrated coefficients into a versioned `behaviorProfile.scoringModelVersion` so rollback is one config change.

**Acceptance:** backtest shows scoring v2 with calibrated coefficients beats v1 on at least two of: { precision, recall, retention-uplift }.

### Phase E — Migration & rollout

- Ship behind a per-club `programmingIQEngine: 'v1' | 'v2'` flag.
- Default `v1` for everyone initially, opt in `v2` for IPC East / IPC South / Sol2 test clubs first.
- Daily diagnostics dashboard shows v1 vs v2 side-by-side metrics on opted-in clubs.
- Two weeks of stable improvement → flip default to v2.
- One month after default flip → delete v1 path.

---

## 5. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Slot-driven iteration scales poorly on 24-court × 7-day × 14-hour grids (~2400 slots) | Pre-index candidates by `(dayOfWeek, hourBucket)` for O(1) per-slot lookup. With ~700 candidate shapes max, total work ≈ 1.7M index hits — sub-second on Vercel. Profile in Phase B. |
| `engagement_multiplier` based on heuristics is wrong and silently regresses | Behind feature flag, always run both engines on opted-in clubs and store comparison in decision log. Roll back per-club instantly if precision drops > 10%. |
| Removing `canShareWindow` blocker floods the grid with parallel sessions | Replace with a soft penalty on `member_saturation` (scale by interest-pool size). Member pool is the real constraint, not "one session per window". |
| Backtest has no ground truth for "engagement uplift" because today's bookings already reflect today's algorithm | Use natural experiments: compare clubs where Programming IQ was off / minimally used vs heavily used. Imperfect but directional. |
| Calibration over-fits to historical data and recommends only known-safe slots | Add an explicit explore-tier budget: ~10% of recommended cells must score in explore range, even if better-scored candidates exist. Forces ongoing exploration. |
| The refactor is large and we ship nothing to operators for weeks | Phase A ships diagnostics that operators can use immediately. Phase B ships visible improvement (more slots filled). C, D, E layer on. |

---

## 6. Success metrics

After Phase E rollout, measured per club over 4 weeks:

- **Coverage:** % of empty court-hours covered by a suggested or explore cell. Target ≥ 60% on clubs with thin history (vs ~5–10% today).
- **Precision @ publish:** % of published cells reaching ≥ 50% capacity within 7 days. Target ≥ 70% for `suggested` tier, ≥ 40% for `risk`, ≥ 25% for `explore`. (Each tier is allowed to be lower-precision; that's the point of the tier.)
- **Engagement uplift:** % increase in sessions attended by members in the at-risk health segment, week-over-week, vs previous 4 weeks. Target ≥ 20%.
- **New-member acquisition:** % of new bookings from members joined < 30 days ago. Target ≥ 15%.
- **Operator trust:** % of suggested cells published as-is (proxy for "the AI is suggesting things I'd have suggested"). Target ≥ 60%.

If after Phase E the diagnostics show <50% coverage on thin-history clubs, the refactor missed its main target and we re-open the design.

---

## 7. Out of scope for this refactor

- LLM-based regenerate prompts ("less Open Play, more drills on weekdays") — keep the existing `interpretRegeneratePrompt` path. It overlays on top of whichever engine version runs.
- Live optimisation suggestions (move/replace existing live sessions) — current logic in `buildLiveOptimizations` stays as-is until Phase D.
- Multi-week / quarterly planning — single-week scope only.
- Auto-publishing of suggestions without operator review — never, full stop.

---

## 8. Open questions for product before we start

1. **Engagement coefficients (α, β, γ, δ)** — even before backtest, what's the priority order between (acquisition / retention / frequency / LTV)? Default assumption: retention > acquisition > frequency > LTV. Confirm with growth team.
2. **Explore tier budget** — should it be an absolute cap (max 5 explore cells / week), a fraction (10% of cells), or an opt-in toggle? Default proposal: 10% fraction, configurable per club.
3. **Empty-with-reason cells** — show in the grid (occupies space) or list separately ("we left these slots empty because…")? Default proposal: list separately to avoid visually-cluttered grid.
4. **Calibration data scope** — do we have permission to backtest against IPC East / IPC South real attendance data, or only synthetic? If real, do we need to anonymise the decision log?
5. **Risk tier rename** — historically `risk` meant "audience saturation risk". My recent commit reused the name for something different ("weak signal — try anyway"). Time to rename one or both. Proposal: keep `risk` for saturation (legacy), introduce `backup` for weak-signal candidates. (Already partially done in UI; consolidate now.)

---

## 9. Files this refactor will touch

- `lib/ai/programming-iq-scheduler.ts` — main pipeline, scoring, cell emit. Heavy rewrite.
- `lib/ai/programming-iq-strategy.ts` — preset definitions become pipeline configs, not weight deltas. Heavy rewrite.
- `lib/ai/advisor-programming.ts` — candidate generation. Drop `minDemand` / `minExistingOccupancy` hard filters; move to score-time soft penalties. Medium rewrite.
- `lib/ai/programming-iq-regenerate.ts` — minimal change, just point at v2 entry.
- `server/routers/intelligence.ts` — the tRPC `regenerate` / `getGrid` procedures pass through new fields. Light change.
- `app/clubs/[id]/intelligence/_components/iq-pages/programming/ProgrammingGrid.tsx` — render `explore` and `empty-with-reason` tiers. Medium change.
- `app/clubs/[id]/intelligence/_components/iq-pages/ProgrammingIQ.tsx` — KPI strip gains explore count and "intentionally empty" count. Medium change.
- `tests/lib/ai/programming-iq-scheduler.test.ts` — heavy expansion: per-tier coverage tests, slot iteration ordering, feasibility cache correctness, engagement multiplier unit tests.

New files:
- `prisma/schema.prisma` — add `programming_iq_decision_log` and `programming_iq_outcome_log` tables (Phase A).
- `migrations/programming-iq-decision-log.sql` — apply via SQL on dev + prod (per `CLAUDE.md`).
- `lib/ai/programming-iq-engagement.ts` — engagement_multiplier extracted as its own module so calibration can swap implementations.
- `app/api/cron/programming-iq-outcomes/route.ts` — Phase A daily aggregator.
- `scripts/programming-iq-backtest.ts` — Phase D backtest harness.
- `docs/PROGRAMMING_IQ_SCORING_REFACTOR.md` — this file.

---

## 10. Branch protocol

- All work on `rgdev`. Do not push to `Sol2` until Phase E rollout begins.
- `rgdev` is currently caught up with `Sol2` at `3c462de4` (merged 2026-05-07).
- Each phase ships as 1–4 commits with passing tests before the next phase starts.
- Decision log table goes live first (Phase A.1) so by the time we're tweaking scoring, we have something to measure against.
- Merge `rgdev → Sol2` only after Phase D backtest shows green metrics on at least one real club.

---

**Last updated:** 2026-05-07 by Claude on `rgdev`.
