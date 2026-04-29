-- 2026-04-26 — Block silent overbooking from CourtReserve sync / admin tools.
--
-- The 2026-04-25 audit flagged that an Advisor query reported sessions
-- at 111% / 133% of capacity. Re-checking against prod, all 13,893
-- play_sessions rows were already clean (registered_count <= maxPlayers
-- everywhere), but nothing structural prevents a future sync from
-- writing a violating row. This adds the missing guardrail.
--
-- Verified clean before applying:
--   SELECT COUNT(*) FROM play_sessions
--    WHERE "maxPlayers" = 0 OR "maxPlayers" IS NULL OR registered_count IS NULL;
--   -- => 0
--   SELECT COUNT(*) FROM play_sessions WHERE registered_count > "maxPlayers";
--   -- => 0
--
-- Already applied to prod (mwdftgazlvpfyvqicovh) on 2026-04-26 via the
-- supabase MCP `apply_migration` tool. This file is a tracked copy so
-- the constraint isn't lost on a future migration replay.

ALTER TABLE play_sessions
  ADD CONSTRAINT play_sessions_registered_count_le_max_players
  CHECK (registered_count <= "maxPlayers");

COMMENT ON CONSTRAINT play_sessions_registered_count_le_max_players ON play_sessions IS
  'Prevents silent overbooking from CourtReserve sync or admin tools. registered_count must never exceed maxPlayers. Verified clean against all 13,893 prod rows on 2026-04-26 before adding.';
