'use client'

import { trpc } from '@/lib/trpc'
import { formatDescription } from '@/lib/formatDescription'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Eye, Search, X } from 'lucide-react'

export default function AdminPage() {
  const { data: tournaments, isLoading, refetch } = trpc.tournament.list.useQuery()
  const deleteTournament = trpc.tournament.delete.useMutation({
    onSuccess: () => {
      refetch()
    }
  })
  
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [selectedDescription, setSelectedDescription] = useState<{title: string, description: string} | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Search tournaments
  const { data: searchResults } = trpc.tournamentAccess.searchTournaments.useQuery(
    { query: searchQuery },
    { enabled: showSearch && searchQuery.length >= 2 }
  )
  
  // Request access mutation
  const requestAccessMutation = trpc.tournamentAccess.requestAccess.useMutation({
    onSuccess: () => {
      alert('Access request sent successfully!')
      setSearchQuery('')
    },
    onError: (error) => {
      alert(`Error: ${error.message}`)
    },
  })

  const handleDeleteClick = (tournamentId: string, tournamentTitle: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete the tournament "${tournamentTitle}"?\n\n` +
      `This action cannot be undone and will permanently remove:\n` +
      `• All tournament data\n` +
      `• All divisions and teams\n` +
      `• All matches and results\n` +
      `• All player information\n\n` +
      `Type "DELETE" to confirm:`
    )
    
    if (confirmed) {
      const userInput = window.prompt('Type "DELETE" to confirm:')
      if (userInput === 'DELETE') {
        setDeleteConfirmId(tournamentId)
        deleteTournament.mutate({ id: tournamentId })
      }
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50/30 flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto mb-3"></div>
          <div className="text-sm text-slate-600">Loading tournaments...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50/30">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Tournaments</h1>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setShowSearch(!showSearch)
              setSearchQuery('')
            }}
            variant="outline"
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 border-slate-300 hover:bg-slate-50"
          >
            <Search className="h-3.5 w-3.5" />
            Find Tournament
          </Button>
          <Link
            href="/admin/new"
            className="bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white font-semibold text-sm py-2 px-4 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
          >
            Create Tournament
          </Link>
        </div>
      </div>

      {/* Search Section */}
      {showSearch && (
        <div className="mb-6 p-5 bg-gradient-to-br from-amber-50/80 to-orange-50/60 rounded-xl border border-orange-200/50 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-800">Find Tournament</h2>
            <Button
              onClick={() => {
                setShowSearch(false)
                setSearchQuery('')
              }}
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Input
            placeholder="Search tournaments by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mb-3 text-sm"
          />
          {searchQuery.length >= 2 && searchResults && (
            <div className="space-y-2.5">
              {searchResults.length === 0 ? (
                <div className="text-center py-6 text-sm text-slate-500">No tournaments found</div>
              ) : (
                searchResults.map((tournament) => (
                  <div key={tournament.id} className="bg-white/70 border border-slate-200/60 rounded-lg p-3.5 flex justify-between items-start hover:border-orange-300/60 hover:shadow-sm transition-all">
                    <div className="flex-1">
                      <h3 className="text-base font-semibold mb-1.5 text-slate-800">{tournament.title}</h3>
                      {tournament.description && (
                        <div
                          className="text-xs text-slate-600 mb-2 line-clamp-2 break-words"
                          dangerouslySetInnerHTML={{ __html: formatDescription(tournament.description) }}
                        />
                      )}
                      <div className="space-y-0.5 text-xs text-slate-500">
                        <div>Start: {new Date(tournament.startDate).toLocaleDateString()}</div>
                        <div>End: {new Date(tournament.endDate).toLocaleDateString()}</div>
                        {tournament.venueName && <div>Venue: {tournament.venueName}</div>}
                        {tournament.entryFee && <div>Entry Fee: ${tournament.entryFee}</div>}
                        <div>Organizer: {tournament.user.name || tournament.user.email}</div>
                      </div>
                    </div>
                    <Button
                      onClick={() => {
                        requestAccessMutation.mutate({ tournamentId: tournament.id })
                      }}
                      disabled={requestAccessMutation.isLoading}
                      className="ml-3 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white text-xs font-medium py-1.5 px-3 rounded-lg shadow-sm hover:shadow transition-all"
                    >
                      {requestAccessMutation.isLoading ? 'Requesting...' : 'Request Access'}
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {tournaments && tournaments.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(tournaments as any[]).map((tournament: any) => (
            <div key={tournament.id} className="bg-gradient-to-br from-amber-50/90 to-orange-50/70 rounded-xl border border-orange-200/50 shadow-sm p-4.5 hover:border-orange-300/70 hover:shadow-md transition-all">
              <h3 className="text-lg font-semibold mb-2 text-slate-800">{tournament.title}</h3>
              {tournament.description && (
                <div className="mb-3">
                  <div
                    className="text-slate-600 text-xs break-words line-clamp-3 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: formatDescription(tournament.description) }}
                  />
                  {tournament.description && tournament.description.split('\n').length > 3 && (
                    <button
                      onClick={() => setSelectedDescription({title: tournament.title, description: tournament.description!})}
                      className="mt-1.5 text-orange-700 hover:text-orange-800 text-xs font-medium flex items-center"
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      Show full description
                    </button>
                  )}
                </div>
              )}
              
              <div className="space-y-1 text-xs text-slate-500 mb-3">
                <div>Start: {new Date(tournament.startDate).toLocaleDateString()}</div>
                <div>End: {new Date(tournament.endDate).toLocaleDateString()}</div>
                <div>Divisions: {tournament._count.divisions}</div>
                {tournament.entryFee && (
                  <div>Entry Fee: ${tournament.entryFee}</div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/admin/${tournament.id}`}
                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-xs font-medium py-1.5 px-3 rounded-lg transition-all duration-200 shadow-sm hover:shadow"
                >
                  Manage
                </Link>
                {tournament.isPublicBoardEnabled && (
                  <Link
                    href={`/t/${tournament.publicSlug}`}
                    className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium py-1.5 px-3 rounded-lg transition-all duration-200 shadow-sm hover:shadow"
                  >
                    View Board
                  </Link>
                )}
                {tournament.isOwner && (
                  <button
                    onClick={() => handleDeleteClick(tournament.id, tournament.title)}
                    disabled={deleteConfirmId === tournament.id}
                    className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-red-400 disabled:to-red-500 text-white text-xs font-medium py-1.5 px-3 rounded-lg transition-all duration-200 shadow-sm hover:shadow"
                  >
                    {deleteConfirmId === tournament.id ? 'Deleting...' : 'Delete'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-10">
          <h3 className="text-base font-medium text-slate-800 mb-1.5">No tournaments yet</h3>
          <p className="text-sm text-slate-600 mb-3">Create your first tournament to get started</p>
          <Link
            href="/admin/new"
            className="bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white font-semibold text-sm py-2 px-4 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md inline-block"
          >
            Create Tournament
          </Link>
        </div>
      )}

      {/* Description Modal */}
      {selectedDescription && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-amber-50/95 to-orange-50/80 rounded-xl border border-orange-200/60 shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-5 border-b border-orange-200/50">
              <h2 className="text-xl font-bold text-slate-800">{selectedDescription.title}</h2>
              <p className="text-slate-600 text-sm mt-0.5">Tournament Description</p>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <div 
                className="text-slate-700 text-sm whitespace-pre-wrap break-words prose prose-sm max-w-none leading-relaxed"
                dangerouslySetInnerHTML={{ __html: formatDescription(selectedDescription.description) }}
              />
            </div>
            <div className="p-5 border-t border-orange-200/50 flex justify-end">
              <Button
                onClick={() => setSelectedDescription(null)}
                variant="outline"
                className="px-4 py-1.5 text-sm border-slate-300 hover:bg-slate-50"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
