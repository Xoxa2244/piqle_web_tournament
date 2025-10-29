'use client'

import { trpc } from '@/lib/trpc'
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

  const truncateText = (text: string | null, maxLines: number = 3) => {
    if (!text) return ''
    const lines = text.split('\n')
    if (lines.length <= maxLines) return text
    return lines.slice(0, maxLines).join('\n')
  }

  const formatText = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
      .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
      .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm">$1</code>') // Code
      .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline">$1</a>') // URLs
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline">$1</a>') // Markdown links
      .replace(/\n/g, '<br>') // Line breaks
  }

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
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading tournaments...</div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Tournaments</h1>
        <div className="flex gap-3">
          <Button
            onClick={() => {
              setShowSearch(!showSearch)
              setSearchQuery('')
            }}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Search className="h-4 w-4" />
            Find Tournament
          </Button>
          <Link
            href="/admin/new"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            Create Tournament
          </Link>
        </div>
      </div>

      {/* Search Section */}
      {showSearch && (
        <div className="mb-8 p-6 bg-white rounded-lg shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Find Tournament</h2>
            <Button
              onClick={() => {
                setShowSearch(false)
                setSearchQuery('')
              }}
              variant="ghost"
              size="sm"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Input
            placeholder="Search tournaments by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mb-4"
          />
          {searchQuery.length >= 2 && searchResults && (
            <div className="space-y-3">
              {searchResults.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No tournaments found</div>
              ) : (
                searchResults.map((tournament) => (
                  <div key={tournament.id} className="border rounded-lg p-4 flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-2">{tournament.title}</h3>
                      {tournament.description && (
                        <p className="text-sm text-gray-600 mb-2 line-clamp-2">{tournament.description}</p>
                      )}
                      <div className="space-y-1 text-sm text-gray-500">
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
                      className="ml-4"
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
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tournaments.map((tournament) => (
            <div key={tournament.id} className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-xl font-semibold mb-2">{tournament.title}</h3>
              {tournament.description && (
                <div className="mb-4">
                  <div className="text-gray-600 text-sm whitespace-pre-wrap break-words">
                    {truncateText(tournament.description)}
                  </div>
                  {tournament.description && tournament.description.split('\n').length > 3 && (
                    <button
                      onClick={() => setSelectedDescription({title: tournament.title, description: tournament.description!})}
                      className="mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center"
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      Show full description
                    </button>
                  )}
                </div>
              )}
              
              <div className="space-y-2 text-sm text-gray-500">
                <div>Start: {new Date(tournament.startDate).toLocaleDateString()}</div>
                <div>End: {new Date(tournament.endDate).toLocaleDateString()}</div>
                <div>Divisions: {tournament._count.divisions}</div>
                {tournament.entryFee && (
                  <div>Entry Fee: ${tournament.entryFee}</div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
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
                {tournament.isOwner && (
                  <button
                    onClick={() => handleDeleteClick(tournament.id, tournament.title)}
                    disabled={deleteConfirmId === tournament.id}
                    className="bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium py-2 px-3 rounded transition-colors"
                  >
                    {deleteConfirmId === tournament.id ? 'Deleting...' : 'Delete'}
                  </button>
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

      {/* Description Modal */}
      {selectedDescription && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">{selectedDescription.title}</h2>
              <p className="text-gray-600 mt-1">Tournament Description</p>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div 
                className="text-gray-700 whitespace-pre-wrap break-words prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: formatText(selectedDescription.description) }}
              />
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end">
              <Button
                onClick={() => setSelectedDescription(null)}
                variant="outline"
                className="px-6"
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
