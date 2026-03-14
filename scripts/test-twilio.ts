/**
 * Quick test: send one SMS via Twilio to verify integration works.
 * Usage: npx tsx scripts/test-twilio.ts
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

async function main() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    console.error('❌ Missing Twilio env vars (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)')
    process.exit(1)
  }

  const to = '+13174520236'

  console.log(`📱 Sending test SMS to ${to}...`)

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      },
      body: new URLSearchParams({
        To: to,
        From: fromNumber,
        Body: '✅ IQSport.ai — Twilio SMS test. If you see this, SMS integration is working!',
      }),
    },
  )

  const data = await res.json()

  if (!res.ok) {
    console.error('❌ API error:', JSON.stringify(data, null, 2))
    process.exit(1)
  }

  console.log('✅ SID:', data.sid)
  console.log('✅ Status:', data.status)
  console.log('')
  console.log('🎉 SMS отправлено! Проверь телефон.')
}

main().catch(console.error)
