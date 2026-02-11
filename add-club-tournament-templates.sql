-- Club tournament templates (presets)
-- Adds:
-- - club_tournament_templates table (reusable tournament config/structure per club)
--
-- Notes:
-- - Only club admins should be able to manage templates in the app.
-- - "config" stores JSON (schema_version for forward compatibility).

CREATE TABLE IF NOT EXISTS "club_tournament_templates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "club_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "config" JSONB NOT NULL,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "created_by_user_id" TEXT NOT NULL,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "club_tournament_templates_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs" ("id") ON DELETE CASCADE,
  CONSTRAINT "club_tournament_templates_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
  CONSTRAINT "club_tournament_templates_updated_by_user_id_fkey"
    FOREIGN KEY ("updated_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'club_tournament_templates_unique_club_name'
  ) THEN
    ALTER TABLE "club_tournament_templates"
      ADD CONSTRAINT "club_tournament_templates_unique_club_name" UNIQUE ("club_id", "name");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "club_tournament_templates_club_id_idx"
  ON "club_tournament_templates" ("club_id");

CREATE INDEX IF NOT EXISTS "club_tournament_templates_club_id_updated_at_idx"
  ON "club_tournament_templates" ("club_id", "updated_at" DESC);

