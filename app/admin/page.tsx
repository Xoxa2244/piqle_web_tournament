'use client'

import { trpc } from '@/lib/trpc'
import { formatDescription } from '@/lib/formatDescription'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Image from 'next/image'
import { Eye, User as UserIcon, Calendar, Users, Trophy, Trash2 } from 'lucide-react'
import ShareButton from '@/components/ShareButton'

// Status helpers (same logic as main page)
function getTournamentStatus(tournament: { startDate: Date | string; endDate: Date | string }): 'past' | 'upcoming' | 'in_progress' {
  const now = new Date()
  const start = new Date(tournament.startDate)
  const end = new Date(tournament.endDate)
  const endWithGrace = new Date(end)
  endWithGrace.setHours(endWithGrace.getHours() + 12)
  const nextDay = new Date(now)
  nextDay.setDate(nextDay.getDate() + 1)
  nextDay.setHours(0, 0, 0, 0)
  if (endWithGrace < nextDay) return 'past'
  if (start > now) return 'upcoming'
  return 'in_progress'
}
function getTournamentStatusLabel(status: 'past' | 'upcoming' | 'in_progress') {
  switch (status) {
    case 'past': return 'Past'
    case 'upcoming': return 'Upcoming'
    case 'in_progress': return 'In progress'
  }
}
function getTournamentStatusBadgeClass(status: 'past' | 'upcoming' | 'in_progress') {
  switch (status) {
    case 'past': return 'bg-gray-100 text-gray-700'
    case 'upcoming': return 'bg-blue-50 text-blue-700'
    case 'in_progress': return 'bg-green-50 text-green-700'
  }
}

function TournamentImagePlaceholder() {
  return (
    <div className="w-11 h-11 flex-shrink-0 rounded-lg bg-gray-200 flex items-center justify-center">
      <Trophy className="w-5 h-5 text-gray-400" />
    </div>
  )
}

export default function AdminPage() {
  const { data: tournaments, isLoading, refetch } = trpc.tournament.list.useQuery()
  const deleteTournament = trpc.tournament.delete.useMutation({
    onSuccess: () => {
      refetch()
    }
  })
  
  const [deleteModal, setDeleteModal] = useState<{ id: string; title: string } | null>(null)
  const [deleteTypeConfirm, setDeleteTypeConfirm] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [selectedDescription, setSelectedDescription] = useState<{title: string, description: string} | null>(null)
  const [baseUrl, setBaseUrl] = useState<string>('')

  // Set base URL on client side only to avoid hydration mismatch
  useEffect(() => {
    setBaseUrl(window.location.origin)
  }, [])

  const handleDeleteClick = (tournamentId: string, tournamentTitle: string) => {
    setDeleteModal({ id: tournamentId, title: tournamentTitle })
    setDeleteTypeConfirm('')
  }

  const handleDeleteConfirm = () => {
    if (!deleteModal || deleteTypeConfirm !== 'DELETE') return
    setDeleteConfirmId(deleteModal.id)
    deleteTournament.mutate(
      { id: deleteModal.id },
      {
        onSettled: () => {
          setDeleteConfirmId(null)
          setDeleteModal(null)
          setDeleteTypeConfirm('')
        },
      }
    )
  }

  const closeDeleteModal = () => {
    if (!deleteTournament.isPending) {
      setDeleteModal(null)
      setDeleteTypeConfirm('')
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
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Tournament Management</h1>
      </div>

      {tournaments && tournaments.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {(tournaments as any[]).map((tournament: any) => (
            <div key={tournament.id} className="bg-white rounded-lg shadow-md p-6 relative">
              {/* Top right: Share + Delete (icon only) */}
              <div className="absolute top-4 right-4 flex items-center gap-1">
                {tournament.isPublicBoardEnabled && baseUrl && (
                  <ShareButton
                    url={`${baseUrl}/scoreboard/${tournament.id}`}
                    title={tournament.title}
                    iconOnly
                    size="sm"
                    variant="ghost"
                    className="text-gray-500 hover:text-gray-700"
                  />
                )}
                {tournament.isOwner && (
                  <button
                    onClick={() => handleDeleteClick(tournament.id, tournament.title)}
                    disabled={deleteConfirmId === tournament.id}
                    className="p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                    title="Delete tournament"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Title + image row */}
              <div className="flex items-start gap-3 pr-16">
                {tournament.image ? (
                  <div className="w-11 h-11 flex-shrink-0 relative overflow-hidden rounded-lg">
                    <Image
                      src={tournament.image}
                      alt={tournament.title}
                      width={44}
                      height={44}
                      className="object-cover w-full h-full"
                    />
                  </div>
                ) : (
                  <TournamentImagePlaceholder />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-semibold">{tournament.title}</h3>
                </div>
              </div>

              {/* Status badge */}
              <div className="mt-2">
                <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getTournamentStatusBadgeClass(getTournamentStatus(tournament))}`}>
                  {getTournamentStatusLabel(getTournamentStatus(tournament))}
                </span>
              </div>

              {tournament.description && (
                <div className="mt-3 mb-2">
                  <div
                    className="text-gray-600 text-sm break-words line-clamp-3"
                    dangerouslySetInnerHTML={{ __html: formatDescription(tournament.description) }}
                  />
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

              {/* Start–End one line + divisions + entry fee with icons */}
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-2 flex-shrink-0 text-gray-500" />
                  <span>{new Date(tournament.startDate).toLocaleDateString()} – {new Date(tournament.endDate).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center">
                  <Users className="h-4 w-4 mr-2 flex-shrink-0 text-gray-500" />
                  <span>{(tournament.divisions?.length ?? tournament._count?.divisions) || 0} division{((tournament.divisions?.length ?? tournament._count?.divisions) || 0) !== 1 ? 's' : ''}</span>
                </div>
                {tournament.entryFee && parseFloat(tournament.entryFee) > 0 && (
                  <div className="flex items-center">
                    <Trophy className="h-4 w-4 mr-2 flex-shrink-0 text-gray-500" />
                    <span>Entry Fee: ${tournament.entryFee}</span>
                  </div>
                )}
              </div>

              {/* Tournament Director */}
              {tournament.user && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500">Tournament Director:</span>
                    {(tournament.user as { image?: string | null }).image ? (
                      <Link
                        href={`/profile/${tournament.user.id}`}
                        className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 transition-colors group"
                      >
                        <Image
                          src={(tournament.user as { image?: string | null }).image!}
                          alt={tournament.user.name || tournament.user.email || 'TD'}
                          width={20}
                          height={20}
                          className="rounded-full object-cover"
                        />
                        <span className="text-xs font-medium group-hover:underline">
                          {tournament.user.name || tournament.user.email}
                        </span>
                      </Link>
                    ) : (
                      <Link
                        href={`/profile/${tournament.user.id}`}
                        className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 transition-colors group"
                      >
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center border border-gray-300">
                          <UserIcon className="h-3 w-3 text-gray-500" />
                        </div>
                        <span className="text-xs font-medium group-hover:underline">
                          {tournament.user.name || tournament.user.email}
                        </span>
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {/* Manage (black) + View Board (gray) */}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/admin/${tournament.id}`}
                  className="bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium py-2 px-3 rounded transition-colors"
                >
                  Manage
                </Link>
                {tournament.isPublicBoardEnabled && (
                  <Link
                    href={`/t/${tournament.publicSlug}`}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2 px-3 rounded transition-colors border border-gray-300"
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

      {/* Delete Tournament Modal */}
      {deleteModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={closeDeleteModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-gray-900 mb-2">Delete tournament</h2>
            <p className="text-gray-600 text-sm mb-4">
              Are you sure you want to delete &quot;{deleteModal.title}&quot;? This action cannot be undone and will permanently remove:
            </p>
            <ul className="text-sm text-gray-600 list-disc list-inside mb-4 space-y-1">
              <li>All tournament data</li>
              <li>All divisions and teams</li>
              <li>All matches and results</li>
              <li>All player information</li>
            </ul>
            <p className="text-sm text-gray-600 mb-2">Type <strong>DELETE</strong> to confirm:</p>
            <Input
              type="text"
              value={deleteTypeConfirm}
              onChange={(e) => setDeleteTypeConfirm(e.target.value)}
              placeholder="DELETE"
              className="mb-6 font-mono"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={closeDeleteModal} disabled={deleteTournament.isPending}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleteTypeConfirm !== 'DELETE' || deleteTournament.isPending}
              >
                {deleteTournament.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Description Modal */}
      {selectedDescription && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedDescription(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">{selectedDescription.title}</h2>
              <p className="text-gray-600 mt-1">Tournament Description</p>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div 
                className="text-gray-700 whitespace-pre-wrap break-words prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: formatDescription(selectedDescription.description) }}
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
