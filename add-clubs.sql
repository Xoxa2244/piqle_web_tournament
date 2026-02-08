-- Clubs / Organizations
-- Adds:
-- - clubs table (venue/community organizations)
-- - followers, admins, announcements, booking requests
-- - tournaments.club_id optional foreign key

-- Enums for Prisma compatibility
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClubKind') THEN
    CREATE TYPE "ClubKind" AS ENUM ('VENUE', 'COMMUNITY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClubAdminRole') THEN
    CREATE TYPE "ClubAdminRole" AS ENUM ('ADMIN', 'MODERATOR');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClubBookingRequestStatus') THEN
    CREATE TYPE "ClubBookingRequestStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'CLOSED');
  END IF;
END
$$;

-- Clubs
CREATE TABLE IF NOT EXISTS "clubs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "kind" "ClubKind" NOT NULL DEFAULT 'VENUE',
  "description" TEXT,
  "logo_url" TEXT,
  "address" TEXT,
  "city" TEXT,
  "state" TEXT,
  "country" TEXT,
  "is_verified" BOOLEAN NOT NULL DEFAULT false,
  "court_reserve_url" TEXT,
  "booking_request_email" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

-- Add missing columns if clubs table already existed (idempotent patching)
ALTER TABLE "clubs"
  ADD COLUMN IF NOT EXISTS "logo_url" TEXT;

-- Link tournaments -> clubs
ALTER TABLE "tournaments"
  ADD COLUMN IF NOT EXISTS "club_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'tournaments_club_id_fkey'
  ) THEN
    ALTER TABLE "tournaments"
      ADD CONSTRAINT "tournaments_club_id_fkey"
      FOREIGN KEY ("club_id") REFERENCES "clubs" ("id") ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "tournaments_club_id_idx" ON "tournaments" ("club_id");

-- Followers
CREATE TABLE IF NOT EXISTS "club_followers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "club_id" UUID NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "club_followers_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs" ("id") ON DELETE CASCADE,
  CONSTRAINT "club_followers_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'club_followers_unique_club_user'
  ) THEN
    ALTER TABLE "club_followers"
      ADD CONSTRAINT "club_followers_unique_club_user" UNIQUE ("club_id", "user_id");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "club_followers_user_id_idx" ON "club_followers" ("user_id");

-- Admins
CREATE TABLE IF NOT EXISTS "club_admins" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "club_id" UUID NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" "ClubAdminRole" NOT NULL DEFAULT 'ADMIN',
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "club_admins_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs" ("id") ON DELETE CASCADE,
  CONSTRAINT "club_admins_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'club_admins_unique_club_user'
  ) THEN
    ALTER TABLE "club_admins"
      ADD CONSTRAINT "club_admins_unique_club_user" UNIQUE ("club_id", "user_id");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "club_admins_user_id_idx" ON "club_admins" ("user_id");

-- Announcements (admin-only posting in app; public reading)
CREATE TABLE IF NOT EXISTS "club_announcements" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "club_id" UUID NOT NULL,
  "title" TEXT,
  "body" TEXT NOT NULL,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "club_announcements_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs" ("id") ON DELETE CASCADE,
  CONSTRAINT "club_announcements_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "club_announcements_club_id_created_at_idx"
  ON "club_announcements" ("club_id", "created_at");

-- Booking requests / inquiries
CREATE TABLE IF NOT EXISTS "club_booking_requests" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "club_id" UUID NOT NULL,
  "requester_user_id" TEXT,
  "requester_name" TEXT NOT NULL,
  "requester_email" TEXT NOT NULL,
  "requester_phone" TEXT,
  "desired_start" TIMESTAMP,
  "duration_minutes" INTEGER,
  "players_count" INTEGER,
  "message" TEXT,
  "status" "ClubBookingRequestStatus" NOT NULL DEFAULT 'NEW',
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "club_booking_requests_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs" ("id") ON DELETE CASCADE,
  CONSTRAINT "club_booking_requests_requester_user_id_fkey"
    FOREIGN KEY ("requester_user_id") REFERENCES "users" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "club_booking_requests_club_id_created_at_idx"
  ON "club_booking_requests" ("club_id", "created_at");
CREATE INDEX IF NOT EXISTS "club_booking_requests_requester_user_id_idx"
  ON "club_booking_requests" ("requester_user_id");
