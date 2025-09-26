# User Stories — Tournament Director (TD)

Below is a compact set of **user stories from the tournament director's perspective**. They are grouped by stages and include brief acceptance criteria (Given/When/Then). These can be used as a basis for e2e tests and checklists.

---

# Epic A — Tournament Creation

**A1. Create Tournament**
*As a TD, I want to create a tournament with basic information (name, dates, venue, rules, entry fee) so I have an entry point for further configuration.*

* **Given** I am on `/admin`
* **When** I create a tournament and fill in the fields
* **Then** I see the tournament card and it appears in my tournaments list.

**A2. Enable Public Board**
*I want to enable/disable a public slug so spectators can see the scoreboard without login.*

* **Given** a tournament is created
* **When** I enable Public Board
* **Then** I get URL `/t/[slug]`, on it empty sections until games start.

**A3. Configure Prizes**
*I want to specify tournament prizes and/or division prizes to later display winners.*

* **Given** a tournament is open
* **When** I add prizes for 1st-3rd places
* **Then** prizes are visible in admin and on public board.

---

# Epic B — Divisions, Constraints, Pools

**B1. Create Division**
*I want to add a division with team type (1v1/2v2/4v4) and pairing mode (FIXED/MIX_AND_MATCH).*

* Given tournament is open
* When I create Division
* Then it appears in list, settings are available.

**B2. Set Constraints**
*I want to restrict participation by age, DUPR and gender (enable/disable, min/max) to comply with regulations.*

* Given Division is open
* When I set constraints
* Then when assigning players, system validates compliance (warning + force-override for TD).

**B3. Enable Pools (optional)**
*I want to split division into pools to simplify RR with large number of teams.*

* Given Division
* When I enable pools and create Pool A/B...
* Then teams can be distributed across pools drag-and-drop.

---

# Epic C — Roster (Teams and Players)

**C1. CSV Import**
*I want to import participants from CSV (PickleballTournaments) so I don't have to enter manually.*

* Given CSV is ready
* When I upload file, map columns and confirm
* Then players/teams/divisions are created (per settings), I see report and can Undo.

**C2. Manual Team Creation**
*I want to quickly create team and fill players manually.*

* Given Division
* When I click "Create team" and add players
* Then team appears in list.

**C3. Drag-and-Drop (DnD)**
*I want to drag players between teams, teams — between pools and divisions (until RR starts).*

* Given Teams page
* When I do drag-and-drop
* Then item moves, with violations — warning/block.

---

# Epic D — Round Robin (RR)

**D1. Configure RR Match Format**
*I want to choose games to 11, win-by-2, number of games or best-of to set round format.*

* Given Division
* When I set RR Settings
* Then new RR matches are created with these parameters.

**D2. Generate RR**
*I want to get "everyone vs everyone" schedule (even/odd, BYE) to start elimination stage.*

* Given teams are distributed
* When I click "Generate RR"
* Then I see rounds with matches.

**D3. Enter Match Scores**
*I want to enter scores by games and fix match winner.*

* Given match in list
* When I enter points and save
* Then standings update, match can be lock/unlock (TD only).

**D4. View RR Table and Tie-breakers**
*I want to see W-L, PF, PA, Diff and tie-breaker explanation.*

* Given games are running
* When I open Standings
* Then table is sorted by rules, "why so" is available.

---

# Epic E — **Merged RR (New)**

**E1. Merge Divisions into Single RR**
*As TD, I want to combine two+ divisions into common RR if each has single pool and identical settings to "gather" sufficient bracket.*

* Given divisions have same teamKind, pairingMode, RR Settings; single pool
* When I click "Merge Divisions to Combined RR" and select needed ones
* Then combined RR group is created, old unplayed matches are deleted, common RR is generated.

**E2. Undo Merge (before games start)**
*I want to be able to split back while no match is played.*

* Given merged RR and 0 played matches
* When I click "Unmerge"
* Then separate RR schedules are restored (regenerated).

**E3. View Combined/By Division**
*I want to switch between common table and filters by divisions in admin and on public board.*

* Given merged RR is running
* When I switch mode
* Then I see either common table or filtered by selected division.

---

# Epic F — Transition to Playoffs (Elimination)

**F1. Start Playoffs with One Button**
*I want to decide transition moment to fix RR results and launch playoffs immediately for all divisions (both merged and regular).*

* Given RR (regular and/or merged)
* When I click "Start Elimination"
* Then standings are frozen (snapshot), playoff brackets are created for **each** division separately.

**F2. Seeding after Merged RR**
*I want seeding of my division after merged RR to be calculated from common table but filtered by my division.*

* Given merged RR is finished/frozen
* When I start playoffs
* Then pairs are formed by filtered sorting (tie-breakers are respected).

**F3. Play-in and BYE**
*I want to support filling to 4/8/16 (and further) through play-in, or give BYE to top seeds when short.*

* Given N teams in division
* When we generate bracket
* Then system creates play-in/bye per described rules.

**F4. Enter Playoff Scores**
*I want to enter scores and close matches to advance bracket to final.*

* Given bracket is created
* When I enter results
* Then bracket moves; final winner is displayed.

---

# Epic G — Public Board

**G1. Spectator Scoreboard**
*I want spectators to see results in real-time without login.*

* Given public board is enabled
* When I open `/t/[slug]`
* Then Standings (RR), Brackets, Prizes are visible; for merged RR — Combined/By Division switcher.

---

# Epic H — Roles, Assistants and Security

**H1. Invite Assistant**
*I want to invite helper with magic link and assign them to specific divisions.*

* Given tournament
* When I send invite and select divisions
* Then assistant sees and can edit only assigned divisions.

**H2. Change Log**
*I want to see who changed what to resolve disputes.*

* Given changes are happening
* When I open Audit
* Then I see list of changes with details.

---

# Epic I — Export/Import and Maintenance

**I1. Export Results**
*I want to export CSV with matches, standings and bracket.*

* Given tournament
* When I click Export
* Then CSV files are downloaded.

**I2. Undo Import**
*I want to rollback failed import with one button.*

* Given ImportJob is completed
* When I click Undo
* Then all entities created by import are deleted transactionally.

---

# Epic J — Edge-cases & Limitations

**J1. Move Team after RR Start**
*I don't want accidental schedule violations.*

* Given RR has started or matches are played
* When I try to move team to another division
* Then action is blocked (only archiving is available).

**J2. Change Format Settings after Generation**
*I want controlled changes.*

* Given schedule is formed
* When I change RR Settings
* Then I get warning about regeneration; on confirmation schedule is recreated.

**J3. Few Teams (<4)**
*I want clear warning and simplified bracket/final.*

* Given few teams
* When I generate playoffs
* Then I see hint and minimal bracket (down to single final).

---

## Definition of Done (for product overall)

* All stories A–J are implemented;
* e2e scenarios cover: import → RR (including merged) → Start Elimination → play-in/bracket → public board;
* roles and RLS are verified;
* performance: live updates <1.5s;
* audit logs every action with actor and entity.
