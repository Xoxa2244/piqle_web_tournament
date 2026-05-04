/**
 * Micro-survey response endpoint (ENGAGE Phase 2).
 *
 * Triggered by GET when a recipient clicks one of the option links in a
 * survey-style email. Currently the only producer is the Newcomer Day-12
 * stalled survey (lib/ai/onboarding-sequence.ts → DAY_12_TEMPLATES.survey)
 * but the endpoint is generic and can serve any future survey email.
 *
 * URL shape:
 *   /api/surveys/respond?logId=<AIRecommendationLog.id>&option=<choice>
 *
 * Behavior:
 *   1. Validate query params (logId required + non-empty, option in allowlist).
 *   2. Look up the source AIRecommendationLog to get clubId + userId + which
 *      survey type this is (derived from log.type + reasoning.day12Variant).
 *   3. Upsert MicroSurveyResponse on log_id (UNIQUE) — second click on the
 *      same email overwrites the prior choice.
 *   4. Return a small HTML thank-you page so the link doesn't dead-end in
 *      a 404 from the recipient's perspective.
 *
 * Auth: none. The logId is a UUID embedded in an email sent only to the
 * recipient — unguessable in practice. Replay/spoofing is low-impact (only
 * affects this one log's recorded answer; doesn't grant any access).
 *
 * Failure modes:
 *   - Bad query params → 400 + plain HTML error.
 *   - logId not found → 404 + plain HTML "link expired".
 *   - DB error → 500 + plain HTML "try again later" (logged + Sentry).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Allowed option values across all current survey types. The Day-12
 *  newcomer survey uses the first 5; other surveys may add to this list
 *  later (e.g. "travel", "injury" for the at-risk segment). */
const ALLOWED_OPTIONS = new Set([
  'schedule',
  'level',
  'partners',
  'price',
  'other',
  // DECLINING_REACTIVATION (segment #4):
  'injury',     // at-risk: травма
  'busy',       // at-risk: занят
  'pause',      // at-risk: просто пауза
  // SLEEPING_REACTIVATION (segment #5):
  'planschanged', // sleeping: my plans changed
  'time',         // sleeping: cannot find a good time
  // Reserved for future surveys:
  'liked',      // trial: понравилось
  'thinking',   // trial: нужно подумать
  'not_for_me', // trial: не для меня
  'questions',  // trial: есть вопросы
])

/** Map AIRecommendationLog.type + reasoning to a stable survey type string.
 *  Persisted on MicroSurveyResponse.surveyType so the dashboard can group
 *  responses by what kind of survey they came from. */
function deriveSurveyType(logType: string, reasoning: any): string {
  if (logType === 'NEW_MEMBER_WELCOME' && reasoning?.day12Variant === 'survey') {
    return 'onboarding_day12'
  }
  if (logType === 'DECLINING_REACTIVATION') {
    // Segment #4 puts the survey on Day 1 (step 0). Day 5 + 12 don't have
    // surveys, so any click here is by definition the Day 1 form.
    return 'declining_reactivation'
  }
  if (logType === 'SLEEPING_REACTIVATION') {
    // Segment #5 puts the survey on Day 14 (step 1). Day 1 has no survey.
    return 'sleeping_reactivation'
  }
  // Fallback — log it as the source type so we don't lose the data even if
  // a future survey email forgets to set day12Variant or similar.
  return logType.toLowerCase()
}

function htmlPage(opts: { title: string; message: string; status?: number }): NextResponse {
  const { title, message, status = 200 } = opts
  const body = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
           background: #f8fafc; color: #1e293b; margin: 0;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; padding: 24px; }
    .card { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);
            padding: 40px 32px; max-width: 440px; text-align: center; }
    h1 { margin: 0 0 12px; font-size: 22px; font-weight: 600; }
    p { margin: 0; line-height: 1.6; color: #475569; }
    .icon { font-size: 48px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${status === 200 ? '🎾' : '⚠️'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`
  return new NextResponse(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const logId = searchParams.get('logId')?.trim()
  const option = searchParams.get('option')?.trim().toLowerCase()

  if (!logId || !option) {
    return htmlPage({
      title: 'Missing details',
      message: 'This survey link is incomplete. Please use the buttons in the email exactly as sent.',
      status: 400,
    })
  }

  if (!ALLOWED_OPTIONS.has(option)) {
    return htmlPage({
      title: 'Unknown option',
      message: 'We did not recognise that response. The email may be from an older campaign.',
      status: 400,
    })
  }

  let log: { id: string; userId: string; clubId: string; type: string; reasoning: any } | null = null
  try {
    log = await prisma.aIRecommendationLog.findUnique({
      where: { id: logId },
      select: { id: true, userId: true, clubId: true, type: true, reasoning: true },
    })
  } catch (err: any) {
    logger.error({ logId, error: err?.message?.slice(0, 200) }, '[survey-respond] DB lookup failed')
    return htmlPage({
      title: 'Something went wrong',
      message: 'We could not record your response right now. Please try again in a few minutes.',
      status: 500,
    })
  }

  if (!log) {
    // Could happen if the log was deleted (GDPR) or the link is from a
    // very old email after a data migration. Surface a friendly message.
    return htmlPage({
      title: 'Link expired',
      message: 'This survey link is no longer valid. If you still have something to share, just reply to the original email — we read everything.',
      status: 404,
    })
  }

  const surveyType = deriveSurveyType(log.type, log.reasoning)

  try {
    // Upsert: a second click on the same email replaces the prior choice
    // (recipient changed mind). We DON'T null-out free_text on update —
    // a future "tell us more" follow-up to "other" can populate it
    // independently of which option was clicked.
    await prisma.microSurveyResponse.upsert({
      where: { logId },
      create: {
        logId,
        userId: log.userId,
        clubId: log.clubId,
        surveyType,
        option,
      },
      update: {
        option,
        respondedAt: new Date(),
      },
    })
  } catch (err: any) {
    logger.error({ logId, option, surveyType, error: err?.message?.slice(0, 200) }, '[survey-respond] Upsert failed')
    return htmlPage({
      title: 'Something went wrong',
      message: 'We could not record your response right now. Please try again in a few minutes.',
      status: 500,
    })
  }

  logger.info({ logId, surveyType, option, clubId: log.clubId }, '[survey-respond] Recorded')

  return htmlPage({
    title: 'Got it — thanks!',
    message: 'We passed that on to your club. They will use it to make things easier for new members like you.',
  })
}
