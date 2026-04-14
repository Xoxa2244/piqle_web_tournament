CREATE TABLE "agent_admin_todo_decisions" (
  "id" UUID NOT NULL,
  "club_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "date_key" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "href" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_admin_todo_decisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_admin_todo_decisions_club_id_user_id_date_key_item_id_key"
  ON "agent_admin_todo_decisions"("club_id", "user_id", "date_key", "item_id");

CREATE INDEX "agent_admin_todo_decisions_club_id_user_id_date_key_updated_at_idx"
  ON "agent_admin_todo_decisions"("club_id", "user_id", "date_key", "updated_at" DESC);

ALTER TABLE "agent_admin_todo_decisions"
  ADD CONSTRAINT "agent_admin_todo_decisions_club_id_fkey"
  FOREIGN KEY ("club_id") REFERENCES "clubs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_admin_todo_decisions"
  ADD CONSTRAINT "agent_admin_todo_decisions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
