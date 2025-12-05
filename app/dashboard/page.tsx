'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { 
  Calendar, 
  TrendingUp, 
  Users, 
  DollarSign, 
  Trophy,
  Clock,
  ArrowUpRight,
  Activity
} from 'lucide-react'
import Link from 'next/link'

export default function TDDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()

  // Redirect if not TD
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'TD') {
      router.push('/')
    }
  }, [session, status, router])

  const { data: overview, isLoading: overviewLoading } = trpc.dashboard.getOverview.useQuery()
  const { data: recentActivity, isLoading: activityLoading } = trpc.dashboard.getRecentActivity.useQuery({ limit: 10 })

  if (status === 'loading' || overviewLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (!session || session.user.role !== 'TD') {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Tournament Director Dashboard</h1>
              <p className="mt-1 text-sm text-gray-500">Welcome back, {session.user.name}!</p>
            </div>
            <Link
              href="/admin/new"
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Trophy className="w-4 h-4 mr-2" />
              Create Tournament
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {/* Active Tournaments */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Trophy className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Active Tournaments</dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">
                        {overview?.tournaments.active || 0}
                      </div>
                      <div className="ml-2 text-sm text-gray-500">
                        / {overview?.tournaments.total || 0} total
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-5 py-3">
              <Link href="/admin" className="text-sm font-medium text-blue-600 hover:text-blue-500">
                View all tournaments
              </Link>
            </div>
          </div>

          {/* Total Players */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Players</dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">
                        {overview?.players.total || 0}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-5 py-3">
              <div className="text-sm text-gray-500">
                Across all tournaments
              </div>
            </div>
          </div>

          {/* Revenue This Month */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <TrendingUp className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">This Month</dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">
                        ${((overview?.revenue.thisMonthFinalPayout || 0) / 100).toFixed(2)}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-5 py-3">
              <div className="text-sm text-gray-500">
                After all fees (Piqle + Stripe)
              </div>
            </div>
          </div>

          {/* Pending Payouts */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <DollarSign className="h-6 w-6 text-orange-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Pending Payouts</dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">
                        ${((overview?.revenue.pendingPayouts || 0) / 100).toFixed(2)}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-5 py-3">
              <Link href="/profile" className="text-sm font-medium text-blue-600 hover:text-blue-500">
                Manage Stripe
              </Link>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Calendar */}
          <div className="lg:col-span-2">
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-gray-900 flex items-center">
                    <Calendar className="w-5 h-5 mr-2" />
                    Tournament Calendar
                  </h2>
                  <Link
                    href="/dashboard/calendar"
                    className="text-sm font-medium text-blue-600 hover:text-blue-500 flex items-center"
                  >
                    Full Calendar
                    <ArrowUpRight className="w-4 h-4 ml-1" />
                  </Link>
                </div>
              </div>
              <div className="p-6">
                <div className="text-center py-12 text-gray-500">
                  <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-sm">Calendar component coming soon</p>
                  <p className="text-xs mt-2">Full calendar view available on dedicated page</p>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="lg:col-span-1">
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900 flex items-center">
                  <Activity className="w-5 h-5 mr-2" />
                  Recent Activity
                </h2>
              </div>
              <div className="divide-y divide-gray-200">
                {activityLoading ? (
                  <div className="p-6 text-center text-gray-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  </div>
                ) : recentActivity && recentActivity.length > 0 ? (
                  <div className="max-h-96 overflow-y-auto">
                    {recentActivity.map((activity) => (
                      <div key={activity.id} className="px-6 py-4 hover:bg-gray-50">
                        {activity.type === 'registration' ? (
                          <div className="flex items-start">
                            <Users className="w-5 h-5 text-green-500 mt-0.5 mr-3 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">
                                New Registration
                              </p>
                              <p className="text-sm text-gray-500">
                                {activity.data.playerName}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                {activity.data.tournamentTitle}
                              </p>
                              {activity.data.isPaid && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 mt-1">
                                  Paid
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400 flex-shrink-0">
                              <Clock className="w-3 h-3 inline mr-1" />
                              {new Date(activity.timestamp).toLocaleDateString()}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start">
                            <DollarSign className="w-5 h-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">
                                Payment Received
                              </p>
                              <p className="text-sm text-gray-500">
                                ${((activity.data.amount || 0) / 100).toFixed(2)} from{' '}
                                {activity.data.playerName}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                {activity.data.tournamentTitle}
                              </p>
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 mt-1">
                                {activity.data.status}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400 flex-shrink-0">
                              <Clock className="w-3 h-3 inline mr-1" />
                              {new Date(activity.timestamp).toLocaleDateString()}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-gray-500">
                    <Activity className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm">No recent activity</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Revenue Overview */}
        <div className="mt-8">
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Revenue Overview</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <div className="text-sm font-medium text-gray-500">Total Revenue</div>
                  <div className="mt-2 text-3xl font-semibold text-gray-900">
                    ${((overview?.revenue.total || 0) / 100).toFixed(2)}
                  </div>
                  <div className="mt-2 text-sm text-gray-500">All time</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-500">Platform Fees</div>
                  <div className="mt-2 text-3xl font-semibold text-orange-600">
                    -${((overview?.revenue.platformFees || 0) / 100).toFixed(2)}
                  </div>
                  <div className="mt-2 text-sm text-gray-500">10% Piqle commission</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-500">Stripe Fees</div>
                  <div className="mt-2 text-3xl font-semibold text-red-600">
                    -${((overview?.revenue.stripeProcessingFees || 0) / 100).toFixed(2)}
                  </div>
                  <div className="mt-2 text-sm text-gray-500">~2.9% + $0.30/txn</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-500">Net Payout</div>
                  <div className="mt-2 text-3xl font-semibold text-green-600">
                    ${((overview?.revenue.finalPayout || 0) / 100).toFixed(2)}
                  </div>
                  <div className="mt-2 text-sm text-gray-500">You receive</div>
                </div>
              </div>
              
              {/* Breakdown explanation */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Calculation:</span>
                  <span className="text-gray-900 font-mono">
                    ${((overview?.revenue.total || 0) / 100).toFixed(2)} 
                    {' '}- ${((overview?.revenue.platformFees || 0) / 100).toFixed(2)}
                    {' '}- ${((overview?.revenue.stripeProcessingFees || 0) / 100).toFixed(2)}
                    {' '}= ${((overview?.revenue.finalPayout || 0) / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

