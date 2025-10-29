-- Migration: Add TournamentAccessRequest model
-- Apply this SQL in Supabase SQL Editor

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "tournament_access_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tournament_access_requests_userId_tournamentId_key" 
    ON "tournament_access_requests"("userId", "tournamentId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "tournament_access_requests" 
        ADD CONSTRAINT "tournament_access_requests_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "users"("id") 
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "tournament_access_requests" 
        ADD CONSTRAINT "tournament_access_requests_tournamentId_fkey" 
        FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") 
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
