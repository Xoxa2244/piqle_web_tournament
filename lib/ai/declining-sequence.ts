/**
 * Declining-Activity Sequence — ENGAGE Segment #4 "Declining activity".
 *
 * Three-step recovery chain for members who just dropped from regular to
 * near-zero activity. Spec from docs in repo:
 *
 *   Day 1: "Anything we can help with?" + 4-button micro-survey
 *          (injury / busy / schedule / pause). NO incentive yet — the
 *          first email is for diagnosis, not pressure.
 *   Day 5: Personalised schedule snapshot — top 3 upcoming sessions
 *          ranked for this member by the slot-filler scoring algorithm.
 *          Sent only if no booking AND no survey response.
 *   Day 12: Incentive — guest pass for one session. Last try. Sent only
 *          if no booking AND no survey response.
 *
 * Step 0 (the Day 1 email) is created by the daily declining-detector
 * + a writer (createDecliningStep0). Steps 1 and 2 are advanced by
 * processDecliningFollowUps which mirrors processOnboardingFollowUps
 * — same sequence-runner pattern (parentLogId + sequenceStep) so the
 * existing dashboards, attribution, and Mandrill click tracking all
 * work without changes.
 *
 * Frequency cap: every send goes through checkAntiSpam with
 * isSequenceFollowUp=true so cross-type cooldown is relaxed (the chain
 * is one campaign) but per-day/per-week caps + opt-out still apply.
 *
 * Conditional skip: before sending Day 5 or Day 12 we re-check
 *   (a) did they make a confirmed booking since Day 1? (success — exit)
 *   (b) did they click a survey option? (we have their answer — exit)
 * If either, we don't escalate. The exit is recorded as `reasoning.exitReason`
 * on the parent log so the dashboard can show why a sequence stopped.
 */

import { campaignLogger as log } from '@/lib/logger'
import { buildPlatformUrl } from '@/lib/platform-base-url'
import { buildEmailButton, buildEmailPanel, renderTextParagraphs } from '@/lib/email-brand'
import { checkAntiSpam } from './anti-spam'
import { generateSlotFillerRecommendations } from './slot-filler'
import type { DecliningCandidate } from './declining-detector'

export interface DecliningStep {
  step: number
  /** Days from step 0 (Day 1 first contact) before this follow-up should fire. */
  delayDays: number
  /** When true, the runtime selects template based on member's behaviour
   *  since step 0. For declining: skip the send entirely if booked/responded. */
  conditional?: boolean
  subject: (firstName: string, clubName: string) => string
  body: (firstName: string, clubName: string, ctx: DecliningStepContext) => string
}

export interface DecliningStepContext {
  bookingUrl: string
  surveyBaseUrl: string
  /** AIRecommendationLog.id — used in survey response URLs to attribute the click. */
  logId: string
  /** Optional: top-N session recommendations for Day 5 personalised schedule. */
  recommendedSessions?: Array<{
    title: string
    date: string
    startTime: string
    bookingUrl: string
  }>
}

/**
 * The 4 micro-survey options spec'd for declining members. All 4 are
 * already in the /api/surveys/respond endpoint allowlist (added in
 * Newcomer Phase 2), so links work without further backend changes.
 */
export const DECLINING_SURVEY_OPTIONS = ['injury', 'busy', 'schedule', 'pause'] as const

const DAY_1: DecliningStep = {
  step: 0,
  delayDays: 0,
  subject: (firstName, clubName) =>
    `${firstName}, everything ok at ${clubName}?`,
  body: (firstName, clubName, ctx) =>
    `Hey ${firstName}!

We noticed you haven't been around ${clubName} as much in the last few weeks. Just checking in — no pressure to book anything, but if there's something getting in the way we'd genuinely like to know.

Quick one — what's going on?

→ Injury or health issue:    ${ctx.surveyBaseUrl}?logId=${ctx.logId}&option=injury
→ Just slammed at work/life:  ${ctx.surveyBaseUrl}?logId=${ctx.logId}&option=busy
→ Schedule doesn't work:      ${ctx.surveyBaseUrl}?logId=${ctx.logId}&option=schedule
→ Just taking a pause:        ${ctx.surveyBaseUrl}?logId=${ctx.logId}&option=pause

If you'd rather just book a session and skip the survey, that works too:
${ctx.bookingUrl}

Either way — we're here when you're ready. 🎾`,
}

const DAY_5: DecliningStep = {
  step: 1,
  delayDays: 5,
  conditional: true,
  subject: (firstName, clubName) =>
    `A few sessions at ${clubName} that look like your speed`,
  body: (firstName, clubName, ctx) => {
    const sessionLines = (ctx.recommendedSessions || []).slice(0, 3).map((s, i) =>
      `${i + 1}. ${s.title} — ${s.date}, ${s.startTime}\n   ${s.bookingUrl}`
    ).join('\n\n')

    const sessionBlock = sessionLines.length > 0
      ? `Here's what's coming up that matches what you usually book:\n\n${sessionLines}`
      : `Here's the full schedule — pick what fits:\n${ctx.bookingUrl}`

    return `Hey ${firstName}!

No worries on the radio silence. We pulled a few sessions for you based on what you've enjoyed before — your level, your usual times, the formats you tend to book.

${sessionBlock}

If none of these fit, the full schedule is at ${ctx.bookingUrl} — no pressure either way. 🎾`
  },
}

const DAY_12: DecliningStep = {
  step: 2,
  delayDays: 12,
  conditional: true,
  subject: (firstName, clubName) =>
    `${firstName}, here's something on us`,
  body: (firstName, clubName, ctx) =>
    `Hey ${firstName}!

We'd really like to see you back at ${clubName}. So here's our offer: a free guest pass for your next session — your pick, any format, no strings.

Click below to book and the pass is automatically applied:
${ctx.bookingUrl}

That's it. No catch, no follow-up sales pitch. Use it or don't — but we wanted to make the first step easier. 🎾`,
}

export const DECLINING_STEPS: DecliningStep[] = [DAY_1, DAY_5, DAY_12]

// ── Rich HTML renderers for each step ──
//
// The plain-text `body` on each DecliningStep above is what shows up in
// non-HTML mail clients and as the email "preview text". The renderers
// below build the equivalent rich HTML that real (HTML) mail clients see —
// proper buttons for survey options, panels for session lists, prominent
// CTA. They piggy-back on the existing email-brand helpers so styling
// stays in lock-step with the rest of the IQSport email family.
//
// Convention: each renderer returns just the inner `bodyHtml` (no DOCTYPE,
// no <html>, no eyebrow chrome). sendOutreachEmail wraps it with
// buildIqSportEmail. We also pass `suppressDefaultCta: true` because each
// renderer ships its own CTAs and we don't want a duplicate "Book a
// Session" button at the bottom.

function renderDay1Html(firstName: string, ctx: DecliningStepContext): string {
  // Day 1: 4 secondary buttons (one per survey option) + primary "book a
  // session" fallback. No incentive yet — first contact is for diagnosis,
  // not pressure.
  const intro = `Hey ${firstName}! We noticed you haven't been around as much in the last few weeks. No pressure — but if there's something getting in the way we'd genuinely like to know.`

  const surveyButtons = [
    { label: 'Injury or health', option: 'injury' },
    { label: 'Slammed at work / life', option: 'busy' },
    { label: 'Schedule does not work', option: 'schedule' },
    { label: 'Just taking a pause', option: 'pause' },
  ]
    .map((opt) =>
      buildEmailButton(opt.label, `${ctx.surveyBaseUrl}?logId=${ctx.logId}&option=${opt.option}`, 'secondary'),
    )
    .join('')

  return `
    ${renderTextParagraphs(intro)}
    <p style="margin:18px 0 6px;font-size:14px;color:#94A3B8;text-align:center;letter-spacing:0.04em;text-transform:uppercase;font-weight:600;">
      Quick one — what's going on?
    </p>
    ${surveyButtons}
    <p style="margin:24px 0 0;font-size:13px;color:#94A3B8;text-align:center;">
      Or skip the survey and just book a session whenever you're ready.
    </p>
    ${buildEmailButton('Browse Sessions', ctx.bookingUrl, 'primary')}
  `
}

function renderDay5Html(firstName: string, ctx: DecliningStepContext): string {
  // Day 5: top-3 recommended sessions in a panel, each linkable, plus a
  // fallback "open the full schedule" button. Uses table-based bulletproof
  // layout per session row so Apple Mail iOS / Outlook render them as
  // proper button-style links rather than bare blue text.
  const intro = `Hey ${firstName}! No worries on the radio silence. We pulled a few sessions for you based on what you've enjoyed before — your level, your usual times, the formats you tend to book.`

  const sessions = ctx.recommendedSessions ?? []
  const sessionsHtml =
    sessions.length === 0
      ? ''
      : buildEmailPanel(
          sessions
            .slice(0, 3)
            .map(
              (s, i) => `
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="${i > 0 ? 'border-top:1px solid rgba(148,163,184,0.18);' : ''}">
                  <tr>
                    <td style="padding:${i > 0 ? '14px 0 0' : '0'};">
                      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:600;color:#F8FAFC;margin-bottom:4px;">${escapeHtml(s.title)}</div>
                      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#CBD5E1;margin-bottom:10px;">
                        ${escapeHtml(s.date)} &middot; ${escapeHtml(s.startTime)}
                      </div>
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td bgcolor="#0891B2" align="center" style="background-color:#0891B2;border-radius:8px;mso-padding-alt:8px 16px;">
                            <a href="${s.bookingUrl}" target="_blank" style="display:inline-block;background-color:#0891B2;color:#ffffff;text-decoration:none;padding:8px 16px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;font-weight:600;line-height:1;">
                              Reserve this session →
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              `,
            )
            .join(''),
        )

  const fallbackText =
    sessions.length === 0
      ? `Here's the full schedule — pick what fits.`
      : `If none of these fit, the full schedule is just a click away — no pressure either way. 🎾`

  return `
    ${renderTextParagraphs(intro)}
    ${sessionsHtml}
    <p style="margin:18px 0 0;font-size:14px;color:#CBD5E1;text-align:center;">
      ${escapeHtml(fallbackText)}
    </p>
    ${buildEmailButton('Open Full Schedule', ctx.bookingUrl, 'primary')}
  `
}

function renderDay12Html(firstName: string, ctx: DecliningStepContext): string {
  // Day 12: emphasized incentive panel + single prominent CTA. Last try.
  const intro = `Hey ${firstName}! We'd really like to see you back. So here's our offer — and that's it: no follow-up sales pitch, no strings attached.`

  // Use solid hex colors (no rgba — iOS Mail dark-mode strips alpha and
  // can flip low-contrast backgrounds to white). Pure white heading +
  // bright body text matched to the rest of the email family.
  const incentivePanel = buildEmailPanel(`
    <div style="text-align:center;padding:8px 0;">
      <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#3B2A6B;border:1px solid #6D4FBF;font-size:11px;font-weight:700;letter-spacing:0.18em;color:#DDD6FE;text-transform:uppercase;margin-bottom:14px;">
        On the house
      </div>
      <div style="font-size:24px;font-weight:800;color:#FFFFFF;line-height:1.25;margin-bottom:8px;">
        Free guest pass for your next session
      </div>
      <div style="font-size:14px;color:#E2E8F0;line-height:1.6;">
        Your pick: any format, any time. The pass is automatically applied when you book.
      </div>
    </div>
  `)

  return `
    ${renderTextParagraphs(intro)}
    ${incentivePanel}
    ${buildEmailButton('Claim Free Session', ctx.bookingUrl, 'primary')}
    <p style="margin:18px 0 0;font-size:13px;color:#94A3B8;text-align:center;">
      Use it or don't — but we wanted to make the first step easier. 🎾
    </p>
  `
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Pick the right rich-HTML renderer for a given step. Plain-text `body`
 * still ships as the multipart text alternative — see step.body() in the
 * DECLINING_STEPS array above.
 */
export function renderDecliningStepHtml(step: number, firstName: string, ctx: DecliningStepContext): string {
  if (step === 0) return renderDay1Html(firstName, ctx)
  if (step === 1) return renderDay5Html(firstName, ctx)
  if (step === 2) return renderDay12Html(firstName, ctx)
  return ''
}

/**
 * Create the Day 1 email + AIRecommendationLog row for a declining candidate.
 * Caller is the daily detector cron loop. Returns the new log row's id (used
 * to attribute survey clicks back) or null if skipped.
 */
export async function createDecliningStep0(
  prisma: any,
  candidate: DecliningCandidate,
  clubName: string,
  dryRun: boolean = false,
): Promise<{ status: 'sent' | 'skipped'; logId?: string; reason?: string }> {
  const { userId, clubId, email, name, recentBookings, historicalAvgPerMonth, daysSinceLastBooking } = candidate

  if (!email) {
    return { status: 'skipped', reason: 'no_email' }
  }

  // Frequency cap + opt-out gate. NOT a sequence follow-up at this stage —
  // we want full cross-type cooldown enforcement on the FIRST contact so we
  // don't pile onto a member who got a slot-filler invite yesterday.
  const spamCheck = await checkAntiSpam({
    prisma, userId, clubId, type: 'DECLINING_REACTIVATION', isSequenceFollowUp: false,
  })
  if (!spamCheck.allowed) {
    return { status: 'skipped', reason: spamCheck.reason }
  }

  if (dryRun) {
    return { status: 'skipped', reason: 'dry_run' }
  }

  const firstName = name?.split(' ')[0] || 'there'
  const bookingUrl = buildPlatformUrl(`/clubs/${clubId}/play`)
  const surveyBaseUrl = buildPlatformUrl('/api/surveys/respond')

  // Create the log first so we have its id for the survey URL — we'll write
  // it again in the same transaction once we have the email's externalMessageId.
  // For now, single-shot create + send afterwards keeps the code simple; if
  // Mandrill rate-limits, we'd reverse this to log-then-send.
  const created = await prisma.aIRecommendationLog.create({
    data: {
      clubId,
      userId,
      type: 'DECLINING_REACTIVATION',
      channel: 'email',
      sequenceStep: 0,
      status: 'sent',
      reasoning: {
        source: 'declining_detector',
        step: 0,
        delayDays: 0,
        recentBookings,
        historicalAvgPerMonth,
        daysSinceLastBooking,
        confidence: 90,
        autoApproved: true,
      },
    },
    select: { id: true },
  })

  const logId = created.id
  const ctx: DecliningStepContext = { bookingUrl, surveyBaseUrl, logId }
  const subject = DAY_1.subject(firstName, clubName)
  const body = DAY_1.body(firstName, clubName, ctx)

  try {
    const { sendOutreachEmail } = await import('@/lib/email')
    await sendOutreachEmail({
      to: email,
      subject,
      body,
      clubName,
      bookingUrl,
      bodyHtmlOverride: renderDecliningStepHtml(0, firstName, ctx),
      suppressDefaultCta: true,
    })
    return { status: 'sent', logId }
  } catch (err: any) {
    log.error({ userId, clubId, error: err?.message?.slice(0, 200) }, '[declining-sequence] step 0 send failed')
    // Mark the log as failed so we don't try again immediately on next cron tick.
    await prisma.aIRecommendationLog.update({
      where: { id: logId },
      data: { status: 'failed' },
    }).catch(() => {})
    return { status: 'skipped', reason: 'send_failed' }
  }
}

/**
 * Advance any in-flight declining sequences — analogous to
 * processOnboardingFollowUps. Reads logs at step 0 or 1, checks delay +
 * conditional skip, sends next step, persists.
 */
export async function processDecliningFollowUps(
  prisma: any,
  clubId: string,
  clubName: string,
  dryRun: boolean = false,
): Promise<{ sent: number; skipped: number; exited: number }> {
  const now = new Date()
  let sent = 0
  let skipped = 0
  let exited = 0

  const activeSequences: any[] = await prisma.aIRecommendationLog.findMany({
    where: {
      clubId,
      type: 'DECLINING_REACTIVATION',
      sequenceStep: { in: [0, 1] },
      status: { in: ['sent', 'delivered', 'opened', 'clicked'] },
    },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  })

  for (const log_entry of activeSequences) {
    const currentStep = log_entry.sequenceStep ?? 0
    const nextStepDef = DECLINING_STEPS[currentStep + 1]
    if (!nextStepDef) continue

    const daysSinceSend = Math.floor((now.getTime() - log_entry.createdAt.getTime()) / 86400000)
    if (daysSinceSend < nextStepDef.delayDays) continue

    // Idempotency: skip if next step already exists.
    const alreadySent = await prisma.aIRecommendationLog.count({
      where: {
        clubId,
        userId: log_entry.userId,
        type: 'DECLINING_REACTIVATION',
        sequenceStep: nextStepDef.step,
      },
    })
    if (alreadySent > 0) {
      skipped++
      continue
    }

    if (dryRun) {
      skipped++
      continue
    }

    // Email validity gate.
    const email = log_entry.user?.email
    if (!email || email.includes('placeholder') || email.includes('demo')) {
      skipped++
      continue
    }

    // Conditional exit BEFORE we hit anti-spam — these checks are the whole
    // point of this sequence. If they booked or answered, we got the signal.
    if (nextStepDef.conditional) {
      // Did they book anything since the welcome went out?
      const newBookings = await prisma.playSessionBooking.count({
        where: {
          userId: log_entry.userId,
          status: 'CONFIRMED',
          createdAt: { gte: log_entry.createdAt },
        },
      })
      if (newBookings > 0) {
        await markSequenceExit(prisma, log_entry.id, 'booked')
        exited++
        continue
      }

      // Did they click a survey option (we have a MicroSurveyResponse)?
      // The model is keyed on log_id of the email that triggered the survey,
      // which is the parent log for steps 1 and 2 — i.e. the step 0 row.
      // For step 1 we look at log_entry.id (which IS step 0). For step 2 we
      // need to walk up to the root.
      const rootLogId = currentStep === 0
        ? log_entry.id
        : log_entry.parentLogId ?? log_entry.id
      const responseExists = await prisma.microSurveyResponse.count({
        where: { logId: rootLogId },
      })
      if (responseExists > 0) {
        await markSequenceExit(prisma, log_entry.id, 'survey_responded')
        exited++
        continue
      }
    }

    // Frequency cap (sequence follow-up — relax cross-type cooldown but keep caps).
    const spamCheck = await checkAntiSpam({
      prisma,
      userId: log_entry.userId,
      clubId,
      type: 'DECLINING_REACTIVATION',
      isSequenceFollowUp: true,
    })
    if (!spamCheck.allowed) {
      log.info({ userId: log_entry.userId, step: nextStepDef.step, reason: spamCheck.reason }, '[declining-sequence] frequency cap')
      skipped++
      continue
    }

    // Build template context.
    const firstName = log_entry.user?.name?.split(' ')[0] || 'there'
    const bookingUrl = buildPlatformUrl(`/clubs/${clubId}/play`)
    const surveyBaseUrl = buildPlatformUrl('/api/surveys/respond')

    // Day 5: pull personalised session recommendations using slot-filler scoring.
    let recommendedSessions: DecliningStepContext['recommendedSessions'] = undefined
    if (nextStepDef.step === 1) {
      recommendedSessions = await pickTopSessionsForMember(prisma, clubId, log_entry.userId, bookingUrl)
    }

    const ctx: DecliningStepContext = { bookingUrl, surveyBaseUrl, logId: log_entry.id, recommendedSessions }
    const subject = nextStepDef.subject(firstName, clubName)
    const body = nextStepDef.body(firstName, clubName, ctx)

    try {
      const { sendOutreachEmail } = await import('@/lib/email')
      await sendOutreachEmail({
        to: email,
        subject,
        body,
        clubName,
        bookingUrl,
        bodyHtmlOverride: renderDecliningStepHtml(nextStepDef.step, firstName, ctx),
        suppressDefaultCta: true,
      })

      await prisma.aIRecommendationLog.create({
        data: {
          clubId,
          userId: log_entry.userId,
          type: 'DECLINING_REACTIVATION',
          channel: 'email',
          sequenceStep: nextStepDef.step,
          parentLogId: log_entry.id,
          status: 'sent',
          reasoning: {
            source: 'declining_sequence',
            step: nextStepDef.step,
            delayDays: nextStepDef.delayDays,
            recommendedSessionCount: recommendedSessions?.length ?? 0,
            confidence: 88,
            autoApproved: true,
          },
        },
      })
      sent++
    } catch (err: any) {
      log.error({ userId: log_entry.userId, step: nextStepDef.step, error: err?.message?.slice(0, 200) }, '[declining-sequence] follow-up send failed')
      skipped++
    }
  }

  return { sent, skipped, exited }
}

async function markSequenceExit(prisma: any, logId: string, exitReason: 'booked' | 'survey_responded'): Promise<void> {
  // Append exitReason to existing reasoning JSON. Read-modify-write because
  // Prisma JSON merge isn't directly expressible.
  const row = await prisma.aIRecommendationLog.findUnique({
    where: { id: logId },
    select: { reasoning: true },
  })
  const existing = (row?.reasoning as any) || {}
  await prisma.aIRecommendationLog.update({
    where: { id: logId },
    data: {
      reasoning: { ...existing, exitedAt: new Date().toISOString(), exitReason },
    },
  })
}

/**
 * Pick top 3 upcoming sessions for a declining member, ranked by the
 * slot-filler scoring algorithm (schedule fit + skill fit + format fit +
 * recency + frequency gap + responsiveness). Reuses existing scoring code
 * so a Day-5 recommendation is consistent with what the operator would see
 * in the Slot Filler page.
 *
 * Lean implementation: load member + preference + history once, load up to
 * 20 underfilled future sessions in club, score, sort, take top 3.
 */
async function pickTopSessionsForMember(
  prisma: any,
  clubId: string,
  userId: string,
  bookingFallbackUrl: string,
): Promise<DecliningStepContext['recommendedSessions']> {
  try {
    // Member core record + preferences
    const member = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, duprRatingDoubles: true },
    })
    if (!member) return []

    const preference = await prisma.userPlayPreference.findUnique({
      where: { userId_clubId: { userId, clubId } },
    })

    // Booking history aggregation for the slot-filler scorer
    const bookings = await prisma.playSessionBooking.findMany({
      where: { userId, status: 'CONFIRMED' },
      include: { session: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const lastBookingAt = bookings[0]?.createdAt
    const daysSinceLastConfirmedBooking = lastBookingAt
      ? Math.floor((Date.now() - new Date(lastBookingAt).getTime()) / 86400000)
      : null
    const oneWeekAgo = new Date(Date.now() - 7 * 86400000)
    const bookingsLastWeek = bookings.filter((b: any) => new Date(b.createdAt) >= oneWeekAgo).length
    const history = {
      daysSinceLastConfirmedBooking,
      bookingsLastWeek,
      inviteAcceptanceRate: 0.5, // unknown — neutral
      bookingsLastMonth: bookings.filter((b: any) => new Date(b.createdAt) >= new Date(Date.now() - 30 * 86400000)).length,
      totalBookings: bookings.length,
      cancelledCount: 0,
      noShowCount: 0,
    }

    // Upcoming underfilled sessions (next 14 days, capacity not yet maxed)
    const upcomingSessions = await prisma.playSession.findMany({
      where: {
        clubId,
        status: 'SCHEDULED',
        date: { gte: new Date(), lte: new Date(Date.now() + 14 * 86400000) },
      },
      orderBy: { date: 'asc' },
      take: 20,
    })

    // Filter to underfilled only — no point inviting to a full session
    const underfilled = upcomingSessions.filter(
      (s: any) => s.maxPlayers > 0 && s.registeredCount < s.maxPlayers,
    )
    if (underfilled.length === 0) return []

    // Score each session for this member using the existing slot-filler algorithm.
    // We pass a single-member array to the same function the operator dashboard uses.
    const memberData = {
      member,
      preference: preference ?? null,
      history,
    }

    const recommendations = underfilled.map((session: any) => {
      const recs = generateSlotFillerRecommendations({
        session,
        members: [memberData],
        alreadyBookedUserIds: new Set<string>(),
      })
      return {
        session,
        score: recs[0]?.score ?? 0,
      }
    })

    // Sort by score desc, take top 3, format for email
    const top = recommendations.sort((a: { score: number }, b: { score: number }) => b.score - a.score).slice(0, 3)

    return top.map(({ session }: { session: any }) => {
      const bookingUrl = (session as any).externalUrl || bookingFallbackUrl
      const dateStr = new Date(session.date).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      })
      return {
        title: session.title || 'Session',
        date: dateStr,
        startTime: session.startTime || '',
        bookingUrl,
      }
    })
  } catch (err: any) {
    log.error({ clubId, userId, error: err?.message?.slice(0, 200) }, '[declining-sequence] pickTopSessions failed')
    return []
  }
}
