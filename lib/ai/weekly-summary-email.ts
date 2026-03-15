import type { WeeklySummaryContent } from './weekly-summary'
import { sendHtmlEmail } from '@/lib/sendTransactionEmail'

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

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;">
  <table style="width:100%;max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;margin-top:20px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <!-- Header -->
    <tr>
      <td style="background:linear-gradient(135deg,#8b5cf6,#7c3aed);padding:24px 32px;">
        <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">&#10024; Weekly AI Summary</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${clubName} &middot; ${content.weekLabel}</p>
      </td>
    </tr>

    <!-- Executive Summary -->
    <tr>
      <td style="padding:24px 32px 16px;">
        <p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">${content.executiveSummary}</p>
      </td>
    </tr>

    <!-- Wins -->
    ${winsHtml ? `<tr>
      <td style="padding:8px 32px 16px;">
        <h3 style="margin:0 0 8px;font-size:14px;color:#059669;">&#127942; Wins</h3>
        <ul style="margin:0;padding-left:20px;list-style:none;">${winsHtml}</ul>
      </td>
    </tr>` : ''}

    <!-- Risks -->
    ${risksHtml ? `<tr>
      <td style="padding:8px 32px 16px;">
        <h3 style="margin:0 0 8px;font-size:14px;color:#d97706;">&#9888;&#65039; Needs Attention</h3>
        <ul style="margin:0;padding-left:20px;list-style:none;">${risksHtml}</ul>
      </td>
    </tr>` : ''}

    <!-- Actions -->
    ${actionsHtml ? `<tr>
      <td style="padding:8px 32px 16px;">
        <h3 style="margin:0 0 8px;font-size:14px;color:#2563eb;">&#128295; Actions Taken</h3>
        <ul style="margin:0;padding-left:20px;list-style:none;">${actionsHtml}</ul>
      </td>
    </tr>` : ''}

    <!-- Key Numbers -->
    ${keyNumbersHtml ? `<tr>
      <td style="padding:8px 32px 24px;">
        <h3 style="margin:0 0 8px;font-size:14px;color:#7c3aed;">&#128202; Key Numbers</h3>
        ${keyNumbersHtml}
      </td>
    </tr>` : ''}

    <!-- CTA -->
    <tr>
      <td style="padding:8px 32px 32px;text-align:center;">
        <a href="${dashboardUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">View Dashboard &rarr;</a>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
          This report was generated automatically by IQSport.ai.
          To stop receiving these emails, update your automation settings in the dashboard.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ── Send weekly summary email ──

export async function sendWeeklySummaryEmail(
  to: string,
  content: WeeklySummaryContent,
  clubName: string,
  clubId: string,
): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'https://stest.piqle.io'
  const dashboardUrl = `${baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`}/clubs/${clubId}/intelligence`

  const subject = `Weekly AI Summary — ${clubName} (${content.weekLabel})`
  const html = buildWeeklySummaryHtml(content, clubName, dashboardUrl)

  await sendHtmlEmail(to, subject, html)
}
