'use client'

import { trpc } from '@/lib/trpc'
import { useParams } from 'next/navigation'

export default function PublicScoreboardPage() {
  const params = useParams()
  const slug = params.slug as string

  const { data: tournament, isLoading, error } = trpc.public.getBoard.useQuery({ slug })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="text-lg">Loading tournament...</div>
      </div>
    )
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Tournament Not Found</h1>
          <p className="text-gray-600">The tournament you&apos;re looking for doesn&apos;t exist or isn&apos;t publicly available.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">{tournament.title}</h1>
          {tournament.description && (
            <p className="text-gray-600 mt-2">{tournament.description}</p>
          )}
          
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-500">
            <div>Start: {new Date(tournament.startDate).toLocaleDateString()}</div>
            <div>End: {new Date(tournament.endDate).toLocaleDateString()}</div>
            {tournament.venueName && <div>Venue: {tournament.venueName}</div>}
            {tournament.entryFee && <div>Entry Fee: ${tournament.entryFee}</div>}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Divisions */}
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Divisions</h2>
            
            {tournament.divisions.length > 0 ? (
              <div className="space-y-6">
                {(tournament.divisions as any[]).map((division) => (
                  <div key={division.id} className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-xl font-semibold mb-4">{division.name}</h3>
                    
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Teams ({division.teams?.length || 0})</h4>
                        <div className="space-y-1">
                          {(division.teams || []).map((team: any) => (
                            <div key={team.id} className="text-sm text-gray-600">
                              {team.name}
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Settings</h4>
                        <div className="text-sm text-gray-600 space-y-1">
                          <div>Type: {division.teamKind?.replace('_', ' ') || 'N/A'}</div>
                          <div>Mode: {division.pairingMode || 'N/A'}</div>
                          {division.poolCount > 1 && <div>Pools: {division.poolCount} pools</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-md p-6 text-center">
                <p className="text-gray-600">No divisions created yet</p>
              </div>
            )}
          </div>

          {/* Prizes */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Prizes</h2>
            
            {tournament.prizes.length > 0 ? (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="space-y-3">
                  {tournament.prizes.map((prize) => (
                    <div key={prize.id} className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">{prize.label}</div>
                        {prize.amount && (
                          <div className="text-sm text-gray-600">${prize.amount}</div>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {prize.place === 1 ? '🥇' : prize.place === 2 ? '🥈' : prize.place === 3 ? '🥉' : `#${prize.place}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-md p-6 text-center">
                <p className="text-gray-600">No prizes set</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
