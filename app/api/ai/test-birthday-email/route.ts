/**
 * Test endpoint: send the birthday gift offer email to sol@piqle.io
 * for visual review of the segment #8 single-step email.
 *
 * Auth: Bearer CRON_SECRET. Recipient HARDCODED. No DB writes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendOutreachEmail } from '@/lib/email'
import { buildPlatformUrl } from '@/lib/platform-base-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HARDCODED_RECIPIENT = 'sol@piqle.io'

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as { clubName?: string }
  const clubName = body.clubName?.trim() || 'IPC Test'
  const firstName = 'Sol'

  const fakeLogId = `test-bday-${Date.now()}`
  const bookingUrl = buildPlatformUrl('/clubs/test-club/play')
  const surveyBaseUrl = buildPlatformUrl('/api/surveys/respond')

  // Inline-import the renderer + plain-text body builder from the production
  // module so we ship the same content the cron sends.
  const { buildEmailButton, buildEmailPanel, renderTextParagraphs } = await import('@/lib/email-brand')

  const intro = `Hey ${firstName}! Your birthday is coming up next week and we wanted to celebrate it with you. Pick a gift on us — no strings, our treat.`
  const giftButtons = [
    { label: '🎾 A week of free play', option: 'gift_week' },
    { label: '👥 Guest pass for a friend', option: 'gift_pass' },
    { label: '👕 IQSport merch (cap or shirt)', option: 'gift_merch' },
  ]
    .map((g) => buildEmailButton(g.label, `${surveyBaseUrl}?logId=${fakeLogId}&option=${g.option}`, 'secondary'))
    .join('')

  const bodyHtml = `
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

  const subject = `[TEST] 🎂 ${firstName}, your birthday is next week — pick a gift`
  const plain = `Hey ${firstName}! Your birthday is coming up next week. Pick a gift on us:

→ A week of free play:        ${surveyBaseUrl}?logId=${fakeLogId}&option=gift_week
→ Guest pass for a friend:     ${surveyBaseUrl}?logId=${fakeLogId}&option=gift_pass
→ IQSport merch (cap or shirt): ${surveyBaseUrl}?logId=${fakeLogId}&option=gift_merch`

  try {
    const info = await sendOutreachEmail({
      to: HARDCODED_RECIPIENT,
      subject,
      body: plain,
      clubName,
      bookingUrl,
      bodyHtmlOverride: bodyHtml,
      suppressDefaultCta: true,
    })
    return NextResponse.json({
      ok: true,
      sentTo: HARDCODED_RECIPIENT,
      fakeLogId,
      giftOptions: ['gift_week', 'gift_pass', 'gift_merch'],
      messageId: info?.messageId,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message?.slice(0, 200) }, { status: 500 })
  }
}
