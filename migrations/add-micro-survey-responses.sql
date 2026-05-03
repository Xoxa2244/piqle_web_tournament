-- ENGAGE Phase 2: micro-survey response storage
--
-- One row per click on a survey-style email link. The link looks like
-- /api/surveys/respond?logId=<AIRecommendationLog.id>&option=<choice>
-- Right now the only producer is the Newcomer Day-12 survey
-- (lib/ai/onboarding-sequence.ts → DAY_12_TEMPLATES.survey), but the
-- surveyType column lets us reuse the same table for "Снижение активности",
-- "Спящий", "Trial не конвертировался" etc. without another migration.
--
-- Idempotency: if the same recipient clicks the same email twice (e.g. once
-- "schedule" then changes mind to "price"), we keep the LATEST choice. The
-- log_id UNIQUE constraint enforces that — INSERT ... ON CONFLICT updates.
--
-- Cascade: when an AIRecommendationLog is deleted (rare, only by GDPR
-- export tooling), its survey responses go with it.

CREATE TABLE IF NOT EXISTS "micro_survey_responses" (
  "id"           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "log_id"       TEXT        NOT NULL UNIQUE,
  "user_id"      TEXT        NOT NULL,
  "club_id"      TEXT        NOT NULL,
  "survey_type"  TEXT        NOT NULL,
  "option"       TEXT        NOT NULL,
  "free_text"    TEXT,
  "responded_at" TIMESTAMP   NOT NULL DEFAULT NOW(),

  CONSTRAINT "micro_survey_responses_log_id_fkey"
    FOREIGN KEY ("log_id") REFERENCES "ai_recommendation_logs"("id") ON DELETE CASCADE
);

-- Dashboard query path: aggregate responses per club + survey type for a date range.
CREATE INDEX IF NOT EXISTS "micro_survey_responses_club_type_date_idx"
  ON "micro_survey_responses" ("club_id", "survey_type", "responded_at");
