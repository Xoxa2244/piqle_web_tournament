# PROMPT FOR CURSOR — COMPLETE TECH SPEC (v2 with "Merged RR → Split Back on Elimination")

## 0) Goal

Build a tournament director web console for conducting pickleball tournaments with 1v1, 2v2 and 4v4 teams. The console handles:

1. tournament setup (info card, rules, prizes),
2. creating divisions with age/DUPR/gender constraints and `FIXED`/`MIX_AND_MATCH` mode, optional pools,
3. importing players/teams from CSV (PickleballTournaments) and manual input/editing,
4. drag-and-drop movement of players/teams between teams/pools/divisions,
5. round-robin (RR) generation, match/game results tracking, standings and tiebreakers,
6. automatic elimination stage generation with play-in (fill to 4/8/16),
7. role-based access (TD and assistants assigned to divisions) and audit log,
8. public scoreboard page (RR standings + playoffs + prizes) with live updates,
9. **new:** ability to **merge two or more divisions** into **unified RR pool** with small team counts and **auto-split back** to original divisions when playoffs start.

## 1) Tech stack & scaffolding

* Next.js 15 (App Router) + TypeScript; deploy to Vercel.
* Supabase: Postgres + Auth (magic link, invite-only) + Realtime + RLS.
* Prisma (ORM) + Prisma Migrate.
* tRPC (server routes) + Zod.
* TanStack Query (client data).
* TailwindCSS + shadcn/ui (UI).
* DnD: `@dnd-kit/core` (+ sortable).
* CSV: `papaparse`.
* Brackets: `react-brackets` (or custom lightweight component).
* Tests: Vitest + Testing Library; Playwright e2e.
* Repo layout:

  ```
  /app/(public) /t/[slug]    // public scoreboard
  /app/admin                  // TD console
  /app/api/trpc               // tRPC
  /components /lib /server /prisma /tests /scripts
  PROMPT.md
  ```

## 2) Environment (expected variables)

```
DATABASE_URL="postgresql://postgres:<PASSWORD>@db.<PROJECT_ID>.supabase.co:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://<PROJECT_ID>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."  // server-side
```

## 3) Data model (Prisma)

All entities with `id uuid`, `createdAt`, `updatedAt`.

* **User**: email, name, role ('TD', 'ASSISTANT'), isActive.
* **Tournament**: title, description, rulesUrl, venueName, venueAddress, startDate, endDate, entryFee (Decimal?), isPublicBoardEnabled (Bool), publicSlug (String @unique).
* **Prize**: tournamentId, divisionId (nullable), place (Int), label (String), amount (Decimal?), kind ('cash' | 'other').
* **Division**: tournamentId, name, teamKind ('SINGLES\_1v1' | 'DOUBLES\_2v2' | 'SQUAD\_4v4'), pairingMode ('FIXED' | 'MIX\_AND\_MATCH'), constraintsId (FK), poolsEnabled (Bool), maxTeams (Int?).
* **DivisionConstraints**: divisionId, minDupr (Decimal?), maxDupr (Decimal?), minAge (Int?), maxAge (Int?), genders ('ANY' | 'MEN' | 'WOMEN' | 'MIXED').
* **AssistantAssignment**: userId, divisionId.
* **Pool**: divisionId, name, order.
* **Team**: divisionId, poolId (nullable), name, seed (Int?), note.
* **Player**: firstName, lastName, email (String?), gender ('M' | 'F' | 'X' | null), dupr (Decimal?), birthDate (DateTime?) or age (Int?), externalId (String?).
* **TeamPlayer**: teamId, playerId, role ('CAPTAIN' | 'PLAYER' | 'SUB').
* **RoundRobinGroup**: tournamentId, name (e.g., "Merged RR #1"); rrSettingsId (FK).
* **RRSettings**: targetPoints (Int, default 11), winBy (Int, default 2), gamesPerMatch (Int, default 1), bestOfMode ('FIXED\_GAMES' | 'BEST\_OF').
* **DivisionRRBinding**: divisionId, rrGroupId, status ('BOUND' | 'UNBOUND'). // for merged RR
* **Match**: rrGroupId (nullable), divisionId (nullable), poolId (nullable), roundIndex (Int), stage ('ROUND\_ROBIN' | 'ELIMINATION' | 'PLAY\_IN'), teamAId, teamBId, bestOfMode, gamesCount, targetPoints, winBy, winnerTeamId (uuid?), locked (Bool).
* **Game**: matchId, index, scoreA, scoreB, winner ('A' | 'B' | null).
* **Standing**: rrGroupId? divisionId? poolId? teamId, wins, losses, pointsFor, pointsAgainst, pointDiff.

  * For RR in merged mode — `rrGroupId` is filled, `divisionId` is null.
  * For RR without merging — `divisionId` is filled, `rrGroupId` is null.
* **ImportJob**: tournamentId, source ('PBT\_CSV'), status, mappingJson, rawFileUrl.
* **AuditLog**: actorUserId, action, entityType, entityId, payload JSON.

RLS: read/write only for TD and assigned assistants; public board — read-only by `publicSlug`.

## 4) Auth & Roles

* TD: full access; invites assistants and assigns them to divisions.
* ASSISTANT: access only to assigned divisions and matches/tables within.
* All mutations are written to AuditLog.

## 5) Tournament setup — Wizard

**Step 1 — Info:** title, dates, venue, rules (markdown/url), entry fee, optionally general prizes.
**Step 2 — Divisions:** create one or more divisions:

* teamKind, pairingMode;
* constraints: enable/disable age/DUPR, min/max, genders;
* poolsEnabled (merging requires single pool);
* division-level prizes.
  **Step 3 — Teams & Players:** teams manually or CSV import; player assignment to teams; constraints validation; force-override with warning.
  **Step 4 — Pools:** if enabled — distribute to pools (DnD). For merging — must be single pool.
  **Step 5 — RR Settings:** targetPoints=11, winBy=2, gamesPerMatch=1 (or BEST\_OF).
  **Step 6 — Public Board:** enable/disable, slug.

Navigation: left sidebar (Tournament → Divisions → Pools → Teams → Matches). Top tabs: `Setup | Teams | Scheduling | Results | Prizes | Audit`.

## 6) CSV Import

* Drag-&-drop .csv; preview 100 rows.
* Column mapping to `Player`/`Team`/`Division`/`Pool`. Support concat/split/regex/trim, age parsing from DoB.
* Deduplication: by email or fuzzy (name+DoB) with confirmation.
* Auto-create division by eventName (optional).
* ImportJob with undo (transactionally delete created entities).

## 7) Drag-and-drop

* Players ↔ Teams (in division), validate constraints.
* Teams ↔ Pools (in division).
* Teams ↔ Divisions (TD only; if RR not started yet).
* Context menus: Move/Edit/Remove; highlight issues.

## 8) Round-Robin (RR)

### 8.1 Generation

* For regular RR without merging:

  * even K — circle method; odd — add BYE.
  * create **Match** (stage=ROUND\_ROBIN) and required **Game**.
  * standings by division (or by pool, if pools exist).

* **Merged RR (new):**

  * TD can **merge** two or more divisions into **unified RR pool** under conditions:

    1. identical `teamKind`, `pairingMode`, `RRSettings` (targetPoints/winBy/gamesPerMatch/bestOf),
    2. each division has **one pool** (or no pools),
    3. operation performed **before RR starts** or **after RR generation, but before any matches played** (when merging, existing unplayed schedule is deleted and regenerated within common RR).
  * When merging, create **RoundRobinGroup** and **DivisionRRBinding** records for participating divisions.
  * RR schedule and standings calculated **by rrGroupId** (unified table).
  * UI: admin and public page have toggle
    «Combined Table (All) / Filter by Division».
  * Split (unmerge) available **only before first played match**; when unmerging, RR is recreated separately for each division.

### 8.2 Score Input and Standings

* Point input at Game level; automatic match winner determination.
* **Standing** updated after each save: wins, losses, PF, PA, Diff.
* Tiebreakers (see 8.3) applied to current context (rrGroupId or divisionId).

### 8.3 Tiebreakers (in priority order)

1. Matches Won,
2. Point Differential — Head-to-Head,
3. Point Differential — Within Entry Pool/Group,
4. Point Differential — vs Next Highest-Ranked Team.
   UI shows breakdown "why this ranking".

## 9) Transition to Playoffs (Elimination)

* **Start Elimination** button available to TD at tournament level: **starts playoffs simultaneously for all divisions** (including those in merged RR).
* Clicking locks snapshot of standings **at current moment** (RR is frozen).
* For merged RR: seeding within **each** division is built from **common rrGroup table** with **filtering by original division**. That is, all results against all opponents from unified RR are considered, then sorted by tiebreakers and only teams from given division are taken.
* Then playoff bracket is created **within each division** independently of the fact that RR was common.

### 9.1 Play-in and Bracket

* Base bracket targets: target ∈ {4, 8, 16, 24, …}
* Examples:

  * N=4 → semi-finals: 1–4, 2–3.
  * N=5 → play-in 4–5 for slot #4; then 1 vs winner, 2 vs 3.
  * N=9 → play-in 8–9 for #8; then bracket of 8.
  * N=10 → play-in 7–10 and 8–9; then 8.
  * N=11 → play-in 6–11, 7–10, 8–9; then 8.
  * N=17 → play-in 16–17; then 16.
  * N=20 → play-in 13–20, 14–19, 15–18, 16–17; then 16.
* Playoff pairings: 1 vs last, 2 vs last-1 … to middle; BYE slots for top seeds if N < target.
* Playoff match format — from division settings (default bestOf=3, to 11, winBy=2).
* Matches marked with stage: `PLAY_IN` → then `ELIMINATION`.

## 10) Public Scoreboard Page `/t/[publicSlug]`

* Division selector; for merged RR — toggle **Combined / By Division**.
* Sections: **Round-Robin Standings**, **Brackets**, **Prizes**.
* Live updates via Supabase Realtime (Game/Match/Standing).
* Read-only, no login, responsive for tablets/TV.

## 11) Scoring UX (directors/assistants)

* List of current round RR matches or playoff stage, search by teams.
* Match card: game list, score input, auto-winner, lock/unlock.
* Edits after lock — TD only, recorded in AuditLog.

## 12) Prizes

* At Tournament level (general) and Division level (place/amount/description).
* Public board shows prizes and winners.

## 13) Validations & constraints

* Player compliance with division constraints; warning and force-override by TD.
* teamKind vs team composition.
* MIX\_AND\_MATCH — warning for non-multiple player count.
* 1v1: team = player (during import create team with player's name).
* Moving team between divisions after RR starts is prohibited (if matches played).
* For merge: check settings identity and "single pool".
* Merge/unmerge prohibited after played matches in common RR.

## 14) Admin tools

* Invite assistants (magic link), assign to division.
* Enable/disable public board.
* CSV export (matches, standings, bracket).
* AuditLog with filters.

## 15) Non-functional

* Up to 500 players / 40+ teams in division, live updates < 1.5s.
* Supabase RLS; tRPC procedures check role and assignments.
* Accessibility: focus styles, ARIA for DnD.
* UI desktop-first, minimal horizontal/vertical scroll, list virtualization.

## 16) API/tRPC (minimum)

* `tournament.create/update/get`
* `division.create/update/delete/list`
* `division.setConstraints`
* `division.merge.start({divisionIds[], rrSettingsId?})`  // check conditions, create RoundRobinGroup, bind DivisionRRBinding, regen RR
* `division.merge.unmerge({rrGroupId})`                   // allowed while no games played
* `division.generateRoundRobin({divisionId})`             // regular mode
* `division.generateElimination({divisionId})`            // used inside start button
* `tournament.startElimination()`                         // common button: freeze standings and generate playoffs for all divisions (incl. from rrGroup)
* `pool.create/update/delete/reorder`
* `team.create/update/delete/move`
* `player.create/update/delete/move`
* `import.createJob/uploadCsv/mapFields/commit/undo`
* `match.listByDivision|RRGroup|Round`
* `match.updateGameScore`, `match.lock`, `match.unlock`
* `standing.recalculate`
* `assistant.invite`, `assistant.assign`, `assistant.revoke`
* `public.getBoard(slug)`

## 17) Algorithms (details)

### 17.1 RR Generator (circle method)

* If K is odd — add BYE, pair with BYE is skipped.
* For `MIX_AND_MATCH`: within round build pairs/quads minimizing partner repeats (greedy algorithm with local swaps); guarantee correctness up to 24 players.

### 17.2 Tiebreakers — Implementation

* Detailed sorting:

  1. wins desc,
  2. head-to-head diff among tied teams,
  3. overall diff in pool/rrGroup,
  4. diff vs next highest-ranked team (iteratively).
* Return «explain» for UI.

### 17.3 Playoffs — Target Selection

```
N = teams count in division
if N <= 5: target = 4
elif N <= 16: target = 8
else:
  target = 16 + 8 * floor((N-1)/16)
```

* If N == target → classic bracket.
* If N > target → create PLAY\_IN for "tail" competing for last slots.
* If N < target → BYE for top seeds.

## 18) UI Details

* **Teams board:** three panels (Unassigned | Teams | Pools). DnD with validation.
* **RR Standings:** `Seed | Team | W-L | PF | PA | Diff | i` (icon "why").
* **Merged RR:** header «Combined RR: \[Div A + Div B + …]», toggle Combined/By Division.
* **Brackets:** tree; play-in marked separately; BYE slots hidden as matches.
* **Audit:** changes table with filters (actor, division, action).

## 19) Edge cases

* <4 teams — warning: form final manually or via simplified bracket.
* Team deletion after played matches — prohibited; archive only.
* Changing pairingMode after RR generation — requires regeneration (confirm).
* Merge possible: before RR or after generation, but while no games played; unmerge — only while no games played.
* During merge all unplayed matches from previous separate RRs are deleted (logged in AuditLog).

## 20) Acceptance Criteria

1. TD creates tournament, divisions, constraints, prizes.
2. CSV import maps to players/teams/divisions, has preview and undo.
3. DnD: player↔team, team↔pool, team↔division (before RR starts).
4. RR generated; scores entered; standings recalculated; tiebreakers applied.
5. **Merged RR:** possible with matching settings and single pool; common RR and unified table; public-board supports Combined/By Division.
6. **Start Elimination** button locks results and builds playoffs **for each division separately**, using seeding from common rrGroup table filtered by division.
7. Play-in/bracket generated by rules; e2e tests pass cases N=4,5,6,7,8,9,10,11,16,17,20.
8. Roles and RLS enforced; assistant sees only their divisions.
9. Public board is beautiful, live, no login.
10. AuditLog records every edit.

## 21) Milestones

* **M1 — Scaffolding & DB:** project, Prisma schema, migrations, basic admin pages, auth (invite-only), RLS.
* **M2 — CSV & Teams Board:** importer, preview/mapping/undo, DnD panels, constraints validation.
* **M3 — RR & Scoring:** RR generator (even/odd, BYE, MIX\_AND\_MATCH), score input forms, standings+tiebreakers.
* **M4 — Merged RR:** RoundRobinGroup, DivisionRRBinding, unified table, Combined/By Division in UI, merge/unmerge rules.
* **M5 — Elimination & Public Board:** play-in and bracket, start with one button, public board with live updates, prizes.
* **M6 — Roles & Audit & e2e:** assistants, AuditLog, CSV export, e2e scenario «import → RR (incl. merged) → score → playoffs → public».
