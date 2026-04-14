CREATE TYPE "OpsSessionDraftStatus" AS ENUM (
  'READY_FOR_OPS',
  'SESSION_DRAFT',
  'REJECTED',
  'ARCHIVED'
);

CREATE TABLE "ops_session_drafts" (
  "id" UUID NOT NULL,
  "club_id" UUID NOT NULL,
  "agent_draft_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "source_proposal_id" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "status" "OpsSessionDraftStatus" NOT NULL DEFAULT 'READY_FOR_OPS',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "day_of_week" TEXT NOT NULL,
  "time_slot" TEXT NOT NULL,
  "start_time" TEXT NOT NULL,
  "end_time" TEXT NOT NULL,
  "format" "PlaySessionFormat" NOT NULL,
  "skill_level" "PlaySessionSkillLevel" NOT NULL DEFAULT 'ALL_LEVELS',
  "max_players" INTEGER NOT NULL DEFAULT 8,
  "projected_occupancy" INTEGER NOT NULL,
  "estimated_interested_members" INTEGER NOT NULL,
  "confidence" INTEGER NOT NULL,
  "note" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "session_drafted_at" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ops_session_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ops_session_drafts_agent_draft_id_source_proposal_id_key"
  ON "ops_session_drafts"("agent_draft_id", "source_proposal_id");

CREATE INDEX "ops_session_drafts_club_id_status_updated_at_idx"
  ON "ops_session_drafts"("club_id", "status", "updated_at" DESC);

CREATE INDEX "ops_session_drafts_agent_draft_id_updated_at_idx"
  ON "ops_session_drafts"("agent_draft_id", "updated_at" DESC);

ALTER TABLE "ops_session_drafts"
  ADD CONSTRAINT "ops_session_drafts_club_id_fkey"
  FOREIGN KEY ("club_id") REFERENCES "clubs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops_session_drafts"
  ADD CONSTRAINT "ops_session_drafts_agent_draft_id_fkey"
  FOREIGN KEY ("agent_draft_id") REFERENCES "agent_drafts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops_session_drafts"
  ADD CONSTRAINT "ops_session_drafts_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
