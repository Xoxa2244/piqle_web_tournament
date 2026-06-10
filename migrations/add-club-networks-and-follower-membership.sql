-- Club networks + per-club membership on club_followers (WS6a, 2026-06-10)
--
-- Operator feedback 1.1 / 2.3: network vs non-network membership analytics
-- and location-based cohorts need (a) a grouping of clubs into a chain and
-- (b) per-club membership state. Today users.membership_type/status are
-- GLOBAL columns written by every club's 15-min CourtReserve sync —
-- last-sync-wins, so per-club tiers for the ~3,150 multi-club members are
-- unreliable by construction. These columns fix that at the data layer; the
-- sync change (courtreserve-sync.ts) starts populating them on deploy.
--
-- Additive-only: new table + nullable columns. No existing reader touches
-- any of this until the analytics code ships, so applying ahead of the code
-- deploy is safe. All keys TEXT (verified against prod information_schema —
-- clubs.id, club_followers.* are TEXT despite older docs claiming UUID).
--
-- Apply per SAFE_MIGRATION_INSTRUCTIONS.md.

-- 1. Network grouping
CREATE TABLE IF NOT EXISTS club_networks (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS network_id TEXT REFERENCES club_networks(id);

-- 2. Per-club membership (populated by the CourtReserve sync going forward)
ALTER TABLE club_followers
  ADD COLUMN IF NOT EXISTS membership_type      TEXT,
  ADD COLUMN IF NOT EXISTS membership_status    TEXT,
  ADD COLUMN IF NOT EXISTS membership_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_club_followers_club_membership
  ON club_followers (club_id, membership_status, membership_type);

-- 3. Seed: one network for the three IPC clubs (the test club "1233" stays
--    outside any network). Idempotent.
INSERT INTO club_networks (id, name)
VALUES ('ipc-network', 'Indy Pickleball Club')
ON CONFLICT (id) DO NOTHING;

UPDATE clubs
SET network_id = 'ipc-network'
WHERE id IN (
  '7659ee7d-9de8-474a-ba43-fa88ffa5952d', -- IPC East
  '6427f742-8f59-4f93-8f17-69a139b0e66f', -- IPC North
  '21e47cb4-3fa5-473e-800e-74afe35d00e2'  -- IPC South
)
AND (network_id IS DISTINCT FROM 'ipc-network');
