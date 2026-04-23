import { getPlatformBaseUrl, getPlatformOriginFromUrl } from '@/lib/platform-base-url'

export function getEmailBaseUrl(preferredUrl?: string | null) {
  return getPlatformOriginFromUrl(preferredUrl) || getPlatformBaseUrl()
}

export function buildEmailButton(label: string, href: string, tone: 'primary' | 'secondary' | 'danger' = 'primary') {
  const background = tone === 'danger'
    ? '#EF4444'
    : tone === 'secondary'
      ? '#0891B2'
      : '#8B5CF6'

  return `
    <div style="text-align:center;margin:24px 0 0;">
      <a href="${href}" style="display:inline-block;background:${background};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:12px;font-size:15px;font-weight:700;">
        ${label}
      </a>
    </div>
  `
}

export function buildEmailPanel(innerHtml: string) {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;background:#131C31;border:1px solid rgba(148,163,184,0.16);border-radius:16px;overflow:hidden;">
      <tr>
        <td style="padding:18px 20px;">
          ${innerHtml}
        </td>
      </tr>
    </table>
  `
}

export function renderTextParagraphs(text: string, color = '#CBD5E1') {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.75;color:${color};">${line}</p>`)
    .join('')
}

export function buildIqSportEmail(opts: {
  title: string
  heading: string
  bodyHtml: string
  baseUrl?: string | null
  eyebrow?: string
  subheading?: string
  footerHtml?: string
}) {
  const baseUrl = getEmailBaseUrl(opts.baseUrl)
  const logoIconUrl = `${baseUrl}/iqsport-logo.svg`
  const eyebrow = opts.eyebrow || 'IQSPORT'
  const footerHtml = opts.footerHtml || `
    <p style="margin:0;font-size:12px;line-height:1.6;color:#94A3B8;">
      Sent via <a href="${baseUrl}" style="color:#A78BFA;text-decoration:none;">IQSport.ai</a>
    </p>
  `

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.title}</title>
</head>
<body style="margin:0;padding:0;background:#0B1020;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#F8FAFC;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0B1020;">
    <tr>
      <td align="center" style="padding:32px 16px 40px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;">
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto;">
                <tr>
                  <td style="vertical-align:middle;padding-right:12px;">
                    <img src="${logoIconUrl}" alt="IQSport" width="58" style="display:block;width:58px;height:58px;border:0;outline:none;" />
                  </td>
                  <td style="vertical-align:middle;text-align:left;">
                    <div style="font-size:20px;line-height:1.05;font-weight:800;letter-spacing:-0.02em;color:#F8FAFC;">
                      IQ<span style="color:#22D3EE;">Sport</span>
                    </div>
                    <div style="margin-top:4px;font-size:11px;line-height:1;letter-spacing:0.18em;font-weight:800;color:#22D3EE;text-transform:uppercase;">
                      Intelligence
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:linear-gradient(180deg,#121A2B 0%,#0F172A 100%);border:1px solid rgba(148,163,184,0.14);border-radius:24px;overflow:hidden;box-shadow:0 22px 55px rgba(2,6,23,0.45);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:28px 28px 12px;text-align:center;">
                    <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:rgba(6,182,212,0.10);border:1px solid rgba(6,182,212,0.20);font-size:11px;font-weight:700;letter-spacing:0.18em;color:#A5F3FC;text-transform:uppercase;">
                      ${eyebrow}
                    </div>
                    <h1 style="margin:18px 0 0;font-size:30px;line-height:1.15;font-weight:800;color:#F8FAFC;">
                      ${opts.heading}
                    </h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 28px 28px;">
                    ${opts.bodyHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top:18px;text-align:center;">
              ${footerHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
