


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."AccessLevel" AS ENUM (
    'ADMIN',
    'SCORE_ONLY'
);


ALTER TYPE "public"."AccessLevel" OWNER TO "postgres";


CREATE TYPE "public"."AccessRequestStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


ALTER TYPE "public"."AccessRequestStatus" OWNER TO "postgres";


CREATE TYPE "public"."BestOfMode" AS ENUM (
    'FIXED_GAMES',
    'BEST_OF'
);


ALTER TYPE "public"."BestOfMode" OWNER TO "postgres";


CREATE TYPE "public"."BindingStatus" AS ENUM (
    'BOUND',
    'UNBOUND'
);


ALTER TYPE "public"."BindingStatus" OWNER TO "postgres";


CREATE TYPE "public"."DivisionStage" AS ENUM (
    'RR_IN_PROGRESS',
    'RR_COMPLETE',
    'PLAY_IN_SCHEDULED',
    'PLAY_IN_IN_PROGRESS',
    'PLAY_IN_COMPLETE',
    'PO_R1_SCHEDULED',
    'PO_R1_IN_PROGRESS',
    'PO_R1_COMPLETE',
    'PO_R2_SCHEDULED',
    'PO_R2_IN_PROGRESS',
    'PO_R2_COMPLETE',
    'PO_R3_SCHEDULED',
    'PO_R3_IN_PROGRESS',
    'PO_R3_COMPLETE',
    'FINAL_SCHEDULED',
    'FINAL_IN_PROGRESS',
    'FINAL_COMPLETE',
    'DIVISION_COMPLETE'
);


ALTER TYPE "public"."DivisionStage" OWNER TO "postgres";


CREATE TYPE "public"."DuprSubmissionStatus" AS ENUM (
    'PENDING',
    'SUCCESS',
    'FAILED'
);


ALTER TYPE "public"."DuprSubmissionStatus" OWNER TO "postgres";


CREATE TYPE "public"."GameType" AS ENUM (
    'WOMEN',
    'MEN',
    'MIXED_1',
    'MIXED_2'
);


ALTER TYPE "public"."GameType" OWNER TO "postgres";


CREATE TYPE "public"."GameWinner" AS ENUM (
    'A',
    'B'
);


ALTER TYPE "public"."GameWinner" OWNER TO "postgres";


CREATE TYPE "public"."Gender" AS ENUM (
    'M',
    'F',
    'X'
);


ALTER TYPE "public"."Gender" OWNER TO "postgres";


CREATE TYPE "public"."GenderConstraint" AS ENUM (
    'ANY',
    'MEN',
    'WOMEN',
    'MIXED'
);


ALTER TYPE "public"."GenderConstraint" OWNER TO "postgres";


CREATE TYPE "public"."ImportSource" AS ENUM (
    'PBT_CSV'
);


ALTER TYPE "public"."ImportSource" OWNER TO "postgres";


CREATE TYPE "public"."ImportStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED'
);


ALTER TYPE "public"."ImportStatus" OWNER TO "postgres";


CREATE TYPE "public"."IndySlot" AS ENUM (
    'A',
    'B',
    'C',
    'D'
);


ALTER TYPE "public"."IndySlot" OWNER TO "postgres";


CREATE TYPE "public"."MatchDayStatus" AS ENUM (
    'DRAFT',
    'IN_PROGRESS',
    'FINALIZED'
);


ALTER TYPE "public"."MatchDayStatus" OWNER TO "postgres";


CREATE TYPE "public"."MatchStage" AS ENUM (
    'ROUND_ROBIN',
    'ELIMINATION',
    'PLAY_IN'
);


ALTER TYPE "public"."MatchStage" OWNER TO "postgres";


CREATE TYPE "public"."MatchupStatus" AS ENUM (
    'PENDING',
    'READY',
    'IN_PROGRESS',
    'COMPLETED'
);


ALTER TYPE "public"."MatchupStatus" OWNER TO "postgres";


CREATE TYPE "public"."PairingMode" AS ENUM (
    'FIXED',
    'MIX_AND_MATCH'
);


ALTER TYPE "public"."PairingMode" OWNER TO "postgres";


CREATE TYPE "public"."PaymentStatus" AS ENUM (
    'PENDING',
    'REQUIRES_ACTION',
    'SUCCEEDED',
    'FAILED',
    'REFUNDED'
);


ALTER TYPE "public"."PaymentStatus" OWNER TO "postgres";


CREATE TYPE "public"."PlayerRole" AS ENUM (
    'CAPTAIN',
    'PLAYER',
    'SUB'
);


ALTER TYPE "public"."PlayerRole" OWNER TO "postgres";


CREATE TYPE "public"."PrizeKind" AS ENUM (
    'CASH',
    'OTHER'
);


ALTER TYPE "public"."PrizeKind" OWNER TO "postgres";


CREATE TYPE "public"."RatingType" AS ENUM (
    'LIKE',
    'DISLIKE'
);


ALTER TYPE "public"."RatingType" OWNER TO "postgres";


CREATE TYPE "public"."StripeAccountStatus" AS ENUM (
    'PENDING',
    'REQUIRE_ONBOARDING',
    'ACTIVE'
);


ALTER TYPE "public"."StripeAccountStatus" OWNER TO "postgres";


CREATE TYPE "public"."TeamKind" AS ENUM (
    'SINGLES_1v1',
    'DOUBLES_2v2',
    'SQUAD_4v4'
);


ALTER TYPE "public"."TeamKind" OWNER TO "postgres";


CREATE TYPE "public"."TournamentFormat" AS ENUM (
    'SINGLE_ELIMINATION',
    'MLP',
    'INDY_LEAGUE'
);


ALTER TYPE "public"."TournamentFormat" OWNER TO "postgres";


CREATE TYPE "public"."UserRole" AS ENUM (
    'TD',
    'ASSISTANT'
);


ALTER TYPE "public"."UserRole" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "text" NOT NULL,
    "userId" "text" NOT NULL,
    "type" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "providerAccountId" "text" NOT NULL,
    "refresh_token" "text",
    "access_token" "text",
    "expires_at" integer,
    "token_type" "text",
    "scope" "text",
    "id_token" "text",
    "session_state" "text"
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assistant_assignments" (
    "id" "text" NOT NULL,
    "userId" "text" NOT NULL,
    "divisionId" "text" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."assistant_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "text" NOT NULL,
    "actorUserId" "text" NOT NULL,
    "tournamentId" "text" NOT NULL,
    "action" "text" NOT NULL,
    "entityType" "text" NOT NULL,
    "entityId" "text" NOT NULL,
    "payload" "jsonb",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."day_rosters" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "matchup_id" "text" NOT NULL,
    "team_id" "text" NOT NULL,
    "player_id" "text" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "letter" character varying(1),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "day_rosters_letter_check" CHECK ((("letter")::"text" = ANY ((ARRAY['A'::character varying, 'B'::character varying, 'C'::character varying, 'D'::character varying])::"text"[])))
);


ALTER TABLE "public"."day_rosters" OWNER TO "postgres";


COMMENT ON TABLE "public"."day_rosters" IS 'Day rosters for IndyLeague matchups';



COMMENT ON COLUMN "public"."day_rosters"."is_active" IS 'Whether player is active for this matchup (exactly 4 per team)';



COMMENT ON COLUMN "public"."day_rosters"."letter" IS 'Letter assignment (A/B/C/D) for active players';



CREATE TABLE IF NOT EXISTS "public"."division_constraints" (
    "id" "text" NOT NULL,
    "divisionId" "text" NOT NULL,
    "minDupr" numeric(4,2),
    "maxDupr" numeric(4,2),
    "minAge" integer,
    "maxAge" integer,
    "genders" "public"."GenderConstraint" DEFAULT 'ANY'::"public"."GenderConstraint" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."division_constraints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."division_rr_bindings" (
    "id" "text" NOT NULL,
    "divisionId" "text" NOT NULL,
    "rrGroupId" "text" NOT NULL,
    "status" "public"."BindingStatus" DEFAULT 'BOUND'::"public"."BindingStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."division_rr_bindings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."divisions" (
    "id" "text" NOT NULL,
    "tournamentId" "text" NOT NULL,
    "name" "text" NOT NULL,
    "teamKind" "public"."TeamKind" NOT NULL,
    "pairingMode" "public"."PairingMode" NOT NULL,
    "maxTeams" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "stage" "public"."DivisionStage" DEFAULT 'RR_IN_PROGRESS'::"public"."DivisionStage",
    "poolCount" integer DEFAULT 1 NOT NULL,
    "isMerged" boolean DEFAULT false NOT NULL,
    "mergedFromDivisionIds" "jsonb"
);


ALTER TABLE "public"."divisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."games" (
    "id" "text" NOT NULL,
    "matchId" "text" NOT NULL,
    "index" integer NOT NULL,
    "scoreA" integer,
    "scoreB" integer,
    "winner" "public"."GameWinner",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "gameType" "public"."GameType",
    "indyLineup" "jsonb"
);


ALTER TABLE "public"."games" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."import_jobs" (
    "id" "text" NOT NULL,
    "tournamentId" "text" NOT NULL,
    "source" "public"."ImportSource" DEFAULT 'PBT_CSV'::"public"."ImportSource" NOT NULL,
    "status" "public"."ImportStatus" DEFAULT 'PENDING'::"public"."ImportStatus" NOT NULL,
    "mappingJson" "jsonb",
    "rawFileUrl" "text",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."import_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."indy_games" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "matchup_id" "text" NOT NULL,
    "order" integer NOT NULL,
    "court" integer NOT NULL,
    "home_pair" character varying(2) NOT NULL,
    "away_pair" character varying(2) NOT NULL,
    "home_score" integer,
    "away_score" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "indy_games_away_pair_check" CHECK ((("away_pair")::"text" = ANY ((ARRAY['AB'::character varying, 'CD'::character varying, 'AC'::character varying, 'BD'::character varying, 'AD'::character varying, 'BC'::character varying])::"text"[]))),
    CONSTRAINT "indy_games_court_check" CHECK (("court" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "indy_games_home_pair_check" CHECK ((("home_pair")::"text" = ANY ((ARRAY['AB'::character varying, 'CD'::character varying, 'AC'::character varying, 'BD'::character varying, 'AD'::character varying, 'BC'::character varying])::"text"[]))),
    CONSTRAINT "indy_games_no_tie" CHECK ((("home_score" IS NULL) OR ("away_score" IS NULL) OR ("home_score" <> "away_score"))),
    CONSTRAINT "indy_games_order_check" CHECK ((("order" >= 1) AND ("order" <= 12)))
);


ALTER TABLE "public"."indy_games" OWNER TO "postgres";


COMMENT ON TABLE "public"."indy_games" IS 'Individual games (1-12) for IndyLeague matchups';



COMMENT ON COLUMN "public"."indy_games"."order" IS 'Game order (1-12)';



COMMENT ON COLUMN "public"."indy_games"."court" IS 'Court number (1 or 2)';



COMMENT ON COLUMN "public"."indy_games"."home_pair" IS 'Home team pair (AB, CD, AC, BD, AD, BC)';



COMMENT ON COLUMN "public"."indy_games"."away_pair" IS 'Away team pair (AB, CD, AC, BD, AD, BC)';



COMMENT ON COLUMN "public"."indy_games"."home_score" IS 'Home team score (nullable until entered)';



COMMENT ON COLUMN "public"."indy_games"."away_score" IS 'Away team score (nullable until entered)';



CREATE TABLE IF NOT EXISTS "public"."indy_league_settings" (
    "id" "text" NOT NULL,
    "divisionId" "text" NOT NULL,
    "configJson" "jsonb" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."indy_league_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."indy_league_standings" (
    "id" "text" NOT NULL,
    "divisionId" "text" NOT NULL,
    "playerId" "text" NOT NULL,
    "matchesPlayed" integer DEFAULT 0 NOT NULL,
    "wins" integer DEFAULT 0 NOT NULL,
    "losses" integer DEFAULT 0 NOT NULL,
    "pointsFor" integer DEFAULT 0 NOT NULL,
    "pointsAgainst" integer DEFAULT 0 NOT NULL,
    "pointDiff" integer DEFAULT 0 NOT NULL,
    "rank" integer DEFAULT 0 NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."indy_league_standings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."indy_matchups" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "match_day_id" "text" NOT NULL,
    "division_id" "text" NOT NULL,
    "home_team_id" "text" NOT NULL,
    "away_team_id" "text" NOT NULL,
    "tie_break_winner_team_id" "text",
    "games_won_home" integer DEFAULT 0 NOT NULL,
    "games_won_away" integer DEFAULT 0 NOT NULL,
    "status" "public"."MatchupStatus" DEFAULT 'PENDING'::"public"."MatchupStatus" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."indy_matchups" OWNER TO "postgres";


COMMENT ON TABLE "public"."indy_matchups" IS 'Matchups (matches) for IndyLeague match days';



COMMENT ON COLUMN "public"."indy_matchups"."tie_break_winner_team_id" IS 'Winner of tie-break when games are 6-6';



COMMENT ON COLUMN "public"."indy_matchups"."games_won_home" IS 'Number of games won by home team';



COMMENT ON COLUMN "public"."indy_matchups"."games_won_away" IS 'Number of games won by away team';



CREATE TABLE IF NOT EXISTS "public"."match_days" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "tournament_id" "text" NOT NULL,
    "date" "date" NOT NULL,
    "status" "public"."MatchDayStatus" DEFAULT 'DRAFT'::"public"."MatchDayStatus" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."match_days" OWNER TO "postgres";


COMMENT ON TABLE "public"."match_days" IS 'Match days for IndyLeague tournaments';



COMMENT ON COLUMN "public"."match_days"."date" IS 'Date of the match day (unique per tournament)';



COMMENT ON COLUMN "public"."match_days"."status" IS 'Status of the match day: DRAFT, IN_PROGRESS, FINALIZED';



CREATE TABLE IF NOT EXISTS "public"."matches" (
    "id" "text" NOT NULL,
    "rrGroupId" "text",
    "divisionId" "text",
    "poolId" "text",
    "roundIndex" integer NOT NULL,
    "stage" "public"."MatchStage" NOT NULL,
    "teamAId" "text" NOT NULL,
    "teamBId" "text" NOT NULL,
    "bestOfMode" "public"."BestOfMode" NOT NULL,
    "gamesCount" integer NOT NULL,
    "targetPoints" integer NOT NULL,
    "winBy" integer NOT NULL,
    "winnerTeamId" "text",
    "locked" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "note" character varying(255),
    "dupr_submission_status" "public"."DuprSubmissionStatus" DEFAULT 'PENDING'::"public"."DuprSubmissionStatus",
    "dupr_match_id" "text",
    "dupr_submission_error" "text",
    "dupr_submitted_at" timestamp without time zone,
    "dupr_retry_count" integer DEFAULT 0,
    "send_to_dupr" boolean DEFAULT false
);


ALTER TABLE "public"."matches" OWNER TO "postgres";


COMMENT ON COLUMN "public"."matches"."note" IS 'Optional note for special matches (e.g., "Third Place Match")';



COMMENT ON COLUMN "public"."matches"."dupr_submission_status" IS 'Status of DUPR submission: PENDING (not sent), SUCCESS (sent successfully), FAILED (error occurred)';



COMMENT ON COLUMN "public"."matches"."dupr_match_id" IS 'DUPR match ID returned from DUPR API after successful submission';



COMMENT ON COLUMN "public"."matches"."dupr_submission_error" IS 'Error message if submission to DUPR failed';



COMMENT ON COLUMN "public"."matches"."dupr_submitted_at" IS 'Timestamp when match was successfully submitted to DUPR';



COMMENT ON COLUMN "public"."matches"."dupr_retry_count" IS 'Number of retry attempts for failed submissions';



COMMENT ON COLUMN "public"."matches"."send_to_dupr" IS 'Flag indicating if match results should be sent to DUPR';



CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "tournamentId" "text" NOT NULL,
    "divisionId" "text",
    "teamId" "text",
    "playerId" "text",
    "amount" integer NOT NULL,
    "currency" character varying(3) DEFAULT 'usd'::character varying NOT NULL,
    "status" "public"."PaymentStatus" DEFAULT 'PENDING'::"public"."PaymentStatus" NOT NULL,
    "stripePaymentIntentId" "text",
    "stripeCheckoutSessionId" "text",
    "applicationFeeAmount" integer DEFAULT 0 NOT NULL,
    "payoutAmount" integer DEFAULT 0 NOT NULL,
    "platformRevenue" integer DEFAULT 0 NOT NULL,
    "createdByUserId" "text",
    "metadata" "jsonb",
    "createdAt" timestamp(3) without time zone DEFAULT "now"() NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."players" (
    "id" "text" NOT NULL,
    "firstName" "text" NOT NULL,
    "lastName" "text" NOT NULL,
    "email" "text",
    "gender" "public"."Gender",
    "birthDate" timestamp(3) without time zone,
    "externalId" "text",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "dupr_rating" numeric(3,2),
    "is_paid" boolean DEFAULT false,
    "is_waitlist" boolean DEFAULT false,
    "tournament_id" "text",
    "dupr" character varying
);


ALTER TABLE "public"."players" OWNER TO "postgres";


COMMENT ON COLUMN "public"."players"."dupr_rating" IS 'DUPR rating from 0.00 to 5.00';



COMMENT ON COLUMN "public"."players"."is_paid" IS 'Payment status of the player';



COMMENT ON COLUMN "public"."players"."is_waitlist" IS 'Whether player is on waitlist';



COMMENT ON COLUMN "public"."players"."dupr" IS 'DUPR ID as string identifier';



CREATE TABLE IF NOT EXISTS "public"."pools" (
    "id" "text" NOT NULL,
    "divisionId" "text" NOT NULL,
    "name" "text" NOT NULL,
    "order" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."pools" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prizes" (
    "id" "text" NOT NULL,
    "tournamentId" "text" NOT NULL,
    "divisionId" "text",
    "place" integer NOT NULL,
    "label" "text" NOT NULL,
    "amount" numeric(10,2),
    "kind" "public"."PrizeKind" DEFAULT 'CASH'::"public"."PrizeKind" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."prizes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."round_robin_groups" (
    "id" "text" NOT NULL,
    "tournamentId" "text" NOT NULL,
    "name" "text" NOT NULL,
    "rrSettingsId" "text" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."round_robin_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rr_settings" (
    "id" "text" NOT NULL,
    "targetPoints" integer DEFAULT 11 NOT NULL,
    "winBy" integer DEFAULT 2 NOT NULL,
    "gamesPerMatch" integer DEFAULT 1 NOT NULL,
    "bestOfMode" "public"."BestOfMode" DEFAULT 'FIXED_GAMES'::"public"."BestOfMode" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."rr_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "text" NOT NULL,
    "sessionToken" "text" NOT NULL,
    "userId" "text" NOT NULL,
    "expires" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."standings" (
    "id" "text" NOT NULL,
    "rrGroupId" "text",
    "divisionId" "text",
    "poolId" "text",
    "teamId" "text" NOT NULL,
    "wins" integer DEFAULT 0 NOT NULL,
    "losses" integer DEFAULT 0 NOT NULL,
    "pointsFor" integer DEFAULT 0 NOT NULL,
    "pointsAgainst" integer DEFAULT 0 NOT NULL,
    "pointDiff" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."standings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_players" (
    "id" "text" NOT NULL,
    "teamId" "text" NOT NULL,
    "playerId" "text" NOT NULL,
    "role" "public"."PlayerRole" DEFAULT 'PLAYER'::"public"."PlayerRole" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "indySlot" "public"."IndySlot"
);


ALTER TABLE "public"."team_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "text" NOT NULL,
    "divisionId" "text" NOT NULL,
    "poolId" "text",
    "name" "text" NOT NULL,
    "seed" integer,
    "note" "text",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tiebreakers" (
    "id" "text" NOT NULL,
    "matchId" "text" NOT NULL,
    "teamAScore" integer DEFAULT 0 NOT NULL,
    "teamBScore" integer DEFAULT 0 NOT NULL,
    "winnerTeamId" "text",
    "sequence" "jsonb",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."tiebreakers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournament_access_requests" (
    "id" "text" NOT NULL,
    "userId" "text" NOT NULL,
    "tournamentId" "text" NOT NULL,
    "status" "public"."AccessRequestStatus" DEFAULT 'PENDING'::"public"."AccessRequestStatus" NOT NULL,
    "message" "text",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."tournament_access_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournament_accesses" (
    "id" "text" NOT NULL,
    "userId" "text" NOT NULL,
    "tournamentId" "text" NOT NULL,
    "divisionId" "text",
    "accessLevel" "public"."AccessLevel" DEFAULT 'SCORE_ONLY'::"public"."AccessLevel" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."tournament_accesses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournament_payment_settings" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "tournamentId" "text" NOT NULL,
    "stripeAccountId" "text",
    "stripeAccountStatus" "public"."StripeAccountStatus" DEFAULT 'PENDING'::"public"."StripeAccountStatus" NOT NULL,
    "paymentsEnabled" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT "now"() NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tournament_payment_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournament_ratings" (
    "id" "text" NOT NULL,
    "tournamentId" "text" NOT NULL,
    "userId" "text" NOT NULL,
    "rating" "text" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."tournament_ratings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournaments" (
    "id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "rulesUrl" "text",
    "venueName" "text",
    "venueAddress" "text",
    "startDate" timestamp(3) without time zone NOT NULL,
    "endDate" timestamp(3) without time zone NOT NULL,
    "entryFee" numeric(10,2),
    "isPublicBoardEnabled" boolean DEFAULT false NOT NULL,
    "publicSlug" "text",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "userId" "text" NOT NULL,
    "isPaid" boolean DEFAULT false NOT NULL,
    "currency" character varying(3) DEFAULT 'usd'::character varying NOT NULL,
    "format" "public"."TournamentFormat" DEFAULT 'SINGLE_ELIMINATION'::"public"."TournamentFormat" NOT NULL,
    "allow_dupr_submission" boolean DEFAULT false,
    "season_label" "text",
    "timezone" "text"
);


ALTER TABLE "public"."tournaments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tournaments"."season_label" IS 'Season label for IndyLeague tournaments';



COMMENT ON COLUMN "public"."tournaments"."timezone" IS 'Timezone for IndyLeague tournaments';



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "text" NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "role" "public"."UserRole" DEFAULT 'TD'::"public"."UserRole" NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "emailVerified" timestamp(3) without time zone,
    "image" "text",
    "gender" "public"."Gender",
    "city" character varying(255),
    "duprLink" character varying(255),
    "stripeAccountId" character varying(255),
    "stripeAccountStatus" "public"."StripeAccountStatus" DEFAULT 'PENDING'::"public"."StripeAccountStatus",
    "paymentsEnabled" boolean DEFAULT false,
    "dupr_id" character varying,
    "dupr_access_token" character varying,
    "dupr_refresh_token" character varying,
    "dupr_rating_singles" numeric(4,2),
    "dupr_rating_doubles" numeric(4,2),
    "dupr_numeric_id" bigint
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."stripeAccountId" IS 'Stripe Connect account ID for receiving payments';



COMMENT ON COLUMN "public"."users"."stripeAccountStatus" IS 'Status of Stripe Connect account';



COMMENT ON COLUMN "public"."users"."paymentsEnabled" IS 'Whether user can receive payments through Stripe';



COMMENT ON COLUMN "public"."users"."dupr_id" IS 'DUPR user ID';



COMMENT ON COLUMN "public"."users"."dupr_access_token" IS 'DUPR access token for API calls';



COMMENT ON COLUMN "public"."users"."dupr_refresh_token" IS 'DUPR refresh token for token renewal';



COMMENT ON COLUMN "public"."users"."dupr_rating_singles" IS 'DUPR singles rating';



COMMENT ON COLUMN "public"."users"."dupr_rating_doubles" IS 'DUPR doubles rating';



COMMENT ON COLUMN "public"."users"."dupr_numeric_id" IS 'DUPR numeric user ID (integer) for API calls, comes from event.id in postMessage';



CREATE TABLE IF NOT EXISTS "public"."verification_tokens" (
    "identifier" "text" NOT NULL,
    "token" "text" NOT NULL,
    "expires" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."verification_tokens" OWNER TO "postgres";


ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assistant_assignments"
    ADD CONSTRAINT "assistant_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."day_rosters"
    ADD CONSTRAINT "day_rosters_matchup_team_player_unique" UNIQUE ("matchup_id", "team_id", "player_id");



ALTER TABLE ONLY "public"."day_rosters"
    ADD CONSTRAINT "day_rosters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."division_constraints"
    ADD CONSTRAINT "division_constraints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."division_rr_bindings"
    ADD CONSTRAINT "division_rr_bindings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."divisions"
    ADD CONSTRAINT "divisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."import_jobs"
    ADD CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."indy_games"
    ADD CONSTRAINT "indy_games_matchup_order_unique" UNIQUE ("matchup_id", "order");



ALTER TABLE ONLY "public"."indy_games"
    ADD CONSTRAINT "indy_games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."indy_league_settings"
    ADD CONSTRAINT "indy_league_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."indy_league_standings"
    ADD CONSTRAINT "indy_league_standings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."indy_matchups"
    ADD CONSTRAINT "indy_matchups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."match_days"
    ADD CONSTRAINT "match_days_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."match_days"
    ADD CONSTRAINT "match_days_tournament_date_unique" UNIQUE ("tournament_id", "date");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_stripeCheckoutSessionId_key" UNIQUE ("stripeCheckoutSessionId");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_stripePaymentIntentId_key" UNIQUE ("stripePaymentIntentId");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pools"
    ADD CONSTRAINT "pools_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prizes"
    ADD CONSTRAINT "prizes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."round_robin_groups"
    ADD CONSTRAINT "round_robin_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rr_settings"
    ADD CONSTRAINT "rr_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."standings"
    ADD CONSTRAINT "standings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_players"
    ADD CONSTRAINT "team_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tiebreakers"
    ADD CONSTRAINT "tiebreakers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_access_requests"
    ADD CONSTRAINT "tournament_access_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_accesses"
    ADD CONSTRAINT "tournament_accesses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_payment_settings"
    ADD CONSTRAINT "tournament_payment_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_payment_settings"
    ADD CONSTRAINT "tournament_payment_settings_tournamentId_key" UNIQUE ("tournamentId");



ALTER TABLE ONLY "public"."tournament_ratings"
    ADD CONSTRAINT "tournament_ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."verification_tokens"
    ADD CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("token");



CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "public"."accounts" USING "btree" ("provider", "providerAccountId");



CREATE UNIQUE INDEX "assistant_assignments_userId_divisionId_key" ON "public"."assistant_assignments" USING "btree" ("userId", "divisionId");



CREATE UNIQUE INDEX "division_constraints_divisionId_key" ON "public"."division_constraints" USING "btree" ("divisionId");



CREATE UNIQUE INDEX "division_rr_bindings_divisionId_rrGroupId_key" ON "public"."division_rr_bindings" USING "btree" ("divisionId", "rrGroupId");



CREATE UNIQUE INDEX "games_matchId_index_key" ON "public"."games" USING "btree" ("matchId", "index");



CREATE INDEX "idx_day_rosters_matchup_id" ON "public"."day_rosters" USING "btree" ("matchup_id");



CREATE INDEX "idx_day_rosters_matchup_team_active" ON "public"."day_rosters" USING "btree" ("matchup_id", "team_id", "is_active");



CREATE INDEX "idx_day_rosters_player_id" ON "public"."day_rosters" USING "btree" ("player_id");



CREATE INDEX "idx_day_rosters_team_id" ON "public"."day_rosters" USING "btree" ("team_id");



CREATE INDEX "idx_indy_games_matchup_court" ON "public"."indy_games" USING "btree" ("matchup_id", "court");



CREATE INDEX "idx_indy_games_matchup_id" ON "public"."indy_games" USING "btree" ("matchup_id");



CREATE INDEX "idx_indy_matchups_away_team_id" ON "public"."indy_matchups" USING "btree" ("away_team_id");



CREATE INDEX "idx_indy_matchups_division_id" ON "public"."indy_matchups" USING "btree" ("division_id");



CREATE INDEX "idx_indy_matchups_home_team_id" ON "public"."indy_matchups" USING "btree" ("home_team_id");



CREATE INDEX "idx_indy_matchups_match_day_division" ON "public"."indy_matchups" USING "btree" ("match_day_id", "division_id");



CREATE INDEX "idx_indy_matchups_match_day_id" ON "public"."indy_matchups" USING "btree" ("match_day_id");



CREATE INDEX "idx_match_days_date" ON "public"."match_days" USING "btree" ("date");



CREATE INDEX "idx_match_days_tournament_id" ON "public"."match_days" USING "btree" ("tournament_id");



CREATE INDEX "idx_matches_dupr_match_id" ON "public"."matches" USING "btree" ("dupr_match_id") WHERE ("dupr_match_id" IS NOT NULL);



CREATE INDEX "idx_matches_dupr_submission_status" ON "public"."matches" USING "btree" ("dupr_submission_status") WHERE ("dupr_submission_status" = ANY (ARRAY['PENDING'::"public"."DuprSubmissionStatus", 'FAILED'::"public"."DuprSubmissionStatus"]));



CREATE INDEX "idx_users_stripe_account_id" ON "public"."users" USING "btree" ("stripeAccountId");



CREATE UNIQUE INDEX "indy_league_settings_divisionId_key" ON "public"."indy_league_settings" USING "btree" ("divisionId");



CREATE UNIQUE INDEX "indy_league_standings_divisionId_playerId_key" ON "public"."indy_league_standings" USING "btree" ("divisionId", "playerId");



CREATE INDEX "payments_player_idx" ON "public"."payments" USING "btree" ("playerId");



CREATE INDEX "payments_status_idx" ON "public"."payments" USING "btree" ("status");



CREATE INDEX "payments_stripe_intent_idx" ON "public"."payments" USING "btree" ("stripePaymentIntentId");



CREATE INDEX "payments_stripe_session_idx" ON "public"."payments" USING "btree" ("stripeCheckoutSessionId");



CREATE INDEX "payments_team_idx" ON "public"."payments" USING "btree" ("teamId");



CREATE INDEX "payments_tournament_idx" ON "public"."payments" USING "btree" ("tournamentId");



CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "public"."sessions" USING "btree" ("sessionToken");



CREATE UNIQUE INDEX "standings_divisionId_teamId_key" ON "public"."standings" USING "btree" ("divisionId", "teamId");



CREATE UNIQUE INDEX "standings_poolId_teamId_key" ON "public"."standings" USING "btree" ("poolId", "teamId");



CREATE UNIQUE INDEX "standings_rrGroupId_teamId_key" ON "public"."standings" USING "btree" ("rrGroupId", "teamId");



CREATE UNIQUE INDEX "team_players_teamId_playerId_key" ON "public"."team_players" USING "btree" ("teamId", "playerId");



CREATE UNIQUE INDEX "tiebreakers_matchId_key" ON "public"."tiebreakers" USING "btree" ("matchId");



CREATE UNIQUE INDEX "tournament_access_requests_userId_tournamentId_key" ON "public"."tournament_access_requests" USING "btree" ("userId", "tournamentId");



CREATE UNIQUE INDEX "tournament_accesses_userId_tournamentId_divisionId_key" ON "public"."tournament_accesses" USING "btree" ("userId", "tournamentId", "divisionId");



CREATE INDEX "tournament_payment_settings_tournament_idx" ON "public"."tournament_payment_settings" USING "btree" ("tournamentId");



CREATE INDEX "tournament_ratings_tournamentId_idx" ON "public"."tournament_ratings" USING "btree" ("tournamentId");



CREATE INDEX "tournament_ratings_userId_idx" ON "public"."tournament_ratings" USING "btree" ("userId");



CREATE UNIQUE INDEX "tournament_ratings_userId_tournamentId_key" ON "public"."tournament_ratings" USING "btree" ("userId", "tournamentId");



CREATE UNIQUE INDEX "tournaments_publicSlug_key" ON "public"."tournaments" USING "btree" ("publicSlug");



CREATE UNIQUE INDEX "users_email_key" ON "public"."users" USING "btree" ("email");



CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "public"."verification_tokens" USING "btree" ("identifier", "token");



CREATE OR REPLACE TRIGGER "update_day_rosters_updated_at" BEFORE UPDATE ON "public"."day_rosters" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_indy_games_updated_at" BEFORE UPDATE ON "public"."indy_games" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_indy_matchups_updated_at" BEFORE UPDATE ON "public"."indy_matchups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_match_days_updated_at" BEFORE UPDATE ON "public"."match_days" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assistant_assignments"
    ADD CONSTRAINT "assistant_assignments_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "public"."divisions"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assistant_assignments"
    ADD CONSTRAINT "assistant_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."day_rosters"
    ADD CONSTRAINT "day_rosters_matchup_id_fkey" FOREIGN KEY ("matchup_id") REFERENCES "public"."indy_matchups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."day_rosters"
    ADD CONSTRAINT "day_rosters_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."day_rosters"
    ADD CONSTRAINT "day_rosters_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."division_constraints"
    ADD CONSTRAINT "division_constraints_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "public"."divisions"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."division_rr_bindings"
    ADD CONSTRAINT "division_rr_bindings_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "public"."divisions"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."division_rr_bindings"
    ADD CONSTRAINT "division_rr_bindings_rrGroupId_fkey" FOREIGN KEY ("rrGroupId") REFERENCES "public"."round_robin_groups"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."divisions"
    ADD CONSTRAINT "divisions_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "public"."matches"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."import_jobs"
    ADD CONSTRAINT "import_jobs_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."indy_games"
    ADD CONSTRAINT "indy_games_matchup_id_fkey" FOREIGN KEY ("matchup_id") REFERENCES "public"."indy_matchups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."indy_league_settings"
    ADD CONSTRAINT "indy_league_settings_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "public"."divisions"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."indy_league_standings"
    ADD CONSTRAINT "indy_league_standings_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "public"."divisions"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."indy_league_standings"
    ADD CONSTRAINT "indy_league_standings_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."indy_matchups"
    ADD CONSTRAINT "indy_matchups_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."indy_matchups"
    ADD CONSTRAINT "indy_matchups_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."indy_matchups"
    ADD CONSTRAINT "indy_matchups_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."indy_matchups"
    ADD CONSTRAINT "indy_matchups_match_day_id_fkey" FOREIGN KEY ("match_day_id") REFERENCES "public"."match_days"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."indy_matchups"
    ADD CONSTRAINT "indy_matchups_tie_break_winner_team_id_fkey" FOREIGN KEY ("tie_break_winner_team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."match_days"
    ADD CONSTRAINT "match_days_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "public"."divisions"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "public"."pools"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_rrGroupId_fkey" FOREIGN KEY ("rrGroupId") REFERENCES "public"."round_robin_groups"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "public"."teams"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "public"."teams"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "public"."divisions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pools"
    ADD CONSTRAINT "pools_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "public"."divisions"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prizes"
    ADD CONSTRAINT "prizes_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "public"."divisions"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prizes"
    ADD CONSTRAINT "prizes_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."round_robin_groups"
    ADD CONSTRAINT "round_robin_groups_rrSettingsId_fkey" FOREIGN KEY ("rrSettingsId") REFERENCES "public"."rr_settings"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."round_robin_groups"
    ADD CONSTRAINT "round_robin_groups_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."standings"
    ADD CONSTRAINT "standings_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "public"."divisions"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."standings"
    ADD CONSTRAINT "standings_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "public"."pools"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."standings"
    ADD CONSTRAINT "standings_rrGroupId_fkey" FOREIGN KEY ("rrGroupId") REFERENCES "public"."round_robin_groups"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."standings"
    ADD CONSTRAINT "standings_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_players"
    ADD CONSTRAINT "team_players_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_players"
    ADD CONSTRAINT "team_players_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "public"."divisions"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "public"."pools"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tiebreakers"
    ADD CONSTRAINT "tiebreakers_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "public"."matches"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_access_requests"
    ADD CONSTRAINT "tournament_access_requests_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_access_requests"
    ADD CONSTRAINT "tournament_access_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_accesses"
    ADD CONSTRAINT "tournament_accesses_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "public"."divisions"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_accesses"
    ADD CONSTRAINT "tournament_accesses_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_accesses"
    ADD CONSTRAINT "tournament_accesses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_payment_settings"
    ADD CONSTRAINT "tournament_payment_settings_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_ratings"
    ADD CONSTRAINT "tournament_ratings_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_ratings"
    ADD CONSTRAINT "tournament_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_userid_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE;





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT ALL ON SCHEMA "public" TO "prisma";

























































































































































GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "prisma";


















GRANT ALL ON TABLE "public"."accounts" TO "anon";
GRANT ALL ON TABLE "public"."accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts" TO "service_role";
GRANT ALL ON TABLE "public"."accounts" TO "prisma";



GRANT ALL ON TABLE "public"."assistant_assignments" TO "anon";
GRANT ALL ON TABLE "public"."assistant_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."assistant_assignments" TO "service_role";
GRANT ALL ON TABLE "public"."assistant_assignments" TO "prisma";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";
GRANT ALL ON TABLE "public"."audit_logs" TO "prisma";



GRANT ALL ON TABLE "public"."day_rosters" TO "anon";
GRANT ALL ON TABLE "public"."day_rosters" TO "authenticated";
GRANT ALL ON TABLE "public"."day_rosters" TO "service_role";
GRANT ALL ON TABLE "public"."day_rosters" TO "prisma";



GRANT ALL ON TABLE "public"."division_constraints" TO "anon";
GRANT ALL ON TABLE "public"."division_constraints" TO "authenticated";
GRANT ALL ON TABLE "public"."division_constraints" TO "service_role";
GRANT ALL ON TABLE "public"."division_constraints" TO "prisma";



GRANT ALL ON TABLE "public"."division_rr_bindings" TO "anon";
GRANT ALL ON TABLE "public"."division_rr_bindings" TO "authenticated";
GRANT ALL ON TABLE "public"."division_rr_bindings" TO "service_role";
GRANT ALL ON TABLE "public"."division_rr_bindings" TO "prisma";



GRANT ALL ON TABLE "public"."divisions" TO "anon";
GRANT ALL ON TABLE "public"."divisions" TO "authenticated";
GRANT ALL ON TABLE "public"."divisions" TO "service_role";
GRANT ALL ON TABLE "public"."divisions" TO "prisma";



GRANT ALL ON TABLE "public"."games" TO "anon";
GRANT ALL ON TABLE "public"."games" TO "authenticated";
GRANT ALL ON TABLE "public"."games" TO "service_role";
GRANT ALL ON TABLE "public"."games" TO "prisma";



GRANT ALL ON TABLE "public"."import_jobs" TO "anon";
GRANT ALL ON TABLE "public"."import_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."import_jobs" TO "service_role";
GRANT ALL ON TABLE "public"."import_jobs" TO "prisma";



GRANT ALL ON TABLE "public"."indy_games" TO "anon";
GRANT ALL ON TABLE "public"."indy_games" TO "authenticated";
GRANT ALL ON TABLE "public"."indy_games" TO "service_role";
GRANT ALL ON TABLE "public"."indy_games" TO "prisma";



GRANT ALL ON TABLE "public"."indy_league_settings" TO "anon";
GRANT ALL ON TABLE "public"."indy_league_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."indy_league_settings" TO "service_role";
GRANT ALL ON TABLE "public"."indy_league_settings" TO "prisma";



GRANT ALL ON TABLE "public"."indy_league_standings" TO "anon";
GRANT ALL ON TABLE "public"."indy_league_standings" TO "authenticated";
GRANT ALL ON TABLE "public"."indy_league_standings" TO "service_role";
GRANT ALL ON TABLE "public"."indy_league_standings" TO "prisma";



GRANT ALL ON TABLE "public"."indy_matchups" TO "anon";
GRANT ALL ON TABLE "public"."indy_matchups" TO "authenticated";
GRANT ALL ON TABLE "public"."indy_matchups" TO "service_role";
GRANT ALL ON TABLE "public"."indy_matchups" TO "prisma";



GRANT ALL ON TABLE "public"."match_days" TO "anon";
GRANT ALL ON TABLE "public"."match_days" TO "authenticated";
GRANT ALL ON TABLE "public"."match_days" TO "service_role";
GRANT ALL ON TABLE "public"."match_days" TO "prisma";



GRANT ALL ON TABLE "public"."matches" TO "anon";
GRANT ALL ON TABLE "public"."matches" TO "authenticated";
GRANT ALL ON TABLE "public"."matches" TO "service_role";
GRANT ALL ON TABLE "public"."matches" TO "prisma";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";
GRANT ALL ON TABLE "public"."payments" TO "prisma";



GRANT ALL ON TABLE "public"."players" TO "anon";
GRANT ALL ON TABLE "public"."players" TO "authenticated";
GRANT ALL ON TABLE "public"."players" TO "service_role";
GRANT ALL ON TABLE "public"."players" TO "prisma";



GRANT ALL ON TABLE "public"."pools" TO "anon";
GRANT ALL ON TABLE "public"."pools" TO "authenticated";
GRANT ALL ON TABLE "public"."pools" TO "service_role";
GRANT ALL ON TABLE "public"."pools" TO "prisma";



GRANT ALL ON TABLE "public"."prizes" TO "anon";
GRANT ALL ON TABLE "public"."prizes" TO "authenticated";
GRANT ALL ON TABLE "public"."prizes" TO "service_role";
GRANT ALL ON TABLE "public"."prizes" TO "prisma";



GRANT ALL ON TABLE "public"."round_robin_groups" TO "anon";
GRANT ALL ON TABLE "public"."round_robin_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."round_robin_groups" TO "service_role";
GRANT ALL ON TABLE "public"."round_robin_groups" TO "prisma";



GRANT ALL ON TABLE "public"."rr_settings" TO "anon";
GRANT ALL ON TABLE "public"."rr_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."rr_settings" TO "service_role";
GRANT ALL ON TABLE "public"."rr_settings" TO "prisma";



GRANT ALL ON TABLE "public"."sessions" TO "anon";
GRANT ALL ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";
GRANT ALL ON TABLE "public"."sessions" TO "prisma";



GRANT ALL ON TABLE "public"."standings" TO "anon";
GRANT ALL ON TABLE "public"."standings" TO "authenticated";
GRANT ALL ON TABLE "public"."standings" TO "service_role";
GRANT ALL ON TABLE "public"."standings" TO "prisma";



GRANT ALL ON TABLE "public"."team_players" TO "anon";
GRANT ALL ON TABLE "public"."team_players" TO "authenticated";
GRANT ALL ON TABLE "public"."team_players" TO "service_role";
GRANT ALL ON TABLE "public"."team_players" TO "prisma";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";
GRANT ALL ON TABLE "public"."teams" TO "prisma";



GRANT ALL ON TABLE "public"."tiebreakers" TO "anon";
GRANT ALL ON TABLE "public"."tiebreakers" TO "authenticated";
GRANT ALL ON TABLE "public"."tiebreakers" TO "service_role";
GRANT ALL ON TABLE "public"."tiebreakers" TO "prisma";



GRANT ALL ON TABLE "public"."tournament_access_requests" TO "anon";
GRANT ALL ON TABLE "public"."tournament_access_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_access_requests" TO "service_role";
GRANT ALL ON TABLE "public"."tournament_access_requests" TO "prisma";



GRANT ALL ON TABLE "public"."tournament_accesses" TO "anon";
GRANT ALL ON TABLE "public"."tournament_accesses" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_accesses" TO "service_role";
GRANT ALL ON TABLE "public"."tournament_accesses" TO "prisma";



GRANT ALL ON TABLE "public"."tournament_payment_settings" TO "anon";
GRANT ALL ON TABLE "public"."tournament_payment_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_payment_settings" TO "service_role";
GRANT ALL ON TABLE "public"."tournament_payment_settings" TO "prisma";



GRANT ALL ON TABLE "public"."tournament_ratings" TO "anon";
GRANT ALL ON TABLE "public"."tournament_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_ratings" TO "service_role";
GRANT ALL ON TABLE "public"."tournament_ratings" TO "prisma";



GRANT ALL ON TABLE "public"."tournaments" TO "anon";
GRANT ALL ON TABLE "public"."tournaments" TO "authenticated";
GRANT ALL ON TABLE "public"."tournaments" TO "service_role";
GRANT ALL ON TABLE "public"."tournaments" TO "prisma";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";
GRANT ALL ON TABLE "public"."users" TO "prisma";



GRANT ALL ON TABLE "public"."verification_tokens" TO "anon";
GRANT ALL ON TABLE "public"."verification_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."verification_tokens" TO "service_role";
GRANT ALL ON TABLE "public"."verification_tokens" TO "prisma";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "prisma";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "prisma";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "prisma";































