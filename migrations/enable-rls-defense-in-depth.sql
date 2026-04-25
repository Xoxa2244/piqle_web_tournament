-- Row-Level Security: Defense-in-Depth
--
-- This app connects to Postgres via Prisma as the `postgres` user (table owner),
-- which BYPASSES RLS by default. Therefore enabling RLS does NOT break existing
-- queries that go through tRPC or the Prisma client.
--
-- What RLS protects against:
--   1. A leaked anon/authenticated Supabase key used for direct REST API access
--   2. A misconfigured client-side component querying sensitive tables directly
--   3. Supabase Realtime subscriptions accidentally exposing data across clubs
--   4. Future moves to a less-privileged DB user — defensive policies stay valid
--
-- Strategy:
--   - Enable RLS on every sensitive table
--   - Explicit `service_role` bypass for future-proofing (service_role can do anything)
--   - No `anon` or `authenticated` policies → deny-by-default for those roles
--   - Skip tournament scoreboard tables (public by design, separate migration if needed)
--
-- Verification:
--   - Run `npm run typecheck` and `npm run test` — must still pass (Prisma unaffected)
--   - In Supabase dashboard → SQL editor: try
--       SELECT * FROM ai_recommendation_logs  (as service_role)   → returns rows
--       with anon JWT role context                                → returns 0 rows
--
-- Rollback: ALTER TABLE <name> DISABLE ROW LEVEL SECURITY; DROP POLICY ... ON <name>;

-- ─────────────────────────────────────────────────────────────────────
-- Tier 1: Intelligence & AI (club-scoped, highest value)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE "ai_recommendation_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "ai_recommendation_logs"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "ai_conversations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "ai_conversations"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "ai_messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "ai_messages"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "ai_usage_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "ai_usage_logs"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "document_embeddings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "document_embeddings"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "agent_drafts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "agent_drafts"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "agent_decision_records" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "agent_decision_records"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "agent_admin_todo_decisions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "agent_admin_todo_decisions"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "ops_session_drafts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "ops_session_drafts"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "member_health_snapshots" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "member_health_snapshots"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "member_ai_profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "member_ai_profiles"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "weekly_summaries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "weekly_summaries"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "session_interest_requests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "session_interest_requests"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "integration_anomaly_incidents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "integration_anomaly_incidents"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "referral_reward_issuances" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "referral_reward_issuances"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- Tier 2: Club Booking & Scheduling (club-scoped, PII present)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE "play_sessions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "play_sessions"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "play_session_bookings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "play_session_bookings"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "play_session_waitlist" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "play_session_waitlist"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "club_courts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "club_courts"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "user_play_preferences" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "user_play_preferences"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- Tier 3: Club Management (admin-only, sensitive credentials)
-- ─────────────────────────────────────────────────────────────────────

-- MOST SENSITIVE — contains encrypted CourtReserve/PodPlay credentials
ALTER TABLE "club_connectors" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "club_connectors"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "club_cohorts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "club_cohorts"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "club_booking_requests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "club_booking_requests"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "club_announcements" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "club_announcements"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "club_bans" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "club_bans"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "club_invites" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "club_invites"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "club_join_requests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "club_join_requests"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "club_join_request_seen" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "club_join_request_seen"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "club_chat_messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "club_chat_messages"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "club_chat_read_states" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "club_chat_read_states"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- Tier 4: Payments & Subscriptions
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "payments"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "subscriptions"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- Tier 5: Partner API & Audit (API keys, request logs)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE "partner_apps" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "partner_apps"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "partner_club_bindings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "partner_club_bindings"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "partner_webhooks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "partner_webhooks"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "api_request_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "api_request_logs"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "audit_logs"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- Tier 6: NextAuth (auth state — must never be exposed to clients)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "accounts"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "sessions"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "email_otps" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "email_otps"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "verification_tokens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "verification_tokens"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- Tier 7: Tournament Private (access control + invitations)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE "tournament_access_requests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "tournament_access_requests"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "tournament_accesses" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "tournament_accesses"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "tournament_invitations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "tournament_invitations"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "tournament_chat_messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "tournament_chat_messages"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "tournament_chat_read_states" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "tournament_chat_read_states"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "division_chat_messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "division_chat_messages"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "division_chat_read_states" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "division_chat_read_states"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "idempotency_keys"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- Notes on tables NOT covered here (intentional):
--
--   Public scoreboard (tournaments, matches, games, standings, etc.):
--     Read via public tRPC endpoints with `isPublicBoardEnabled` check.
--     Enabling RLS would require careful policies to preserve that flow.
--     Revisit in a follow-up migration if we start allowing Supabase Realtime
--     subscriptions for live scoreboards.
--
--   Base models (users, clubs, players, club_admins, club_followers):
--     Low-risk to expose basic info (name, avatar). Adding RLS here needs
--     careful policies for the authenticated role to allow profile lookups.
--     Kept off until we have Supabase Auth integration or direct client queries.
-- ─────────────────────────────────────────────────────────────────────
