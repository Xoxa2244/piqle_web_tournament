import type { Metadata } from 'next'
import { SmsOptInForm } from './SmsOptInForm'

export const metadata: Metadata = {
  title: 'SMS Opt-In | IQSport.ai',
  description: 'Opt in to receive SMS notifications from your racquet sports club via IQSport.ai.',
}

export default function SmsOptInPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-lg px-6 py-16">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            SMS Notifications Opt-In
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            IQSport.ai — Club Communication Platform
          </p>
        </div>

        {/* Program description */}
        <div className="mb-8 rounded-lg border border-gray-200 bg-gray-50 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">
            About This Program
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            IQSport.ai sends SMS notifications on behalf of racquet sports clubs.
            By opting in below, you agree to receive text messages from your club including:
          </p>
          <ul className="mt-2 text-sm text-gray-600 list-disc pl-5 space-y-1">
            <li>Court booking confirmations and reminders</li>
            <li>Open court slot invitations and session fill alerts</li>
            <li>Membership reactivation offers and re-engagement messages</li>
            <li>Event and tournament notifications</li>
          </ul>
        </div>

        {/* Form */}
        <SmsOptInForm />

        {/* Footer links */}
        <div className="mt-10 pt-6 border-t border-gray-200 text-center text-xs text-gray-400 space-y-1">
          <p>
            <a href="/sms-terms" className="text-blue-600 underline">SMS Terms &amp; Conditions</a>
            {' · '}
            <a href="/privacy" className="text-blue-600 underline">Privacy Policy</a>
            {' · '}
            <a href="/terms" className="text-blue-600 underline">Terms of Service</a>
          </p>
          <p>&copy; {new Date().getFullYear()} Piqle Inc. (d/b/a IQSport.ai). All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}
