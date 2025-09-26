'use client'

import { trpc } from '@/lib/trpc'
import Link from 'next/link'

export default function AdminPage() {
  const { data: tournaments, isLoading } = trpc.tournament.list.useQuery()

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading tournaments...</div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Tournaments</h1>
        <Link
          href="/admin/new"
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          Create Tournament
        </Link>
      </div>

      {tournaments && tournaments.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tournaments.map((tournament) => (
            <div key={tournament.id} className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-xl font-semibold mb-2">{tournament.title}</h3>
              <p className="text-gray-600 mb-4">{tournament.description}</p>
              
              <div className="space-y-2 text-sm text-gray-500">
                <div>Start: {new Date(tournament.startDate).toLocaleDateString()}</div>
                <div>End: {new Date(tournament.endDate).toLocaleDateString()}</div>
                <div>Divisions: {tournament._count.divisions}</div>
                {tournament.entryFee && (
                  <div>Entry Fee: ${tournament.entryFee}</div>
                )}
              </div>

              <div className="mt-4 flex space-x-2">
                <Link
                  href={`/admin/${tournament.id}`}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-3 rounded transition-colors"
                >
                  Manage
                </Link>
                {tournament.isPublicBoardEnabled && (
                  <Link
                    href={`/t/${tournament.publicSlug}`}
                    className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-3 rounded transition-colors"
                  >
                    View Board
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-gray-900 mb-2">No tournaments yet</h3>
          <p className="text-gray-600 mb-4">Create your first tournament to get started</p>
          <Link
            href="/admin/new"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            Create Tournament
          </Link>
        </div>
      )}
    </div>
  )
}
