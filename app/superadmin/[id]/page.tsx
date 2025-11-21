'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { formatDescription } from '@/lib/formatDescription'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { 
  Users, 
  Calendar, 
  BarChart3, 
  Settings,
  FileText,
  Target,
  ArrowLeft,
  Upload,
  Globe,
  Edit,
  Shield
} from 'lucide-react'

export default function SuperAdminTournamentPage() {
  const params = useParams()
  const router = useRouter()
  const tournamentId = params.id as string
  const [showCreateDivision, setShowCreateDivision] = useState(false)
  const [showEditTournament, setShowEditTournament] = useState(false)
  const [tournamentForm, setTournamentForm] = useState({
    title: '',
    description: '',
    venueName: '',
    startDate: '',
    endDate: '',
    entryFee: '',
    isPublicBoardEnabled: false,
  })
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

  // Use superadmin query instead of regular tournament.get
  const { data: tournament, isLoading, error } = trpc.superadmin.getTournament.useQuery({ id: tournamentId })
  
  // Super admin has full access
  const isAdmin = true
  const isOwner = true
  
  // Get pending access requests count (using regular query, but it might fail - that's ok)
  const { data: accessRequests } = trpc.tournamentAccess.listRequests.useQuery(
    { tournamentId },
    { enabled: !!tournamentId }
  )
  const pendingRequestsCount = accessRequests?.length || 0
  
  const updateTournament = trpc.superadmin.updateTournament.useMutation({
    onSuccess: () => {
      setShowEditTournament(false)
      window.location.reload()
    },
    onError: (error) => {
      console.error('Error updating tournament:', error)
      alert('Error updating tournament: ' + error.message)
    },
  })
  
  // Note: createDivision still uses regular mutation which requires auth
  // If this fails, we'll need to create superadmin.createDivision
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

  const handleUpdateTournament = () => {
    if (!tournamentForm.title.trim()) {
      alert('Please enter tournament title')
      return
    }
    updateTournament.mutate({
      id: tournamentId,
      title: tournamentForm.title,
      description: tournamentForm.description || undefined,
      venueName: tournamentForm.venueName || undefined,
      startDate: tournamentForm.startDate || undefined,
      endDate: tournamentForm.endDate || undefined,
      entryFee: tournamentForm.entryFee ? parseFloat(tournamentForm.entryFee) : undefined,
      isPublicBoardEnabled: tournamentForm.isPublicBoardEnabled,
    })
  }

  const handleTournamentChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setTournamentForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  // Populate form when tournament loads
  useEffect(() => {
    if (tournament && !tournamentForm.title) {
      setTournamentForm({
        title: tournament.title,
        description: tournament.description || '',
        venueName: tournament.venueName || '',
        startDate: tournament.startDate ? new Date(tournament.startDate).toISOString().split('T')[0] : '',
        endDate: tournament.endDate ? new Date(tournament.endDate).toISOString().split('T')[0] : '',
        entryFee: tournament.entryFee?.toString() || '',
        isPublicBoardEnabled: tournament.isPublicBoardEnabled,
      })
    }
  }, [tournament])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-lg text-slate-600">Loading tournament...</div>
        </div>
      </div>
    )
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md mx-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Tournament not found</h1>
            <p className="text-slate-600 mb-6">The tournament may have been deleted</p>
            <Link href="/superadmin" className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to superadmin
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/superadmin" className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Super Admin
          </Link>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{tournament.title}</h1>
              {tournament.description && (
                <div 
                  className="mt-2 text-slate-600 prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: formatDescription(tournament.description) }}
                />
              )}
            </div>
            {isAdmin && (
              <Button
                onClick={() => setShowEditTournament(true)}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Edit className="w-4 h-4" />
                Edit Tournament
              </Button>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Divisions</p>
                  <p className="text-2xl font-bold text-slate-900">{tournament.divisions.length}</p>
                </div>
                <Target className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Start Date</p>
                  <p className="text-sm font-bold text-slate-900">
                    {new Date(tournament.startDate).toLocaleDateString()}
                  </p>
                </div>
                <Calendar className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">End Date</p>
                  <p className="text-sm font-bold text-slate-900">
                    {new Date(tournament.endDate).toLocaleDateString()}
                  </p>
                </div>
                <Calendar className="w-8 h-8 text-red-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Public Board</p>
                  <p className="text-sm font-bold text-slate-900">
                    {tournament.isPublicBoardEnabled ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
                <Globe className="w-8 h-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Link href={`/admin/${tournamentId}/dashboard`}>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <BarChart3 className="w-8 h-8 text-blue-600" />
                  <div>
                    <h3 className="font-semibold text-slate-900">Dashboard</h3>
                    <p className="text-sm text-slate-600">View standings & brackets</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href={`/admin/${tournamentId}/divisions`}>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <Target className="w-8 h-8 text-green-600" />
                  <div>
                    <h3 className="font-semibold text-slate-900">Divisions</h3>
                    <p className="text-sm text-slate-600">Manage divisions</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href={`/admin/${tournamentId}/teams`}>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <Users className="w-8 h-8 text-purple-600" />
                  <div>
                    <h3 className="font-semibold text-slate-900">Teams</h3>
                    <p className="text-sm text-slate-600">Manage teams</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href={`/admin/${tournamentId}/players`}>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <Users className="w-8 h-8 text-orange-600" />
                  <div>
                    <h3 className="font-semibold text-slate-900">Players</h3>
                    <p className="text-sm text-slate-600">Manage players</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href={`/admin/${tournamentId}/stages`}>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <Settings className="w-8 h-8 text-indigo-600" />
                  <div>
                    <h3 className="font-semibold text-slate-900">Stages</h3>
                    <p className="text-sm text-slate-600">Manage stages</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {isOwner && (
            <Link href={`/admin/${tournamentId}/import`}>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <Upload className="w-8 h-8 text-teal-600" />
                    <div>
                      <h3 className="font-semibold text-slate-900">Import</h3>
                      <p className="text-sm text-slate-600">Import CSV data</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          {isOwner && (
            <Link href={`/admin/${tournamentId}/access`}>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <Shield className="w-8 h-8 text-red-600" />
                    <div>
                      <h3 className="font-semibold text-slate-900">Access Control</h3>
                      <p className="text-sm text-slate-600">
                        Manage access {pendingRequestsCount > 0 && (
                          <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-xs ml-1">
                            {pendingRequestsCount}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          {tournament.isPublicBoardEnabled && tournament.publicSlug && (
            <Link href={`/t/${tournament.publicSlug}`} target="_blank">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <Globe className="w-8 h-8 text-cyan-600" />
                    <div>
                      <h3 className="font-semibold text-slate-900">Public Board</h3>
                      <p className="text-sm text-slate-600">View public scoreboard</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>

        {/* Divisions List */}
        {tournament.divisions.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Divisions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {tournament.divisions.map((division: any) => (
                  <div key={division.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-slate-900">{division.name}</h3>
                        <p className="text-sm text-slate-600 mt-1">
                          {division.teams?.length || 0} teams, {division.matches?.length || 0} matches
                        </p>
                      </div>
                      <Link href={`/admin/${tournamentId}/divisions`}>
                        <Button variant="outline" size="sm">
                          Manage
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Create Division Button */}
        {isAdmin && (
          <div className="mb-8">
            <Button
              onClick={() => setShowCreateDivision(true)}
              className="bg-green-600 hover:bg-green-700"
            >
              Create Division
            </Button>
          </div>
        )}
      </div>

      {/* Edit Tournament Modal */}
      {showEditTournament && tournament && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Edit Tournament</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  name="title"
                  value={tournamentForm.title}
                  onChange={handleTournamentChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  name="description"
                  value={tournamentForm.description}
                  onChange={handleTournamentChange}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Venue Name</label>
                <input
                  type="text"
                  name="venueName"
                  value={tournamentForm.venueName}
                  onChange={handleTournamentChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                  <input
                    type="date"
                    name="startDate"
                    value={tournamentForm.startDate}
                    onChange={handleTournamentChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                  <input
                    type="date"
                    name="endDate"
                    value={tournamentForm.endDate}
                    onChange={handleTournamentChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Entry Fee</label>
                <input
                  type="number"
                  name="entryFee"
                  value={tournamentForm.entryFee}
                  onChange={handleTournamentChange}
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="isPublicBoardEnabled"
                  checked={tournamentForm.isPublicBoardEnabled}
                  onChange={handleTournamentChange}
                  className="mr-2"
                />
                <label className="text-sm font-medium text-gray-700">Enable Public Board</label>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <Button
                onClick={() => setShowEditTournament(false)}
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdateTournament}
                disabled={updateTournament.isLoading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {updateTournament.isLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Division Modal */}
      {showCreateDivision && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Create Division</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Division Name *</label>
                <input
                  type="text"
                  value={divisionForm.name}
                  onChange={(e) => setDivisionForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., Men's Doubles Open"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team Kind</label>
                <select
                  value={divisionForm.teamKind}
                  onChange={(e) => setDivisionForm(prev => ({ ...prev, teamKind: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="SINGLES_1v1">Singles (1v1)</option>
                  <option value="DOUBLES_2v2">Doubles (2v2)</option>
                  <option value="SQUAD_4v4">Squad (4v4)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pairing Mode</label>
                <select
                  value={divisionForm.pairingMode}
                  onChange={(e) => setDivisionForm(prev => ({ ...prev, pairingMode: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="FIXED">Fixed Teams</option>
                  <option value="MIX_AND_MATCH">Mix and Match</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pool Count</label>
                <input
                  type="number"
                  min="1"
                  value={divisionForm.poolCount}
                  onChange={(e) => setDivisionForm(prev => ({ ...prev, poolCount: parseInt(e.target.value) || 1 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <Button
                onClick={() => setShowCreateDivision(false)}
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateDivision}
                disabled={createDivision.isLoading}
                className="bg-green-600 hover:bg-green-700"
              >
                {createDivision.isLoading ? 'Creating...' : 'Create Division'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

