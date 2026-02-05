-- Enum for invitation status
CREATE TYPE "TournamentInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- Tournament invitations: invite platform user to tournament as player
CREATE TABLE IF NOT EXISTS tournament_invitations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  invited_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status "TournamentInvitationStatus" NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, invited_user_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_invitations_tournament_id ON tournament_invitations(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_invitations_invited_user_id ON tournament_invitations(invited_user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_invitations_status ON tournament_invitations(status);
