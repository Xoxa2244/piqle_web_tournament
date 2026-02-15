-- Tournament payment timing policy + payment due dates

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentTiming') THEN
    CREATE TYPE "PaymentTiming" AS ENUM ('PAY_IN_15_MIN', 'PAY_BY_DEADLINE');
  END IF;
END
$$;

ALTER TABLE "tournaments"
  ADD COLUMN IF NOT EXISTS "payment_timing" "PaymentTiming" NOT NULL DEFAULT 'PAY_IN_15_MIN';

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "due_at" TIMESTAMP;

UPDATE "payments" AS p
SET "due_at" = CASE
  WHEN COALESCE(t."payment_timing"::text, 'PAY_IN_15_MIN') = 'PAY_BY_DEADLINE'
    THEN COALESCE(t."registration_end_date", t."start_date")
  ELSE p."created_at" + INTERVAL '15 minutes'
END
FROM "tournaments" AS t
WHERE p."tournament_id" = t."id"
  AND p."status" = 'PENDING'
  AND p."due_at" IS NULL;

CREATE INDEX IF NOT EXISTS "payments_tournament_status_due_at_idx"
  ON "payments" ("tournament_id", "status", "due_at");
