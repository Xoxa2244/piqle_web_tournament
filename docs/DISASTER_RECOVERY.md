# Disaster Recovery Runbook

When something is broken in production, this is the playbook. Keep it short, keep it actionable.

## At-a-glance emergency controls

| Situation | Action |
|-----------|--------|
| Agent is spamming members | Kill switch SQL below + `AGENT_OUTREACH_ROLLOUT_CLUB_IDS=""` in Vercel |
| All API requests failing | Vercel → Deployments → previous good deploy → Promote |
| DB corrupted / data wiped | Supabase → Database → Backups → Restore to PITR |
| Webhook events lost | Mandrill/Stripe dashboards can replay events |
| AI spend spike | Budget alerts should have fired; apply caps (see below) |
| Auth completely broken | Check `NEXTAUTH_SECRET` and `NEXTAUTH_URL` env vars |

## Agent Emergency Kill Switch

Stops all member-facing agent outreach instantly. Use when you see unexpected email activity.

### Option A — kill switch for ALL clubs (nuclear)

```sql
-- Connect to production DB via Supabase SQL editor
UPDATE clubs
SET automation_settings = jsonb_set(
  COALESCE(automation_settings, '{}'::jsonb),
  '{intelligence,controlPlane,killSwitch}',
  'true'::jsonb
);
```

Verification:
```sql
SELECT id, name,
  automation_settings->'intelligence'->'controlPlane'->>'killSwitch' AS kill_switch
FROM clubs;
-- All rows should show: kill_switch = 'true'
```

### Option B — disable rollout allowlist (softer)

Vercel → Project → Settings → Environment Variables:
```
AGENT_OUTREACH_ROLLOUT_CLUB_IDS=""
```
Then redeploy. Agent stops sending but won't touch killSwitch state.

### Re-enable after issue is fixed

```sql
UPDATE clubs
SET automation_settings = jsonb_set(
  automation_settings,
  '{intelligence,controlPlane,killSwitch}',
  'false'::jsonb
);
```

## Rollback Deployment

Fastest option when a recent deploy broke prod.

```
Vercel Dashboard
  → Project (piqle_web_tournament)
  → Deployments
  → find last green deployment
  → ⋯ menu → "Promote to Production"
```

Wait ~30 sec for DNS/cache to settle, then verify at `https://app.iqsport.ai/api/health`.

**If the bad deploy included DB migrations:** rollback the code only, DB stays migrated. In 95% of cases our migrations are additive (new columns, indexes) and old code ignores them safely. If a migration dropped or changed columns, you need explicit reverse migration — see "DB restore" below.

## DB Restore from Supabase Backup

Supabase makes daily automatic backups (7-day retention on free/pro tiers).

1. Supabase Dashboard → Project → Database → Backups
2. Pick the backup timestamp BEFORE the problem
3. Click "Restore" → follow UI prompts
4. Warning: this creates a NEW database, not in-place restore. You'll need to point `DATABASE_URL` and `DIRECT_URL` at the new instance in Vercel.

**For point-in-time recovery (PITR) on Pro tier:** you can restore to any minute in the last 7 days. Same flow but more granular timestamp.

### If you only need one table back

Dump from backup, restore specific table:

```bash
# Get connection string for the backup restore (Supabase provides it)
pg_dump "$BACKUP_URL" -t public.ai_recommendation_logs > table-backup.sql
psql "$PROD_URL" < table-backup.sql
```

## Stripe Webhook Replay

If webhook events were dropped (network issue, our bug, whatever):

1. Stripe Dashboard → Developers → Webhooks
2. Click the endpoint that failed
3. Scroll to "Event deliveries" — failed events show red
4. Click the event → "Resend" button

For ALL failed events: Stripe will auto-retry for 3 days. Usually no action needed unless we're close to the 3-day limit.

## Mandrill / Email Events Replay

Mandrill doesn't auto-retry to the same extent. If our webhook was down:

1. Mandrill Dashboard → Activity → search by date range
2. Find the lost events (opens, clicks, bounces)
3. Export the data and replay manually via:
   ```
   POST /api/webhooks/mailchimp
   body: mandrill_events=<JSON array>
   ```

Or: reconstruct from Mandrill activity exports and bulk-update `ai_recommendation_logs`.

## AI Spend Spike

Our `/api/cron/ai-budget-check` runs every 6h and fires Sentry warnings. If you see a spike:

1. Identify the club: check Sentry tags, or query directly:
   ```sql
   SELECT club_id, SUM(cost_usd) AS spend_24h
   FROM ai_usage_logs
   WHERE created_at > NOW() - INTERVAL '24 hours'
   GROUP BY club_id
   ORDER BY spend_24h DESC
   LIMIT 5;
   ```

2. Cap the club immediately:
   ```sql
   UPDATE clubs
   SET ai_monthly_budget_usd = 10.00  -- set low cap
   WHERE id = 'offending-club-uuid';
   ```

3. Check what operations caused it:
   ```sql
   SELECT operation, COUNT(*) AS calls, SUM(total_tokens) AS tokens, SUM(cost_usd) AS cost
   FROM ai_usage_logs
   WHERE club_id = 'offending-club-uuid'
     AND created_at > NOW() - INTERVAL '24 hours'
   GROUP BY operation
   ORDER BY cost DESC;
   ```

4. If it's a specific cron running amok, disable it in `vercel.json` and redeploy.

## Auth Completely Broken

Symptoms: everyone logged out, login loop, 401 on every request.

Check env vars in Vercel:
- `NEXTAUTH_SECRET` — must be set, at least 32 chars
- `NEXTAUTH_URL` — must match the production domain EXACTLY (with https://, no trailing slash)
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — for Google OAuth path

If `NEXTAUTH_SECRET` was rotated or misconfigured, existing JWTs become invalid → everyone logged out. Not destructive, users just sign in again.

Recovery: set correct values, redeploy. Do NOT delete session rows manually — they'll invalidate automatically at next request.

## Rate Limit Storms

If Upstash Redis has an outage or we hit rate limits ourselves:

1. Our code gracefully degrades (`checkRateLimit` returns `{success: true, skipped: true}`) — requests pass through
2. Sentry logs the warning, no user-facing errors
3. If Upstash is permanently down, the app continues functioning without rate limiting (security posture degrades)

Recovery: wait for Upstash to recover, or switch to a backup Redis instance:
```
UPSTASH_REDIS_REST_URL=<backup>
UPSTASH_REDIS_REST_TOKEN=<backup>
```

## Escalation Contacts

| System | Status page | Support |
|--------|-------------|---------|
| Vercel | vercel-status.com | vercel.com/help |
| Supabase | status.supabase.com | support@supabase.com |
| Stripe | status.stripe.com | support.stripe.com |
| Mandrill/Mailchimp | status.mailchimp.com | mailchimp.com/help |
| Twilio | status.twilio.com | help.twilio.com |
| OpenAI | status.openai.com | help.openai.com |
| Anthropic | status.anthropic.com | support.anthropic.com |

## Post-Incident

1. Write what happened in `docs/incidents/YYYY-MM-DD-short-name.md`
2. Add one sentence to runbook if new failure mode discovered
3. Add regression test if it was a code bug

Short incidents (under 30 min, no data loss): one paragraph is fine.
Long incidents or data loss: full postmortem with root cause, timeline, prevention.
