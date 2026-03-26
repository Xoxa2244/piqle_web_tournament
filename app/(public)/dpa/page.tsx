import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Data Processing Agreement | IQSport.ai',
  description: 'Data Processing Agreement for IQSport.ai, operated by Piqle Inc. Covers data handling, security, sub-processors, and data subject rights.',
}

export default function DpaPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Data Processing Agreement
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Effective date: March 26, 2026
          </p>
        </div>

        <div className="space-y-10 text-gray-700 leading-relaxed">
          {/* Parties */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              1. Parties
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Data Controller:</strong> The Club (the entity using the IQSport.ai platform)
              </li>
              <li>
                <strong>Data Processor:</strong> Piqle Inc., operator of IQSport.ai
              </li>
            </ul>
          </section>

          {/* Scope of Processing */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              2. Scope of Processing
            </h2>
            <p className="mb-3">
              The Processor processes personal data of club members imported via third-party
              integrations, including CourtReserve, OpenCourt, and CSV import. The categories
              of personal data processed include:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Name, email address, and phone number</li>
              <li>Membership type</li>
              <li>Skill ratings</li>
              <li>Court booking history</li>
              <li>Attendance records</li>
              <li>Payment status</li>
            </ul>
          </section>

          {/* Purpose of Processing */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              3. Purpose of Processing
            </h2>
            <p className="mb-3">
              Personal data is processed solely to provide AI-powered analytics and club management
              features, including:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Occupancy analysis</li>
              <li>Session recommendations</li>
              <li>Member health scoring</li>
              <li>Reactivation campaigns</li>
              <li>Revenue optimization</li>
            </ul>
            <p className="mt-3">
              Data is <strong>not</strong> used for advertising, profiling for third parties, or sold
              to any party.
            </p>
          </section>

          {/* Duration */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              4. Duration
            </h2>
            <p>
              Processing continues for the duration of the Controller&apos;s active subscription to
              IQSport.ai. Upon termination of the subscription, all personal data will be deleted
              within 90 days, unless retention is required by applicable law.
            </p>
          </section>

          {/* Security Measures */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              5. Security Measures
            </h2>
            <p className="mb-3">
              The Processor implements the following technical and organizational measures to protect
              personal data:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Encryption at rest:</strong> AES-256 encryption for all stored credentials</li>
              <li><strong>Encryption in transit:</strong> TLS 1.3 for all data transmitted between systems</li>
              <li><strong>Access controls:</strong> Role-based access controls (RBAC)</li>
              <li><strong>Audits:</strong> Regular security audits</li>
              <li><strong>Infrastructure:</strong> Database hosted on SOC 2-compliant Supabase (AWS)</li>
            </ul>
          </section>

          {/* Sub-Processors */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              6. Sub-Processors
            </h2>
            <p className="mb-3">
              The Processor engages the following sub-processors to deliver the service:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border border-gray-200 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Sub-Processor</th>
                    <th className="px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Purpose</th>
                    <th className="px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="px-4 py-3">Supabase Inc.</td>
                    <td className="px-4 py-3">Database hosting</td>
                    <td className="px-4 py-3">AWS us-east-1</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Vercel Inc.</td>
                    <td className="px-4 py-3">Compute &amp; edge delivery</td>
                    <td className="px-4 py-3">United States</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">OpenAI Inc.</td>
                    <td className="px-4 py-3">AI inference (anonymized/aggregated data only)</td>
                    <td className="px-4 py-3">United States</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Twilio Inc.</td>
                    <td className="px-4 py-3">SMS delivery</td>
                    <td className="px-4 py-3">United States</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Intuit Mailchimp</td>
                    <td className="px-4 py-3">Email delivery</td>
                    <td className="px-4 py-3">United States</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              The Controller will be given 30 days&apos; prior written notice before any new
              sub-processor is engaged.
            </p>
          </section>

          {/* Data Subject Rights */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              7. Data Subject Rights
            </h2>
            <p className="mb-3">
              The Processor assists the Controller in fulfilling data subject requests, including:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access requests</li>
              <li>Deletion requests</li>
              <li>Data portability</li>
              <li>Rectification</li>
            </ul>
            <p className="mt-3">
              The Processor will respond to Controller requests related to data subject rights within
              30 days.
            </p>
          </section>

          {/* Data Breach Notification */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              8. Data Breach Notification
            </h2>
            <p className="mb-3">
              The Processor will notify the Controller within <strong>72 hours</strong> of becoming
              aware of a personal data breach. The notification will include:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Nature of the breach</li>
              <li>Categories of personal data affected</li>
              <li>Estimated number of records affected</li>
              <li>Measures taken or proposed to address the breach</li>
            </ul>
          </section>

          {/* Data Deletion */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              9. Data Deletion
            </h2>
            <p className="mb-3">
              Upon disconnection of a third-party integration:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>API credentials</strong> are deleted immediately</li>
              <li><strong>Synced member data</strong> is retained for 90 days, then permanently deleted</li>
            </ul>
            <p className="mt-3">
              The Controller may request immediate deletion of all synced data at any time via the
              platform settings or by emailing{' '}
              <a href="mailto:dpa@iqsport.ai" className="text-blue-600 underline">
                dpa@iqsport.ai
              </a>.
            </p>
          </section>

          {/* International Transfers */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              10. International Transfers
            </h2>
            <p>
              Personal data is processed in the United States. For data subjects located in the
              European Union, standard contractual clauses (SCCs) apply to ensure an adequate level
              of data protection.
            </p>
          </section>

          {/* Audit Rights */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              11. Audit Rights
            </h2>
            <p>
              The Controller may request documentation of the Processor&apos;s compliance with this
              agreement. The Processor will provide written responses to such requests within 30 days.
            </p>
          </section>

          {/* Contact */}
          <section className="rounded-lg border border-gray-200 bg-gray-50 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              12. Contact
            </h2>
            <p>
              <strong>Piqle Inc.</strong> (d/b/a IQSport.ai)<br />
              Email:{' '}
              <a href="mailto:dpa@iqsport.ai" className="text-blue-600 underline">
                dpa@iqsport.ai
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
