-- Agent Decision Records — audit trail for every agent control-plane decision.
-- Applied to prod via Supabase MCP on 2026-04-17.
--
-- Why critical: the P0 security commits (50a5fd6, dbe5040) reference
-- persistAgentDecisionRecord from lib/ai/agent-decision-records.ts. Without
-- this table, every control-plane / autonomy / rollout decision is silently
-- lost (the function catches the error). Zero audit trail.
CREATE TABLE IF NOT EXISTS "agent_decision_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "club_id" UUID NOT NULL,
  "user_id" TEXT,
  "actor_type" TEXT NOT NULL DEFAULT 'user',
  "action" TEXT NOT NULL,
  "target_type" TEXT,
  "target_id" TEXT,
  "mode" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "agent_decision_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_decision_records_club_created_idx"
  ON "agent_decision_records" ("club_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "agent_decision_records_club_action_created_idx"
  ON "agent_decision_records" ("club_id", "action", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "agent_decision_records_club_result_created_idx"
  ON "agent_decision_records" ("club_id", "result", "created_at" DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_decision_records_club_id_fkey') THEN
    ALTER TABLE "agent_decision_records"
      ADD CONSTRAINT "agent_decision_records_club_id_fkey"
      FOREIGN KEY ("club_id") REFERENCES "clubs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_decision_records_user_id_fkey') THEN
    ALTER TABLE "agent_decision_records"
      ADD CONSTRAINT "agent_decision_records_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "agent_decision_records" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON "agent_decision_records";
CREATE POLICY "service_role_all" ON "agent_decision_records"
  FOR ALL TO service_role USING (true) WITH CHECK (true);
