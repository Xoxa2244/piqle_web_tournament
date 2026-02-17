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

DO $$
DECLARE
  tournament_reg_end_col TEXT;
  tournament_start_col   TEXT;
  payment_created_col    TEXT;
  payment_tournament_col TEXT;
BEGIN
  -- Support both naming styles in existing environments.
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'registration_end_date'
    ) THEN 'registration_end_date'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'registrationEndDate'
    ) THEN 'registrationEndDate'
    ELSE NULL
  END INTO tournament_reg_end_col;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'startDate'
    ) THEN 'startDate'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'start_date'
    ) THEN 'start_date'
    ELSE NULL
  END INTO tournament_start_col;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'created_at'
    ) THEN 'created_at'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'createdAt'
    ) THEN 'createdAt'
    ELSE NULL
  END INTO payment_created_col;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'tournament_id'
    ) THEN 'tournament_id'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'tournamentId'
    ) THEN 'tournamentId'
    ELSE NULL
  END INTO payment_tournament_col;

  IF tournament_start_col IS NULL THEN
    RAISE EXCEPTION 'Cannot find tournament start column (startDate/start_date).';
  END IF;
  IF tournament_reg_end_col IS NULL THEN
    tournament_reg_end_col := tournament_start_col;
  END IF;
  IF payment_created_col IS NULL THEN
    RAISE EXCEPTION 'Cannot find payments created column (created_at/createdAt).';
  END IF;
  IF payment_tournament_col IS NULL THEN
    RAISE EXCEPTION 'Cannot find payments tournament column (tournament_id/tournamentId).';
  END IF;

  EXECUTE format(
    $sql$
      UPDATE "payments" AS p
      SET "due_at" = CASE
        WHEN COALESCE(t."payment_timing"::text, 'PAY_IN_15_MIN') = 'PAY_BY_DEADLINE'
          THEN COALESCE(t.%I, t.%I)
        ELSE p.%I + INTERVAL '15 minutes'
      END
      FROM "tournaments" AS t
      WHERE p.%I = t."id"
        AND p."status" = 'PENDING'
        AND p."due_at" IS NULL
    $sql$,
    tournament_reg_end_col,
    tournament_start_col,
    payment_created_col,
    payment_tournament_col
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS "payments_tournament_status_due_at_idx" ON "payments" (%I, "status", "due_at")',
    payment_tournament_col
  );
END
$$;
