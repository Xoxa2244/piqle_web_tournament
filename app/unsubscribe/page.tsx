import { CheckCircle2, AlertTriangle, MailCheck } from 'lucide-react'
import Link from 'next/link'

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; token?: string }>
}) {
  const params = await searchParams
  const status = params.status
  const token = params.token

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border p-8 text-center">
        {status === 'success' && (
          <>
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              You&apos;ve been unsubscribed
            </h1>
            <p className="text-gray-500 mb-6">
              You will no longer receive automated emails from this club.
            </p>
            {token && (
              <a
                href={`/api/resubscribe?token=${encodeURIComponent(token)}`}
                className="text-sm text-violet-600 hover:text-violet-700 underline"
              >
                Changed your mind? Re-subscribe
              </a>
            )}
          </>
        )}

        {status === 'resubscribed' && (
          <>
            <MailCheck className="w-12 h-12 text-violet-500 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Welcome back!
            </h1>
            <p className="text-gray-500 mb-6">
              You&apos;ve been re-subscribed and will receive emails again.
            </p>
          </>
        )}

        {status === 'invalid' && (
          <>
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Invalid or expired link
            </h1>
            <p className="text-gray-500 mb-6">
              This unsubscribe link is no longer valid. Please contact the club directly
              or manage your preferences from your account settings.
            </p>
          </>
        )}

        {!status && (
          <>
            <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Manage email preferences
            </h1>
            <p className="text-gray-500 mb-6">
              Use the unsubscribe link from your email to manage your preferences.
            </p>
          </>
        )}

        <div className="mt-6 pt-4 border-t">
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Go to homepage
          </Link>
        </div>
      </div>
    </div>
  )
}
