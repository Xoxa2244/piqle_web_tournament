'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { trpc } from '@/lib/trpc'
import { formatDescription } from '@/lib/formatDescription'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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

function getTournamentStatus(tournament: {
  startDate: Date | string
  endDate: Date | string
}): 'past' | 'upcoming' | 'in_progress' {
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
    case 'past':
      return 'Past'
    case 'upcoming':
      return 'Upcoming'
    case 'in_progress':
      return 'In progress'
  }
}

function getTournamentStatusBadgeClass(status: 'past' | 'upcoming' | 'in_progress') {
  switch (status) {
    case 'past':
      return 'bg-gray-100 text-gray-700'
    case 'upcoming':
      return 'bg-blue-50 text-blue-700'
    case 'in_progress':
      return 'bg-green-50 text-green-700'
  }
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

  const { data: tournament, isLoading: tournamentLoading } = trpc.public.getBoardById.useQuery(
    { id: tournamentId! },
    { enabled: !!tournamentId }
  )

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

  if (tournamentLoading || !tournament) {
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

  const divisions = tournament.divisions ?? []
  const tournamentAny = tournament as any
  const imageValue = tournamentAny?.image
  const tournamentTitle = String(tournamentAny?.title ?? '')
  const tournamentIdStr = String(tournamentAny?.id ?? '')
  const tournamentPublicSlug =
    typeof tournamentAny?.publicSlug === 'string' && tournamentAny.publicSlug.trim() !== ''
      ? tournamentAny.publicSlug
      : null
  const tournamentStatus = getTournamentStatus({
    startDate: tournamentAny?.startDate,
    endDate: tournamentAny?.endDate,
  } as any)
  const tournamentImage =
    typeof imageValue === 'string' && imageValue.trim() !== '' ? imageValue : null
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
              {tournamentImage ? (
                <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                  <Image
                    src={tournamentImage}
                    alt={tournamentTitle}
                    width={80}
                    height={80}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <TournamentImagePlaceholder size="lg" />
              )}
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{tournamentTitle}</h2>
                <p className="text-gray-600 mt-1">Tournament Details</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(tournament as { user?: { id: string } }).user?.id === session?.user?.id && (
                <>
                  <Link href={`/admin/${tournament.id}`}>
                    <Button className="bg-gray-900 hover:bg-gray-800 text-white">Manage</Button>
                  </Link>
                  {tournamentPublicSlug && (
                    <Link href={`/t/${tournamentPublicSlug}`}>
                      <Button className="bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-300">
                        View Board
                      </Button>
                    </Link>
                  )}
                </>
              )}
              {(() => {
                const pendingInvitation =
                  myTournamentInvitation?.status === 'PENDING' &&
                  myTournamentInvitation?.tournamentId === String(tournamentAny?.id ?? '')
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

                const status = registrationStatuses?.[tournamentIdStr]?.status ?? 'none'
                const registrationOpen = isRegistrationOpen({
                  startDate: tournamentAny?.startDate,
                  registrationStartDate: tournamentAny?.registrationStartDate,
                  registrationEndDate: tournamentAny?.registrationEndDate,
                } as any)
                const label =
                  status === 'active'
                    ? 'Cancel Registration'
                    : status === 'waitlisted'
                      ? 'Leave Waitlist'
                      : 'Join Tournament'
                return (
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
                          `/auth/signin?callbackUrl=${encodeURIComponent(`/tournaments/${tournamentIdStr}/register`)}`
                        )
                        return
                      }
                      if (status === 'active') {
                        if (confirm('Cancel registration?')) {
                          cancelRegistration.mutate({ tournamentId: tournamentIdStr })
                        }
                        return
                      }
                      if (status === 'waitlisted') {
                        const divisionId = registrationStatuses?.[tournamentIdStr]?.divisionId
                        if (divisionId && confirm('Leave waitlist?')) {
                          leaveWaitlist.mutate({ divisionId })
                        }
                        return
                      }
                      router.push(`/tournaments/${tournamentIdStr}/register`)
                    }}
                  >
                    {label}
                  </Button>
                )
              })()}
              <button
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
                Comments ({commentCounts?.[tournamentIdStr] ?? 0})
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
                View Results
              </button>
            </nav>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {modalTab === 'information' && (
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  <div>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${getTournamentStatusBadgeClass(tournamentStatus)}`}
                    >
                      {getTournamentStatusLabel(tournamentStatus)}
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
                          {new Date(tournament.startDate).toLocaleDateString()} -{' '}
                          {new Date(tournament.endDate).toLocaleDateString()}
                        </span>
                      </div>
                      {((tournament as { registrationStartDate?: string | null }).registrationStartDate ||
                        (tournament as { registrationEndDate?: string | null }).registrationEndDate) && (
                        <div className="flex items-center text-sm text-gray-600">
                          <ClipboardList className="h-4 w-4 mr-2" />
                          <span>
                            Registration:{' '}
                            {(tournament as { registrationStartDate?: string }).registrationStartDate
                              ? new Date(
                                  (tournament as { registrationStartDate: string }).registrationStartDate
                                ).toLocaleDateString()
                              : '—'}{' '}
                            –{' '}
                            {(tournament as { registrationEndDate?: string }).registrationEndDate
                              ? new Date(
                                  (tournament as { registrationEndDate: string }).registrationEndDate
                                ).toLocaleDateString()
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
                          className={`flex items-center text-sm ${onVenueClick ? 'cursor-pointer hover:underline' : ''} ${(tournament as { venueAddress?: string | null }).venueAddress?.trim() ? 'text-blue-600 hover:text-blue-800' : 'text-gray-600 hover:text-blue-600'}`}
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
                  {(tournament as { user?: { id: string; name?: string | null; image?: string | null; email?: string | null } }).user && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Tournament Director</h3>
                      <Link
                        href={
                          session?.user?.id &&
                          String((tournament as { user: { id: string } }).user.id) === String(session.user.id)
                            ? '/profile'
                            : `/profile/${(tournament as { user: { id: string } }).user.id}`
                        }
                        className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 transition-colors"
                      >
                        <AvatarImage
                          src={(tournament as { user: { image?: string | null } }).user.image}
                          alt={
                            (tournament as { user: { name?: string | null; email?: string | null } }).user
                              .name ||
                            (tournament as { user: { email?: string | null } }).user.email ||
                            'TD'
                          }
                          userId={(tournament as { user: { id: string } }).user.id}
                          size={32}
                        />
                        <span className="font-medium">
                          {(tournament as { user: { name?: string | null; email?: string | null } }).user
                            .name ||
                            (tournament as { user: { email?: string | null } }).user.email}
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
                                                if (
                                                  confirm('Are you sure you want to delete this comment?')
                                                ) {
                                                  deleteComment.mutate({ commentId: comment.id })
                                                }
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
                <iframe
                  src={`/scoreboard/${tournament.id}/embed`}
                  title="View Results"
                  className="w-full flex-1 min-h-[60vh] border-0"
                />
              </div>
            )}
          </div>
        </div>
      </div>

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
