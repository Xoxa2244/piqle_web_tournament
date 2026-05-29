# IQSport Intelligence Module — Final Code Audit

## 1. Overall grade: **C+ / "B-minus engineering, D security"**

This is impressively sophisticated work for a solo founder — the SQL hygiene, performance tuning, and AI-pipeline architecture are well above seed-stage norms — but it is **not production-safe as-is**. One systemic authorization defect (`requireClubAdmin` admits any club follower) cuts across the entire tRPC surface and, combined with two zero-auth IDORs, makes the whole multi-tenant boundary porous. Fix the access-control model and wire the dormant crons, and this jumps to a solid B+. Ship it unfixed and any registered user can read every club's revenue/PII and send club-branded SMS to its members.

## 2. Per-discipline grades

| Discipline | Grade | One-line takeaway |
|---|---|---|
| Backend / tRPC / Prisma | C | Excellent SQL & validation hygiene undone by a member-as-admin authz model on 66 mutations. |
| SQL correctness & perf | B- | Hot paths genuinely tuned; two insight engines read time-of-day from a noon-truncated column. |
| AI / LLM pipelines | B- | Clean abstraction, but tier env-mapping is broken, budget gate is dead code, fallback is dead code. |
| Frontend / React / Next | B- | Data layer is exemplary; component layer has 3k-line monoliths with unmemoized per-render maps. |
| Security & authorization | **D** | Self-service followers get admin-tier reach; AI surface has no rate limit; cross-tenant cost abuse open. |
| Analytics / economics | B- | Core economics are honest and clean; two bugs show operators silently-wrong headline numbers. |
| Architecture / tech-debt | C+ | High intent quality, but a 14.5k-line god-router and confirmed dead modules. |
| Reliability / ops | B- | Strong foundations; ~26/27 prod crons silently dormant; freeze-fix only half-ported. |

## 3. Top risks (severity-ordered; cross-cutting flagged)

**1. [CRITICAL · cross-cutting, 3 reviewers] `requireClubAdmin` is "require membership," not "require admin."**
`server/routers/intelligence.ts:97-115` — returns `{isAdmin:false, isMember:true}` for any `clubFollower` and only ~4-5 of ~160 call sites check the flag. **Why it matters:** `club.toggleFollow` (`server/routers/club.ts:802`) lets any user self-join any OPEN club, then read `getRevenueAnalytics`/`getMemberHealth` and *trigger side effects* — `sendOutreachMessage`, `launchCampaign`, `sendEventCampaign`, `exportLookalikeAudienceCsv`, `deleteCohort`, tier-config writes. The intelligence pages have no server guard, so tRPC is the only boundary. **Fix:** introduce a `clubAdminProcedure` middleware that resolves `clubId` from input and throws `FORBIDDEN` for non-admins; make `requireClubAdmin` throw by default with an explicit `{allowMembers:true}` opt-in for the handful of self-facing reads.

**2. [CRITICAL · 2 reviewers] Member-AI-profile endpoints have zero club authorization.**
`intelligence.ts:6777 getMemberAiProfiles`, `:6792 getMemberAiProfile` — bodies are literally `findMany({ where:{ clubId } })` / `findUnique` with no auth, no membership, no userId scoping. **Why it matters:** any authenticated user passes an arbitrary `clubId` and enumerates every member's churn `riskScore`, `riskSegment`, and AI-drafted `reactivationMessage` (PII, `prisma/schema.prisma` MemberAiProfile). Wired into the live UI hook, so it's a production endpoint. **Fix:** add admin-gated `requireClubAdmin` to both.

**3. [HIGH · cross-cutting, 3 reviewers] Insight generators read hour from `ps.date`, which carries no time-of-day.**
`lib/ai/business-insights-engine.ts:288/298/358` and twins `lib/ai/insights-engine.ts:122/132/548` use `EXTRACT(HOUR FROM ps.date)`. CR sync hardcodes `T12:00:00Z` (`courtreserve-sync.ts:61`), CSV hardcodes `T00:00:00` (`session-importer.ts:206`). **Why it matters:** `pilotEmptyEveningSlots` (`>=19`) matches **zero rows forever**; `pilotPeakHourOverflow` always reports hour 12/0 — fabricated "peak hour" cards on the dashboard and AI Advisor. The codebase already knows the fix: `intelligence.ts:3011/10783` use `ps."startTime"::time`. **Fix:** swap to `EXTRACT(HOUR FROM ps."startTime"::time)` in all four queries; add a regression test.

**4. [HIGH] AI rate limiter defined, wired to zero endpoints + cross-tenant cost abuse.**
`lib/rate-limit.ts:58` (`aiChat`) has no callers; `app/api/ai/chat/route.ts` relies only on per-club/day `checkUsageLimit` (Infinity for paid plans). Separately, `regenerateMemberProfiles` (`intelligence.ts:6803`) gates only on `checkFeatureAccess` (plan check, not authz), and `app/api/ai/generate-member-profiles/route.ts:18-29` accepts any session, reads `clubId` from the body, and **fans out to every club if `clubId` is omitted**. **Why it matters:** denial-of-wallet — an authenticated user can burst the streamed LLM route and force paid profile-regen for arbitrary tenants. **Fix:** wire `checkRateLimit('aiChat', ${clubId}:${userId})` into the chat route; admin-gate the three regen entry points; never allow the all-clubs fan-out from a user session.

**5. [HIGH] `event-detection.ts`: invalid SQL + text-vs-timestamp params + no per-club isolation.**
`lib/ai/event-detection.ts:76-88` — `HAVING` with **no `GROUP BY`** over non-aggregated `ps.id`/`ps."maxPlayers"` (Postgres rejects this unconditionally); lines `73/88/99` pass `.toISOString()` strings into timestamp columns (the prod `timestamp >= text` error class); the loop at `:456` has no try/catch. **Why it matters:** the agent event pipeline (`app/api/agent/events/route.ts` + CR sync worker) throws on the first club and aborts the rest. **Fix:** move the occupancy predicate into a `WHERE` on a correlated subquery, pass `Date` objects, and wrap each `detectEventsForClub` call in try/catch.

**6. [HIGH] Model-tier env collision — one var drives two tiers.**
`lib/ai/llm/provider.ts:18-31` — both `fast.primary` and `standard.primary` read `AI_PRIMARY_MODEL`. **Why it matters:** `.env.example` sets it to `gpt-4o-mini`, so the flagship advisor (`getModel('standard')`) silently runs on the cheap model; flipping it to `gpt-4o` makes ~1,900 profile calls/day jump ~16×. The tier abstraction is non-functional. **Fix:** give each tier its own var (`AI_FAST_MODEL`/`AI_STANDARD_MODEL`/`AI_PREMIUM_MODEL`); audit the live Vercel value now.

**7. [HIGH · cross-cutting, 2 reviewers] ~26/27 Vercel crons are dormant on the prod domain.**
`vercel.json:5-110` + `docs/CRON_SETUP.md` — `app.iqsport.ai` is a preview alias; only CR-sync moved to QStash. **Why it matters:** health-snapshot, business-insights, operational-signals, lifecycle/campaign-sends, ai-budget-check, etc. never run in prod; health-snapshot feeds downstream features, so the degradation cascades. `/api/health` doesn't detect it. **Fix (already task #42, treat as P0):** split into a Vercel project whose prod branch is Sol2, or move all crons to QStash; add a cron-heartbeat table + health check.

**8. [HIGH] `operational-signals` auto-resolve runs even after a generator throws.**
`lib/ai/operational-signals-engine.ts:1060-1164` — catches per-generator errors but **omits the `errors[]` field and the `if (errors.length === 0)` guard** that its sibling has (`business-insights-engine.ts:1066`). **Why it matters:** a transient throw in `vipAtRiskAlerts` makes those signals absent from `produced` for the wrong reason, so they get silently `resolved` — and this runs on a manual operator "Refresh," so a click can wipe valid VIP-at-risk alerts. **Fix:** mirror the biz-insights guard exactly (collect `errors[]`, gate the resolve sweep).

**9. [MEDIUM · cross-cutting] Cross-club IDOR in cohort mutations + "Revenue at risk" is a flat $99.**
`updateCohort:10555`/`deleteCohort:10575`/`getCohortMembers:10656` authorize on `input.clubId` but operate on bare `where:{ id: cohortId }` — an admin of club A can edit/delete club B's cohort. The right pattern (`findFirst({where:{id, clubId}})`) already exists at `toggleCampaignPause`. Separately, `lib/ai/member-health.ts:773` computes `revenueAtRisk = count × 99` because every call site omits the price arg — the Members-page headline KPI is wrong for VIP-weighted clubs. **Fix:** scope cohort ops by `clubId` and assert count===1; thread real per-club avg price into `generateMemberHealth`.

## 4. Prioritized remediation backlog

**P0 (now — security/data exposure):**
- Convert `requireClubAdmin` to throw-by-default + introduce `clubAdminProcedure`; audit all ~165 call sites. *(Risk #1)*
- Admin-gate the 4 member-profile tRPC procedures + the REST regen route; kill the all-clubs fan-out. *(Risks #2, #4)*
- Wire `checkRateLimit('aiChat')` into the chat route + a shared limiter on other `/api/ai/*` routes. *(Risk #4)*
- Scope `updateCohort`/`deleteCohort`/`getCohortMembers` by `clubId`. *(Risk #9)*
- Resolve cron-dormancy (#42) + add a cron-heartbeat probe. *(Risk #7)*

**P1 (soon — correctness/cost/reliability):**
- Swap `ps.date` → `ps."startTime"::time` in both insight engines + regression test. *(Risk #3)*
- Fix `event-detection.ts` SQL, params, and per-club isolation. *(Risk #5)*
- Split the model-tier env vars; audit the live Vercel value. *(Risk #6)*
- Add the `errors.length === 0` guard to `operational-signals`. *(Risk #8)*
- Thread real avg subscription price into `revenueAtRisk`. *(Risk #9)*
- Wire `checkAIBudget` into `generateMemberProfilesForClub` + chat (or drop the "refuses calls" docs); add `trackUsage` to the onboarding route.
- Wrap `deleteImport`/`deleteAllClubData` multi-step deletes in a transaction.
- Close the secondary fail-open holes: `enrich-members` + `slot-filler` crons fail OPEN when `CRON_SECRET` unset; `/api/ai/test-email` is an open relay.

**P2 (later — debt/perf/quality):**
- Memoize `MembersIQ` `realMembers`/`allMembers`/`filtered` + debounce search (6,800-member jank). *(jank on largest club)*
- Split `intelligence.ts` (14.5k lines) into namespaced sub-routers; extract cohort-SQL helpers to a testable lib.
- Delete dead code: legacy `insights-engine.ts`, the `CampaignCreator` family (~1,200 LOC), `getClubInsights`.
- Remove the misleading streamText try/catch fallback (it can't catch streaming errors) or implement real fallback.
- Add `play_session_bookings(userId)` and `(status, bookedAt)` indexes; route the `cron-wrapper` (Sentry) into the other 8 cron handlers; de-dup the two campaign-send crons; remove `db:push` from `package.json`.

## 5. Genuine strengths

This codebase is far from sloppy — the deliberate patterns are easy to distinguish from the accidents because the comment quality is unusually high. Specifically:

- **SQL discipline is real:** all 63 `$queryRawUnsafe` sites use positional params; the `::uuid`-on-TEXT trap is consistently *avoided with explanatory comments*; the cohort builder defends string interpolation with quote-escaping + `Number()` range guards + a field/op allowlist layered on a Zod enum.
- **Performance was measured, not guessed:** the pre-aggregate-CTE rewrite (`membership-economics.ts:446`, `member-profile-generator.ts:391`) with EXPLAIN-ANALYZE notes (100s→~1s), and `CREATE INDEX CONCURRENTLY` on `play_sessions(clubId,date)` (37-145s→0.4s).
- **Honest economics:** MRR-at-risk is grounded in a *measured* per-club churn rate with a transparent small-sample fallback (`measured:false`), and assumed save-rates are surfaced in the operator-facing copy.
- **Mature failure handling where it counts:** `FOR UPDATE SKIP LOCKED` on the campaign send path (no double-sends), the documented per-generator isolation fix on biz-insights, AES-256-GCM connector secrets never returned to clients, a fail-fast env validator with weak-secret detection, and a genuinely actionable DR runbook.
- **The frontend data layer is exemplary:** `use-intelligence.ts` has consistent `enabled` guards, volatility-tuned `staleTime`, and well-reasoned heavy-payload deferral; the `STANDALONE_PATHS`/auth-storm tradeoff in `providers.tsx` is senior-level reasoning with dated decision comments.

Bottom line for the founder: the hard, easy-to-get-wrong stuff (SQL safety, perf, AI cost architecture) is done well. The gap is a single mis-named authorization helper that propagated everywhere, plus deployment plumbing that outgrew its origins. Both are mechanical to fix and don't require rearchitecting — but they are genuinely blocking for a multi-tenant production launch.

Key files: `server/routers/intelligence.ts:97` · `server/routers/intelligence.ts:6777,10555` · `lib/ai/business-insights-engine.ts:288` · `lib/ai/event-detection.ts:76` · `lib/ai/llm/provider.ts:18` · `lib/ai/operational-signals-engine.ts:1060` · `lib/ai/member-health.ts:773` · `app/api/ai/generate-member-profiles/route.ts:18` · `lib/rate-limit.ts:58` · `vercel.json:5`.