# CourtReserve Integration Spec

Status: current implementation spec
Last updated: 2026-06-15

## 1. Purpose

CourtReserve integration connects a club's CourtReserve account to IQSport and imports operational data needed for dashboards, AI recommendations, cohorts, campaigns, and member analytics.

The integration is read-only. IQSport imports data from CourtReserve but never writes schedule, member, booking, or billing changes back to CourtReserve.

## 2. Main User Flows

### 2.1 Club onboarding

During club creation/onboarding, the user can choose CourtReserve as the data source.

The onboarding screen must provide:

- CourtReserve API credential fields.
- Consent checkbox for data processing and communication terms.
- `How does it work?` button.
- Modal explaining the sync stages and that the user can leave the page while sync continues.

After successful connection:

1. IQSport saves encrypted credentials.
2. Initial sync starts automatically.
3. User is redirected into the club experience.
4. Sync progress remains visible in the club UI.

### 2.2 Club Integrations tab

Inside a club, the `/integrations` tab is open and available in the IQ sidebar.

The CourtReserve block contains:

- Connection form if not connected.
- Status pill if connected.
- `How does it work?` button inside the CourtReserve card header.
- Live sync progress while syncing.
- Paused/rate-limited progress if CourtReserve temporarily blocks requests.
- Final sync stats after completion.
- Manual `Sync Now`.
- Disconnect.

## 3. CourtReserve API Client Rules

Code of record:

- `lib/connectors/courtreserve-client.ts`

Client behavior:

- Base URL defaults to `https://api.courtreserve.com`.
- Auth uses HTTP Basic with CourtReserve API username/password.
- Every request is throttled by 1000 ms to reduce rate-limit pressure.
- Request timeout is 30 seconds.
- Member pagination uses page size 100.
- Date ranges are split into max 31-day windows.
- CourtReserve response envelope is unwrapped from `{ ErrorMessage, Data, IsSuccessStatusCode }`.

Rate limit behavior:

- If CourtReserve returns HTTP 429 with `Retry-After <= 10s`, the client retries in-process up to 3 times.
- If `Retry-After` is larger, or retries are exhausted, the client throws a `CourtReserveError`.
- The sync orchestrator then stores `nextRetryAt = now + Retry-After + 30s buffer`.
- IQSport must not invent a pause if CourtReserve did not return a rate limit.

## 4. Data Imported

CourtReserve data is imported into IQSport in this order:

1. Courts.
2. Membership type catalog.
3. Members.
4. Reservations.
5. Events calendar.
6. Event registrations.
7. Event waitlists.
8. Post-processing and AI enrichment.

The sync uses idempotent upserts where possible. Re-running a sync should update existing data, not duplicate it.

External identity is stored through `external_id_mappings`, scoped to a generated partner for the club.

## 5. Sync Entry Points

### 5.1 Manual sync

Code of record:

- `server/routers/connectors.ts`

The `connectors.syncNow` mutation starts a sync for one CourtReserve connector.

Manual sync uses a function budget of about 260 seconds.

### 5.2 Automatic sync

Code of record:

- `app/api/connectors/courtreserve/sync/route.ts`
- `app/api/connectors/courtreserve/sync-worker/route.ts`

Automatic sync is fan-out based:

1. Cron/orchestrator finds eligible connectors.
2. Orchestrator dispatches each connector to a worker.
3. Each worker handles one connector.
4. Worker returns `202 Accepted` quickly, then continues sync in `after()`.
5. Worker uses a max function budget of about 270 seconds for the actual sync.

Eligibility:

- `autoSync = true`.
- Connector status is `syncing`, or status is `connected`/`error` and it is due for sync.
- Connectors with `nextRetryAt` in the future are skipped until CourtReserve allows retry.

Concurrency guard:

- If a connector is already `syncing` and was updated within the last 5 minutes, the worker refuses to start a duplicate sync.
- After 5 minutes, a new worker may take over because the previous invocation may have crashed or timed out.

## 6. Sync Orchestration

Code of record:

- `lib/connectors/courtreserve-sync.ts`

Main function:

- `runCourtReserveSync(connectorId, options)`

At the start of every run:

1. Connector is loaded.
2. Status is set to `syncing`.
3. Stale `nextRetryAt` is cleared.
4. Stale auto-resume/rate-limit error is cleared.
5. CourtReserve credentials are decrypted.
6. Partner and PartnerApp records are ensured for external mappings.

## 7. Detailed Sync Stages

### Stage 1: Courts

Data source:

- CourtReserve courts endpoint.

Destination:

- `club_courts`.
- `external_id_mappings` with entity type `COURT`.

Resume behavior:

- If `courtsDone = true` in `lastSyncResult`, this stage is skipped.

### Stage 1b: Membership Types

Data source:

- CourtReserve membership package/type endpoint.

Destination:

- `club_membership_types`.

Behavior:

- Runs every sync.
- Failure is non-fatal.
- If this stage fails, the main member/session sync continues.

### Stage 2: Members

Data source:

- CourtReserve member paginated endpoint.

Destination:

- `users`.
- `club_followers`.
- `external_id_mappings` with entity type `MEMBER`.

Imported fields include:

- Email.
- Name.
- Phone, normalized to E.164 when possible.
- Gender.
- City.
- Date of birth.
- Zip code.
- Skill level.
- Membership tier/name.
- Membership status.
- DUPR-like ratings when CourtReserve provides them in member ratings.

Progress fields:

- `membersSynced`.
- `membersTotal`.
- `status`.
- `percent`.

Total count rules:

- Prefer explicit total-count fields from CourtReserve when available.
- If CourtReserve does not provide a reliable total, do not show a fake `X / X`.
- UI should show `Members: X imported` until a real larger total is known.
- On tab focus/reopen, `getStatus` hydrates the latest member count from IQSport DB.

Resume behavior:

- Members are paginated and deadline-aware.
- If the function is near timeout, sync returns `{ incomplete: true }`.
- Next run resumes from persisted progress and current DB state.

### Stage 3: Reservations

Data source:

- CourtReserve active/cancelled reservation reports.

Destination:

- `play_sessions`.
- `play_session_bookings`.

Behavior:

- Date ranges are split into 31-day windows.
- Completed reservation windows are stored in `completedWindows` as `res:<from>`.
- On resume, completed windows are skipped.

### Stage 4: Events

Data sources:

- CourtReserve event calendar.
- CourtReserve event registrations.
- CourtReserve event waitlist.

Destination:

- `play_sessions`.
- `play_session_bookings`.
- `play_session_waitlist`.

Behavior:

- Date ranges are split into 31-day windows.
- For each event window:
  1. Import event calendar.
  2. Import event registrations.
  3. Import event waitlist.
- Completed event windows are stored in `completedWindows` as `evt:<from>`.
- On resume, completed windows are skipped.

Progress fields:

- `sessionsSynced`.
- `eventsSynced`.
- `bookingsSynced`.

`eventsSynced` currently maps to imported IQSport `play_sessions`, because events and reservations are represented as sessions inside IQSport.

### Stage 5: Post-Processing

After reservation/event windows, IQSport runs best-effort cleanup:

- Repair court assignments when CourtReserve returns empty or mismatched court IDs but the court can be inferred from session title.
- Backfill public event URLs and member SSO URLs between related/sibling sessions.

Failures here are logged but should not invalidate the full sync.

### Stage 6: Completion and Enrichment

When all phases are complete:

1. IQSport counts final members from `club_followers`.
2. IQSport counts final sessions/events from `play_sessions`.
3. IQSport counts final bookings from `play_session_bookings`.
4. Connector status becomes `connected`.
5. `lastSyncAt` is updated.
6. `lastError` is cleared.

Then non-fatal enrichment jobs run:

- Gender and skill enrichment.
- RAG indexing.
- AI member profile generation.
- Event detection in the worker after successful sync completion.

## 8. Initial Sync Date Phases

Initial sync imports recent/high-value data first, then backfills older history.

Current phase table:

| Phase | Date range | Purpose |
| --- | --- | --- |
| 1 | Today - 60 days through today + 30 days | Recent and upcoming operating data |
| 2 | Today - 150 days through today - 60 days | 2-5 month backfill |
| 3 | Today - 240 days through today - 150 days | 5-8 month backfill |
| 4 | Today - 365 days through today - 240 days | 8-12 month backfill |

Inside each phase:

1. Reservations are synced first.
2. Events are synced second.
3. Post-processing runs.
4. If there is another phase, the sync continues immediately.

Important rule:

- IQSport must not pause between phases on its own.
- Sync continues until CourtReserve returns a rate limit, or until the function budget is nearly exhausted.
- If CourtReserve returns rate limit, UI shows paused state with `nextRetryAt`.

## 9. Incremental Sync

After initial sync completes, regular syncs are incremental.

Default range:

- Today - 7 days through today + 30 days.

Purpose:

- Keep recent booking activity fresh.
- Keep upcoming sessions and events fresh.
- Pick up changed members.

Incremental member sync uses `createdOrUpdatedFrom = lastSyncAt` when applicable.

## 10. Paused and Resumed Sync

Pause source:

- Only CourtReserve rate limit should create a real paused state.

Paused state storage:

- `lastSyncResult.nextRetryAt`.
- `lastSyncResult.phase`.
- `lastSyncResult.syncPhaseIdx`.
- `lastSyncResult.completedWindows`.
- `lastSyncResult.membersSynced`.
- `lastSyncResult.membersTotal`.
- `lastSyncResult.sessionsSynced`.
- `lastSyncResult.eventsSynced`.
- `lastSyncResult.bookingsSynced`.

UI behavior:

- Show what is already done.
- Show what is currently paused.
- Show what remains queued.
- Keep showing when the sync will resume.
- Keep red error text hidden once sync has resumed.

Resume behavior:

- Worker skips execution while `nextRetryAt` is in the future.
- Once the time passes, next manual/automatic sync can continue.
- On resume, previously completed courts, members, and date windows are skipped.
- `nextRetryAt` is cleared at run start.
- `lastError` is cleared at run start.

## 11. Status API and UI Refresh

Code of record:

- `server/routers/connectors.ts`
- `app/clubs/[id]/intelligence/_components/iq-pages/shared/CourtReserveConnector.tsx`

`connectors.getStatus` returns connector state and hydrates live counts from DB while sync is active or progress exists.

Hydrated counts:

- Members from `club_followers`.
- Events/sessions from `play_sessions`.
- Bookings from `play_session_bookings`.

UI refresh rules:

- Poll every few seconds while syncing.
- Refetch on window focus.
- Refetch on reconnect.
- Invalidate status on visibility change when the tab becomes visible.

This ensures that after a pause, resume, or tab switch, the UI shows the latest final member/event counts instead of stale cached values.

## 12. Error Handling

Credential errors:

- HTTP 401 becomes `Invalid API credentials`.
- Connection test fails and credentials are not saved.

CourtReserve API errors:

- Wrapped `ErrorMessage` becomes a CourtReserve API error.

Rate limits:

- HTTP 429 stores `nextRetryAt` using CourtReserve `Retry-After`.
- Connector status remains `syncing`.
- UI shows paused progress and automatic resume timing.

Function timeout/abort:

- If partial data exists, connector remains `syncing`.
- No artificial `nextRetryAt` is created unless CourtReserve gave a rate limit.
- Next automatic/manual run can continue.

Non-fatal errors:

- Membership type sync failure.
- Waitlist window failure.
- Court repair failure.
- URL backfill failure.
- AI enrichment/indexing/profile generation failure.
- Event detection failure.

These are logged and should not block the main data import.

## 13. Data Integrity Requirements

The integration must be:

- Idempotent: repeated runs should not duplicate members, sessions, bookings, courts, or waitlist entries.
- Resumable: interrupted runs continue from persisted progress.
- Read-only toward CourtReserve.
- Safe under duplicate worker attempts.
- Accurate in UI progress.
- Honest about totals: never show `X / X` unless `X` is a real known total or final completed total.

## 14. Acceptance Criteria

### Connection

- User can enter CourtReserve API credentials.
- User can test connection before saving.
- User must accept required data/communication terms before connecting.
- Successful connection starts initial sync.

### Help Modal

- `How does it work?` appears during onboarding CourtReserve setup.
- `How does it work?` appears inside the CourtReserve card on `/integrations`.
- Modal explains read-only access, sync stages, recent-first import, historical backfill, and automatic resume.

### Sync Progress

- While syncing members, UI shows latest imported member count.
- If CourtReserve provides a total, UI shows `Members: synced / total`.
- If no trustworthy total is known, UI shows `Members: synced imported`.
- While syncing reservations/events, UI shows live event/session count.
- After tab focus/reopen, UI refetches current status and counts.

### Rate Limit / Pause

- IQSport does not create pauses between phases.
- Only CourtReserve 429/Retry-After creates `nextRetryAt`.
- Paused UI shows completed stages, current stage, remaining queued stages, and resume time.
- Red rate-limit/auto-resume error disappears once sync resumes.

### Completion

- Final result shows members, sessions/events, and bookings from IQSport DB counts.
- Connector status becomes `connected`.
- `lastError` is cleared.
- `lastSyncAt` is updated.

## 15. Current Open Questions

- Does CourtReserve expose a reliable total count for all member API responses across all plans?
- Do any clubs need more than 12 months of historical backfill?
- Should `eventsSynced` be renamed in UI/API to `sessionsSynced` to match IQSport's internal data model?
- Should timeout/abort progress be surfaced differently from CourtReserve rate limit pauses?
