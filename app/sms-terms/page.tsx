import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SMS Terms & Conditions | IQSport",
  description: "SMS messaging terms, opt-in consent, and privacy information for IQSport club notifications.",
};

export default function SmsTermsPage() {
  return (
    <div className="min-h-screen bg-[#0B0D17] text-gray-200">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-white mb-2">SMS Terms &amp; Conditions</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: March 17, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Program Description</h2>
            <p>
              IQSport (operated by Piqle Inc.) provides SMS notifications to racquet sports club
              members on behalf of club administrators. By opting in, you agree to receive text
              messages related to your club membership and activity.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. Message Types</h2>
            <p>Messages you may receive include:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-300">
              <li>Court booking confirmations and reminders</li>
              <li>Open court slot invitations and session fill alerts</li>
              <li>Membership reactivation offers and re-engagement messages</li>
              <li>Event and tournament notifications</li>
              <li>Account and scheduling updates</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. Consent &amp; Opt-In</h2>
            <p>
              By creating an account on IQSport and providing your mobile phone number, or by
              checking the SMS consent checkbox during registration or within your club settings,
              you expressly consent to receive recurring automated text messages from IQSport
              at the phone number you provided. Consent is not a condition of purchase or
              membership.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Message Frequency</h2>
            <p>
              Message frequency varies based on your club activity. You can expect to receive
              approximately <strong className="text-white">2 to 8 messages per month</strong>.
              Message frequency may increase during tournaments or special events.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. Message and Data Rates</h2>
            <p>
              Message and data rates may apply. Your mobile carrier&apos;s standard messaging
              rates will apply to all text messages sent and received. IQSport is not responsible
              for any charges from your wireless provider.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. Opt-Out Instructions</h2>
            <p>
              You may opt out of receiving SMS messages at any time by replying{" "}
              <strong className="text-white">STOP</strong> to any message you receive from us.
              After opting out, you will receive a one-time confirmation message. You will no
              longer receive SMS messages from IQSport unless you re-subscribe.
            </p>
            <p className="mt-2">
              You can also manage your SMS preferences in your account settings at{" "}
              <a href="https://app.iqsport.ai" className="text-cyan-400 hover:underline">
                app.iqsport.ai
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. Help</h2>
            <p>
              For help or questions about our SMS program, reply{" "}
              <strong className="text-white">HELP</strong> to any message, or contact us at{" "}
              <a href="mailto:support@iqsport.ai" className="text-cyan-400 hover:underline">
                support@iqsport.ai
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">8. Privacy</h2>
            <p>
              Your phone number and messaging data will not be shared with third parties for
              marketing purposes. We use your phone number solely to deliver the notifications
              described above. For more information, see our{" "}
              <a href="https://app.iqsport.ai/privacy" className="text-cyan-400 hover:underline">
                Privacy Policy
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. Supported Carriers</h2>
            <p>
              Our SMS service is supported on major US carriers including AT&amp;T, Verizon,
              T-Mobile, Sprint, and others. Carriers are not liable for delayed or undelivered
              messages.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">10. Contact Information</h2>
            <p>
              <strong className="text-white">Piqle Inc. (d/b/a IQSport)</strong><br />
              Email:{" "}
              <a href="mailto:support@iqsport.ai" className="text-cyan-400 hover:underline">
                support@iqsport.ai
              </a><br />
              Website:{" "}
              <a href="https://iqsport.ai" className="text-cyan-400 hover:underline">
                iqsport.ai
              </a>
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-700 text-xs text-gray-500">
          <p>&copy; {new Date().getFullYear()} Piqle Inc. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
