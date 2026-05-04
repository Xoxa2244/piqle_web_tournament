-- Sprint 1.5: backfill PlaySession.external_url + member_sso_url for existing rows
--
-- Background:
-- CR's /eventcalendar/eventlist returns event series (template, has
-- PublicEventUrl) and event instances (occurrences, has registrations) as
-- separate rows in the same response. Sprint 1 (commit 5f1cda87) captured
-- URLs but only into whichever row CR returned them on — usually the series
-- row, never the instance row. Sprint 1.5 in code (resolveEventUrls) bridges
-- them on future syncs. This migration bridges them for ROWS ALREADY IN THE DB.
--
-- Strategy: for any session (clubId, title) that has at least one row with a
-- URL, propagate that URL to all sibling rows (same clubId + title) that
-- don't have one. Uses the same identity key as the runtime fallback.
--
-- Idempotent: WHERE clause on NULL filter means re-running is a no-op.
-- Scoped to clubId — no cross-club leakage.
--
-- Safety: only writes to external_url / member_sso_url. Never touches title,
-- registered_count, status, etc. Touches updatedAt as a side-effect of UPDATE.

UPDATE play_sessions ps
SET
  external_url   = COALESCE(ps.external_url,   src.external_url),
  member_sso_url = COALESCE(ps.member_sso_url, src.member_sso_url),
  "updatedAt"    = NOW()
FROM (
  SELECT DISTINCT ON ("clubId", title)
    "clubId",
    title,
    external_url,
    member_sso_url
  FROM play_sessions
  WHERE external_url IS NOT NULL OR member_sso_url IS NOT NULL
  ORDER BY "clubId", title, "updatedAt" DESC
) src
WHERE ps."clubId" = src."clubId"
  AND ps.title    = src.title
  AND (
    (ps.external_url   IS NULL AND src.external_url   IS NOT NULL)
    OR
    (ps.member_sso_url IS NULL AND src.member_sso_url IS NOT NULL)
  );
