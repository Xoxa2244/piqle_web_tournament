-- AI Cost Tracking
--
-- Per-call usage logs for visibility into AI spend.
-- Plus per-club monthly budget so we can refuse expensive calls when exceeded.
--
-- Rationale: At 100+ clubs, daily profile generation + embeddings + advisor
-- chat + campaigns can burn $500-2000/day with zero visibility. Without
-- budgets, a runaway cron or abuse can cost $$$$ before anyone notices.

-- ── ai_usage_logs ─────────────────────────────────────────────────────
-- Every LLM/embedding call records: model, operation, tokens, cost.
CREATE TABLE IF NOT EXISTS "ai_usage_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "club_id" UUID NOT NULL,
  "model" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
  "completion_tokens" INTEGER NOT NULL DEFAULT 0,
  "total_tokens" INTEGER NOT NULL DEFAULT 0,
  "cost_usd" DECIMAL(10, 6) NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_usage_logs_club_created_idx"
  ON "ai_usage_logs" ("club_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "ai_usage_logs_operation_created_idx"
  ON "ai_usage_logs" ("operation", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "ai_usage_logs_model_created_idx"
  ON "ai_usage_logs" ("model", "created_at" DESC);

ALTER TABLE "ai_usage_logs"
  ADD CONSTRAINT "ai_usage_logs_club_id_fkey"
  FOREIGN KEY ("club_id") REFERENCES "clubs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Club budget fields ────────────────────────────────────────────────
-- aiMonthlyBudgetUsd: NULL = unlimited (default for grandfathered clubs).
-- Set via superadmin or subscription tier defaults.
-- aiSpendCurrentMonth: rolling counter, reset by monthly cron.
ALTER TABLE "clubs"
  ADD COLUMN IF NOT EXISTS "ai_monthly_budget_usd" DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS "ai_spend_current_month" DECIMAL(10, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ai_spend_month_start" TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- For quick dashboard queries: "clubs approaching or over budget"
CREATE INDEX IF NOT EXISTS "clubs_ai_spend_idx"
  ON "clubs" ("ai_spend_current_month" DESC)
  WHERE "ai_monthly_budget_usd" IS NOT NULL;
