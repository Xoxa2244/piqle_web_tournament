# QA Checklist: Ladder Formats (MVP)

This doc is for verifying the two new ladder formats:

- `ONE_DAY_LADDER` (one-day ladder)
- `LADDER_LEAGUE` (weekly pods ladder league)

## Prerequisites

1. Apply DB migration:
   - Run `/Users/vasilykozlov/Documents/GitHub/piqle_web_tournament/add-ladder-formats.sql` in your production DB.
2. Make sure tournament creation UI shows the new formats.

## ONE_DAY_LADDER

### Admin flow

1. Create a new tournament:
   - Format: `ONE_DAY_LADDER`
   - Create at least 1 division.
2. Add teams to the division:
   - Verify **odd** team count blocks initialization:
     - Go to `Admin -> Ladder`
     - "Initialize Ladder" should be disabled with a clear reason.
3. Make team count **even** (>= 2):
   - "Initialize Ladder" should become enabled.
4. Initialize ladder:
   - Choose seeding: `BY_SEED` and also test `RANDOM`.
   - Expected:
     - Courts (pools) created/used = teamCount / 2
     - Each court has exactly 2 teams
     - Round 1 matches are created (one match per court)
5. Enter results for round 1:
   - Open "Score Input" from Ladder page.
   - Enter scores so each match has a winner.
   - Expected:
     - Each court tile becomes "Completed"
     - "Advance Round" becomes enabled
6. Advance round:
   - Click "Advance Round"
   - Expected:
     - Teams move between courts
     - New matches are created for the next round
     - "Next round preview" disappears (because it becomes the current round)
7. Negative case:
   - Try "Advance Round" while some courts are missing winners:
     - Button should be disabled and show missing courts.
8. Edge cases:
   - teamCount = 2:
     - 1 court exists
     - advancing creates the next round and keeps the same 2 teams
   - attempt to initialize again after matches exist:
     - should not allow re-init (conflict)

### Player flow

1. Register into the tournament:
   - Expected: registration page shows "View Ladder" button.
2. Open `/tournaments/:id/ladder`:
   - Expected:
     - correct division is selected by default (your division if active)
     - your team is highlighted in the courts grid

## LADDER_LEAGUE

### Admin flow

1. Create a new tournament:
   - Format: `LADDER_LEAGUE`
   - Create at least 1 division.
2. Add teams to the division:
   - teamCount must be a **multiple of 4**.
   - Verify invalid counts are blocked:
     - teamCount < 4
     - teamCount % 4 != 0
3. Initialize pods:
   - Go to `Admin -> Ladder`
   - Click "Initialize Pods"
   - Expected:
     - Pools named "Pod 1..N"
     - Each pod has 4 teams assigned (by seed or random)
4. Create a week (match day):
   - Pick a date, click "Add"
   - Select the created week in the dropdown
5. Generate week matches:
   - Click "Generate Week Matches"
   - Expected:
     - Matches are created for the selected week
     - Button becomes disabled with reason "already generated"
6. Enter results:
   - Click "Open Score Input" from Ladder page
   - Expected:
     - Score Input opens with the right `division` AND selected `day`
     - entering winners updates standings
7. Close week:
   - Verify blocked if not all matches have winners.
   - After all winners are set, click "Close Week (Promote/Demote)" and confirm.
   - Expected:
     - Match day becomes `FINALIZED`
     - Teams are swapped between adjacent pods:
       - Pod N #1 swaps with Pod N-1 #4
8. Repeat:
   - Add week 2
   - Generate matches
   - Enter results
   - Close week

### Player flow

1. Register into the tournament:
   - Expected: registration page shows "View Ladder" button.
2. Open `/tournaments/:id/ladder`:
   - Expected:
     - pod standings visible
     - your pod is highlighted
     - "UP"/"DOWN" markers are visible for promotion/demotion zones

