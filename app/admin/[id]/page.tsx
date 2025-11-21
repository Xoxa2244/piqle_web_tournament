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
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(120,119,198,0.1),transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(219,39,119,0.1),transparent_50%)]"></div>
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-200 border-t-indigo-600 mx-auto mb-4"></div>
          <div className="text-lg font-semibold text-indigo-900 bg-white/60 backdrop-blur-sm px-6 py-3 rounded-2xl shadow-lg">Loading tournament...</div>
        </div>
      </div>
    )
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(120,119,198,0.1),transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(219,39,119,0.1),transparent_50%)]"></div>
        <div className="text-center relative z-10">
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 max-w-md mx-4 border border-white/20">
            <div className="w-16 h-16 bg-gradient-to-br from-red-400 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-red-600 to-pink-600 bg-clip-text text-transparent mb-2">Tournament not found</h1>
            <p className="text-gray-600 mb-6">The tournament may have been deleted or you don&apos;t have access</p>
            <Link href="/admin" className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl font-semibold">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to tournaments
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-indigo-200/30 to-purple-200/30 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-br from-pink-200/30 to-rose-200/30 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-blue-200/20 to-cyan-200/20 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Tournament Information - Left Column (60%) */}
          <div className="lg:col-span-2">
            <Card className="h-full border-0 shadow-2xl bg-white/70 backdrop-blur-xl relative overflow-hidden group hover:shadow-3xl transition-all duration-500">
              {/* Decorative gradient overlay */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-400/10 to-purple-400/10 rounded-full blur-3xl -mr-32 -mt-32 group-hover:scale-150 transition-transform duration-700"></div>
              
              <CardHeader className="pb-4 relative z-10">
                <CardTitle className="text-2xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent flex items-center">
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center mr-3 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <Calendar className="w-5 h-5 text-white" />
                  </div>
                  Tournament Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 relative z-10">
                {/* Tournament Description */}
                <div className="bg-gradient-to-br from-indigo-50/80 via-purple-50/80 to-pink-50/80 backdrop-blur-sm rounded-2xl p-5 border border-indigo-100/50 shadow-inner relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                  <div className="h-24 overflow-y-auto custom-scrollbar">
                    {tournament.description ? (
                      <div 
                        className="text-base font-medium text-gray-800 prose prose-sm max-w-none leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: formatDescription(tournament.description) }}
                      />
                    ) : (
                      <p className="text-base font-medium text-gray-400 italic">
                        No description provided
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="group relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/10 to-teal-400/10 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
                    <div className="relative bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-emerald-200/50 shadow-lg group-hover:shadow-xl group-hover:scale-[1.02] transition-all duration-300">
                      <label className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-3 block">Start Date</label>
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-md group-hover:rotate-12 transition-transform duration-300">
                          <Calendar className="w-5 h-5 text-white" />
                        </div>
                        <p className="text-base font-bold text-gray-800">
                          {new Date(tournament.startDate).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="group relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-rose-400/10 to-pink-400/10 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
                    <div className="relative bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-rose-200/50 shadow-lg group-hover:shadow-xl group-hover:scale-[1.02] transition-all duration-300">
                      <label className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-3 block">End Date</label>
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-rose-500 to-pink-600 rounded-xl flex items-center justify-center shadow-md group-hover:rotate-12 transition-transform duration-300">
                          <Calendar className="w-5 h-5 text-white" />
                        </div>
                        <p className="text-base font-bold text-gray-800">
                          {new Date(tournament.endDate).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="group relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-400/10 to-orange-400/10 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
                    <div className="relative bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-amber-200/50 shadow-lg group-hover:shadow-xl group-hover:scale-[1.02] transition-all duration-300">
                      <label className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-3 block">Venue</label>
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-md group-hover:rotate-12 transition-transform duration-300">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                        <p className="text-base font-bold text-gray-800">
                          {tournament.venueName || '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="group relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-green-400/10 to-emerald-400/10 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
                    <div className="relative bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-green-200/50 shadow-lg group-hover:shadow-xl group-hover:scale-[1.02] transition-all duration-300">
                      <label className="text-xs font-bold text-green-600 uppercase tracking-wider mb-3 block">Entry Fee</label>
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-md group-hover:rotate-12 transition-transform duration-300">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                          </svg>
                        </div>
                        <p className="text-base font-bold text-gray-800">
                          {tournament.entryFee ? `$${tournament.entryFee}` : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions - Right Column (40%) */}
          <div className="lg:col-span-1">
            <Card className="h-full border-0 shadow-2xl bg-white/70 backdrop-blur-xl relative overflow-hidden group hover:shadow-3xl transition-all duration-500">
              {/* Decorative gradient overlay */}
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-purple-400/10 to-pink-400/10 rounded-full blur-3xl -ml-32 -mb-32 group-hover:scale-150 transition-transform duration-700"></div>
              
              <CardHeader className="pb-4 relative z-10">
                <CardTitle className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 bg-clip-text text-transparent flex items-center">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center mr-3 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <Settings className="w-5 h-5 text-white" />
                  </div>
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {isAdmin && (
                    <Link href={`/admin/${tournamentId}/divisions`} className="group/action">
                      <div className="relative h-24 w-full">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/20 to-indigo-400/20 rounded-2xl blur-xl group-hover/action:blur-2xl transition-all duration-300"></div>
                        <Button variant="outline" className="relative h-full w-full p-4 bg-white/60 backdrop-blur-sm border-blue-200/50 hover:border-blue-300 hover:bg-white/80 transition-all duration-300 rounded-2xl shadow-lg group-hover/action:shadow-xl group-hover/action:scale-[1.02] border-2">
                          <div className="flex flex-col items-center space-y-2 w-full">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md group-hover/action:rotate-12 group-hover/action:scale-110 transition-all duration-300">
                              <Settings className="h-5 w-5 text-white" />
                            </div>
                            <div className="text-center">
                              <div className="font-bold text-sm text-gray-800 group-hover/action:text-blue-600 transition-colors">Divisions</div>
                            </div>
                          </div>
                        </Button>
                      </div>
                    </Link>
                  )}
                  
                  <Link href={`/admin/${tournamentId}/players`} className="group/action">
                    <div className="relative h-24 w-full">
                      <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/20 to-teal-400/20 rounded-2xl blur-xl group-hover/action:blur-2xl transition-all duration-300"></div>
                      <Button variant="outline" className="relative h-full w-full p-4 bg-white/60 backdrop-blur-sm border-emerald-200/50 hover:border-emerald-300 hover:bg-white/80 transition-all duration-300 rounded-2xl shadow-lg group-hover/action:shadow-xl group-hover/action:scale-[1.02] border-2">
                        <div className="flex flex-col items-center space-y-2 w-full">
                          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-md group-hover/action:rotate-12 group-hover/action:scale-110 transition-all duration-300">
                            <Users className="h-5 w-5 text-white" />
                          </div>
                          <div className="text-center">
                            <div className="font-bold text-sm text-gray-800 group-hover/action:text-emerald-600 transition-colors">Players</div>
                          </div>
                        </div>
                      </Button>
                    </div>
                  </Link>
                  
                  <Link href={`/admin/${tournamentId}/stages`} className="group/action">
                    <div className="relative h-24 w-full">
                      <div className="absolute inset-0 bg-gradient-to-br from-amber-400/20 to-orange-400/20 rounded-2xl blur-xl group-hover/action:blur-2xl transition-all duration-300"></div>
                      <Button variant="outline" className="relative h-full w-full p-4 bg-white/60 backdrop-blur-sm border-amber-200/50 hover:border-amber-300 hover:bg-white/80 transition-all duration-300 rounded-2xl shadow-lg group-hover/action:shadow-xl group-hover/action:scale-[1.02] border-2">
                        <div className="flex flex-col items-center space-y-2 w-full">
                          <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-md group-hover/action:rotate-12 group-hover/action:scale-110 transition-all duration-300">
                            <FileText className="h-5 w-5 text-white" />
                          </div>
                          <div className="text-center">
                            <div className="font-bold text-sm text-gray-800 group-hover/action:text-amber-600 transition-colors">Score Input</div>
                          </div>
                        </div>
                      </Button>
                    </div>
                  </Link>
                  
                  <Link href={`/admin/${tournamentId}/dashboard`} className="group/action">
                    <div className="relative h-24 w-full">
                      <div className="absolute inset-0 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-2xl blur-xl group-hover/action:blur-2xl transition-all duration-300"></div>
                      <Button variant="outline" className="relative h-full w-full p-4 bg-white/60 backdrop-blur-sm border-purple-200/50 hover:border-purple-300 hover:bg-white/80 transition-all duration-300 rounded-2xl shadow-lg group-hover/action:shadow-xl group-hover/action:scale-[1.02] border-2">
                        <div className="flex flex-col items-center space-y-2 w-full">
                          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-md group-hover/action:rotate-12 group-hover/action:scale-110 transition-all duration-300">
                            <BarChart3 className="h-5 w-5 text-white" />
                          </div>
                          <div className="text-center">
                            <div className="font-bold text-sm text-gray-800 group-hover/action:text-purple-600 transition-colors">Dashboard</div>
                          </div>
                        </div>
                      </Button>
                    </div>
                  </Link>
                  
                  {isOwner && (
                    <Link href={`/admin/${tournamentId}/access`} className="relative group/action">
                      <div className="relative h-24 w-full">
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-400/20 to-slate-400/20 rounded-2xl blur-xl group-hover/action:blur-2xl transition-all duration-300"></div>
                        <Button variant="outline" className="relative h-full w-full p-4 bg-white/60 backdrop-blur-sm border-gray-200/50 hover:border-gray-300 hover:bg-white/80 transition-all duration-300 rounded-2xl shadow-lg group-hover/action:shadow-xl group-hover/action:scale-[1.02] border-2">
                          <div className="flex flex-col items-center space-y-2 w-full">
                            <div className="w-10 h-10 bg-gradient-to-br from-gray-500 to-slate-600 rounded-xl flex items-center justify-center shadow-md group-hover/action:rotate-12 group-hover/action:scale-110 transition-all duration-300">
                              <Shield className="h-5 w-5 text-white" />
                            </div>
                            <div className="text-center">
                              <div className="font-bold text-sm text-gray-800 group-hover/action:text-gray-600 transition-colors">Access</div>
                            </div>
                          </div>
                        </Button>
                      </div>
                      {pendingRequestsCount > 0 && (
                        <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-xs font-bold text-white shadow-lg animate-pulse z-20 border-2 border-white">
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-8 w-full max-w-md mx-4 border border-white/20 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-200/20 to-purple-200/20 rounded-full blur-3xl -mr-16 -mt-16"></div>
            <div className="flex items-center mb-6 relative z-10">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center mr-3 shadow-lg">
                <Settings className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Create Division</h2>
            </div>
            
            <div className="space-y-5 relative z-10">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Division Name *
                </label>
                <input
                  type="text"
                  value={divisionForm.name}
                  onChange={(e) => setDivisionForm({ ...divisionForm, name: e.target.value })}
                  className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                  placeholder="e.g., Men's 2v2"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Team Type
                </label>
                <select
                  value={divisionForm.teamKind}
                  onChange={(e) => setDivisionForm({ ...divisionForm, teamKind: e.target.value as any })}
                  className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                >
                  <option value="SINGLES_1v1">Singles (1v1)</option>
                  <option value="DOUBLES_2v2">Doubles (2v2)</option>
                  <option value="SQUAD_4v4">Squad (4v4)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Pairing Mode
                </label>
                <select
                  value={divisionForm.pairingMode}
                  onChange={(e) => setDivisionForm({ ...divisionForm, pairingMode: e.target.value as any })}
                  className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                >
                  <option value="FIXED">Fixed Teams</option>
                  <option value="MIX_AND_MATCH">Mix and Match</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Number of Pools
                </label>
                <input
                  type="number"
                  min="0"
                  value={divisionForm.poolCount}
                  onChange={(e) => setDivisionForm({ ...divisionForm, poolCount: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Max Teams (optional)
                </label>
                <input
                  type="number"
                  min="1"
                  value={divisionForm.maxTeams || ''}
                  onChange={(e) => setDivisionForm({ ...divisionForm, maxTeams: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                  placeholder="No limit"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-8 relative z-10">
              <Button
                variant="outline"
                onClick={() => setShowCreateDivision(false)}
                disabled={createDivision.isPending}
                className="px-6 py-3 text-base rounded-xl border-2 border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-semibold"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateDivision}
                disabled={createDivision.isPending}
                className="px-6 py-3 text-base bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl font-semibold"
              >
                {createDivision.isPending ? 'Creating...' : 'Create Division'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Tournament Modal */}
      {showEditTournament && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-8 w-full max-w-2xl mx-4 border border-white/20 max-h-[90vh] overflow-y-auto custom-scrollbar relative">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
            <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-indigo-200/20 to-purple-200/20 rounded-full blur-3xl -mr-20 -mt-20"></div>
            <div className="flex items-center mb-6 relative z-10">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center mr-3 shadow-lg">
                <Edit className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Edit Tournament</h2>
            </div>
            
            <div className="space-y-5 relative z-10">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Tournament Name *
                </label>
                <input
                  type="text"
                  name="title"
                  value={tournamentForm.title}
                  onChange={handleTournamentChange}
                  className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                  placeholder="e.g., Pickleball Championship 2024"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  name="description"
                  value={tournamentForm.description}
                  onChange={handleTournamentChange}
                  rows={3}
                  className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm resize-none"
                  placeholder="Tournament description, rules, features..."
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Venue
                </label>
                <input
                  type="text"
                  name="venueName"
                  value={tournamentForm.venueName}
                  onChange={handleTournamentChange}
                  className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                  placeholder="Sports complex name"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    name="startDate"
                    value={tournamentForm.startDate}
                    onChange={handleTournamentChange}
                    className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    End Date *
                  </label>
                  <input
                    type="date"
                    name="endDate"
                    value={tournamentForm.endDate}
                    onChange={handleTournamentChange}
                    className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Entry Fee ($)
                </label>
                <input
                  type="number"
                  name="entryFee"
                  value={tournamentForm.entryFee}
                  onChange={handleTournamentChange}
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                  placeholder="0.00"
                />
              </div>

              <div className="flex items-center p-4 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 rounded-xl border border-indigo-100">
                <input
                  type="checkbox"
                  name="isPublicBoardEnabled"
                  checked={tournamentForm.isPublicBoardEnabled}
                  onChange={handleTournamentChange}
                  className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
                />
                <label className="ml-3 block text-sm font-semibold text-gray-700 cursor-pointer">
                  Enable public results board
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-8 relative z-10">
              <Button
                variant="outline"
                onClick={() => setShowEditTournament(false)}
                disabled={updateTournament.isPending}
                className="px-6 py-3 text-base rounded-xl border-2 border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-semibold"
              >
                Cancel
              </Button>
              <Button
                onClick={handleTournamentSubmit}
                disabled={updateTournament.isPending}
                className="px-6 py-3 text-base bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl font-semibold"
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