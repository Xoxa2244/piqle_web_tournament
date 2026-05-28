-- Index: play_sessions ("clubId", date)
--
-- WHY: play_sessions has no index on clubId (only the PK on id). Every query
-- that filters sessions by club + date range (Tier Constructor's
-- getTierDistribution / getFrequentUntaggedTitles, and others) therefore
-- sequentially scanned the whole table. On IPC North that table is ~422 MB
-- (heavy per-row columns), so a single scan took 37-145 SECONDS and the Tier
-- Constructor hung on its skeleton / timed out (400).
--
-- With this composite index the same queries do a bitmap index scan and read
-- only the ~1k matching rows: getTierDistribution 43s → 0.6s,
-- getFrequentUntaggedTitles 145s → 0.4s (measured on prod).
--
-- Applied to Sol2 prod on 2026-05-28 via CREATE INDEX CONCURRENTLY (the table
-- is written every 15 min by the CourtReserve sync, so a plain CREATE INDEX
-- hit a lock timeout). Committed here for traceability / other environments.
--
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction block — run
-- this statement on its own (e.g. psql -c), not wrapped in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS play_sessions_club_date_idx
  ON play_sessions ("clubId", date);
