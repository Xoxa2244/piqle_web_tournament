# Production Deploy Checklist

Run through this before any major change hits prod. Print it, laminate it, hang it on the wall.

## Pre-Flight (do once per deploy)

### Code

- [ ] `npm run typecheck` passes locally
- [ ] `npm run test -- --run` passes locally
- [ ] `npx prisma generate` runs without errors
- [ ] No new `console.log` with PII left in (grep: `console.log.*email`)
- [ ] No `TODO: fix before prod` comments blocking
- [ ] CI green on the branch you're merging

### DB Migrations

- [ ] New SQL files in `migrations/` are idempotent (IF NOT EXISTS, DO blocks with guards)
- [ ] Each migration tested on staging DB (or local Postgres with same schema)
- [ ] If migration drops columns: backward-compatible app code deployed FIRST, then migration
- [ ] Backup confirmed recent in Supabase → Database → Backups (< 24h old)

### Environment Variables

Verify these in Vercel → Project → Settings → Environment Variables:

**Required in production** (app refuses to start if missing — see `lib/env-validation.ts`):
- [ ] `DATABASE_URL`
- [ ] `DIRECT_URL`
- [ ] `NEXTAUTH_SECRET` (32+ chars, not "dev"/"fallback"/"test")
- [ ] `CRON_SECRET` (32+ chars, not weak)
- [ ] `CONNECTOR_ENCRYPTION_KEY` (32+ chars)
- [ ] `OPENAI_API_KEY`
- [ ] `ANTHROPIC_API_KEY`
- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`

**Recommended** (features degrade without them):
- [ ] `MAILCHIMP_TRANSACTIONAL_API_KEY` — email sending
- [ ] `MAILCHIMP_WEBHOOK_KEY` — email event tracking
- [ ] `TWILIO_AUTH_TOKEN` — SMS + webhook sig verification
- [ ] `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — OAuth login
- [ ] `SENTRY_DSN` — error tracking
- [ ] `NEXT_PUBLIC_APP_URL` — absolute URL construction
- [ ] `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — rate limits

**Agent-specific:**
- [ ] `AGENT_OUTREACH_ROLLOUT_CLUB_IDS` — which clubs allow live member-facing actions

### Third-party Integrations

- [ ] Mandrill webhook URL points to `/api/webhooks/mailchimp` (NOT `/api/webhooks/mandrill` — that's the deprecated one)
- [ ] Stripe webhook URL points to `/api/stripe/webhook` with correct `STRIPE_WEBHOOK_SECRET`
- [ ] Twilio statusCallback URL builds correctly (check `lib/sms.ts`)
- [ ] CourtReserve sync credentials are valid (last successful sync < 24h in Supabase logs)

### Monitoring Setup

- [ ] Sentry DSN flowing — check recent events in Sentry dashboard
- [ ] UptimeRobot (or equivalent) pinging `/api/health` every 5 min
- [ ] AI budget alert cron (`/api/cron/ai-budget-check`) scheduled every 6h in `vercel.json`

### Feature Flags

- [ ] Agent control plane defaults to disabled/shadow for new clubs (verify in `lib/ai/agent-control-plane.ts`)
- [ ] Autonomy policies default to `approve` mode (not `auto`) for safety
- [ ] Rollout allowlist (`AGENT_OUTREACH_ROLLOUT_CLUB_IDS`) contains only pilot club IDs

## Deploy

Best case: merge to `deviq`, Vercel auto-deploys, wait 2-3 min, done.

### Manual rollback if needed

```
Vercel Dashboard → Deployments → previous good build → ⋯ → Promote to Production
```

## Post-Deploy Smoke Tests

Run within 5 minutes of deploy going live.

- [ ] `curl https://stest.piqle.io/api/health` → `{"ok": true, ...}` with 200
- [ ] Open app, sign in with Google → lands on dashboard
- [ ] Navigate to intelligence/advisor → renders without errors
- [ ] Check Sentry dashboard → no spike in errors
- [ ] Check Vercel logs → no startup errors from `instrumentation.ts`

## First 24 Hours

- [ ] AI spend matches expected baseline (check `ai_usage_logs` table)
- [ ] No unexpected agent decisions (check `agent_decision_records`)
- [ ] Webhook success rate: opens/clicks flowing for recent campaigns
- [ ] No jump in 500s or 429s in Sentry

## After a Major Change

- [ ] Update `CLAUDE.md` if DB schema or workflow changed
- [ ] Update this checklist if a new step became necessary
- [ ] Mention the deploy in a founder update / Slack channel
