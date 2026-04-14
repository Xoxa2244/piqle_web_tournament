CREATE TABLE "agent_drafts" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "conversation_id" TEXT,
    "source_message_id" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'review_ready',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "original_intent" TEXT,
    "selected_plan" TEXT NOT NULL DEFAULT 'requested',
    "requested_action" JSONB NOT NULL,
    "recommended_action" JSONB,
    "working_action" JSONB NOT NULL,
    "sandbox_mode" BOOLEAN NOT NULL DEFAULT false,
    "scheduled_for" TIMESTAMP(3),
    "time_zone" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "approved_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_drafts_source_message_id_key" ON "agent_drafts"("source_message_id");
CREATE INDEX "agent_drafts_club_id_status_updated_at_idx" ON "agent_drafts"("club_id", "status", "updated_at" DESC);
CREATE INDEX "agent_drafts_conversation_id_updated_at_idx" ON "agent_drafts"("conversation_id", "updated_at" DESC);
CREATE INDEX "agent_drafts_created_by_user_id_updated_at_idx" ON "agent_drafts"("created_by_user_id", "updated_at" DESC);

ALTER TABLE "agent_drafts"
ADD CONSTRAINT "agent_drafts_club_id_fkey"
FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_drafts"
ADD CONSTRAINT "agent_drafts_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_drafts"
ADD CONSTRAINT "agent_drafts_source_message_id_fkey"
FOREIGN KEY ("source_message_id") REFERENCES "ai_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_drafts"
ADD CONSTRAINT "agent_drafts_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
