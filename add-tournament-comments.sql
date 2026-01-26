-- Create TournamentComment table for tournament comments
CREATE TABLE IF NOT EXISTS tournament_comments (
    id TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    text TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT tournament_comments_pkey PRIMARY KEY (id)
);

-- Create foreign key constraints
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'tournament_comments_tournamentId_fkey'
    ) THEN
        ALTER TABLE tournament_comments 
        ADD CONSTRAINT tournament_comments_tournamentId_fkey 
        FOREIGN KEY ("tournamentId") REFERENCES tournaments(id) ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'tournament_comments_userId_fkey'
    ) THEN
        ALTER TABLE tournament_comments 
        ADD CONSTRAINT tournament_comments_userId_fkey 
        FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS tournament_comments_tournamentId_createdAt_idx 
ON tournament_comments("tournamentId", "createdAt");

