import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'SMS Terms & Conditions | IQSport.ai',
  description: 'SMS messaging terms, opt-in consent, and privacy information for IQSport.ai club notifications.',
}

export default function SmsTermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            SMS Terms &amp; Conditions
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Last updated: March 14, 2026
          </p>
        </div>

        <div className="space-y-10 text-gray-700 leading-relaxed">
          {/* Program Description */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Program Description
            </h2>
            <p>
              IQSport.ai (operated by Piqle Inc.) provides SMS notifications to members of
              racquet sports clubs that use our platform. Messages are sent on behalf of club
              administrators to help members stay informed and engaged with their club activities.
            </p>
          </section>

          {/* Message Types */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Types of Messages
            </h2>
            <p className="mb-3">You may receive the following types of SMS messages:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Court Availability Alerts</strong> — Notifications when courts matching your preferences become available</li>
              <li><strong>Booking Reminders</strong> — Reminders about your upcoming court reservations</li>
              <li><strong>Reactivation Invitations</strong> — Personalized invitations to return to your club after a period of inactivity</li>
              <li><strong>Event Notifications</strong> — Information about upcoming club events, mixers, and tournaments</li>
              <li><strong>Slot Filler Invites</strong> — Invitations to fill open spots in play sessions at your skill level</li>
            </ul>
          </section>

          {/* Consent / Opt-In */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Consent &amp; Opt-In
            </h2>
            <p className="mb-3">
              By providing your phone number and enabling SMS notifications in your IQSport.ai
              profile settings, you expressly consent to receive automated text messages from
              IQSport.ai on behalf of your club. Consent is not a condition of purchase or
              membership.
            </p>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
              <h3 className="font-semibold text-gray-900 mb-2">How to Opt In</h3>
              <ol className="list-decimal pl-6 space-y-2">
                <li>Log in to your IQSport.ai account at <strong>app.iqsport.ai</strong></li>
                <li>Navigate to <strong>Profile Settings</strong></li>
                <li>Enter your mobile phone number</li>
                <li>Check the box: <em>&quot;I agree to receive SMS notifications from my club via IQSport.ai&quot;</em></li>
                <li>Click <strong>Save</strong></li>
              </ol>
            </div>
          </section>

          {/* Opt-Out */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              How to Opt Out
            </h2>
            <p className="mb-3">
              You can stop receiving SMS messages at any time using any of the following methods:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Reply STOP</strong> — Text <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm font-mono">STOP</code> to
                any message you receive from us
              </li>
              <li>
                <strong>Profile Settings</strong> — Disable SMS notifications in your IQSport.ai profile
              </li>
              <li>
                <strong>Contact Support</strong> — Email{' '}
                <a href="mailto:support@iqsport.ai" className="text-blue-600 underline">
                  support@iqsport.ai
                </a>{' '}
                to request removal
              </li>
            </ul>
            <p className="mt-3">
              After opting out, you will receive a one-time confirmation message.
              You will not receive any further SMS messages unless you re-subscribe.
              To re-subscribe, text <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm font-mono">START</code> or
              re-enable notifications in your profile.
            </p>
          </section>

          {/* Help */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Help
            </h2>
            <p>
              For assistance, text <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm font-mono">HELP</code> to
              any message, or contact us at{' '}
              <a href="mailto:support@iqsport.ai" className="text-blue-600 underline">
                support@iqsport.ai
              </a>.
            </p>
          </section>

          {/* Message Frequency & Rates */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Message Frequency &amp; Rates
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Frequency:</strong> Approximately 2-8 messages per month, depending on your club activity and preferences</li>
              <li><strong>Rates:</strong> Message and data rates may apply. Check with your mobile carrier for details</li>
              <li><strong>Carriers:</strong> Compatible with all major US carriers including AT&amp;T, T-Mobile, Verizon, and others</li>
            </ul>
          </section>

          {/* Privacy */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Privacy
            </h2>
            <p>
              Your phone number and messaging data are kept confidential and are never sold,
              rented, or shared with third parties for marketing purposes. Phone numbers are
              only used to deliver club-related notifications as described above. For more
              information, see our{' '}
              <a href="/privacy" className="text-blue-600 underline">
                Privacy Policy
              </a>.
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
              <a href="mailto:support@iqsport.ai" className="text-blue-600 underline">
                support@iqsport.ai
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
