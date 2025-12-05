'use client'

import Link from 'next/link'

export default function HomePage() {

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Piqle Tournament Management
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Tournament management and scoreboard system
          </p>
        </div>

        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold mb-4">Quick Links</h2>
              <div className="space-y-3">
                <Link
                  href="/admin"
                  className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-center"
                >
                  Tournament Director Console
                </Link>
                <Link
                  href="/auth/signin"
                  className="block w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-center"
                >
                  Sign In / Register
                </Link>
                <Link
                  href="/scoreboard"
                  className="block w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-center"
                >
                  Public Scoreboard
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
