# Operator Feedback Analysis — June 10, 2026

Source: "IQSport Platform Edit Suggestions" from a multi-location club operator (CourtReserve chain).
Verdict per item: **EXISTS** (live today — here's where) · **BUILDING** (in the current workstream queue) · **DEFERRED** (why).

Build branch: `feat/operator-feedback-2026-06` (off `sol2-lean`). Workstreams referenced below: WS1–WS7.

---

## 1. Membership Analytics

### 1.1 Split network vs non-network memberships — BUILDING (WS6)
Nothing user-facing exists today. The data model already links one person across clubs (one global `User` matched by email at sync time, a `ClubFollower` row per club), so "network member" is computable without new integrations. What's genuinely missing — and being built:
- A club-network grouping (new `club_networks` table + `clubs.network_id`).
- Per-club membership columns on `club_followers` (today `users.membership_type/status` are global and **last-sync-wins** across clubs — per-club tier data for multi-club members is unreliable by construction; WS6 fixes this at the sync layer).
- A network/single-club rollup tile and per-tier badge on Membership Health, plus a Network/Single-club member filter.
Cross-club detail stays aggregate-only by default (a club admin sees counts about sibling clubs, not their member lists).

### 1.2 Membership filters / Membership Dashboard — PARTIAL → BUILDING (WS7)
Exists today: Members page filters by exact membership type with live counts; Membership Health already compares all tiers on est. MRR, zombie %, power %, suspended %, bookings-per-active — over a fixed 30-day window.
Building: Membership Health becomes the membership dashboard — select two or more tiers and compare usage, revenue, activity, and retention over a chosen period, with per-tier time series. (A global membership filter threaded through every dashboard was considered and descoped: every engine is single-scope; the blast radius on a live product is too high for this round.)

### 1.3 Deeper membership tier insights — BUILDING (WS2)
Exists today: per-tier verdicts, zombie/power shares, est. MRR at risk, upsell-potential MRR; a backend bucket resolver (`getTierAudience`) that returns member IDs per bucket.
Building: click any tier → drawer with **All / Top attendees / Zombies / Power (upsell candidates) / Suspended**, members sorted by attendance, with per-member bookings-in-window, last visit, join date, and full member detail one click deeper.
Honesty note: "how much each member pays" = the tier's contracted catalog price. Actual payment transactions are not in the CourtReserve sync; revenue figures are contracted estimates and are labeled as such.

### 1.4 Date filter for membership reporting — BUILDING (WS1)
Exists today on Programming Health (7d/30d/90d/1y + custom). Membership Health is hardcoded to 30 days — WS1 adds 7d / 30d / Last month / Month-to-date / Year-to-date / Custom.
"Season-to-date": the platform has no season concept yet; YTD + custom range ship now, a per-club season start date is a follow-up.

## 2. Member Segmentation and Filtering

### 2.1 Advanced member filters — PARTIAL → BUILDING (WS3)
Exists today: 6 filter groups (Membership status, Membership type, Activity level, Health risk, Engagement trend, Value tier).
Building: a Profile filter tab — gender, age bands, skill level (+DUPR bands), location (city/zip), sessions-in-window min/max. The underlying data is already synced from CourtReserve; the segment engine already supports these fields — this is UI exposure, not new infrastructure. Combined filters already AND-compose, and any filter combination can be saved as an Audience.
"Multi-location usage" filter lands with WS6 (needs the network model).

### 2.2 Zombie / inactive member cohorts — BUILT, WAS GATED → SHIPPING (WS4)
The cohort engine, quick builder (inactivity days, sessions/month, trend, risk), presets, and save/list/dynamic re-evaluation are fully built and production-proven — they were hidden in the lean build. WS4 un-gates the section, renamed **"Audiences"**, and adds explicit presets with pinned definitions:
- **No-visit 7 / 14 / 30 days** — no confirmed booking in N days.
- **Zombie** — active membership AND no visit in 30 days (matches the Membership Health zombie definition).
- **Dropped-off** — engagement trend declining/churning (used to be active, faded).
- **Churn-risk** — health risk at-risk/critical.
Campaign sending stays gated; audiences are build-and-save in this round.

### 2.3 Location-based cohorts — BUILDING (WS6, after the network model)
Presets planned: "Has multi-club access, uses one location", "Visits only this location", "Stopped visiting here, active elsewhere" (= cross-location campaign candidates). Blocked on WS6a/6b (network grouping + per-club membership), so this ships in the network workstream, not before.

## 3. Programming Health

### 3.1 Event-type breakdown — ~90% EXISTS, gap is the graph (WS5)
Exists today: Programming Health already breaks down into 8 program families — Open Play, Court Bookings, Clinics & Training (includes drills), Private Lessons, Leagues, Events (includes tournaments), Youth, Equipment — each with sessions, participants, signups, fill %, and trend, expandable to per-program rows, each opening a dynamics line chart.
Building: the one missing piece — a single **compare-families graph** (all event types on one chart over the selected period).

### 3.2 Drill into individual events — BUILDING (WS5)
Exists today: the Schedule page has full per-session detail (players, est. revenue, fill recommendations) — but it isn't reachable from Programming Health.
Building: a Sessions tab inside the Programming Health drill — list of event instances (date, confirmed, cancellations, fill %, est. revenue), each expandable to the attendee list with membership-type mix, skill mix, repeat-attendance count, and "returned within 30 days after the event" %.
Honesty notes: **no-shows are not tracked** — the CourtReserve sync carries confirmed and cancelled bookings only, so the column is "Cancellations", not "No-shows". Revenue per event = price × confirmed bookings (estimate, labeled).

## 4. Product Goal — alignment

The stated objective (upsell detection, inactive identification, location utilization, programming performance, campaign targeting) matches the platform's positioning directly; items 1.3 (upsell candidates per tier), 2.2 (zombie audiences), and 3.2 (event-level economics) are the highest-leverage builds and are sequenced first alongside the date filter.

---

## Sequencing

| Order | Workstream | Feedback items | Size |
|---|---|---|---|
| 0 | This document | — | done |
| 1 | WS1 Membership Health date range | 1.4 | S/M |
| 2 | WS2 Tier drill-down | 1.3 | M |
| 3 | WS3 Advanced member filters | 2.1 | M |
| 4 | WS4 Audiences un-gate + inactive presets | 2.2 | S/M |
| 5 | WS5 Programming compare graph + event drill | 3.1, 3.2 | M |
| 6 | WS6 Network model + split + location cohorts | 1.1, 2.3, 2.1(multi-location) | L |
| 7 | WS7 Tier-compare dashboard | 1.2 | M |

Known platform constraints surfaced by this analysis (worth fixing upstream): per-club membership for multi-club members (WS6b), payment transactions not synced (blocks actual-revenue analytics), no-show/check-in data not synced (blocks true attendance-vs-booking analytics).
