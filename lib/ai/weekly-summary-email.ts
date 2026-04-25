import type { WeeklySummaryContent } from './weekly-summary'
import { sendHtmlEmail } from '@/lib/sendTransactionEmail'
import { buildPlatformUrl } from '@/lib/platform-base-url'
import { buildEmailButton, buildEmailPanel, buildIqSportEmail } from '@/lib/email-brand'

// ── HTML Email Template for Weekly AI Summary ──

function buildWeeklySummaryHtml(
  content: WeeklySummaryContent,
  clubName: string,
  dashboardUrl: string,
): string {
  const winsHtml = content.wins.length > 0
    ? content.wins.map(w => `<li style="margin-bottom:6px;color:#059669;font-size:14px;">&#9989; ${w}</li>`).join('')
    : ''

  const risksHtml = content.risks.length > 0
    ? content.risks.map(r => `<li style="margin-bottom:6px;color:#d97706;font-size:14px;">&#9888;&#65039; ${r}</li>`).join('')
    : ''

  const actionsHtml = content.actionsTaken.length > 0
    ? content.actionsTaken.map(a => `<li style="margin-bottom:6px;color:#2563eb;font-size:14px;">&#128295; ${a}</li>`).join('')
    : ''

  const keyNumbersHtml = content.keyNumbers.length > 0
    ? `<table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <tr>
          ${content.keyNumbers.slice(0, 3).map(kn => {
            const arrow = kn.direction === 'up' ? '&#9650;' : kn.direction === 'down' ? '&#9660;' : '&#9644;'
            const isBadUp = kn.label.toLowerCase().includes('risk') || kn.label.toLowerCase().includes('bounce')
            const trendColor = isBadUp
              ? (kn.direction === 'up' ? '#dc2626' : kn.direction === 'down' ? '#059669' : '#6b7280')
              : (kn.direction === 'up' ? '#059669' : kn.direction === 'down' ? '#dc2626' : '#6b7280')
            return `<td style="padding:12px;border:1px solid #e5e7eb;border-radius:8px;text-align:center;width:33%;">
              <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">${kn.label}</div>
              <div style="font-size:24px;font-weight:bold;margin:4px 0;">${kn.thisWeek}</div>
              <div style="font-size:12px;color:${trendColor};font-weight:600;">
                ${arrow} ${kn.changePercent > 0 ? '+' : ''}${typeof kn.changePercent === 'number' ? kn.changePercent.toFixed(1) : kn.changePercent}%
                <span style="color:#9ca3af;font-weight:normal;"> vs ${kn.lastWeek}</span>
              </div>
            </td>`
          }).join('')}
        </tr>
        ${content.keyNumbers.length > 3 ? `<tr>
          ${content.keyNumbers.slice(3, 6).map(kn => {
            const arrow = kn.direction === 'up' ? '&#9650;' : kn.direction === 'down' ? '&#9660;' : '&#9644;'
            const isBadUp = kn.label.toLowerCase().includes('risk') || kn.label.toLowerCase().includes('bounce')
            const trendColor = isBadUp
              ? (kn.direction === 'up' ? '#dc2626' : kn.direction === 'down' ? '#059669' : '#6b7280')
              : (kn.direction === 'up' ? '#059669' : kn.direction === 'down' ? '#dc2626' : '#6b7280')
            return `<td style="padding:12px;border:1px solid #e5e7eb;border-radius:8px;text-align:center;width:33%;">
              <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">${kn.label}</div>
              <div style="font-size:24px;font-weight:bold;margin:4px 0;">${kn.thisWeek}</div>
              <div style="font-size:12px;color:${trendColor};font-weight:600;">
                ${arrow} ${kn.changePercent > 0 ? '+' : ''}${typeof kn.changePercent === 'number' ? kn.changePercent.toFixed(1) : kn.changePercent}%
                <span style="color:#9ca3af;font-weight:normal;"> vs ${kn.lastWeek}</span>
              </div>
            </td>`
          }).join('')}
        </tr>` : ''}
      </table>`
    : ''

  return buildIqSportEmail({
    title: `Weekly AI Summary — ${clubName}`,
    heading: 'Weekly AI Summary',
    eyebrow: 'Club Intelligence',
    subheading: `${clubName} · ${content.weekLabel}`,
    baseUrl: dashboardUrl,
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#CBD5E1;">${content.executiveSummary}</p>
      ${winsHtml ? buildEmailPanel(`<h3 style="margin:0 0 10px;font-size:14px;color:#34D399;">Wins</h3><ul style="margin:0;padding-left:18px;list-style:none;">${winsHtml}</ul>`) : ''}
      ${risksHtml ? buildEmailPanel(`<h3 style="margin:0 0 10px;font-size:14px;color:#F59E0B;">Needs Attention</h3><ul style="margin:0;padding-left:18px;list-style:none;">${risksHtml}</ul>`) : ''}
      ${actionsHtml ? buildEmailPanel(`<h3 style="margin:0 0 10px;font-size:14px;color:#60A5FA;">Actions Taken</h3><ul style="margin:0;padding-left:18px;list-style:none;">${actionsHtml}</ul>`) : ''}
      ${keyNumbersHtml ? buildEmailPanel(`<h3 style="margin:0 0 10px;font-size:14px;color:#A78BFA;">Key Numbers</h3>${keyNumbersHtml}`) : ''}
      ${buildEmailButton('View Dashboard →', dashboardUrl)}
    `,
    footerHtml: `<p style="margin:0;font-size:11px;line-height:1.7;color:#94A3B8;">This report was generated automatically by IQSport.ai. To stop receiving these emails, update your automation settings in the dashboard.</p>`,
  })
}

// ── Send weekly summary email ──

export async function sendWeeklySummaryEmail(
  to: string,
  content: WeeklySummaryContent,
  clubName: string,
  clubId: string,
): Promise<void> {
  const dashboardUrl = buildPlatformUrl(`/clubs/${clubId}/intelligence`)

  const subject = `Weekly AI Summary — ${clubName} (${content.weekLabel})`
  const html = buildWeeklySummaryHtml(content, clubName, dashboardUrl)

  await sendHtmlEmail(to, subject, html)
}
