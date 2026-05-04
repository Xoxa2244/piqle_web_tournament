/**
 * Birthday Gift Offer — ENGAGE Segment #8 "День рождения".
 *
 * Single email fired 7 days before a member's birthday with 3 gift-choice
 * buttons. The member's choice is captured via MicroSurveyResponse and
 * the club acts on it on the actual birthday. One email per member per
 * calendar year (detector enforces cooldown).
 *
 * Why 7 days ahead (vs day-of):
 *   - Gives the club time to prep the gift (week-pass code, merch sizing,
 *     guest-pass invite link)
 *   - Birthday-day inbox is noisy from all the other automated greetings;
 *     a week-ahead email stands out
 *   - Member can plan the chosen reward into their week
 *
 * Reuses everything: MicroSurveyResponse for click capture, sendOutreachEmail
 * with bodyHtmlOverride, checkAntiSpam frequency cap (full cooldown — this
 * is a first contact, not a sequence step).
 *
 * Detector + sender combined in one module since the segment is single-step
 * (no follow-up runner needed).
 */

import { campaignLogger as log } from '@/lib/logger'
import { buildPlatformUrl } from '@/lib/platform-base-url'
import { buildEmailButton, buildEmailPanel, renderTextParagraphs } from '@/lib/email-brand'
import { checkAntiSpam } from './anti-spam'

export interface BirthdayCandidate {
  userId: string
  clubId: string
  email: string
  name: string | null
  /** Member's birthday this year (YYYY-MM-DD). Their actual birthday is
   *  exactly 7 days from "now" when detector ran. */
  birthdayThisYear: string
}

interface DetectOptions {
  /** Anti-burst safety cap. Default 100 — easily covers all 3 IPC clubs
   *  (largest day saw 41 birthdays exactly 7d out). */
  limit?: number
}

/** 3 gift options the member can choose. Each becomes a survey button. */
export const BIRTHDAY_GIFT_OPTIONS = ['gift_week', 'gift_pass', 'gift_merch'] as const

interface BirthdayCtx {
  bookingUrl: string
  surveyBaseUrl: string
  logId: string
  birthdayThisYear: string
}

export async function detectBirthdayMembers(
  prisma: any,
  clubId: string,
  opts: DetectOptions = {},
): Promise<BirthdayCandidate[]> {
  const limit = opts.limit ?? 100

  // Match birthdays via MM-DD comparison (leap-year-safe — no MAKE_DATE).
  // Filter out anyone we already sent a BIRTHDAY_GIFT_OFFER to in the
  // current calendar year — one per year.
  const candidates: BirthdayCandidate[] = await prisma.$queryRawUnsafe(
    `
    WITH already_sent_this_year AS (
      SELECT DISTINCT "userId" AS user_id
      FROM ai_recommendation_logs
      WHERE "clubId" = $1
        AND type = 'BIRTHDAY_GIFT_OFFER'
        AND EXTRACT(YEAR FROM "createdAt") = EXTRACT(YEAR FROM NOW())
    )
    SELECT
      u.id AS "userId",
      $1::text AS "clubId",
      u.email,
      u.name,
      to_char(
        MAKE_DATE(
          EXTRACT(YEAR FROM NOW())::int,
          EXTRACT(MONTH FROM u.date_of_birth)::int,
          -- Clamp Feb 29 → Feb 28 in non-leap years to avoid MAKE_DATE
          -- raising "date out of range" on Feb-29 birthdays.
          LEAST(
            EXTRACT(DAY FROM u.date_of_birth)::int,
            CASE EXTRACT(MONTH FROM u.date_of_birth)::int
              WHEN 2 THEN
                CASE WHEN (EXTRACT(YEAR FROM NOW())::int % 4 = 0
                       AND (EXTRACT(YEAR FROM NOW())::int % 100 <> 0
                         OR EXTRACT(YEAR FROM NOW())::int % 400 = 0))
                  THEN 29 ELSE 28 END
              WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30
              ELSE 31
            END
          )
        ),
        'YYYY-MM-DD'
      ) AS "birthdayThisYear"
    FROM users u
    JOIN club_followers cf ON cf.user_id = u.id AND cf.club_id = $1
    WHERE u.email IS NOT NULL
      AND u.email <> ''
      AND u.email NOT LIKE '%placeholder%'
      AND u.email NOT LIKE '%demo%'
      AND u.membership_status = 'Active'
      AND u.date_of_birth IS NOT NULL
      -- Birthday is exactly 7 days from today (MM-DD match, leap-year safe)
      AND to_char(u.date_of_birth, 'MM-DD') = to_char(NOW() + INTERVAL '7 days', 'MM-DD')
      -- Not already sent this year
      AND u.id NOT IN (SELECT user_id FROM already_sent_this_year)
    ORDER BY u.id ASC
    LIMIT $2::int
    `,
    clubId,
    limit,
  )

  log.info({ clubId, candidates: candidates.length }, '[birthday-detector] found')
  return candidates
}

function renderBirthdayHtml(firstName: string, ctx: BirthdayCtx): string {
  const intro = `Hey ${firstName}! Your birthday is coming up next week and we wanted to celebrate it with you. Pick a gift on us — no strings, our treat.`

  const giftButtons = [
    { label: '🎾 A week of free play', option: 'gift_week' },
    { label: '👥 Guest pass for a friend', option: 'gift_pass' },
    { label: '👕 IQSport merch (cap or shirt)', option: 'gift_merch' },
  ]
    .map((g) =>
      buildEmailButton(g.label, `${ctx.surveyBaseUrl}?logId=${ctx.logId}&option=${g.option}`, 'secondary'),
    )
    .join('')

  return `
    ${renderTextParagraphs(intro)}
    ${buildEmailPanel(`
      <div style="text-align:center;padding:6px 0;">
        <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#3B2A6B;border:1px solid #6D4FBF;font-size:11px;font-weight:700;letter-spacing:0.18em;color:#DDD6FE;text-transform:uppercase;margin-bottom:14px;">
          Pick your gift
        </div>
        <div style="font-size:18px;font-weight:600;color:#FFFFFF;line-height:1.4;margin-bottom:4px;">
          One tap — your choice will be ready on your birthday.
        </div>
      </div>
    `)}
    ${giftButtons}
    <p style="margin:24px 0 0;font-size:13px;color:#94A3B8;text-align:center;">
      Happy almost-birthday from everyone here. 🎂
    </p>
  `
}

export async function sendBirthdayGiftOffer(
  prisma: any,
  candidate: BirthdayCandidate,
  clubName: string,
  dryRun: boolean = false,
): Promise<{ status: 'sent' | 'skipped'; logId?: string; reason?: string }> {
  const { userId, clubId, email, name, birthdayThisYear } = candidate

  if (!email) return { status: 'skipped', reason: 'no_email' }

  // Birthday email is a first contact — full cross-type cooldown enforced
  // so we don't pile onto a member who got a slot-filler invite yesterday.
  const spamCheck = await checkAntiSpam({
    prisma, userId, clubId, type: 'BIRTHDAY_GIFT_OFFER', isSequenceFollowUp: false,
  })
  if (!spamCheck.allowed) return { status: 'skipped', reason: spamCheck.reason }

  if (dryRun) return { status: 'skipped', reason: 'dry_run' }

  const firstName = name?.split(' ')[0] || 'friend'
  const bookingUrl = buildPlatformUrl(`/clubs/${clubId}/play`)
  const surveyBaseUrl = buildPlatformUrl('/api/surveys/respond')

  const created = await prisma.aIRecommendationLog.create({
    data: {
      clubId,
      userId,
      type: 'BIRTHDAY_GIFT_OFFER',
      channel: 'email',
      sequenceStep: 0,
      status: 'sent',
      reasoning: {
        source: 'birthday_detector',
        birthdayThisYear,
        confidence: 95,
        autoApproved: true,
      },
    },
    select: { id: true },
  })

  const logId = created.id
  const ctx: BirthdayCtx = { bookingUrl, surveyBaseUrl, logId, birthdayThisYear }
  const subject = `🎂 ${firstName}, your birthday is next week — pick a gift`
  // Plain-text fallback for non-HTML clients
  const body = `Hey ${firstName}! Your birthday is coming up next week and we wanted to celebrate it with you. Pick a gift on us — no strings, our treat.

→ A week of free play:        ${surveyBaseUrl}?logId=${logId}&option=gift_week
→ Guest pass for a friend:     ${surveyBaseUrl}?logId=${logId}&option=gift_pass
→ IQSport merch (cap or shirt): ${surveyBaseUrl}?logId=${logId}&option=gift_merch

Happy almost-birthday from everyone here.`

  try {
    const { sendOutreachEmail } = await import('@/lib/email')
    await sendOutreachEmail({
      to: email,
      subject, body, clubName, bookingUrl,
      bodyHtmlOverride: renderBirthdayHtml(firstName, ctx),
      suppressDefaultCta: true,
    })
    return { status: 'sent', logId }
  } catch (err: any) {
    log.error({ userId, clubId, error: err?.message?.slice(0, 200) }, '[birthday-gift] send failed')
    await prisma.aIRecommendationLog.update({
      where: { id: logId },
      data: { status: 'failed' },
    }).catch(() => {})
    return { status: 'skipped', reason: 'send_failed' }
  }
}
