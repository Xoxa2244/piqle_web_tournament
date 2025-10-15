'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { 
  Users, 
  Calendar, 
  BarChart3, 
  Settings,
  FileText,
  Target
} from 'lucide-react'

export default function TournamentDetailPage() {
  const params = useParams()
  const tournamentId = params.id as string
  const [showCreateDivision, setShowCreateDivision] = useState(false)
  const [divisionForm, setDivisionForm] = useState({
    name: '',
    teamKind: 'DOUBLES_2v2' as 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4',
    pairingMode: 'FIXED' as 'FIXED' | 'MIX_AND_MATCH',
    poolCount: 1,
    maxTeams: undefined as number | undefined,
    minDupr: undefined as number | undefined,
    maxDupr: undefined as number | undefined,
    minAge: undefined as number | undefined,
    maxAge: undefined as number | undefined,
  })

  const { data: tournament, isLoading, error } = trpc.tournament.get.useQuery({ id: tournamentId })
  const createDivision = trpc.division.create.useMutation({
    onSuccess: () => {
      setShowCreateDivision(false)
      setDivisionForm({
        name: '',
        teamKind: 'DOUBLES_2v2',
        pairingMode: 'FIXED',
        poolCount: 1,
        maxTeams: undefined,
        minDupr: undefined,
        maxDupr: undefined,
        minAge: undefined,
        maxAge: undefined,
      })
      window.location.reload()
    },
  })

  const handleCreateDivision = () => {
    if (!divisionForm.name.trim()) {
      alert('Please enter division name')
      return
    }
    createDivision.mutate({
      tournamentId,
      name: divisionForm.name,
      teamKind: divisionForm.teamKind,
      pairingMode: divisionForm.pairingMode,
      poolCount: divisionForm.poolCount,
      maxTeams: divisionForm.maxTeams,
      minDupr: divisionForm.minDupr,
      maxDupr: divisionForm.maxDupr,
      minAge: divisionForm.minAge,
      maxAge: divisionForm.maxAge,
    })
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading tournament...</div>
      </div>
    )
  }

  if (error || !tournament) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Tournament not found</h1>
        <p className="text-gray-600 mb-4">The tournament may have been deleted or you don&apos;t have access</p>
        <Link href="/admin" className="text-blue-600 hover:text-blue-800">
          ← Back to tournaments
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex justify-between items-baseline">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 leading-tight">
                {tournament.title}
              </h1>
            </div>
            
            <div className="flex items-center space-x-3">
              <Link
                href={`/admin/${tournamentId}/import`}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-base"
              >
                CSV Import
              </Link>
              {tournament.isPublicBoardEnabled && (
                <Link
                  href={`/t/${tournament.publicSlug}`}
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-base"
                >
                  Public Board
                </Link>
              )}
              <Link
                href="/admin"
                className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-base"
              >
                ← Back
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Tournament Information - Left Column (60%) */}
          <div className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-xl font-semibold">Tournament Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-gray-500 uppercase tracking-wide">Start Date</label>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {new Date(tournament.startDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500 uppercase tracking-wide">End Date</label>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {new Date(tournament.endDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500 uppercase tracking-wide">Venue</label>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {tournament.venueName || '—'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500 uppercase tracking-wide">Entry Fee</label>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {tournament.entryFee ? `$${tournament.entryFee}` : '—'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions - Right Column (40%) */}
          <div className="lg:col-span-1">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-xl font-semibold">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <Link href={`/admin/${tournamentId}/divisions`}>
                    <Button variant="outline" className="h-20 w-full p-4 hover:bg-gray-50">
                      <div className="flex items-center space-x-3 w-full">
                        <Settings className="h-6 w-6 text-gray-600" />
                        <div className="text-left">
                          <div className="font-semibold text-base">Divisions</div>
                          <div className="text-sm text-gray-500">Manage divisions</div>
                        </div>
                      </div>
                    </Button>
                  </Link>
                  
                  <Link href={`/admin/${tournamentId}/players`}>
                    <Button variant="outline" className="h-20 w-full p-4 hover:bg-gray-50">
                      <div className="flex items-center space-x-3 w-full">
                        <Users className="h-6 w-6 text-gray-600" />
                        <div className="text-left">
                          <div className="font-semibold text-base">Player Management</div>
                          <div className="text-sm text-gray-500">General tournament participants list</div>
                        </div>
                      </div>
                    </Button>
                  </Link>
                  
                  <Link href={`/admin/${tournamentId}/stages`}>
                    <Button variant="outline" className="h-20 w-full p-4 hover:bg-gray-50">
                      <div className="flex items-center space-x-3 w-full">
                        <Target className="h-6 w-6 text-gray-600" />
                        <div className="text-left">
                          <div className="font-semibold text-base">Score Input</div>
                          <div className="text-sm text-gray-500">Ввод счёта</div>
                        </div>
                      </div>
                    </Button>
                  </Link>
                  
                  <Link href={`/admin/${tournamentId}/dashboard`}>
                    <Button variant="outline" className="h-20 w-full p-4 hover:bg-gray-50">
                      <div className="flex items-center space-x-3 w-full">
                        <BarChart3 className="h-6 w-6 text-gray-600" />
                        <div className="text-left">
                          <div className="font-semibold text-base">Dashboard</div>
                          <div className="text-sm text-gray-500">Division overview</div>
                        </div>
                      </div>
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Create Division Modal */}
      {showCreateDivision && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">Create Division</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Division Name *
                </label>
                <input
                  type="text"
                  value={divisionForm.name}
                  onChange={(e) => setDivisionForm({ ...divisionForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Men's 2v2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Team Type
                </label>
                <select
                  value={divisionForm.teamKind}
                  onChange={(e) => setDivisionForm({ ...divisionForm, teamKind: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="SINGLES_1v1">Singles (1v1)</option>
                  <option value="DOUBLES_2v2">Doubles (2v2)</option>
                  <option value="SQUAD_4v4">Squad (4v4)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pairing Mode
                </label>
                <select
                  value={divisionForm.pairingMode}
                  onChange={(e) => setDivisionForm({ ...divisionForm, pairingMode: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="FIXED">Fixed Teams</option>
                  <option value="MIX_AND_MATCH">Mix and Match</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Number of Pools
                </label>
                <input
                  type="number"
                  min="0"
                  value={divisionForm.poolCount}
                  onChange={(e) => setDivisionForm({ ...divisionForm, poolCount: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Teams (optional)
                </label>
                <input
                  type="number"
                  min="1"
                  value={divisionForm.maxTeams || ''}
                  onChange={(e) => setDivisionForm({ ...divisionForm, maxTeams: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="No limit"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <Button
                variant="outline"
                onClick={() => setShowCreateDivision(false)}
                disabled={createDivision.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateDivision}
                disabled={createDivision.isPending}
              >
                {createDivision.isPending ? 'Creating...' : 'Create Division'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}