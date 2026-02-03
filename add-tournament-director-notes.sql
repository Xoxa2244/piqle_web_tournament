-- Tournament director notes (private notes for tournament admins)
CREATE TABLE IF NOT EXISTS "tournament_director_notes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tournament_id" TEXT NOT NULL REFERENCES "Tournament"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "text" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "tournament_director_notes_tournament_id_created_at_idx"
  ON "tournament_director_notes"("tournament_id", "created_at");
