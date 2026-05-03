# Cron Setup

## Why this doc exists

Most cron jobs on this repo run via Vercel native cron (`vercel.json` →
`crons` array). For one of them — the CourtReserve sync orchestrator —
we use Upstash QStash instead, because Vercel cron only fires on
**production** deployments and `app.iqsport.ai` is served by a **preview**
deploy of the `Sol2` branch. Preview deploys never receive Vercel cron
triggers.

## CourtReserve sync schedule

- **Trigger:** Upstash QStash (US-EAST-1)
- **Schedule ID:** `scd_7gqRt3u9FQ3yMAjf9to7oauFURkz`
- **Cron:** `*/15 * * * *` (every 15 min)
- **Target:** `https://app.iqsport.ai/api/connectors/courtreserve/sync`
- **Method:** POST
- **Auth:** `Authorization: Bearer <CRON_SECRET>` (forwarded by QStash)
- **Retries:** 3 (exponential backoff)

The orchestrator endpoint dispatches to per-connector worker functions
(`/api/connectors/courtreserve/sync-worker`) via fan-out, so each club
gets its own 5-min Vercel function budget in parallel.

## Operating QStash

Dashboard: https://console.upstash.com/qstash → US Region

REST API base: `https://qstash-us-east-1.upstash.io`

Auth: `Authorization: Bearer $QSTASH_TOKEN` (Upstash Console → QStash → Details)

### List schedules
```sh
curl -s "https://qstash-us-east-1.upstash.io/v2/schedules" \
  -H "Authorization: Bearer $QSTASH_TOKEN" | jq
```

### Pause / resume
```sh
# Pause
curl -X PATCH "https://qstash-us-east-1.upstash.io/v2/schedules/scd_7gqRt3u9FQ3yMAjf9to7oauFURkz/pause" \
  -H "Authorization: Bearer $QSTASH_TOKEN"
# Resume
curl -X PATCH "https://qstash-us-east-1.upstash.io/v2/schedules/scd_7gqRt3u9FQ3yMAjf9to7oauFURkz/resume" \
  -H "Authorization: Bearer $QSTASH_TOKEN"
```

### Recreate (e.g. to change cron or target)
```sh
curl -X POST "https://qstash-us-east-1.upstash.io/v2/schedules/https://app.iqsport.ai/api/connectors/courtreserve/sync" \
  -H "Authorization: Bearer $QSTASH_TOKEN" \
  -H "Upstash-Cron: */15 * * * *" \
  -H "Upstash-Method: POST" \
  -H "Upstash-Forward-Authorization: Bearer $CRON_SECRET" \
  -H "Upstash-Retries: 3"
```

### View execution history
QStash Console → Schedules → click schedule ID → events with response codes.

## When can we move CR sync back to Vercel native cron?

When IQSport gets its own dedicated Vercel project where production
branch is `Sol2` (or `main` after we eventually rename). Then cron jobs
defined in `vercel.json` will fire correctly. At that point:

1. Add the entry back to `vercel.json` `crons` array:
   ```json
   { "path": "/api/connectors/courtreserve/sync", "schedule": "*/15 * * * *" }
   ```
2. Pause the QStash schedule (don't delete — keep as fallback for ~1
   week to confirm Vercel cron is firing reliably).
3. Once confirmed, delete the QStash schedule via DELETE `/v2/schedules/<id>`.
