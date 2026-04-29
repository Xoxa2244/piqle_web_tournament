# Engage Section — Redesign Plan

> **Owner:** Rodion + AI co-pilot
> **Branch context:** `rgdev` (synced with `origin/deviq` as of Apr 24, 2026)
> **Status:** Approved direction, ready for staged implementation
> **Scope:** Engage section (Members, Cohorts, Reactivation, Campaigns) + Sidebar + supporting Settings page. Dashboard redesign captured separately (see §11).

---

## 1. Why we're doing this

Today's Engage section is built as **4 disconnected pages with overlapping roles**, not as a sequential workflow:

```
Members      = people DB + KPIs + agent actions + list
Cohorts      = nearly empty page, "just segments"
Reactivation = at-risk dashboard + list + campaign trigger   ← duplicates Campaigns
Campaigns    = agent ops dashboard + AI Recommended (buried at the bottom)
```

Three structural problems:

1. **Reactivation is a special case of Campaigns** — it shouldn't have its own page.
2. **Cohorts are disconnected from Campaigns** — a director creates a cohort and then… what? There's no bridge from "segment" to "action".
3. **Members is overloaded** but **doesn't tell the story** about who's in the club (no trend, no anomaly narrative, no AI insight).

The mental model should be a **linear funnel**:

```
WHO ARE THEY?           WHO TO TALK TO?         WHAT TO SAY?
   Members        →        Cohorts        →       Campaigns
(database+health)      (AI-suggested+manual)   (AI-recommended+launch)
```

Reactivation as a separate menu item **disappears**. Its dashboard moves into Members, its list becomes a pre-built cohort ("At-Risk") inside Cohorts, and its action becomes one of the Campaign templates.

---

## 2. New sidebar structure

### Before

```
ENGAGE
  Members
  Cohorts
  Reactivation    ← removed
  Campaigns
```

### After

```
ENGAGE
  👥 Members        — who's in my club and what's happening to them
  🎯 Cohorts        — who I want to group for action
  📨 Campaigns      — what I say to them and what comes back
```

**Removed:** `Reactivation` (entire page)
**Moved:** `Agent Campaign Layer` → `Settings → Automation` (this is dev/ops, not for directors)

Other sidebar sections (`ANALYTICS`, `AI TOOLS`, `SYSTEM`) — **untouched**.

---

## 3. 👥 MEMBERS — rebuild

### 3.1 What's wrong now

| Problem | Concretely |
|---|---|
| Member cards are huge | 9 cards = entire screen. At 500 members it becomes **unusable** |
| Duplicate tabs | "At-Risk (1)" and "Reactivation (6)" — these are just filters, but built as separate tabs |
| Agent Actions eats space | 2 cards on half the screen for "Renew Expired (3)" + "Upsell Package (1)" |
| No AI narrative | Member segmentation shown, but **nothing explains what's happening** |
| KPIs feel disconnected | "19 active / 61 health / 13 VIP" — counters without any story |

### 3.2 New layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Members         360° member profiles · 22 total          [+ Add]  │
└─────────────────────────────────────────────────────────────────────┘

┌──────────── KPIs (compact strip) ────────────────────────────────────┐
│  19 Active   61 Avg Health   5 At-Risk   $X LTV total   13 VIP      │
│  of 22       ↗ +3 vs last    ↗ +2 ⚠      +$420 vs last   3 Package  │
└──────────────────────────────────────────────────────────────────────┘

┌──────────── 🤖 AI Insight (NEW) ─────────────────────────────────────┐
│  5 members shifted from Healthy → Watch this week.                   │
│  Primary cause: 80% drop in evening sessions for these players.      │
│  💡 [ Create cohort "Lost Evening Players" → ]   [ Dismiss ]         │
└──────────────────────────────────────────────────────────────────────┘

┌──────────── How Members Play (compact chart) ────────────────────────┐
│  [bar chart: members grouped by sessions/week]                       │
└──────────────────────────────────────────────────────────────────────┘

┌──────────── Members List ───────────────────── [Grid] [List] [Cards] │
│                                                                      │
│  [🔍 Search]  Sort: Health ▾   Filters ▾   Bulk: [Add to cohort ▾]   │
│                                                                      │
│  ┌───┬──────────────┬────────┬─────────────┬───────┬─────┬─────────┐│
│  │ A │ Alice Carter │ 81 ▓▓ │ VIP·Growing │  3/mo │ 2d  │ ⋯ Email │ │
│  │ K │ Kevin Lopez  │ 78 ▓▓ │ VIP·Growing │  2/mo │ 3d  │ ⋯ Email │ │
│  │ R │ Rodion Gorin │ 26 ▒░ │ Watch ⚠     │  1/mo │ 35d │ ⋯ SMS   │ │
│  │ ...                                                              │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  Showing 25 of 22 · [< 1 >]                                          │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.3 Keep as-is

- Title + description ("360° member profiles…")
- Period selector: Week / Month / Quarter / Custom
- "How Members Play" chart (play frequency)
- Search by name/email
- Sort controls (Health / Revenue / Sessions / Name)
- Filter pills (Activity / Risk / Trend / Value)
- "+ Add Member" button

### 3.4 Change

- **KPI strip:** drop `Guests / Drop-Ins 0` (uninformative); add `At-Risk` and `LTV total` → 5 meaningful KPIs with `vs last month` deltas
- **Default view:** **List** (compact rows) instead of Grid (giant cards). Grid stays as an option for working with 2-3 members
- **Member row in List:** 1 row = avatar + name + health bar + segment badges + sessions/mo + last play + $LTV + action menu (⋯)
- **Filters:** group into a sticky left panel, free up space for the list

### 3.5 Add

- **AI Insight ribbon** at top (narrative explanation of anomalies + CTA "Create cohort")
- **View mode toggle:** `[List] [Grid] [Cards]` in upper right of list
- **Bulk select:** checkbox per row + toolbar "Add to cohort ▾ / Send campaign ▾"
- **Row click → Member Detail drawer** (no page reload)
- **Churn trend** as a compact chart next to "How Members Play"

### 3.6 Delete

- Tab **"At-Risk (1)"** → becomes a saved filter in Filter pills (`RISK: At-Risk`)
- Tab **"Reactivation (6)"** → disappears with the entire Reactivation page
- Block **"Agent Actions"** ("Renew Expired" / "Upsell Package" cards) → **moves to Cohorts**

### 3.7 Arrives here (from removed Reactivation)

- KPI `5 Inactive Members` → into KPI strip as `At-Risk`
- KPI `Revenue at Risk $0` → into KPI strip as part of `LTV total` / `Revenue at risk` badge
- Chart `Churn & Reactivation Trend` → next to "How Members Play"

### 3.8 Leaves from here

- Block **Agent Actions** → `Cohorts` (becomes AI-Suggested cohorts)
- Topics `At-Risk` / `Reactivation` → `Cohorts` (pre-built cohorts) + `Campaigns` (campaign templates)

---

## 4. 🎯 COHORTS — turn into AI-driven workspace

### 4.1 What's wrong now

The current page shows **2 hardcoded cohorts** ("Age >= 30 — 20 members", "Gender = Female — 11 members") and a lot of empty space. This is **basic field filtering**, not segmentation. A director looks at it and thinks "ok, so what?".

### 4.2 New layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Cohorts        Custom segments for targeted campaigns  [+ Create] │
└─────────────────────────────────────────────────────────────────────┘

┌──────────── 🤖 AI-Suggested Cohorts ─────────── refreshed daily ────┐
│                                                                       │
│   Based on your member data, IQ identified 6 high-value segments:    │
│                                                                       │
│  ┌────────────────────────────────┐ ┌────────────────────────────┐  │
│  │ ⚠ Lost Evening Players    12  │ │ 🌟 New & Engaged         5 │  │
│  │ Played 4+ eve/mo, now ≤1      │ │ Joined <30d, 4+ sessions   │  │
│  │ Suggested: Reactivation       │ │ Suggested: Onboarding      │  │
│  │ Est impact: $1,400/mo         │ │ Est impact: $600 LTV       │  │
│  │ [Create cohort] [→ Campaign]  │ │ [Create cohort] [→ Camp.]  │  │
│  └────────────────────────────────┘ └────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────┐ ┌────────────────────────────┐  │
│  │ 💎 VIP Power Users         3  │ │ 📅 Renewal in 14d         7 │  │
│  │ Top 10% sessions + revenue    │ │ Package expires soon       │  │
│  │ Suggested: Loyalty perk       │ │ Suggested: Renewal nudge   │  │
│  │ [Create cohort] [→ Campaign]  │ │ [Create cohort] [→ Camp.]  │  │
│  └────────────────────────────────┘ └────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────┐ ┌────────────────────────────┐  │
│  │ 🎂 Birthday This Month     4  │ │ 📉 Declining Casuals      8 │  │
│  │ Auto-refresh                  │ │ Sessions ↓ 50% in 30d      │  │
│  │ Suggested: Discount/perk      │ │ Suggested: Check-in        │  │
│  │ [Create cohort] [→ Campaign]  │ │ [Create cohort] [→ Camp.]  │  │
│  └────────────────────────────────┘ └────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘

┌──────────── Your Cohorts ────────────────────────────────────────────┐
│                                                                       │
│  ┌───────────────┐ ┌───────────────┐ ┌──────── + Create empty ───┐  │
│  │ 👥 20 members │ │ 👥 11 members │ │                             │  │
│  │ Age >= 30     │ │ Gender = F    │ │   Build a custom cohort     │  │
│  │ Last edit: 2d │ │ Last edit: 1w │ │   from scratch with         │  │
│  │ [Edit] [Send] │ │ [Edit] [Send] │ │   AND/OR conditions         │  │
│  └───────────────┘ └───────────────┘ └─────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘

┌──────────── Cohort Builder (modal/drawer when creating) ─────────────┐
│  Name: [_______________________]                                     │
│                                                                       │
│  Conditions:                                                          │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ Health Score    is less than    50                       ✕ │   │
│   │ AND  Last play  is more than    14 days ago              ✕ │   │
│   │ AND  Membership tier  is one of  [VIP] [Package]         ✕ │   │
│   │                                              [+ Add cond]  │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│   Live preview: 8 members match  [Show list]                         │
│                                                                       │
│   [ Cancel ]   [ Save cohort ]   [ Save + Create campaign → ]        │
└───────────────────────────────────────────────────────────────────────┘
```

### 4.3 Keep

- Title + description
- "+ Create Cohort" button (but its behavior changes — see below)
- Existing user cohorts (`Age >= 30`, `Gender = Female`)

### 4.4 Change

- **Page is no longer empty** (was 2 cards and that's it)
- Layout: **AI-Suggested Cohorts** on top, **Your Cohorts** below
- "+ Create Cohort" opens not a form, but a **Cohort Builder drawer** with live preview

### 4.5 Add

- **AI-Suggested Cohorts section** (new main block):
  - 6–10 auto-generated segments, refreshed daily
  - Base set: `Lost Evening Players`, `New & Engaged`, `VIP Power Users`, `Renewal in 14d`, `Birthday This Month`, `Declining Casuals`
  - Each card: name, count, description, **estimated $ impact**, [Create cohort] + [→ Campaign] buttons
- **Cohort Builder** (visual):
  - AND / OR condition builder
  - Live preview count as you edit
  - Bottom buttons: `[Cancel] [Save cohort] [Save + Create campaign →]`
- **Your Cohorts card:** name, count, criteria, last edited, `[Edit] [Send campaign]`
- **"+ Create empty"** card in Your Cohorts — blank template for a custom cohort

### 4.6 Delete

- Nothing (page was nearly empty)

### 4.7 Arrives here

- From `Members` → block **Agent Actions** (2 cards "Renew Expired" / "Upsell Package") becomes part of AI-Suggested cohorts
- From `Reactivation` → **Risk Distribution donut** as a helper when picking audience in Builder
- From `Reactivation` → "At-Risk Members" logic becomes a pre-built cohort `At-Risk Members`

### 4.8 Leaves from here

- Nothing leaves — Cohorts becomes the centerpiece everything connects to

### 4.9 AI suggestion sources (what to actually query)

All required signals already exist in `intelligence.ts` / member-health / churn modules. The work is to combine them into **segment recommendations** and cache for 24h:

| Suggested cohort | Source signal |
|---|---|
| Lost Evening Players | join member sessions × time-of-day × week-over-week delta |
| New & Engaged | `joined_at` + session count |
| VIP Power Users | top decile by sessions × LTV |
| Renewal in 14d | `membership.expires_at - now < 14d` |
| Birthday This Month | `user.birthday` month = current month |
| Declining Casuals | session frequency 30d trend < -50% |

---

## 5. 🔥 REACTIVATION — entire page is removed

The menu item disappears from sidebar. All content is redistributed:

| Block from Reactivation | New home |
|---|---|
| KPI `5 Inactive Members` | `Members` → KPI strip (`At-Risk` tile) |
| KPI `Reactivated (30d)` | `Campaigns` → Campaign History section |
| KPI `Revenue at Risk $0` | `Members` → KPI strip or `Dashboard` → Money Story |
| KPI `Avg Health Score 26 (at-risk)` | Drillable through main `Avg Health` on Members |
| Chart `Churn & Reactivation Trend` | `Members` → next to "How Members Play" |
| Chart `Risk Distribution donut` | `Cohorts` → helper when creating a cohort |
| Table `At-Risk Members` | `Cohorts` → becomes pre-built cohort `At-Risk Members` |
| Button `Generate AI profiles` | `Campaigns` → into Campaign Wizard, Step 3 "Message" |
| Action `Send reactivation` | `Campaigns` → Campaign Wizard flow + AI-Recommended card `Win Back Inactive Members` |

---

## 6. 📨 CAMPAIGNS — massive simplification

### 6.1 What's wrong now

The top of the Campaigns page is occupied by **"Agent Campaign Layer"** with three columns of internal mechanics:

| Column | What it shows | Who cares |
|---|---|---|
| `Draft Queue` | 0 drafts, 0 review ready, 0 sandboxed, 0 scheduled, 0 blocked | Automation developer |
| `Live Rollout` | Shadow-only, no env allowlist, 0 live types armed | DevOps |
| `Live Pilot Health` | 11 sends · 0 delivered · 0 opened · 3 failed | QA engineer |

**A director looks at this and understands nothing.** It's an automation ops dashboard that accidentally leaked onto a user-facing page.

Meanwhile, the most useful part — `AI-Recommended Campaigns` (Win Back, Boost Retention, Check In) — is **buried at the bottom**.

### 6.2 New layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Campaigns           🟡 Live mode: OFF       [Switch to Live]      │
│                                                       [+ New Campaign] │
└─────────────────────────────────────────────────────────────────────┘

┌──────────── 🤖 AI-Recommended Campaigns ─────── ranked by $ impact ─┐
│                                                                       │
│  Based on your member data, these are the highest-impact campaigns:  │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ 1. Win Back Inactive Members              5 members             │ │
│  │    Personalized reactivation for 21+ day inactives              │ │
│  │    💰 ~$960/mo recovery potential                               │ │
│  │    📨 Email + SMS  ·  ⏱ ~3min to launch                         │ │
│  │    [ Preview & Launch → ]                                       │ │
│  ├─────────────────────────────────────────────────────────────────┤│
│  │ 2. Renewal Reminder                       7 members             │ │
│  │    Package expires in 14 days, nudge to renew                   │ │
│  │    💰 ~$1,400/mo MRR retention                                  │ │
│  │    [ Preview & Launch → ]                                       │ │
│  ├─────────────────────────────────────────────────────────────────┤│
│  │ 3. New Member Onboarding                  5 members             │ │
│  │    First-month engagement series                                │ │
│  │    💰 ~$600 LTV boost per member                                │ │
│  │    [ Preview & Launch → ]                                       │ │
│  ├─────────────────────────────────────────────────────────────────┤│
│  │ 4. Boost Retention                        1 member              │ │
│  │ 5. Check In                               6 members              │ │
│  └─────────────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────────────┘

┌──────────── Active Campaigns (running) ─────────────────────────────┐
│                                                                       │
│  Name              Cohort           Channel  Sent  Open  Booked  …  │
│  Win Back Q1       Lost Evening     Email     12   58%   $240    ⏵  │
│  Spring Renewal    Renewal in 14d   SMS+Email 7    71%   $1.4K   ⏵  │
│                                                                       │
│  [ View all ]                                                         │
└───────────────────────────────────────────────────────────────────────┘

┌──────────── Campaign History (collapsed) ──────────────── [expand ▾] │
│  9 past campaigns · $X total revenue attributed                      │
└───────────────────────────────────────────────────────────────────────┘
```

### 6.3 Keep

- "+ New Campaign" button (but the flow behind it changes)
- **AI-Recommended Campaigns** section (but moves to top and gets enriched)

### 6.4 Change

- **AI-Recommended Campaigns:** lift from bottom of page **to the very top**
- Each recommendation card: add `$ impact`, `channel`, `time to launch`, `[Preview & Launch →]` instead of current implicit CTA
- Sort recommendations **by $ impact**
- **"+ New Campaign"** flow: currently unclear what opens → becomes a **4-step wizard**

### 6.5 Add

- **Status bar at top:** `🟡 Live mode: OFF / ON` toggle + `4 active campaigns running` quick stats
- **Active Campaigns table** (new section): name, cohort, channel, sent, open %, booked, status, actions
- **Campaign History section** (collapsed accordion): past campaigns + $ revenue attributed
- **Campaign Wizard** (4 steps for `+ New Campaign`):
  - **Step 1 — Audience:** pick from saved cohorts / AI-suggested cohorts / build new inline
  - **Step 2 — Goal:** Reactivate / Onboard / Promote / Upsell / Renewal / Custom
  - **Step 3 — Message:** AI-generated template (subject + body), editor, `[Regenerate with AI]`, `[A/B test]`
  - **Step 4 — Schedule:** Send now / Scheduled / Triggered + channel toggles + preview + test send
- In Step 3, integrate `Generate AI profiles` (per-recipient personalization)

### 6.6 Delete

- **"Agent Campaign Layer"** block entirely (3 columns: Draft Queue / Live Rollout / Live Pilot Health) → moves to `Settings → Automation`
- Banner **"Automation: Paused — 0/4 triggers active"** → moves to Settings (or becomes a small green/yellow badge in Status bar)
- **"Agent Quick Starts"** section → duplicates AI-Recommended, drop it

### 6.7 Arrives here

- From `Reactivation` → entire reactivation flow becomes one of **Campaign templates** (already exists in AI-Recommended as `Win Back Inactive Members`)
- From `Reactivation` → button `Generate AI profiles` → embedded into Wizard Step 3 as "Personalize per recipient with AI"

### 6.8 Leaves from here

- **Agent Campaign Layer** (Draft Queue / Live Rollout / Live Pilot Health) → `Settings → Automation`
- **Automation triggers management** (4 triggers status) → `Settings → Automation`

### 6.9 Campaign Wizard — full step-by-step

```
Step 1 — AUDIENCE
  Choose cohort:
  ○ Pick from saved cohorts          [dropdown of user cohorts]
  ○ Pick from AI-suggested            [dropdown of AI cohorts]
  ○ Build new cohort right here       → opens cohort builder inline

  Selected: "Lost Evening Players" (12 members)
  [ Show list ]

Step 2 — GOAL
  ○ Reactivate dormant players
  ○ Onboard new members
  ○ Promote event/program
  ○ Upsell membership tier
  ○ Renewal reminder
  ○ Custom

Step 3 — MESSAGE
  Template: [AI-generated based on goal + cohort]

  Subject: We miss you on the courts, {first_name}
  Body:   Hey {first_name}, noticed you haven't played evening
          sessions in a while. We just opened up Tue 7PM —
          your old favorite slot. Want to grab a spot?

          [Book Tue 7PM →]

  [ Edit ]   [ Regenerate with AI ]   [ A/B test ]

Step 4 — SCHEDULE
  ○ Send now
  ○ Schedule for [date/time]
  ○ Trigger when [condition]

  Channel: ☑ Email   ☑ SMS (if opted-in)

  [ Preview ]   [ Send to test address ]   [ ✅ Launch ]
```

---

## 7. ⚙️ SETTINGS — new "Automation" page (where the heavy ops moves)

A new page **Settings → Automation** is added, accessible only to admin roles. Regular directors don't see it.

Contents (all moved from Campaigns):
- **Agent Campaign Layer** block (Draft Queue / Live Rollout / Live Pilot Health)
- **Automation triggers** management (0/4 active etc.)
- **Outreach mode toggle** (Shadow / Live)
- **Allowlist** management (test addresses)
- **Shadow-back recommendations**

---

## 8. 🔗 Cross-cutting concerns

### 8.1 Live Mode badge — global

- Currently hidden inside one card on Dashboard
- Pull out as **global status badge** in header / top-bar of all Engage pages
- `[Switch to Live Mode]` button on every page where it's relevant

### 8.2 Member entity — single drawer

- Currently the same member is shown **in different views** in Members / Reactivation / Campaigns
- Build a **unified Member Detail drawer:** click a member in any list → side drawer opens with health / sessions / revenue / actions / history
- Single source of truth for "what we know about a member"

### 8.3 Cohort ↔ Campaign linkage

- Every cohort should know **how many campaigns were sent to it** and **with what result**
- Every campaign should know **which cohort it was sent to**
- This closes the feedback loop: "create cohort → send campaign → get $ → see it on the cohort card"

### 8.4 $ attribution — single formula

- All new `estimated $ impact` values on cohorts / campaigns should use **the same formula**
- The same formula feeds the **Money Story widget** on Dashboard (when we get there)

---

## 9. 📊 Where do the KPI numbers come from?

**Important clarification:** the KPIs in the new Members layout are **NOT AI predictions**. They're **deterministic SQL aggregations** over fields that already exist in the DB. Nothing speculative.

| KPI in proposal | Source | Formula | AI? |
|---|---|---|---|
| **19 Active / of 22** | existing `membershipStatus` field | `count(m where status='active') / count(m)` | ❌ no |
| **61 Avg Health** | existing `healthScore` field (computed in `member-health` module) | `AVG(healthScore)` | ❌ no |
| **5 At-Risk** | existing `segment` field (or `riskLevel` in `member_health_history`) | `count(m where segment IN ('at-risk', 'critical'))` | ❌ no |
| **$X LTV total** | existing `totalRevenue` field on Member | `SUM(totalRevenue)` | ❌ no |
| **13 VIP / 3 Package** | existing `normalizedMembershipType` field | `count(m where type='unlimited')` etc. | ❌ no |

**The only new calculation is the `vs last month` deltas.** Two options:

- **Option A — On-the-fly:** add `comparePeriod` param to `getMemberHealth` → router runs 2 queries (current + previous) → returns both → frontend renders delta
- **Option B — Snapshots:** use existing `MemberHealthHistory` table (`prisma/schema.prisma:2029`) which already stores daily snapshots — fetch value from N days ago and compare with today

**Option B is preferred** because trends are already being persisted; no need to recompute the prior month each time. This is the same source we'd use for sparkline charts later.

### Where AI actually lives on the Members page

Two clearly separated blocks (NOT inside the KPI strip):

1. **AI Insight ribbon** (narrative)
   - Detects anomalies (rules + LLM, mostly already in `member-health`)
   - Explains the cause via LLM looking at deltas across measurable axes
   - Suggests an action (which cohort to create)

2. **Suggested Action per member** (in row hover/tooltip or "Next best action" column)
   - Already exists as a `suggestedAction: string` field on the Member type
   - Generated by an AI endpoint per member

This visual separation is critical: mixing "AI says you have 5 at-risk" with "AI says reach out to them" undermines trust in the data.

---

## 10. 📋 Quick reference — change matrix

| Section | Keep | Change | Add | Delete | Move out | Move in |
|---|---|---|---|---|---|---|
| **Members** | 7 items | 4 items | 5 items | 3 items | 1 block → Cohorts | 3 items from Reactivation |
| **Cohorts** | 3 items | 2 items | 4 items | 0 | 0 | 3 items from Reactivation + Members |
| **Reactivation** | — | — | — | **entire page** | 9 items distributed | — |
| **Campaigns** | 2 items | 3 items | 4 items | 3 items | 2 items → Settings | 2 items from Reactivation |
| **Sidebar** | — | 1 item (Engage) | 0 | 1 item (Reactivation) | — | — |
| **Settings** | all | 0 | 1 new page (Automation) | 0 | — | 2 blocks from Campaigns |

---

## 11. 📌 DASHBOARD redesign (deferred)

> Not part of this plan's first execution wave. Captured here so it isn't lost.

The current dashboard is built for an **analyst/observer**, not for a **club director**. Main issues:

| Current card | Director's reaction |
|---|---|
| Active Members 14 (+100%) | "100%? From 7 to 14? Real data with 2000 people will never look like this" |
| Court Occupancy 100% (+49.3%) | "Is this good or am I underutilized elsewhere?" |
| Player Sessions 32 | "Is that a lot? Below plan?" |
| **Lost Revenue $0 (-100%)** | "What does this even mean? Where does -100% come from?" |

All 4 cards are operational counters, no money, no context. **Not a WOW moment for a director.**

### Proposed structure (top-down)

```
[Header + Live Mode badge]

🤖 THIS MONTH IN 10 SECONDS  (AI narrative — one paragraph, the story)

DO TODAY  (ranked by $ impact, primary CTA on each)

MONEY KPIs              (MRR / Δ vs last / IQ found / Actioned)
CLUB HEALTH SCORE       (composite 0–100, breakdown, "what's pulling down")
OPERATIONAL METRICS     (Active / Occupancy / Sessions / New, with peer benchmarks)

⚠ TREND ALERT           (anomaly detection — narrative + CTA)

PLAYER HEALTH           (drillable, AI-explained "what changed")
OCCUPANCY HEATMAP       (compact, peaks pop, zeros fade)
FORMAT PERFORMANCE      ($/session table, "what's most profitable")

PERIOD COMPARISON       (vs prior + vs peers)

💰 MONEY STORY          (IQ identified $X / actioned $Y / left on table $Z)

[status bar — data freshness]
```

### What changes vs current

| Current block | Status | Why |
|---|---|---|
| Active / Occupancy / Sessions / **Lost Revenue $0** | KPIs stay, **Lost Revenue removed**, absolute deltas added | "$0 -100%" looks like a bug; absolute numbers honest on small samples |
| AI-Attributed Revenue (big green empty card) | → **"Money Story"** at bottom | When Live OFF, not emptiness — promise + breakdown |
| Player Health Overview | → **drillable + actionable** + add Churned | Each bar clickable, AI hint about why "Watch" grew |
| AI Insights (Accept/Dismiss) | → **"Do Today"** at top | $-impact, ranked, primary CTA — director decides in 3 seconds |
| Occupancy Heatmap (noisy) | → compact, peaks pop, zeros fade | Grid of zeros uninformative — peaks and overflow matter |
| Sessions by Format (donut) | → **Format Performance table** with $/session | Donut was decorative — now you see what's profitable |
| Period Comparison | → add **Peer avg + You vs peer** | Numbers in a vacuum are silent — needs benchmark |
| Data Uploads (big right block) | → **status bar at bottom**, one line | This is ops, not director-facing |

### New blocks (didn't exist before)

1. **🤖 "This month in 10 seconds"** — AI narrative at top. One paragraph, the main story of the month. First thing a director reads.
2. **⚠ Trend Alert** — separate signal block when AI detects a meaningful anomaly (e.g., drop in `avg sessions/member` while membership grows). Narrative + actionable CTA.
3. **Club Health Score** — composite 0–100 with breakdown. The number a director can quote at coffee ("I'm at 72 / 100").
4. **Money Story widget** — closes the question "how much is IQ actually making me?". Visual progress bar `found vs actioned vs left on table`.
5. **Live Mode badge at top** — global status, always visible. Currently hidden inside one card.

### Dashboard guiding principles

1. **Money first, units second.** Director thinks in $. MRR and Δ vs last month — top.
2. **Each block answers one director question.** Not "data" — "what it means" + "what to do".
3. **Each anomaly → narrative + CTA.** AI doesn't show numbers; AI **tells a story and proposes an action.** This is IQ vs a regular BI dashboard.
4. **Benchmarks everywhere possible.** "100% occupancy" in a vacuum = "and?". "100% peak / 78% avg / peers 64%" = "you're crushing it".
5. **Live Mode out of the shadow.** Always at top.
6. **Drill-down over piling up.** Heatmap, format, health — compact widgets, **click → detailed view.** Front page should not be "everything at once".

---

## 12. 🚀 Recommended implementation phases

### Phase 1 — Cleanup (1-2 days, low risk)

- Remove `Reactivation` from sidebar
- Move Agent Campaign Layer to `Settings → Automation`
- Lift AI-Recommended Campaigns to the top of Campaigns page
- Remove the duplicate `Automation: Paused` banner

### Phase 2 — Members rework (3-4 days)

- List view + view-mode toggle
- KPI strip reframe (drop Guests, add At-Risk + LTV)
- Bulk actions + row-click drawer
- AI Insight ribbon (minimal, rules-based first version)

### Phase 3 — Cohorts AI suggestions (5-7 days)

- 6 base suggested-cohort generators
- Cohort Builder with live preview
- "Save + Create campaign" bridge

### Phase 4 — Campaign Wizard (7-10 days)

- 4-step wizard skeleton
- 6 campaign templates by goal
- AI message generation (uses existing endpoint)

### Phase 5 — Closing the loop (3-5 days)

- Active Campaigns table with live metrics
- Cohort ↔ Campaign linkage in DB and UI
- $ attribution pipeline → readiness for Money Story on Dashboard

---

## 13. 🎯 The product story this redesign unlocks

```
   📊 Member health changed         (signal)
              ↓
   🤖 AI Insight on Members page    (narrative)
              ↓
   🎯 AI suggests cohort            (segment)
              ↓
   🚀 Convert to campaign           (action)
              ↓
   📈 Track impact in Active        (outcome)
              ↓
   💰 Money Story on Dashboard      (revenue attribution)
```

Today this story is **broken across 4 disconnected pages**. After this redesign, it becomes the spine of the product.

---

## 14. Open questions / decisions still to make

- [ ] Where does the **Member Detail drawer** live structurally — separate route `/members/[id]` or pure side-drawer (no URL change)?
- [ ] Which 2-3 of the 6 AI-Suggested cohorts ship in Phase 3 first (need to pick the highest-impact + easiest-to-compute)?
- [ ] Do we need a **lightweight Active Campaigns table** in Phase 4 (no real metrics yet) or wait for Phase 5 with proper attribution?
- [ ] Does "Generate AI profiles" remain a button or become **automatic on every Wizard Step 3** (when sample size is small enough)?
- [ ] Cohort Builder field set — which member fields to expose in v1 (don't try to ship all 30+ at once)?

---

## 15. References (where to dig in code)

- Members UI: `app/clubs/[id]/intelligence/_components/iq-pages/MembersIQ.tsx`
- Cohorts UI: `app/clubs/[id]/intelligence/cohorts/page.tsx`
- Campaigns UI: `app/clubs/[id]/intelligence/campaigns/page.tsx`
- Reactivation UI (to be removed): `app/clubs/[id]/intelligence/reactivation/page.tsx`
- Hooks layer: `app/clubs/[id]/intelligence/_hooks/use-intelligence.ts`
- tRPC router: `server/routers/intelligence.ts`
- AI services: `lib/ai/intelligence-service.ts`, `lib/ai/campaign-engine.ts`, `lib/ai/anti-spam.ts`
- Member health: `lib/member-health/` + `MemberHealthHistory` model in `prisma/schema.prisma:2029`
- Brand routing: `lib/brand.ts` + `middleware.ts` (no changes expected — this redesign is brand-agnostic)
