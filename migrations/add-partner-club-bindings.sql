-- Partner-Club Bindings — used by 11 committed routes in app/api/v1/partners/.
-- Applied to prod via Supabase MCP on 2026-04-17.
--
-- Column types: partner_id=TEXT (matches partners.id), club_id=UUID (matches clubs.id).
CREATE TABLE IF NOT EXISTS "partner_club_bindings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "partner_id" TEXT NOT NULL,
  "club_id" UUID NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "partner_club_bindings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "partner_club_bindings_partner_club_unique"
  ON "partner_club_bindings" ("partner_id", "club_id");
CREATE INDEX IF NOT EXISTS "partner_club_bindings_partner_idx"
  ON "partner_club_bindings" ("partner_id");
CREATE INDEX IF NOT EXISTS "partner_club_bindings_club_idx"
  ON "partner_club_bindings" ("club_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_club_bindings_partner_id_fkey') THEN
    ALTER TABLE "partner_club_bindings"
      ADD CONSTRAINT "partner_club_bindings_partner_id_fkey"
      FOREIGN KEY ("partner_id") REFERENCES "partners"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_club_bindings_club_id_fkey') THEN
    ALTER TABLE "partner_club_bindings"
      ADD CONSTRAINT "partner_club_bindings_club_id_fkey"
      FOREIGN KEY ("club_id") REFERENCES "clubs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION set_updated_at_partner_club_bindings()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS "partner_club_bindings_set_updated_at" ON "partner_club_bindings";
CREATE TRIGGER "partner_club_bindings_set_updated_at"
  BEFORE UPDATE ON "partner_club_bindings"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_partner_club_bindings();

ALTER TABLE "partner_club_bindings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON "partner_club_bindings";
CREATE POLICY "service_role_all" ON "partner_club_bindings"
  FOR ALL TO service_role USING (true) WITH CHECK (true);
