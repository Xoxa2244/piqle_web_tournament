-- Tournament + Division chats (MVP)
-- Notes:
-- - Tournament chat: owner, tournament/club admins, tournament participants.
-- - Division chat: owner, tournament/club admins, division participants.
-- - Permissions are enforced in app (TRPC).

CREATE TABLE IF NOT EXISTS "tournament_chat_messages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tournament_id" UUID NOT NULL,
  "user_id" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "deleted_at" TIMESTAMP,
  "deleted_by_user_id" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "tournament_chat_messages_tournament_id_fkey"
    FOREIGN KEY ("tournament_id") REFERENCES "tournaments" ("id") ON DELETE CASCADE,
  CONSTRAINT "tournament_chat_messages_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "tournament_chat_messages_tournament_id_created_at_idx"
  ON "tournament_chat_messages" ("tournament_id", "created_at");
CREATE INDEX IF NOT EXISTS "tournament_chat_messages_user_id_idx"
  ON "tournament_chat_messages" ("user_id");
CREATE INDEX IF NOT EXISTS "tournament_chat_messages_tournament_id_user_id_created_at_idx"
  ON "tournament_chat_messages" ("tournament_id", "user_id", "created_at");

CREATE TABLE IF NOT EXISTS "division_chat_messages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "division_id" UUID NOT NULL,
  "user_id" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "deleted_at" TIMESTAMP,
  "deleted_by_user_id" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "division_chat_messages_division_id_fkey"
    FOREIGN KEY ("division_id") REFERENCES "divisions" ("id") ON DELETE CASCADE,
  CONSTRAINT "division_chat_messages_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "division_chat_messages_division_id_created_at_idx"
  ON "division_chat_messages" ("division_id", "created_at");
CREATE INDEX IF NOT EXISTS "division_chat_messages_user_id_idx"
  ON "division_chat_messages" ("user_id");
CREATE INDEX IF NOT EXISTS "division_chat_messages_division_id_user_id_created_at_idx"
  ON "division_chat_messages" ("division_id", "user_id", "created_at");
