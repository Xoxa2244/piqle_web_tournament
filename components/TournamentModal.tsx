'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { trpc } from '@/lib/trpc'
import { formatDescription } from '@/lib/formatDescription'
import { formatUsDateTimeShort } from '@/lib/dateFormat'
import {
  getTournamentStatus,
  getTournamentStatusBadgeClass,
  getTournamentStatusLabel,
} from '@/lib/tournamentStatus'
import { getTournamentTypeLabel } from '@/lib/tournamentType'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import ConfirmModal from '@/components/ConfirmModal'
import {
  Calendar,
  MapPin,
  Users,
  Trophy,
  X,
  User as UserIcon,
  MessageCircle,
  Send,
  MoreVertical,
  Trash2,
  AlertTriangle,
  ClipboardList,
} from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import ComplaintModal from '@/components/ComplaintModal'
import CancelRegistrationModal from '@/components/CancelRegistrationModal'

function TournamentImagePlaceholder({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const [showFallback, setShowFallback] = useState(true)
  const sizeClass = size === 'lg' ? 'w-20 h-20' : 'w-11 h-11'
  const iconSize = size === 'lg' ? 'w-8 h-8' : 'w-5 h-5'
  return (
    <div className={`${sizeClass} flex-shrink-0 rounded-lg bg-gray-200 flex items-center justify-center overflow-hidden relative`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/tournament-placeholder.png"
        alt=""
        className="w-full h-full object-cover"
        onLoad={() => setShowFallback(false)}
        onError={() => setShowFallback(true)}
      />
      {showFallback && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
          <Trophy className={`${iconSize} text-gray-400`} />
        </div>
      )}
    </div>
  )
}

function AvatarImage({
  src,
  alt,
  userId,
  size = 20,
}: {
  src?: string | null
  alt: string
  userId: string
  size?: number
}) {
  const [avatarError, setAvatarError] = useState(false)
  const hasValidAvatar = Boolean(
    src && src.trim() !== '' && (src.startsWith('http') || src.startsWith('data:'))
  )

  if (hasValidAvatar && !avatarError && src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={size}
        height={size}
        className="rounded-full object-cover"
        onError={() => setAvatarError(true)}
      />
    )
  }

  const iconSize = Math.round(size * 0.6)
  return (
    <div
      className="rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center border border-gray-300"
      style={{ width: size, height: size }}
    >
      <UserIcon style={{ width: iconSize, height: iconSize }} className="text-gray-500" />
    </div>
  )
}

function isRegistrationOpen(tournament: {
  registrationStartDate?: Date | string | null
  registrationEndDate?: Date | string | null
  startDate: Date | string
}): boolean {
  const start = tournament.registrationStartDate
    ? new Date(tournament.registrationStartDate)
    : new Date(tournament.startDate)
  const end = tournament.registrationEndDate
    ? new Date(tournament.registrationEndDate)
    : new Date(tournament.startDate)
  const now = new Date()
  return now >= start && now <= end
}

export type TournamentModalProps = {
  tournamentId: string | null
  onClose: () => void
  /** When provided, venue name becomes clickable and calls this (e.g. switch to map tab on home) */
  onVenueClick?: (tournamentId: string) => void
}

export default function TournamentModal({
  tournamentId,
  onClose,
  onVenueClick,
}: TournamentModalProps) {
  const router = useRouter()
  const { data: session } = useSession()
  const { toast } = useToast()

  const [modalTab, setModalTab] = useState<'information' | 'comments' | 'view-results'>('information')
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [openCommentMenu, setOpenCommentMenu] = useState<string | null>(null)
  const [reportCommentModal, setReportCommentModal] = useState<{
    commentId: string
    commentText: string
    authorName: string
    authorEmail: string
  } | null>(null)
  const [showCancelRegistrationModal, setShowCancelRegistrationModal] = useState(false)
  const [leaveWaitlistDivisionId, setLeaveWaitlistDivisionId] = useState<string | null>(null)
  const [commentToDelete, setCommentToDelete] = useState<string | null>(null)

  const { data: _tournamentData, isLoading: tournamentLoading } = trpc.public.getBoardById.useQuery(
    { id: tournamentId! },
    { enabled: !!tournamentId }
  )
  const tournament: any = _tournamentData

  const tournamentIds = tournamentId ? [tournamentId] : []
  const { data: registrationStatuses } = trpc.registration.getMyStatuses.useQuery(
    { tournamentIds },
    { enabled: !!session && tournamentIds.length > 0 }
  )
  const { data: commentCounts } = trpc.comment.getTournamentCommentCounts.useQuery(
    { tournamentIds },
    { enabled: tournamentIds.length > 0 }
  )
  const { data: comments, refetch: refetchComments } = trpc.comment.getTournamentComments.useQuery(
    { tournamentId: tournamentId || '' },
    { enabled: !!tournamentId }
  )
  const { data: myTournamentInvitation } = trpc.tournamentInvitation.getMineByTournament.useQuery(
    { tournamentId: tournamentId || '' },
    { enabled: !!session && !!tournamentId }
  )
  const utils = trpc.useUtils()

  const createComment = trpc.comment.createComment.useMutation({
    onSuccess: () => {
      setCommentText('')
      refetchComments()
      utils.comment.getTournamentCommentCounts.invalidate({ tournamentIds })
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    },
  })

  const deleteComment = trpc.comment.deleteComment.useMutation({
    onSuccess: () => {
      refetchComments()
      utils.comment.getTournamentCommentCounts.invalidate({ tournamentIds })
    },
  })

  const cancelRegistration = trpc.registration.cancelRegistration.useMutation({
    onSuccess: () => {
      utils.registration.getMyStatuses.invalidate({ tournamentIds })
    },
  })

  const leaveWaitlist = trpc.registration.leaveWaitlist.useMutation({
    onSuccess: () => {
      utils.registration.getMyStatuses.invalidate({ tournamentIds })
    },
  })

  const acceptTournamentInvitation = trpc.tournamentInvitation.accept.useMutation({
    onSuccess: (data) => {
      utils.tournamentInvitation.getMineByTournament.invalidate({ tournamentId: data.tournamentId })
      utils.notification.list.invalidate({ limit: 20 })
      router.push(`/tournaments/${data.tournamentId}/register`)
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    },
  })

  const declineTournamentInvitation = trpc.tournamentInvitation.decline.useMutation({
    onSuccess: () => {
      if (tournamentId) {
        utils.tournamentInvitation.getMineByTournament.invalidate({ tournamentId })
      }
      utils.notification.list.invalidate({ limit: 20 })
      toast({ title: 'Invitation declined', description: 'You declined this tournament invitation.' })
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    },
  })

  const handleCommentSubmit = useCallback(() => {
    if (!tournamentId || !commentText.trim()) return
    if (!session) {
      toast({ title: 'Login Required', description: 'Please log in to post comments.', variant: 'default' })
      return
    }
    createComment.mutate({ tournamentId: tournamentId!, text: commentText.trim() })
  }, [tournamentId, commentText, session, createComment, toast])

  const resetModalState = useCallback(() => {
    setModalTab('information')
    setDescriptionExpanded(false)
    setCommentText('')
    setOpenCommentMenu(null)
    setReportCommentModal(null)
  }, [])

  if (!tournamentId) return null

  if (tournamentLoading) {
    return (
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex items-center justify-center min-h-[200px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </div>
    )
  }

  if (!tournament) {
    return (
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Tournament not found</h3>
          <p className="text-sm text-gray-600 mb-4">
            This tournament is unavailable or was removed.
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const divisions = tournament.divisions ?? []
  const entryFeeNum = tournament.entryFee != null ? Number(tournament.entryFee) : 0

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={() => {
          resetModalState()
          onClose()
        }}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {tournament.image ? (
                <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                  <Image
                    src={tournament.image}
                    alt={tournament.title}
                    width={80}
                    height={80}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <TournamentImagePlaceholder size="lg" />
              )}
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{tournament.title}</h2>
                <p className="text-gray-600 mt-1">Tournament Details</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {tournament.user?.id === session?.user?.id && (
                <Link href={`/admin/${tournament.id}`}>
                  <Button className="bg-gray-900 hover:bg-gray-800 text-white">Manage</Button>
                </Link>
              )}
              {(() => {
                const pendingInvitation =
                  myTournamentInvitation?.status === 'PENDING' &&
                  myTournamentInvitation?.tournamentId === tournament.id
                    ? myTournamentInvitation
                    : null

                if (pendingInvitation) {
                  return (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 mr-1">You were invited to this tournament</span>
                      <Button
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={
                          acceptTournamentInvitation.isPending || declineTournamentInvitation.isPending
                        }
                        onClick={(e) => {
                          e.stopPropagation()
                          acceptTournamentInvitation.mutate({ invitationId: pendingInvitation.id })
                        }}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="outline"
                        disabled={
                          acceptTournamentInvitation.isPending || declineTournamentInvitation.isPending
                        }
                        onClick={(e) => {
                          e.stopPropagation()
                          declineTournamentInvitation.mutate({ invitationId: pendingInvitation.id })
                        }}
                      >
                        Decline
                      </Button>
                    </div>
                  )
                }

                const status = registrationStatuses?.[tournament.id]?.status ?? 'none'
                const registrationOpen = isRegistrationOpen(tournament)
                const isActiveUnpaid =
                  status === 'active' &&
                  entryFeeNum > 0 &&
                  !registrationStatuses?.[tournament.id]?.isPaid
                const label =
                  status === 'active'
                    ? 'Cancel Registration'
                    : status === 'waitlisted'
                      ? 'Leave Waitlist'
                      : 'Join Tournament'
                return (
                  <div className="flex flex-wrap gap-2">
                    {isActiveUnpaid && (
                      <Button className="bg-gray-900 hover:bg-gray-800 text-white" asChild>
                        <Link
                          href={`/tournaments/${tournament.id}/register`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Pay Now ${entryFeeNum.toFixed(2)}
                        </Link>
                      </Button>
                    )}
                    <Button
                      className={label === 'Join Tournament' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
                      variant={
                        label === 'Join Tournament' ? undefined : status === 'active' ? 'destructive' : 'default'
                      }
                      disabled={!registrationOpen}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!session) {
                          router.push(
                            `/auth/signin?callbackUrl=${encodeURIComponent(`/tournaments/${tournament.id}/register`)}`
                          )
                          return
                        }
                        if (status === 'active') {
                          setShowCancelRegistrationModal(true)
                          return
                        }
                        if (status === 'waitlisted') {
                          const divisionId = registrationStatuses?.[tournament.id]?.divisionId
                          if (divisionId) setLeaveWaitlistDivisionId(divisionId)
                          return
                        }
                        router.push(`/tournaments/${tournament.id}/register`)
                      }}
                    >
                      {label}
                    </Button>
                  </div>
                )
              })()}
              <button
                type="button"
                onClick={() => {
                  resetModalState()
                  onClose()
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          <div className="border-b border-gray-200 px-6">
            <nav className="flex gap-6" aria-label="Tabs">
              <button
                type="button"
                onClick={() => setModalTab('information')}
                className={`py-4 text-sm font-medium border-b-2 transition-colors ${
                  modalTab === 'information'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Information
              </button>
              <button
                type="button"
                onClick={() => setModalTab('comments')}
                className={`py-4 text-sm font-medium border-b-2 transition-colors ${
                  modalTab === 'comments'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Comments ({commentCounts?.[tournament.id] ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setModalTab('view-results')}
                className={`py-4 text-sm font-medium border-b-2 transition-colors ${
                  modalTab === 'view-results'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Dashboard
              </button>
            </nav>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {modalTab === 'information' && (
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${getTournamentStatusBadgeClass(getTournamentStatus(tournament))}`}
                    >
                      {getTournamentStatusLabel(getTournamentStatus(tournament))}
                    </span>
                    <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200">
                      {getTournamentTypeLabel(tournament.format)}
                    </span>
                  </div>
                  {tournament.description && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
                      <div
                        className={`text-gray-700 whitespace-pre-wrap break-words prose prose-sm max-w-none ${!descriptionExpanded ? 'line-clamp-3' : ''}`}
                        dangerouslySetInnerHTML={{ __html: formatDescription(tournament.description) }}
                      />
                      {(tournament.description.split('\n').length > 3 ||
                        tournament.description.length > 150) && (
                        <button
                          onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                          className="mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center"
                        >
                          {descriptionExpanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Information</h3>
                    <div className="space-y-2">
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="h-4 w-4 mr-2" />
                        <span>
                          {formatUsDateTimeShort(tournament.startDate, { timeZone: tournament.timezone })} -{' '}
                          {formatUsDateTimeShort(tournament.endDate, { timeZone: tournament.timezone })}
                        </span>
                      </div>
                      {(tournament.registrationStartDate || tournament.registrationEndDate) && (
                        <div className="flex items-center text-sm text-gray-600">
                          <ClipboardList className="h-4 w-4 mr-2" />
                          <span>
                            Registration:{' '}
                            {tournament.registrationStartDate
                              ? new Date(tournament.registrationStartDate).toLocaleDateString()
                              : '—'}{' '}
                            –{' '}
                            {tournament.registrationEndDate
                              ? new Date(tournament.registrationEndDate).toLocaleDateString()
                              : '—'}
                          </span>
                        </div>
                      )}
                      {tournament.venueName && (
                        <div
                          role={onVenueClick ? 'button' : undefined}
                          tabIndex={onVenueClick ? 0 : undefined}
                          onClick={
                            onVenueClick
                              ? () => {
                                  onClose()
                                  onVenueClick(tournament.id)
                                }
                              : undefined
                          }
                          onKeyDown={
                            onVenueClick
                              ? (e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    onClose()
                                    onVenueClick(tournament.id)
                                  }
                                }
                              : undefined
                          }
                          className={`flex items-center text-sm ${onVenueClick ? 'cursor-pointer hover:underline' : ''} ${tournament.venueAddress?.trim() ? 'text-blue-600 hover:text-blue-800' : 'text-gray-600 hover:text-blue-600'}`}
                        >
                          <MapPin className="h-4 w-4 mr-2 flex-shrink-0" />
                          <span>{tournament.venueName}</span>
                        </div>
                      )}
                      <div className="flex items-center text-sm text-gray-600">
                        <Users className="h-4 w-4 mr-2" />
                        <span>
                          {divisions.length} division{divisions.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {entryFeeNum > 0 && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Trophy className="h-4 w-4 mr-2" />
                          <span>Entry Fee: ${entryFeeNum.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {divisions.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Divisions</h3>
                      <div className="flex flex-wrap gap-2">
                        {divisions.map((d: { id: string; name: string }) => (
                          <Badge key={d.id} variant="secondary">
                            {d.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {tournament.user && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Tournament Director</h3>
                      <Link
                        href={
                          session?.user?.id &&
                          String(tournament.user.id) === String(session.user.id)
                            ? '/profile'
                            : `/profile/${tournament.user.id}`
                        }
                        className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 transition-colors"
                      >
                        <AvatarImage
                          src={tournament.user.image}
                          alt={tournament.user.name || tournament.user.email || 'TD'}
                          userId={tournament.user.id}
                          size={32}
                        />
                        <span className="font-medium">
                          {tournament.user.name || tournament.user.email}
                        </span>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}

            {modalTab === 'comments' && (
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {comments && comments.length > 0 ? (
                    [...comments]
                      .sort(
                        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                      )
                      .map((comment) => {
                        const isOwnComment = session?.user?.id === comment.user.id
                        return (
                          <div
                            key={comment.id}
                            className="border-b border-gray-100 pb-4 last:border-0 relative"
                          >
                            <div className="flex items-start space-x-3">
                              <AvatarImage
                                src={comment.user.image}
                                alt={comment.user.name || comment.user.email || 'User'}
                                userId={comment.user.id}
                                size={32}
                              />
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center space-x-2">
                                    <span className="font-medium text-sm text-gray-900">
                                      {comment.user.name || comment.user.email}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      {new Date(comment.createdAt).toLocaleDateString()}{' '}
                                      {new Date(comment.createdAt).toLocaleTimeString()}
                                    </span>
                                  </div>
                                  <div className="relative">
                                    <button
                                      onClick={() =>
                                        setOpenCommentMenu(openCommentMenu === comment.id ? null : comment.id)
                                      }
                                      className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </button>
                                    {openCommentMenu === comment.id && (
                                      <>
                                        <div
                                          className="fixed inset-0 z-10"
                                          onClick={() => setOpenCommentMenu(null)}
                                        />
                                        <div className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px]">
                                          {isOwnComment && (
                                            <button
                                              onClick={() => {
                                                setOpenCommentMenu(null)
                                                setCommentToDelete(comment.id)
                                              }}
                                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                              <span>Delete</span>
                                            </button>
                                          )}
                                          <button
                                            onClick={() => {
                                              setOpenCommentMenu(null)
                                              setReportCommentModal({
                                                commentId: comment.id,
                                                commentText: comment.text,
                                                authorName: comment.user.name || 'Unknown',
                                                authorEmail: comment.user.email || '',
                                              })
                                            }}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                                          >
                                            <AlertTriangle className="h-4 w-4" />
                                            <span>Report</span>
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                                  {comment.text}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      })
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No comments yet. Be the first to comment!</p>
                    </div>
                  )}
                </div>
                {session ? (
                  <div className="p-6 border-t border-gray-200 flex-shrink-0">
                    <div className="flex space-x-2">
                      <Input
                        placeholder="Write a comment..."
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleCommentSubmit()
                          }
                        }}
                        className="flex-1"
                      />
                      <Button
                        onClick={handleCommentSubmit}
                        disabled={!commentText.trim() || createComment.isPending}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 border-t border-gray-200 text-center flex-shrink-0">
                    <p className="text-sm text-gray-500 mb-2">Please log in to post comments</p>
                    <Link href="/auth/signin">
                      <Button variant="outline" size="sm">
                        Login
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            )}

            {modalTab === 'view-results' && (
              <div className="flex-1 min-h-0 flex flex-col">
                {registrationStatuses?.[tournament.id]?.status === 'active' &&
                  registrationStatuses[tournament.id]?.divisionName &&
                  registrationStatuses[tournament.id]?.teamName && (
                  <div className="flex-shrink-0 px-6 pt-4 pb-2 border-b border-gray-200">
                    <div className="rounded-lg bg-green-100 border border-green-200 px-3 py-2 text-sm text-green-900 text-left">
                      <span className="font-medium">You&apos;re registered:</span>{' '}
                      {registrationStatuses[tournament.id]?.divisionName} ·{' '}
                      {registrationStatuses[tournament.id]?.teamName}
                    </div>
                  </div>
                )}
                <div className="flex-1 min-h-0">
                  <iframe
                    src={(() => {
                      const divId = registrationStatuses?.[tournament.id]?.divisionId
                      const teamId = registrationStatuses?.[tournament.id]?.teamId
                      const params = new URLSearchParams()
                      if (divId) params.set('divisionId', divId)
                      if (teamId) params.set('teamId', teamId)
                      const q = params.toString()
                      return `/scoreboard/${tournament.id}/embed${q ? `?${q}` : ''}`
                    })()}
                    title="Dashboard"
                    className="w-full h-full min-h-[60vh] border-0"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <CancelRegistrationModal
        open={showCancelRegistrationModal}
        onClose={() => setShowCancelRegistrationModal(false)}
        onConfirm={() => {
          cancelRegistration.mutate({ tournamentId: tournament.id })
          setShowCancelRegistrationModal(false)
        }}
        isPending={cancelRegistration.isPending}
        isPaidTournament={entryFeeNum > 0}
      />

      <ConfirmModal
        open={!!leaveWaitlistDivisionId}
        onClose={() => setLeaveWaitlistDivisionId(null)}
        onConfirm={() => {
          if (!leaveWaitlistDivisionId) return
          leaveWaitlist.mutate({ divisionId: leaveWaitlistDivisionId })
          setLeaveWaitlistDivisionId(null)
        }}
        isPending={leaveWaitlist.isPending}
        title="Leave waitlist?"
        description="You will lose your waitlist spot for this division."
        confirmText={leaveWaitlist.isPending ? 'Leaving…' : 'Leave waitlist'}
      />

      <ConfirmModal
        open={!!commentToDelete}
        onClose={() => setCommentToDelete(null)}
        onConfirm={() => {
          if (!commentToDelete) return
          deleteComment.mutate({ commentId: commentToDelete })
          setCommentToDelete(null)
        }}
        isPending={deleteComment.isPending}
        destructive
        title="Delete comment?"
        description="Are you sure you want to delete this comment? This cannot be undone."
        confirmText={deleteComment.isPending ? 'Deleting…' : 'Delete'}
      />

      {reportCommentModal && tournamentId && (
        <ComplaintModal
          isOpen={!!reportCommentModal}
          onClose={() => setReportCommentModal(null)}
          tournamentId={tournamentId}
          tournamentTitle={tournament.title}
          commentId={reportCommentModal.commentId}
          commentText={reportCommentModal.commentText}
          commentAuthorName={reportCommentModal.authorName}
          commentAuthorEmail={reportCommentModal.authorEmail}
        />
      )}
    </>
  )
}
