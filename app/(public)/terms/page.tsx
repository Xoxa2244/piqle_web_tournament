import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service | IQSport.ai',
  description: 'Terms of Service for IQSport.ai, the AI-powered intelligence platform for racquet sports clubs, operated by Piqle Inc.',
}

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Last updated: March 26, 2026
          </p>
        </div>

        <div className="space-y-10 text-gray-700 leading-relaxed">
          {/* Acceptance of Terms */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Acceptance of Terms
            </h2>
            <p>
              By accessing or using IQSport.ai (the &quot;Service&quot;), operated by Piqle Inc.
              (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), you agree to be bound by these
              Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, you may not
              access or use the Service. We reserve the right to update these Terms at any time, and
              your continued use of the Service constitutes acceptance of any changes.
            </p>
          </section>

          {/* Description of Service */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Description of Service
            </h2>
            <p className="mb-3">
              IQSport.ai is an AI-powered intelligence platform designed for racquet sports clubs.
              The Service provides tools to help clubs optimize operations, increase revenue, and
              improve member engagement. Features include:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Dashboard Analytics</strong> — Real-time metrics and insights into club performance</li>
              <li><strong>Slot Filler</strong> — AI-driven recommendations to fill open court slots and maximize occupancy</li>
              <li><strong>Reactivation Campaigns</strong> — Automated outreach to re-engage inactive members</li>
              <li><strong>Revenue Insights</strong> — Detailed analytics on revenue trends, occupancy, and growth opportunities</li>
              <li><strong>AI Advisor</strong> — Conversational AI assistant for club management decisions</li>
              <li><strong>Third-Party Integrations</strong> — Connections with club management systems, booking platforms, and communication tools</li>
            </ul>
          </section>

          {/* Account Registration */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Account Registration
            </h2>
            <p>
              To use certain features of the Service, you must create an account. You agree to
              provide accurate, current, and complete information during registration and to keep
              your account information up to date. You are solely responsible for maintaining the
              confidentiality of your login credentials and for all activities that occur under your
              account. You must notify us immediately of any unauthorized use of your account.
            </p>
          </section>

          {/* Data Responsibility */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Data Responsibility
            </h2>
            <p className="mb-3">
              When using the Service, the club administrator acts as the <strong>Data Controller</strong> and
              IQSport.ai acts as the <strong>Data Processor</strong> with respect to club member data.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                The club administrator is responsible for having a valid legal basis (such as consent
                or legitimate interest) to share member data with the Service.
              </li>
              <li>
                Club administrators must ensure they comply with all applicable data protection laws
                and regulations when uploading or syncing member information.
              </li>
              <li>
                Before connecting any third-party integrations, club administrators must review and
                agree to our Data Processing Agreement (DPA).
              </li>
            </ul>
          </section>

          {/* Subscription & Billing */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Subscription &amp; Billing
            </h2>
            <p className="mb-3">
              IQSport.ai offers the following plans:
            </p>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 mb-3">
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Free</strong> — Limited access at no cost</li>
                <li><strong>Starter</strong> — $129/month</li>
                <li><strong>Pro</strong> — $299/month</li>
                <li><strong>Enterprise</strong> — Custom pricing</li>
              </ul>
            </div>
            <p>
              All paid plans include a 14-day free trial. Subscriptions auto-renew at the end of
              each billing cycle unless cancelled. You may cancel your subscription at any time
              through the billing portal. Cancellations take effect at the end of the current
              billing period.
            </p>
          </section>

          {/* Acceptable Use */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Acceptable Use
            </h2>
            <p className="mb-3">
              You agree not to misuse the Service. Prohibited activities include, but are not
              limited to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Attempting to gain unauthorized access to the Service, other accounts, or related systems</li>
              <li>Scraping, crawling, or using automated tools to extract data from the Service</li>
              <li>Reselling, redistributing, or sublicensing any data obtained through the Service</li>
              <li>Using the Service for any unlawful purpose or in violation of any applicable laws</li>
              <li>Interfering with or disrupting the integrity or performance of the Service</li>
            </ul>
          </section>

          {/* Intellectual Property */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Intellectual Property
            </h2>
            <p>
              All intellectual property rights in the Service, including but not limited to
              software, algorithms, AI models, designs, trademarks, and documentation, are owned
              by Piqle Inc. or its licensors. Nothing in these Terms transfers any ownership rights
              to you. You retain full ownership of any data you upload or generate through your use
              of the Service (&quot;Your Data&quot;).
            </p>
          </section>

          {/* Limitation of Liability */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Limitation of Liability
            </h2>
            <p className="mb-3">
              The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis
              without warranties of any kind, either express or implied. To the fullest extent
              permitted by law:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                We are not liable for any indirect, incidental, special, consequential, or punitive
                damages arising from your use of the Service.
              </li>
              <li>
                Our total aggregate liability for any claims arising under these Terms shall not
                exceed the total fees paid by you to us in the 12 months preceding the claim.
              </li>
            </ul>
          </section>

          {/* Termination */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Termination
            </h2>
            <p>
              We may suspend or terminate your access to the Service at any time if you violate
              these Terms or engage in conduct that we determine, in our sole discretion, to be
              harmful to the Service or other users. You may cancel your account at any time. Upon
              cancellation, your data will be retained for 90 days, after which it will be
              permanently deleted.
            </p>
          </section>

          {/* Governing Law */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Governing Law
            </h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the
              State of Delaware, USA, without regard to its conflict of law provisions. Any disputes
              arising under these Terms shall be subject to the exclusive jurisdiction of the courts
              located in Delaware.
            </p>
          </section>

          {/* Contact */}
          <section className="rounded-lg border border-gray-200 bg-gray-50 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Contact
            </h2>
            <p>
              <strong>Piqle Inc.</strong> (d/b/a IQSport.ai)<br />
              Email:{' '}
              <a href="mailto:legal@iqsport.ai" className="text-blue-600 underline">
                legal@iqsport.ai
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
