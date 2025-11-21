'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
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
import TournamentNavBar from '@/components/TournamentNavBar'

export default function TournamentDetailPage() {
  const params = useParams()
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

  const { data: tournament, isLoading, error } = trpc.tournament.get.useQuery({ id: tournamentId })
  
  // Check if user has admin access (owner or ADMIN access level)
  const isAdmin = tournament?.userAccessInfo?.isOwner || tournament?.userAccessInfo?.accessLevel === 'ADMIN'
  // Check if user is owner (for owner-only features like CSV import and access control)
  const isOwner = tournament?.userAccessInfo?.isOwner
  
  // Get pending access requests count (only for owner)
  const { data: accessRequests } = trpc.tournamentAccess.listRequests.useQuery(
    { tournamentId },
    { enabled: !!isOwner && !!tournamentId }
  )
  const pendingRequestsCount = accessRequests?.length || 0
  
  const updateTournament = trpc.tournament.update.useMutation({
    onSuccess: () => {
      setShowEditTournament(false)
      window.location.reload()
    },
    onError: (error) => {
      console.error('Error updating tournament:', error)
      alert('Error updating tournament: ' + error.message)
    },
  })
  
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

  const handlePublicScoreboardClick = () => {
    if (!tournament?.isPublicBoardEnabled) {
      alert('Public Scoreboard is not available. Please enable it in tournament settings.')
      return
    }
    window.open(`/scoreboard/${tournamentId}`, '_blank')
  }

  const handleEditTournamentClick = () => {
    if (!tournament) return
    
    setTournamentForm({
      title: tournament.title,
      description: tournament.description || '',
      venueName: tournament.venueName || '',
      startDate: new Date(tournament.startDate).toISOString().split('T')[0],
      endDate: new Date(tournament.endDate).toISOString().split('T')[0],
      entryFee: tournament.entryFee?.toString() || '',
      isPublicBoardEnabled: tournament.isPublicBoardEnabled,
    })
    setShowEditTournament(true)
  }

  const handleTournamentSubmit = () => {
    if (!tournamentForm.title || !tournamentForm.startDate || !tournamentForm.endDate) {
      alert('Please fill in required fields')
      return
    }

    updateTournament.mutate({
      id: tournamentId,
      title: tournamentForm.title,
      description: tournamentForm.description || undefined,
      venueName: tournamentForm.venueName || undefined,
      startDate: tournamentForm.startDate,
      endDate: tournamentForm.endDate,
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-stone-50 to-stone-50/50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-stone-400 mx-auto mb-3"></div>
          <div className="text-sm text-stone-600">Loading tournament...</div>
        </div>
      </div>
    )
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-stone-50 to-stone-50/50 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-white rounded-lg shadow-md p-6 max-w-md mx-4 border border-stone-200">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-stone-900 mb-2">Tournament not found</h1>
            <p className="text-sm text-stone-600 mb-4">The tournament may have been deleted or you don&apos;t have access</p>
            <Link href="/admin" className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
              <ArrowLeft className="w-3.5 h-3.5 mr-2" />
              Back to tournaments
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-stone-50/50">
      {/* Navigation Bar */}
      <TournamentNavBar
        tournamentTitle={tournament.title}
        isAdmin={isAdmin}
        isOwner={isOwner}
        pendingRequestsCount={pendingRequestsCount}
        onPublicScoreboardClick={handlePublicScoreboardClick}
        onEditTournamentClick={handleEditTournamentClick}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Tournament Information - Left Column (60%) */}
          <div className="lg:col-span-2">
            <Card className="h-full border border-stone-200/60 shadow-sm bg-white/90">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-bold text-stone-900 flex items-center">
                  <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center mr-2.5">
                    <Calendar className="w-3.5 h-3.5 text-white" />
                  </div>
                  Tournament Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Tournament Description */}
                <div className="bg-stone-50 rounded-lg p-3 border border-stone-200/60">
                  <div className="h-20 overflow-y-auto">
                    {tournament.description ? (
                      <div 
                        className="text-sm font-medium text-stone-900 prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: formatDescription(tournament.description) }}
                      />
                    ) : (
                      <p className="text-sm font-medium text-stone-500 italic">
                        No description provided
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="group">
                    <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5 block">Start Date</label>
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 bg-emerald-600 rounded flex items-center justify-center">
                        <Calendar className="w-3 h-3 text-white" />
                      </div>
                      <p className="text-sm font-semibold text-stone-900">
                        {new Date(tournament.startDate).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="group">
                    <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5 block">End Date</label>
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 bg-red-600 rounded flex items-center justify-center">
                        <Calendar className="w-3 h-3 text-white" />
                      </div>
                      <p className="text-sm font-semibold text-stone-900">
                        {new Date(tournament.endDate).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="group">
                    <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5 block">Venue</label>
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 bg-amber-600 rounded flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <p className="text-sm font-semibold text-stone-900">
                        {tournament.venueName || '—'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="group">
                    <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5 block">Entry Fee</label>
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 bg-green-600 rounded flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                        </svg>
                      </div>
                      <p className="text-sm font-semibold text-stone-900">
                        {tournament.entryFee ? `$${tournament.entryFee}` : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions - Right Column (40%) */}
          <div className="lg:col-span-1">
            <Card className="h-full border border-stone-200/60 shadow-sm bg-white/90">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-bold text-stone-900 flex items-center">
                  <div className="w-7 h-7 bg-purple-600 rounded-lg flex items-center justify-center mr-2.5">
                    <Settings className="w-3.5 h-3.5 text-white" />
                  </div>
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {isAdmin && (
                    <Link href={`/admin/${tournamentId}/divisions`}>
                      <Button variant="outline" className="h-16 w-full p-3 hover:bg-stone-50 hover:border-stone-300 transition-all duration-200 group border-stone-200">
                        <div className="flex flex-col items-center space-y-1.5 w-full">
                          <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
                            <Settings className="h-3.5 w-3.5 text-white" />
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-xs text-stone-900">Divisions</div>
                          </div>
                        </div>
                      </Button>
                    </Link>
                  )}
                  
                  <Link href={`/admin/${tournamentId}/players`}>
                    <Button variant="outline" className="h-16 w-full p-3 hover:bg-stone-50 hover:border-stone-300 transition-all duration-200 group border-stone-200">
                      <div className="flex flex-col items-center space-y-1.5 w-full">
                        <div className="w-6 h-6 bg-emerald-600 rounded flex items-center justify-center">
                          <Users className="h-3.5 w-3.5 text-white" />
                        </div>
                        <div className="text-center">
                          <div className="font-semibold text-xs text-stone-900">Players</div>
                        </div>
                      </div>
                    </Button>
                  </Link>
                  
                  <Link href={`/admin/${tournamentId}/stages`}>
                    <Button variant="outline" className="h-16 w-full p-3 hover:bg-stone-50 hover:border-stone-300 transition-all duration-200 group border-stone-200">
                      <div className="flex flex-col items-center space-y-1.5 w-full">
                        <div className="w-6 h-6 bg-amber-600 rounded flex items-center justify-center">
                          <FileText className="h-3.5 w-3.5 text-white" />
                        </div>
                        <div className="text-center">
                          <div className="font-semibold text-xs text-stone-900">Score Input</div>
                        </div>
                      </div>
                    </Button>
                  </Link>
                  
                  <Link href={`/admin/${tournamentId}/dashboard`}>
                    <Button variant="outline" className="h-16 w-full p-3 hover:bg-stone-50 hover:border-stone-300 transition-all duration-200 group border-stone-200">
                      <div className="flex flex-col items-center space-y-1.5 w-full">
                        <div className="w-6 h-6 bg-purple-600 rounded flex items-center justify-center">
                          <BarChart3 className="h-3.5 w-3.5 text-white" />
                        </div>
                        <div className="text-center">
                          <div className="font-semibold text-xs text-stone-900">Dashboard</div>
                        </div>
                      </div>
                    </Button>
                  </Link>
                  
                  {isOwner && (
                    <Link href={`/admin/${tournamentId}/access`} className="relative">
                      <Button variant="outline" className="h-16 w-full p-3 hover:bg-stone-50 hover:border-stone-300 transition-all duration-200 group border-stone-200">
                        <div className="flex flex-col items-center space-y-1.5 w-full">
                          <div className="w-6 h-6 bg-stone-600 rounded flex items-center justify-center">
                            <Shield className="h-3.5 w-3.5 text-white" />
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-xs text-stone-900">Access</div>
                          </div>
                        </div>
                      </Button>
                      {pendingRequestsCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white shadow-sm">
                          {pendingRequestsCount}
                        </span>
                      )}
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Create Division Modal */}
      {showCreateDivision && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4 border border-stone-200">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-2.5">
                <Settings className="w-4 h-4 text-white" />
              </div>
              <h2 className="text-lg font-bold text-stone-900">Create Division</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Division Name *
                </label>
                <input
                  type="text"
                  value={divisionForm.name}
                  onChange={(e) => setDivisionForm({ ...divisionForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="e.g., Men's 2v2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Team Type
                </label>
                <select
                  value={divisionForm.teamKind}
                  onChange={(e) => setDivisionForm({ ...divisionForm, teamKind: e.target.value as any })}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                >
                  <option value="SINGLES_1v1">Singles (1v1)</option>
                  <option value="DOUBLES_2v2">Doubles (2v2)</option>
                  <option value="SQUAD_4v4">Squad (4v4)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Pairing Mode
                </label>
                <select
                  value={divisionForm.pairingMode}
                  onChange={(e) => setDivisionForm({ ...divisionForm, pairingMode: e.target.value as any })}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                >
                  <option value="FIXED">Fixed Teams</option>
                  <option value="MIX_AND_MATCH">Mix and Match</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Number of Pools
                </label>
                <input
                  type="number"
                  min="0"
                  value={divisionForm.poolCount}
                  onChange={(e) => setDivisionForm({ ...divisionForm, poolCount: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Max Teams (optional)
                </label>
                <input
                  type="number"
                  min="1"
                  value={divisionForm.maxTeams || ''}
                  onChange={(e) => setDivisionForm({ ...divisionForm, maxTeams: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="No limit"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <Button
                variant="outline"
                onClick={() => setShowCreateDivision(false)}
                disabled={createDivision.isPending}
                className="px-4 py-2 text-sm rounded-lg border-stone-300 hover:bg-stone-50 transition-all duration-200"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateDivision}
                disabled={createDivision.isPending}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-200 shadow-sm hover:shadow"
              >
                {createDivision.isPending ? 'Creating...' : 'Create Division'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Tournament Modal */}
      {showEditTournament && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl mx-4 border border-stone-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-2.5">
                <Edit className="w-4 h-4 text-white" />
              </div>
              <h2 className="text-lg font-bold text-stone-900">Edit Tournament</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Tournament Name *
                </label>
                <input
                  type="text"
                  name="title"
                  value={tournamentForm.title}
                  onChange={handleTournamentChange}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="e.g., Pickleball Championship 2024"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Description
                </label>
                <textarea
                  name="description"
                  value={tournamentForm.description}
                  onChange={handleTournamentChange}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="Tournament description, rules, features..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Venue
                </label>
                <input
                  type="text"
                  name="venueName"
                  value={tournamentForm.venueName}
                  onChange={handleTournamentChange}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="Sports complex name"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    name="startDate"
                    value={tournamentForm.startDate}
                    onChange={handleTournamentChange}
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    End Date *
                  </label>
                  <input
                    type="date"
                    name="endDate"
                    value={tournamentForm.endDate}
                    onChange={handleTournamentChange}
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Entry Fee ($)
                </label>
                <input
                  type="number"
                  name="entryFee"
                  value={tournamentForm.entryFee}
                  onChange={handleTournamentChange}
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="0.00"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="isPublicBoardEnabled"
                  checked={tournamentForm.isPublicBoardEnabled}
                  onChange={handleTournamentChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-xs text-stone-700">
                  Enable public results board
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <Button
                variant="outline"
                onClick={() => setShowEditTournament(false)}
                disabled={updateTournament.isPending}
                className="px-4 py-2 text-sm rounded-lg border-stone-300 hover:bg-stone-50 transition-all duration-200"
              >
                Cancel
              </Button>
              <Button
                onClick={handleTournamentSubmit}
                disabled={updateTournament.isPending}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-200 shadow-sm hover:shadow"
              >
                {updateTournament.isPending ? 'Updating...' : 'Update Tournament'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}