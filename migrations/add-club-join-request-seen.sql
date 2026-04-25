-- ── Backfill: create club_join_request_seen table ──
--
-- This table has been declared in prisma/schema.prisma (model
-- ClubJoinRequestSeen) for a while, but the matching DDL never landed
-- as a migration on `dev` / other environments. Any Prisma query that
-- referenced the relation (e.g. `include: { joinRequestSeen: ... }`
-- on a club lookup) crashed with:
--
--   ERROR: relation "public.club_join_request_seen" does not exist
--
-- That's what the /clubs page 500 on dev.iqsport.ai was tracing back to.
--
-- Schema mirrors the Prisma model exactly — user_id is TEXT (matches
-- users.id), club_id is UUID (matches clubs.id). Unique on the pair so
-- we get an upsert semantic "has this user dismissed this club's join-
-- request notification".

CREATE TABLE IF NOT EXISTS club_join_request_seen (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  club_id    UUID NOT NULL REFERENCES clubs (id) ON DELETE CASCADE,
  seen_at    TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, club_id)
);

CREATE INDEX IF NOT EXISTS club_join_request_seen_user_id_idx
  ON club_join_request_seen (user_id);
CREATE INDEX IF NOT EXISTS club_join_request_seen_club_id_idx
  ON club_join_request_seen (club_id);

COMMENT ON TABLE club_join_request_seen IS
  'Tracks which club-join-request notifications a user has dismissed. Matches prisma model ClubJoinRequestSeen.';
