-- Extended RLS coverage — tables missed in initial enable-rls-defense-in-depth sweep,
-- tournament scoreboard tables, and base tables (users, clubs, etc).
--
-- Applied to prod via Supabase MCP on 2026-04-17.
--
-- After this migration + the initial RLS sweep + migration-4 tables,
-- Supabase security advisor reports 0 ERRORs on the RLS front (down from 57).
--
-- These all use the same pattern: service_role bypass, deny-by-default for
-- anon/authenticated. Prisma (postgres owner) bypasses RLS automatically,
-- so application code is unaffected.
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    -- Sensitive tables missed in initial sweep
    'direct_chat_threads','direct_chat_messages','direct_chat_read_states',
    'direct_chat_hidden_states','direct_chat_blocks','direct_chat_reports',
    'direct_chat_likes',
    'ai_coach_state','ai_coach_messages',
    'feedback','club_member_join_logs','club_member_leave_logs',
    'club_chat_likes','tournament_chat_likes','division_chat_likes',
    'club_chat_member_tags',
    'club_announcement_likes','club_announcement_polls',
    'club_announcement_poll_options','club_announcement_poll_votes',
    'import_jobs','assistant_assignments','external_id_mappings','partners',
    -- Tournament scoreboard tables (read via tRPC which uses Prisma owner)
    'tournaments','matches','games','standings','players','teams','team_players',
    'divisions','division_constraints','division_rr_bindings','pools',
    'round_robin_groups','rr_settings','tiebreakers','match_days','day_rosters',
    'indy_games','indy_matchups','indy_league_settings','indy_league_standings',
    'courts','waitlist_entries','tournament_comments','tournament_ratings',
    'club_tournament_templates','tournament_payment_settings','prizes',
    -- Base tables
    'users','clubs','club_followers','club_admins'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "service_role_all" ON %I', tbl);
      EXECUTE format(
        'CREATE POLICY "service_role_all" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        tbl
      );
      RAISE NOTICE 'RLS enabled on: %', tbl;
    ELSE
      RAISE NOTICE 'SKIPPED: %', tbl;
    END IF;
  END LOOP;
END $$;

-- Fix function_search_path_mutable warnings
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
             WHERE n.nspname = 'public' AND p.proname = 'update_sir_updated_at') THEN
    ALTER FUNCTION public.update_sir_updated_at() SET search_path = public, pg_temp;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
             WHERE n.nspname = 'public' AND p.proname = 'set_updated_at_partner_club_bindings') THEN
    ALTER FUNCTION public.set_updated_at_partner_club_bindings() SET search_path = public, pg_temp;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
             WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column') THEN
    ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
  END IF;
END $$;

-- match_documents has overloaded signatures — handle them all
DO $$
DECLARE stmt TEXT;
BEGIN
  FOR stmt IN
    SELECT format('ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp;',
                  p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'match_documents'
  LOOP
    EXECUTE stmt;
  END LOOP;
END $$;

-- Drop 4 duplicate indexes on member_ai_profiles (kept Prisma-named versions)
DROP INDEX IF EXISTS idx_map_club;
DROP INDEX IF EXISTS idx_member_ai_profiles_club;
DROP INDEX IF EXISTS idx_member_ai_profiles_risk;
DROP INDEX IF EXISTS idx_member_ai_profiles_user;
