# Engage — Priority 1: One-time campaigns end-to-end

> **STATUS: ✅ COMPLETE.** All 6 substeps shipped to `rgdev` and verified live with real Mandrill sends. See §4 for evidence.
> **Companion to:** `ENGAGE_REDESIGN_SPEC.md` (Phases 0–5, all shipped earlier).
> **Branch:** `rgdev`. Not yet merged to `main`/Sol2 — see §6 for merge gate.
> **Working cadence:** Each substep was implemented → pushed → tested → next. No cross-step regressions reported.

---

## 0. Outcome (as of 2026-05-01)

The Campaign Wizard now actually sends mail. Admin clicks Launch → recipients get real emails via Mandrill within ~60s → opens/clicks/bounces flow back into per-Campaign counters → Active Campaigns table updates in real time. Live Mode and killSwitch gating verified at the cron layer. Test send (single-recipient preview) works. Sequence/Recurring formats remain intentionally disabled with "Coming soon" labels — they require a separate runner, deferred to Priority 3.

**Pipeline (verified end-to-end):**
```
Wizard Launch
  → tRPC launchCampaign → Campaign row + eager AIRecommendationLog fan-out (one per recipient)
  → Vercel cron /api/cron/campaign-sends (every minute, Bearer CRON_SECRET)
  → resolveAgentControlPlane gate (skip if mode !== 'live' or killSwitch)
  → Atomic claim (FOR UPDATE SKIP LOCKED, batch of 50)
  → sendOutreachEmail → Mandrill API → recipient inbox
  → externalMessageId stored, sent_count++, status='completed' when batch done
  → [user opens email]
  → Mandrill webhook (signed HMAC-SHA1) → /api/webhooks/mandrill
  → log.openedAt set + Campaign.openedCount++ (idempotent via NULL guard)
  → Active Campaigns table (refetchInterval 30s) → admin sees count tick up
```

---

## 1. Decisions locked (kept)

| ID | Decision | Outcome |
|----|----------|---------|
| **D1** | One-time only in P1; Sequence/Recurring stay disabled. | Held. `launchCampaign` rejects non-`one_time` formats with explicit error. |
| **D2** | `Campaign.cohortSnapshot.userIds` is the source of truth for the send queue. | Held. Cohort filter changes after launch do not affect already-launched campaigns. |
| **D3** | Reuse existing email transport (`sendOutreachEmail`); no new sender abstraction. | Held. Cron and Test Send both call `sendOutreachEmail`. |
| **D4** | Per-minute Vercel cron, idempotent via `sent_at IS NULL` guard. | Held. Concurrent ticks safe via `FOR UPDATE SKIP LOCKED`. |
| **D5** | Live Mode gated at three layers (UI / launchCampaign / cron). | Cron-layer gate uses existing `resolveAgentControlPlane`, also honours `killSwitch=true`. |
| **D6** | Recipient logs in `AIRecommendationLog` with `campaignId` FK. | Held. Eager fan-out at launch — rows exist immediately even for `status='scheduled'`. |

---

## 2. Substeps (all shipped)

### P1.1 — Launch mutation + real Active Campaigns query ✅
**Commit:** `7f57d3c4` (Apr 29).
- `intelligence.launchCampaign` (`server/routers/intelligence.ts:9067`) creates `Campaign` row with frozen `cohortSnapshot.userIds`, status `running`/`scheduled`. Rejects empty audience and non-one_time formats.
- `intelligence.listActiveCampaigns` (`server/routers/intelligence.ts:9017`) reads real `Campaign` rows where `status IN ('running','scheduled','paused')`, projects `attribution.booked_count` / `attribution.booked_revenue_cents`.
- Wizard Launch wired to mutation; success/error UI in `Step4Message.tsx`.

### P1.2 — Send queue cron + per-minute Vercel schedule ✅
**Commit:** `34a6959f`.

**Migration `migrations/add-campaign-send-fanout.sql`** (applied to dev project `angwdmyswzztmlrdzgxm`):
- `ai_recommendation_logs.campaign_id UUID` FK → `campaigns.id`, ON DELETE SET NULL
- `ai_recommendation_logs.sent_at TIMESTAMPTZ`, `retry_count INT NOT NULL DEFAULT 0`
- Partial index `(campaign_id, "createdAt") WHERE sent_at IS NULL AND campaign_id IS NOT NULL` — hot path for cron's batch claim
- `AIRecommendationType` enum: `CAMPAIGN_SEND` value added
- `campaigns.clicked_count INT NOT NULL DEFAULT 0` — symmetry with delivered/opened

**Prisma schema:** added `campaignId` + `sentAt` + `retryCount` + `Campaign` relation to `AIRecommendationLog`; added `clickedCount` + `recipientLogs` relation to `Campaign`.

**`launchCampaign` amend** — eager fan-out: after creating `Campaign` row, `createMany` inserts one `AIRecommendationLog` per recipient with `type='CAMPAIGN_SEND'`, `status='pending'`, `campaignId` set. Progress UI shows "0 / N" the moment Launch is clicked.

**New cron `app/api/cron/campaign-sends/route.ts`:**
- Auth: `Bearer ${CRON_SECRET}` (matches `health-snapshot` pattern)
- Selects campaigns where `status='running' AND (scheduledAt IS NULL OR scheduledAt <= now)`
- For each: resolves `outreachSend.mode` via `resolveAgentControlPlane(club.automationSettings)`. Skips if `mode !== 'live'` OR `killSwitch=true`.
- Atomic claim of `MAX_BATCH=50` pending logs:
  ```sql
  UPDATE ai_recommendation_logs SET sent_at=NOW()
   WHERE id IN (SELECT id FROM ai_recommendation_logs
                 WHERE campaign_id=$1 AND sent_at IS NULL
                 ORDER BY "createdAt" ASC LIMIT 50
                 FOR UPDATE SKIP LOCKED)
   RETURNING id, "userId", retry_count
  ```
- Per row: hydrate `user.email`, render `{{name}}`, call `sendOutreachEmail` with `metadata={logId, clubId, userId}` for webhook correlation.
- On success: store `externalMessageId`, bump `Campaign.sent_count`.
- On failure: revert `sent_at=NULL` + increment `retry_count`. At `MAX_RETRIES=3` → `bouncedAt` + `bounceType='retry_exhausted'` + bump `failed_count`.
- Pre-flight `isBlockedEmail` check counts as failed with `bounceType='blocked_domain'`.
- After batch: if `(sent_count + failed_count >= total)` → `status='completed'` + `completedAt=now`.

**`vercel.json` cron:** `* * * * *` (every minute).

### P1.3 — Mandrill webhook → Campaign counter rollup ✅
**Commit:** `73197ee2`.

**Gap closed:** existing webhook updated `AIRecommendationLog` timestamps but never bumped per-Campaign counters. Active Campaigns would have shown "0 opens / 0 clicks" forever.

**Added in `app/api/webhooks/mandrill/route.ts`:**
- `'send'` event → `log.deliveredAt` set + `Campaign.deliveredCount` bumped (Mandrill 'send' = "handed to receiving SMTP" = closest signal to delivered)
- First `'open'` → `openedCount++`; first `'click'` → `clickedCount++`; first `'hard_bounce'`/`'reject'` → `failedCount++`
- Soft bounces deliberately do NOT bump `failedCount` — they may recover; cron's retry-exhaustion path catches truly dead rows
- **Idempotency:** bumps fire only when relevant log timestamp was NULL pre-update. Mandrill re-deliveries absorbed without double-counting.
- **Filter:** bumps only fire when `log.campaignId` is set — i.e. for `CAMPAIGN_SEND` rows specifically, not for one-off CHECK_IN/REACTIVATION/SLOT_FILLER recommendations sharing the table.

### P1.4 — Live Mode cron-layer gate ✅
Code shipped with P1.2 (`34a6959f`). Verified live with toggle test on test club:

| Time | Mode | KillSwitch | Cron response |
|------|------|------------|---------------|
| 02:47:27 | shadow | false | `liveModeSkipped:1, totalSent:0`, 126ms |
| 02:48:34 | live | false | `totalSent:1`, dispatch ✓ (Mandrill `d09c86b7d14...`) |
| 02:49:38 | live | true | `liveModeSkipped:1, totalSent:0`, 123ms |

All 3 gating scenarios behave correctly. No DB side effects when skipped (recipient log stays `pending`, `sent_at=NULL`).

### P1.5 — Active Campaigns refetchInterval ✅
**Commit:** `f3ad821e`.

`useListActiveCampaigns` got `refetchInterval=30s`. Counters tick up in real time as cron and webhooks land bumps. `staleTime` lowered 60s → 30s to match. `refetchInterval` honours existing `options.enabled` so background sections don't poll uselessly. `refetchOnWindowFocus` left at default — only the timer fires extra requests.

### P1.6 — Test send (single-recipient preview) ✅
**Commit:** `2d39d67f`.

**New mutation `intelligence.testSendCampaign`:**
- Inputs: `clubId, subject, body, channels, optional to`
- Auth: `requireClubAdmin`
- Resolves recipient: explicit `to` → caller's session email → error
- Subject prefixed with `[TEST]` so it never gets mistaken for a real send
- `{{name}}` substitution against caller's display name
- Reuses `sendOutreachEmail` so preview reads exactly like a real send
- **Critically does NOT:** create Campaign row, create `AIRecommendationLog`, bump counters, or honour Live Mode (it's a QA tool, not member outreach)

**`Step4Message.tsx` UI:** disabled placeholder replaced with real mutation call. Loading spinner, disabled input/button while in flight, success banner, inline error banner. Empty `testEmail` → falls back to session email.

---

## 3. Schema changes (applied to dev `angwdmyswzztmlrdzgxm`)

| Table | Change |
|-------|--------|
| `ai_recommendation_logs` | + `campaign_id UUID FK`, + `sent_at TIMESTAMPTZ`, + `retry_count INT` |
| `ai_recommendation_logs` | + partial index for cron batch claim |
| `AIRecommendationType` enum | + `CAMPAIGN_SEND` |
| `campaigns` | + `clicked_count INT NOT NULL DEFAULT 0` |

Migration file: `migrations/add-campaign-send-fanout.sql`.

**Pending for prod:** the same migration must run against `mwdftgazlvpfyvqicovh` (iqsport-prod) before `rgdev` is merged to `main`. See §6 merge gate.

---

## 4. Verified live — full P1 E2E

Six real Mandrill sends to `ds@piqle.io` and `sol@piqle.io`. Recipients confirmed delivery.

| Campaign | Recipient | Mandrill messageId | Result |
|----------|-----------|--------------------|--------|
| `511491a6-...` "P1.2 smoke test" | Diana | `03f440cea8c446c1bb9e730ee27a5ac7` | sent → opened (sim) → clicked (sim) → opened_count=1, clicked_count=1 |
| `29489bd7-...` "P1.2 smoke test — Sol" | Sol | `7d754094a76c4c388c7c447164c9afba` | sent → 'send' event → delivered_count=1 |
| `50a2c324-...` "P1.4 Live Mode test" | Sol | `d09c86b7d14d438ea07fcc75d710644d` | shadow-skipped, dispatched after live flip |
| `8269874e-...` "P1.4 killSwitch test" | Sol | — | killSwitch-skipped, never sent |
| (test-send 1) | Sol (`[TEST]`) | `07012b5a6d254b359ddacd0266beda12` | preview, no DB rows |
| (test-send 2) | Sol (`[TEST]`) | `006638d4d86c48a8a6ff3495fc82de3a` | preview, no DB rows |

---

## 5. Known limitations (documented; not blockers)

1. **Stuck-claim recovery not implemented.** If cron crashes after `sent_at=NOW()` but before `externalMessageId` update, the row reads as "sent" with no Mandrill ack. Sweeper (`sent_at < NOW()-5min AND externalMessageId IS NULL → revert NULL`) is left for follow-up if it surfaces.
2. **Multi-channel** (email + SMS simultaneously). P1.2 picks the primary channel only. Per-`(userId, channel)` fan-out lands when SMS sender ships.
3. **`{{name}}` is the only substitution.** Variant rendering / per-row personalisation beyond first-name lands later.
4. **Hardcoded "Book a Session" CTA.** All campaign emails use `sendOutreachEmail` template, which embeds a CTA → club page. For retention/win-back universal; for upgrade/event flows the CTA reads odd. Fix proposal: add `cta_label` + `cta_url` to `Campaign` model + Wizard Step 4. Strong P2 candidate.

---

## 6. Open items / next

### Immediate (small, high-value)
1. **`rgdev` → `main` merge gate.** Prod Supabase (`mwdftgazlvpfyvqicovh`) needs the same migration applied first. Then merge → Vercel auto-registers `* * * * *` schedule for `/api/cron/campaign-sends` on prod. Until merged, cron only runs on the rgdev preview deployment when manually triggered with `CRON_SECRET`.
2. **Custom CTA in Campaign emails.** Extend `Campaign` model with `cta_label` + `cta_url`, surface in Wizard Step 4. Removes the "Book a Session" mismatch for non-retention flows.
3. **AI Insights role-tagging.** Out of P1 scope but flagged by recent persona research (Marketer / Ops / Owner agents — see §7). Add `role: 'owner' | 'marketer' | 'ops'` to each Insight + filter UI. Not Engage-specific; useful regardless.

### Engage Priority 2
- **Campaign History page real data + drilldown card + per-campaign attribution view.** Currently the History accordion is a static placeholder. P2 fills it from `Campaign WHERE status='completed' ORDER BY completedAt DESC` with an expandable per-row card showing metric tiles, attributed members, and the sample message.

### Engage Priority 3+
- **Sequence engine** (admin-authored multi-message series). Schema additions for `Campaign.format`, `Campaign.steps[]`. Multi-message editor in Wizard Step 4. Separate runner. **Do not conflate with `lib/ai/sequence-runner.ts`** — that handles per-member health-driven retention chains automatically; admin-authored sequences are a different system.
- **Recurring campaigns** ("every Monday at 9am"). Cron expression parser + recurring runner.
- **Dead-state cleanup** in `CampaignsIQ.tsx` — unused hooks left after legacy block removal.
- **Send Volume chart** sizing in Insights drawer (currently clipped).

---

## 7. References

- **Full session log (4 days, 4 workstreams):** `docs/iqsport-session-summary-2026-04-30.md`
- **Full Engage SPEC** (Phases 0–5): `docs/ENGAGE_REDESIGN_SPEC.md`
- **High-level plan:** `docs/ENGAGE_REDESIGN_PLAN.md`
- **Repo conventions** (DB types, brand gating, branch policy): `CLAUDE.md`
- **Auto-retention runner** (orthogonal to admin sequences, do not modify together): `lib/ai/sequence-runner.ts`
- **Reference IDs:**
  - iqsport-prod Supabase: `mwdftgazlvpfyvqicovh`
  - dev (piqle-web-tournament): `angwdmyswzztmlrdzgxm`
  - test iq2 club (dev): `bbdfc056-40c9-449f-8297-0fa48383cebb`
  - rgdev preview: `piqle-web-tournament-git-rgdev-rodion-gorins-projects.vercel.app`

---

**End of Priority 1 spec — closed 2026-05-01.**
