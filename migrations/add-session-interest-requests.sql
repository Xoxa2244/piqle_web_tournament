CREATE TABLE IF NOT EXISTS session_interest_requests (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id              TEXT        NOT NULL,
  club_id              UUID        NOT NULL,
  preferred_days       TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  preferred_formats    TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  preferred_time_slots JSONB       NOT NULL DEFAULT '{"morning":false,"afternoon":false,"evening":false}'::jsonb,
  token                TEXT        NOT NULL,
  status               TEXT        NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'notified', 'booked')),
  notified_at          TIMESTAMPTZ,
  session_id           UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT session_interest_requests_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS session_interest_requests_token_key ON session_interest_requests(token);
CREATE UNIQUE INDEX IF NOT EXISTS session_interest_requests_user_club_key ON session_interest_requests(user_id, club_id);
CREATE INDEX IF NOT EXISTS session_interest_requests_club_id_idx ON session_interest_requests(club_id);
CREATE INDEX IF NOT EXISTS session_interest_requests_status_idx ON session_interest_requests(status);

ALTER TABLE session_interest_requests
  ADD CONSTRAINT sir_user_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE session_interest_requests
  ADD CONSTRAINT sir_club_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION update_sir_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sir_updated_at ON session_interest_requests;
CREATE TRIGGER sir_updated_at BEFORE UPDATE ON session_interest_requests FOR EACH ROW EXECUTE FUNCTION update_sir_updated_at();
