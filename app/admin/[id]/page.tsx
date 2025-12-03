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
            <p className="text-slate-600 mb-6">The tournament may have been deleted or you don&apos;t have access</p>
            <Link href="/admin" className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to tournaments
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Navigation Bar */}
      <TournamentNavBar
        tournamentTitle={tournament.title}
        isAdmin={isAdmin}
        isOwner={isOwner}
        pendingRequestsCount={pendingRequestsCount}
        onPublicScoreboardClick={handlePublicScoreboardClick}
        onEditTournamentClick={handleEditTournamentClick}
        publicScoreboardUrl={tournament?.isPublicBoardEnabled ? `${typeof window !== 'undefined' ? window.location.origin : 'https://dtest.piqle.io'}/scoreboard/${tournamentId}` : undefined}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Tournament Information - Left Column (60%) */}
          <div className="lg:col-span-2">
            <Card className="h-full border-0 shadow-xl bg-white/70 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl font-bold text-slate-900 flex items-center">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mr-3">
                    <Calendar className="w-4 h-4 text-white" />
                  </div>
                  Tournament Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Tournament Description */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                  <div className="h-24 overflow-y-auto">
                    {tournament.description ? (
                      <div 
                        className="text-lg font-medium text-slate-900 prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: formatDescription(tournament.description) }}
                      />
                    ) : (
                      <p className="text-lg font-medium text-slate-900 text-gray-500 italic">
                        No description provided
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="group">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">Start Date</label>
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-white" />
                      </div>
                      <p className="text-base font-semibold text-slate-900">
                        {new Date(tournament.startDate).toLocaleDateString('en-US', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="group">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">End Date</label>
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-white" />
                      </div>
                      <p className="text-base font-semibold text-slate-900">
                        {new Date(tournament.endDate).toLocaleDateString('en-US', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="group">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">Venue</label>
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <p className="text-base font-semibold text-slate-900">
                        {tournament.venueName || '—'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="group">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">Entry Fee</label>
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                        </svg>
                      </div>
                      <p className="text-base font-semibold text-slate-900">
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
            <Card className="h-full border-0 shadow-xl bg-white/70 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl font-bold text-slate-900 flex items-center">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center mr-3">
                    <Settings className="w-4 h-4 text-white" />
                  </div>
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {isAdmin && (
                    <Link href={`/admin/${tournamentId}/divisions`}>
                      <Button variant="outline" className="h-20 w-full p-4 hover:bg-gradient-to-br hover:from-blue-50 hover:to-indigo-50 hover:border-blue-200 transition-all duration-200 group">
                        <div className="flex flex-col items-center space-y-2 w-full">
                          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                            <Settings className="h-4 w-4 text-white" />
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-base text-slate-900">Divisions</div>
                          </div>
                        </div>
                      </Button>
                    </Link>
                  )}
                  
                  <Link href={`/admin/${tournamentId}/players`}>
                    <Button variant="outline" className="h-20 w-full p-4 hover:bg-gradient-to-br hover:from-emerald-50 hover:to-green-50 hover:border-emerald-200 transition-all duration-200 group">
                      <div className="flex flex-col items-center space-y-2 w-full">
                        <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                          <Users className="h-4 w-4 text-white" />
                        </div>
                        <div className="text-center">
                          <div className="font-semibold text-base text-slate-900">Player Management</div>
                        </div>
                      </div>
                    </Button>
                  </Link>
                  
                  <Link href={`/admin/${tournamentId}/stages`}>
                    <Button variant="outline" className="h-20 w-full p-4 hover:bg-gradient-to-br hover:from-amber-50 hover:to-orange-50 hover:border-amber-200 transition-all duration-200 group">
                      <div className="flex flex-col items-center space-y-2 w-full">
                        <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                          <FileText className="h-4 w-4 text-white" />
                        </div>
                        <div className="text-center">
                          <div className="font-semibold text-base text-slate-900">Score Input</div>
                        </div>
                      </div>
                    </Button>
                  </Link>
                  
                  <Link href={`/admin/${tournamentId}/dashboard`}>
                    <Button variant="outline" className="h-20 w-full p-4 hover:bg-gradient-to-br hover:from-purple-50 hover:to-pink-50 hover:border-purple-200 transition-all duration-200 group">
                      <div className="flex flex-col items-center space-y-2 w-full">
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                          <BarChart3 className="h-4 w-4 text-white" />
                        </div>
                        <div className="text-center">
                          <div className="font-semibold text-base text-slate-900">Dashboard</div>
                        </div>
                      </div>
                    </Button>
                  </Link>
                  
                  {isOwner && (
                    <Link href={`/admin/${tournamentId}/access`} className="relative">
                      <Button variant="outline" className="h-20 w-full p-4 hover:bg-gradient-to-br hover:from-gray-50 hover:to-slate-50 hover:border-gray-200 transition-all duration-200 group">
                        <div className="flex flex-col items-center space-y-2 w-full">
                          <div className="w-8 h-8 bg-gradient-to-br from-gray-500 to-gray-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                            <Shield className="h-4 w-4 text-white" />
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-base text-slate-900">Access Control</div>
                          </div>
                        </div>
                      </Button>
                      {pendingRequestsCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow-md">
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
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4 border border-slate-200">
            <div className="flex items-center mb-6">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mr-3">
                <Settings className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Create Division</h2>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Division Name *
                </label>
                <input
                  type="text"
                  value={divisionForm.name}
                  onChange={(e) => setDivisionForm({ ...divisionForm, name: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="e.g., Men's 2v2"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Team Type
                </label>
                <select
                  value={divisionForm.teamKind}
                  onChange={(e) => setDivisionForm({ ...divisionForm, teamKind: e.target.value as any })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                >
                  <option value="SINGLES_1v1">Singles (1v1)</option>
                  <option value="DOUBLES_2v2">Doubles (2v2)</option>
                  <option value="SQUAD_4v4">Squad (4v4)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Pairing Mode
                </label>
                <select
                  value={divisionForm.pairingMode}
                  onChange={(e) => setDivisionForm({ ...divisionForm, pairingMode: e.target.value as any })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                >
                  <option value="FIXED">Fixed Teams</option>
                  <option value="MIX_AND_MATCH">Mix and Match</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Number of Pools
                </label>
                <input
                  type="number"
                  min="0"
                  value={divisionForm.poolCount}
                  onChange={(e) => setDivisionForm({ ...divisionForm, poolCount: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Max Teams (optional)
                </label>
                <input
                  type="number"
                  min="1"
                  value={divisionForm.maxTeams || ''}
                  onChange={(e) => setDivisionForm({ ...divisionForm, maxTeams: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="No limit"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-8">
              <Button
                variant="outline"
                onClick={() => setShowCreateDivision(false)}
                disabled={createDivision.isPending}
                className="px-6 py-2.5 rounded-xl border-slate-300 hover:bg-slate-50 transition-all duration-200"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateDivision}
                disabled={createDivision.isPending}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
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
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-2xl mx-4 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center mb-6">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mr-3">
                <Edit className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Edit Tournament</h2>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Tournament Name *
                </label>
                <input
                  type="text"
                  name="title"
                  value={tournamentForm.title}
                  onChange={handleTournamentChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="e.g., Pickleball Championship 2024"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Description
                </label>
                <textarea
                  name="description"
                  value={tournamentForm.description}
                  onChange={handleTournamentChange}
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="Tournament description, rules, features..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Venue
                </label>
                <input
                  type="text"
                  name="venueName"
                  value={tournamentForm.venueName}
                  onChange={handleTournamentChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="Sports complex name"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    name="startDate"
                    value={tournamentForm.startDate}
                    onChange={handleTournamentChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    End Date *
                  </label>
                  <input
                    type="date"
                    name="endDate"
                    value={tournamentForm.endDate}
                    onChange={handleTournamentChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Entry Fee ($)
                </label>
                <input
                  type="number"
                  name="entryFee"
                  value={tournamentForm.entryFee}
                  onChange={handleTournamentChange}
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
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
                <label className="ml-2 block text-sm text-gray-700">
                  Enable public results board
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-8">
              <Button
                variant="outline"
                onClick={() => setShowEditTournament(false)}
                disabled={updateTournament.isPending}
                className="px-6 py-2.5 rounded-xl border-slate-300 hover:bg-slate-50 transition-all duration-200"
              >
                Cancel
              </Button>
              <Button
                onClick={handleTournamentSubmit}
                disabled={updateTournament.isPending}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
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