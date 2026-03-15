/**
 * Quick test: send one email via Mandrill to verify integration works.
 * Usage: npx tsx scripts/test-mandrill.ts
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const MANDRILL_API = 'https://mandrillapp.com/api/1.0/messages/send.json'

async function main() {
  const apiKey = process.env.MAILCHIMP_TRANSACTIONAL_API_KEY
  if (!apiKey) {
    console.error('❌ MAILCHIMP_TRANSACTIONAL_API_KEY not set in .env.local')
    process.exit(1)
  }

  console.log('📧 Sending test email via Mandrill...')

  const res = await fetch(MANDRILL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: apiKey,
      message: {
        html: '<h2>IQSport.ai — Mandrill Test ✅</h2><p>If you see this, email integration is working!</p><p><a href="https://stest.piqle.io">Open IQSport Dashboard</a></p>',
        text: 'IQSport.ai — Mandrill Test. If you see this, email integration is working!',
        subject: '✅ IQSport.ai — Mandrill Integration Test',
        from_email: 'noreply@piqle.io',
        from_name: 'IQSport.ai',
        to: [{ email: 'sol@piqle.io', type: 'to' }],
        track_opens: true,
        track_clicks: true,
        tags: ['test'],
      },
    }),
  })

  const data = await res.json()

  if (!res.ok) {
    console.error('❌ API error:', JSON.stringify(data, null, 2))
    process.exit(1)
  }

  console.log('✅ Result:', JSON.stringify(data, null, 2))
  console.log('')
  console.log(data[0]?.status === 'sent' || data[0]?.status === 'queued'
    ? '🎉 Письмо отправлено! Проверь sol@piqle.io'
    : '⚠️  Статус: ' + data[0]?.status + ' — ' + (data[0]?.reject_reason || ''))
}

main().catch(console.error)
