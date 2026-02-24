-- User notifications feed (for bell + toasts)
-- Adds a generic notifications table to store user-facing events.

CREATE TABLE IF NOT EXISTS "user_notifications" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "target_url" TEXT,
  "data" JSONB,
  "read_at" TIMESTAMP,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "user_notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "user_notifications_user_id_created_at_idx"
  ON "user_notifications" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "user_notifications_user_id_read_at_idx"
  ON "user_notifications" ("user_id", "read_at");
