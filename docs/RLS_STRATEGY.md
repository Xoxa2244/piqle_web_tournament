# Row-Level Security Strategy

## TL;DR

We enable RLS on every sensitive table as defense-in-depth. Prisma queries continue to work unchanged because they connect as the `postgres` user (table owner), which bypasses RLS by default. RLS blocks direct anon/authenticated key access.

## Threat Model

| Attack | Mitigation |
|--------|------------|
| Leaked `NEXT_PUBLIC_SUPABASE_ANON_KEY` → attacker queries `ai_recommendation_logs`, `payments`, `club_connectors` directly via REST API | RLS denies all access to `anon` role |
| Misconfigured client-side component uses Supabase SDK to `.from('users').select('*')` instead of going through tRPC | RLS denies; client gets empty array |
| Supabase Realtime subscription leaks rows across clubs | RLS filters the subscription stream |
| `service_role` key compromised | **Not mitigated by RLS alone** — rotate immediately. RLS is not a substitute for secret management. |

## How It Works

### Prisma side (unaffected)

Our app connects via `DATABASE_URL` using the `postgres` user — this user owns every table in the `public` schema. Table owners bypass RLS by default in Postgres. Therefore:

```ts
// Works exactly the same as before
await prisma.aIRecommendationLog.findMany({ where: { clubId } })
```

No Prisma code needs to change.

### Direct Supabase client side (blocked by default)

If someone queries a table via the Supabase SDK:

```ts
import { supabase } from '@/lib/supabase'  // uses NEXT_PUBLIC_SUPABASE_ANON_KEY

// Before RLS: returns all rows
// After RLS:  returns empty array (policy denies)
const { data } = await supabase.from('ai_recommendation_logs').select('*')
```

We don't use this pattern anywhere in the codebase today. The only places using the Supabase SDK are:

- `lib/ai/rag/indexer.ts` — server-side, uses `SUPABASE_SERVICE_ROLE_KEY`
- `app/api/upload-*/route.ts` — server-side, uses service role for Storage

Both of these continue to work because `service_role` has explicit bypass policies in the migration.

## What's Covered

40+ tables across 7 tiers:

1. **Intelligence & AI** — ai_recommendation_logs, agent_drafts, member_ai_profiles, document_embeddings, etc.
2. **Club Booking** — play_sessions, bookings, waitlist, user_play_preferences
3. **Club Management** — club_connectors (!), announcements, bans, invites, chat
4. **Payments** — payments, subscriptions
5. **Partner API** — API keys, webhooks, request logs, audit logs
6. **NextAuth** — accounts, sessions, email_otps, verification_tokens
7. **Tournament Private** — access_requests, invitations, private chat

## What's Not Covered (Intentionally)

- **Public scoreboard tables** (tournaments, matches, games, standings, players, teams). These are designed to be readable by anyone with the URL. Adding RLS here would require granular policies to preserve the public flow.
- **Base tables** (users, clubs, club_admins, club_followers). Low-risk basic info. Would need authenticated-role policies to allow profile lookups via Supabase Auth (which we don't use).

These can be added in a follow-up if we move to Supabase Realtime for live scoreboards or adopt Supabase Auth.

## Verification Steps

### 1. Local (before applying)

```bash
npm run typecheck    # must pass
npm run test         # must pass
```

If these pass, Prisma queries are unaffected.

### 2. Apply to staging Supabase

```bash
psql $STAGING_DIRECT_URL < migrations/enable-rls-defense-in-depth.sql
```

### 3. Verify RLS is enabled

In Supabase SQL editor:

```sql
-- Should return 40+ rows, all with rowsecurity = true
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = true
ORDER BY tablename;
```

### 4. Verify policies exist

```sql
-- Should return ~40 rows, one per table, all named "service_role_all"
SELECT tablename, policyname, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;
```

### 5. Smoke test via REST API

Using your Supabase `anon` key:

```bash
# Before RLS: returns rows
# After RLS:  returns [] (blocked)
curl -s "$SUPABASE_URL/rest/v1/ai_recommendation_logs?select=*" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

Expected: `[]` (empty array, not an error).

### 6. Verify app still works

Deploy to staging, visit the intelligence dashboard. Should load as normal (Prisma queries bypass RLS).

## Rollback

If something breaks unexpectedly:

```sql
-- Disable RLS on a specific table
ALTER TABLE <name> DISABLE ROW LEVEL SECURITY;

-- Or drop the service_role policy and disable
DROP POLICY "service_role_all" ON <name>;
ALTER TABLE <name> DISABLE ROW LEVEL SECURITY;
```

Prisma queries remain unaffected either way.

## Future Work

- **Granular policies for authenticated users** — when we adopt Supabase Auth or need Realtime subscriptions, add policies like:
  ```sql
  CREATE POLICY "members_see_own_club" ON play_sessions FOR SELECT TO authenticated
    USING (club_id IN (
      SELECT club_id FROM club_followers WHERE user_id = auth.uid()::text
    ));
  ```
- **Public scoreboard tables** — selective read policies for `isPublicBoardEnabled = true`
- **Force RLS on table owner** — `ALTER TABLE ... FORCE ROW LEVEL SECURITY` — belt-and-suspenders for case where postgres user gets removed from owner. Not strictly needed today.
