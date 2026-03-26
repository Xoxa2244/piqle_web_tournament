import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy | IQSport.ai',
  description: 'Privacy policy for IQSport.ai, operated by Piqle Inc. Learn how we collect, use, and protect your data.',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Last updated: March 26, 2026
          </p>
        </div>

        <div className="space-y-10 text-gray-700 leading-relaxed">
          {/* Information We Collect */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Information We Collect
            </h2>
            <p className="mb-3">
              We collect the following categories of information to provide and improve our services:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Account Information</strong> — Your name and email address, provided when you create an IQSport.ai account
              </li>
              <li>
                <strong>Club Member Data</strong> — Member information imported via integrations with your club&apos;s management platform, including name, email, phone number, player ratings, and booking history
              </li>
              <li>
                <strong>Usage Data</strong> — Analytics data about how you interact with our platform, including page views, feature usage, and session duration
              </li>
            </ul>
          </section>

          {/* How We Use Your Information */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              How We Use Your Information
            </h2>
            <p className="mb-3">We use collected information for the following purposes:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>AI Analytics</strong> — Generating insights about club performance, member engagement, and revenue trends</li>
              <li><strong>Occupancy Optimization</strong> — Identifying underutilized court time and recommending strategies to fill open slots</li>
              <li><strong>Member Reactivation</strong> — Detecting inactive members and powering personalized outreach campaigns</li>
              <li><strong>Session Recommendations</strong> — Suggesting play sessions based on member skill levels and preferences</li>
              <li><strong>Email &amp; SMS Notifications</strong> — Sending club-related communications such as booking reminders, event invitations, and reactivation messages</li>
            </ul>
          </section>

          {/* Third-Party Integrations */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Third-Party Integrations
            </h2>
            <p className="mb-3">
              IQSport.ai integrates with club management platforms to import member and booking data.
              Currently supported integrations include:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>CourtReserve</strong></li>
              <li><strong>OpenCourt</strong></li>
            </ul>
            <p className="mt-3">
              All integrations are configured by club administrators with their explicit consent and a
              signed Data Processing Agreement (DPA). Data synced through integrations includes member
              profiles, court bookings, and attendance records.
            </p>
          </section>

          {/* Data Storage & Security */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Data Storage &amp; Security
            </h2>
            <p className="mb-3">
              We take the security of your data seriously and employ industry-standard measures to protect it:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Database</strong> — Supabase (PostgreSQL), hosted on AWS infrastructure</li>
              <li><strong>Encryption at Rest</strong> — All stored data is encrypted. API credentials are encrypted using AES-256</li>
              <li><strong>Encryption in Transit</strong> — All data transmitted between your browser and our servers is protected with TLS 1.3</li>
            </ul>
          </section>

          {/* Data Retention */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Data Retention
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Active Subscription</strong> — Your data is retained for as long as your club maintains an active subscription</li>
              <li><strong>After Cancellation</strong> — Data is retained for 90 days following subscription cancellation, then permanently deleted</li>
              <li><strong>On Request</strong> — You may request deletion of your data at any time; we will process your request within 30 days</li>
            </ul>
          </section>

          {/* Your Rights (CCPA/GDPR) */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Your Rights (CCPA / GDPR)
            </h2>
            <p className="mb-3">
              You have the right to access, delete, and export your personal data. To exercise any of
              these rights, contact us at{' '}
              <a href="mailto:privacy@iqsport.ai" className="text-blue-600 underline">
                privacy@iqsport.ai
              </a>.
            </p>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
              <h3 className="font-semibold text-gray-900 mb-2">California Residents (CCPA)</h3>
              <p>
                If you are a California resident, you have the right to know what personal information
                we collect, request deletion of your data, and opt out of the sale of your personal
                information. <strong>We do not sell your personal data.</strong>
              </p>
            </div>
          </section>

          {/* Sub-Processors */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Sub-Processors
            </h2>
            <p className="mb-3">
              We use the following third-party services to operate our platform:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Supabase</strong> — Database hosting</li>
              <li><strong>Vercel</strong> — Compute and application hosting</li>
              <li><strong>OpenAI</strong> — AI analytics (anonymized data only)</li>
              <li><strong>Twilio</strong> — SMS messaging</li>
              <li><strong>Mailchimp</strong> — Email communications</li>
            </ul>
          </section>

          {/* Children's Privacy */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Children&apos;s Privacy
            </h2>
            <p>
              IQSport.ai is not directed at children under the age of 13. We do not knowingly collect
              personal information from children under 13. If you believe we have inadvertently collected
              such information, please contact us at{' '}
              <a href="mailto:privacy@iqsport.ai" className="text-blue-600 underline">
                privacy@iqsport.ai
              </a>{' '}
              and we will promptly delete it.
            </p>
          </section>

          {/* Changes to This Policy */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. If we make material changes, we will
              notify you via email associated with your account. Your continued use of the platform after
              such changes constitutes your acceptance of the updated policy.
            </p>
          </section>

          {/* Contact */}
          <section className="rounded-lg border border-gray-200 bg-gray-50 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Contact Information
            </h2>
            <p>
              <strong>Piqle Inc.</strong> (d/b/a IQSport.ai)<br />
              Email:{' '}
              <a href="mailto:privacy@iqsport.ai" className="text-blue-600 underline">
                privacy@iqsport.ai
              </a><br />
              Website:{' '}
              <a href="https://iqsport.ai" className="text-blue-600 underline">
                iqsport.ai
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
