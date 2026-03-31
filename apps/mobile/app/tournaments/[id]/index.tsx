import { useQuery } from '@tanstack/react-query'
import { Feather } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Keyboard,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  ScrollView as RNScrollView,
  Text,
  UIManager,
  View,
  useWindowDimensions,
  type ScrollView as RNScrollViewType,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { AppBottomSheet, AppConfirmActions, AppInfoFooter } from '../../../src/components/AppBottomSheet'
import { EntityImage } from '../../../src/components/EntityImage'
import { FeedbackEntityContextCard } from '../../../src/components/FeedbackEntityContextCard'
import { FeedbackRatingModal } from '../../../src/components/FeedbackRatingModal'
import { PickleRefreshScrollView } from '../../../src/components/PickleRefreshScrollView'
import { RemoteUserAvatar } from '../../../src/components/RemoteUserAvatar'
import { ChatComposer } from '../../../src/components/ChatComposer'
import { ChatThreadMessageList } from '../../../src/components/ChatThreadMessageList'
import { BackCircleButton } from '../../../src/components/navigation/BackCircleButton'
import {
  ActionButton,
  EmptyState,
  LoadingBlock,
  SegmentedContentFade,
  SegmentedControl,
  SectionTitle,
  SurfaceCard,
} from '../../../src/components/ui'
import { GradientTrophyIcon, TROPHY_GRADIENT_BRONZE, TROPHY_GRADIENT_GOLD, TROPHY_GRADIENT_SILVER } from '../../../src/components/GradientTrophyIcon'
import { OptionalLinearGradient } from '../../../src/components/OptionalLinearGradient'
import { RatingStarIcon } from '../../../src/components/icons/RatingStarIcon'
import { fetchWithTimeout } from '../../../src/lib/apiFetch'
import { buildApiUrl, buildWebUrl, FEEDBACK_API_ENABLED } from '../../../src/lib/config'
import { formatDateRange, formatLocation, formatMoney } from '../../../src/lib/formatters'
import { getDivisionSlotMetrics, getPlayersPerTeam, getTournamentSlotMetrics } from '../../../src/lib/tournamentSlots'
import { trpc } from '../../../src/lib/trpc'
import { radius, spacing, type ThemePalette } from '../../../src/lib/theme'
/** Как в турнирном чате: `COMPOSER_IDLE_BOTTOM_EXTRA` */
const COMMENTS_COMPOSER_IDLE_BOTTOM_EXTRA = 24
/** Приблизительная высота composer внутри карточки Comments (wrap padding + input). */
const COMMENTS_COMPOSER_ESTIMATED_H = 84

import { useAuth } from '../../../src/providers/AuthProvider'
import { useAppTheme } from '../../../src/providers/ThemeProvider'
import { useToast } from '../../../src/providers/ToastProvider'
import { usePullToRefresh } from '../../../src/hooks/usePullToRefresh'
import { useToastWhenEntityMissing } from '../../../src/hooks/useToastWhenEntityMissing'
import { useTournamentAccessInfo } from '../../../src/hooks/useTournamentAccessInfo'

const longDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

const formatHeroDateRange = (start?: string | Date | null, end?: string | Date | null) => {
  if (!start) return 'Date TBD'

  const startDate = new Date(start)
  if (!end) {
    return longDateFormatter.format(startDate)
  }

  const endDate = new Date(end)
  const sameMonthAndYear =
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth()

  if (sameMonthAndYear) {
    return `${startDate.toLocaleString('en-US', {
      month: 'long',
    })} ${startDate.getDate()}-${endDate.getDate()}, ${endDate.getFullYear()}`
  }

  return `${longDateFormatter.format(startDate)} - ${longDateFormatter.format(endDate)}`
}

type IndyMatchupRosterLine = { id: string; name: string; letter: string }

function getActiveIndyMatchupRosterPlayers(matchup: any, teamId: string): IndyMatchupRosterLine[] {
  const rosters = Array.isArray(matchup?.rosters) ? matchup.rosters : []
  const players: IndyMatchupRosterLine[] = rosters
    .filter(
      (r: any) =>
        r.teamId === teamId &&
        r.isActive &&
        typeof r.letter === 'string' &&
        r.letter.trim() !== ''
    )
    .map((r: any) => ({
      id: String(r.player?.id ?? r.playerId ?? ''),
      name:
        `${r.player?.firstName || ''} ${r.player?.lastName || ''}`.trim() ||
        'Unknown player',
      letter: String(r.letter),
    }))
  return players.sort((a, b) => a.letter.localeCompare(b.letter))
}

const formatTournamentFormat = (format?: string | null) => {
  switch (format) {
    case 'SINGLE_ELIMINATION':
      return 'Single Elimination'
    case 'ROUND_ROBIN':
      return 'Round Robin'
    case 'MLP':
      return 'MLP'
    case 'INDY_LEAGUE':
      return 'Indy League'
    case 'LEAGUE_ROUND_ROBIN':
      return 'League Round Robin'
    case 'ONE_DAY_LADDER':
      return 'One Day Ladder'
    case 'LADDER_LEAGUE':
      return 'Ladder League'
    default:
      return 'Tournament'
  }
}

/** Паттерн точек как на карточке ивента (hero на 40% ширины с затуханием). */
const EVENT_PATTERN_EDGE = 2
const EVENT_PATTERN_STEP = 7
const EVENT_PATTERN_DIAG = 3
const EVENT_PATTERN_DOT = 3

function EventHeroDotPattern({
  style,
  dotStyle,
}: {
  style: any
  dotStyle: any
}) {
  const [layout, setLayout] = useState({ w: 0, h: 0 })
  const dots = useMemo(() => {
    const w = layout.w
    const h = layout.h
    if (w < 4 || h < 4) return []
    const EDGE = EVENT_PATTERN_EDGE
    const STEP = EVENT_PATTERN_STEP
    const DIAG = EVENT_PATTERN_DIAG
    const DOT = EVENT_PATTERN_DOT
    const spanX = Math.max(1, w - EDGE * 2)
    const rowMax = Math.max(0, Math.floor((h - EDGE - DOT) / STEP))
    const out: Array<{ key: string; left: number; top: number; opacity: number }> = []
    let index = 0
    for (let row = 0; row <= rowMax; row += 1) {
      const top = EDGE + row * STEP
      if (top + DOT > h) continue
      const colStart = Math.ceil((-EDGE - row * DIAG) / STEP)
      const colEnd = Math.floor((w - DOT - EDGE - row * DIAG) / STEP)
      for (let col = colStart; col <= colEnd; col += 1) {
        const left = EDGE + col * STEP + row * DIAG
        if (left + DOT > w) continue
        const nx = spanX > 0 ? (left - EDGE) / spanX : 0
        const fade = 1 - Math.min(1, nx) ** 0.42
        const opacity = Math.max(0.04, Math.min(0.58, 0.06 + 0.52 * fade))
        out.push({ key: `event-hero-dot-${index}`, left, top, opacity })
        index += 1
      }
    }
    return out
  }, [layout.h, layout.w])

  return (
    <View
      pointerEvents="none"
      style={style}
      collapsable={false}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout
        if (width <= 0 || height <= 0) return
        setLayout((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }))
      }}
    >
      <OptionalLinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
        fallbackColor="rgba(255,255,255,0.08)"
      >
        {dots.map((dot) => (
          <View
            key={dot.key}
            pointerEvents="none"
            style={[dotStyle, { left: dot.left, top: dot.top, opacity: dot.opacity }]}
          />
        ))}
      </OptionalLinearGradient>
    </View>
  )
}

type DetailTab = 'info' | 'divisions' | 'dashboard'

type StatusMeta = {
  label: string
  backgroundColor: string
}

const fetchTournamentBoardById = async (id: string) => {
  const response = await fetchWithTimeout(
    buildApiUrl(`/api/trpc/public.getBoardById?input=${encodeURIComponent(JSON.stringify({ id }))}`)
  )
  const payload = await response.json()

  if (!response.ok || payload?.error) {
    throw new Error(payload?.error?.message || `Failed to load tournament ${id}`)
  }

  return payload?.result?.data ?? null
}

const fetchFullTournamentById = async (id: string) => {
  const response = await fetchWithTimeout(
    buildApiUrl(`/api/trpc/public.getTournamentById?input=${encodeURIComponent(JSON.stringify({ id }))}`)
  )
  const payload = await response.json()

  if (!response.ok || payload?.error) {
    const msg = payload?.error?.message || `Failed to load full tournament ${id}`
    // Нет сущности — не бросаем (иначе шум в консоли и лишний error в React Query).
    if (typeof msg === 'string' && /tournament not found/i.test(msg)) {
      return null
    }
    throw new Error(msg)
  }

  return payload?.result?.data ?? null
}

const normalizeTournamentForDetail = (tournament: any) => ({
  ...tournament,
  prizes: Array.isArray(tournament?.prizes) ? tournament.prizes : [],
  divisions: Array.isArray(tournament?.divisions)
    ? tournament.divisions.map((division: any) => ({
        ...division,
        teamKind: division?.teamKind ?? null,
        teams: Array.isArray(division?.teams) ? division.teams : undefined,
      }))
    : [],
})

const isRegistrationOpen = (tournament: {
  registrationStartDate?: string | Date | null
  registrationEndDate?: string | Date | null
  startDate: string | Date
}) => {
  const start = tournament.registrationStartDate
    ? new Date(tournament.registrationStartDate)
    : new Date(tournament.startDate)
  const end = tournament.registrationEndDate
    ? new Date(tournament.registrationEndDate)
    : new Date(tournament.startDate)
  const now = new Date()
  return now >= start && now <= end
}

const getStatusMeta = (
  tournament: any,
  myStatus?: string | null,
  hasPrivilegedAccess = false
): StatusMeta => {
  if (hasPrivilegedAccess) {
    return { label: 'Admin', backgroundColor: 'rgba(40, 205, 65, 0.92)' }
  }

  if (myStatus === 'active') {
    return { label: 'Registered', backgroundColor: 'rgba(40, 205, 65, 0.92)' }
  }
  if (myStatus === 'waitlisted') {
    return { label: 'Waitlist', backgroundColor: 'rgba(255, 214, 10, 0.88)' }
  }
  if (new Date(tournament.endDate).getTime() < Date.now() || !isRegistrationOpen(tournament)) {
    return { label: 'Closed', backgroundColor: 'rgba(10, 10, 10, 0.58)' }
  }

  const slotMetrics = getTournamentSlotMetrics(tournament)
  if (slotMetrics.createdSlots !== null && slotMetrics.createdSlots > 0 && slotMetrics.openSlots === 0) {
    return { label: 'Waitlist', backgroundColor: 'rgba(255, 214, 10, 0.88)' }
  }
  if (slotMetrics.fillRatio !== null && slotMetrics.fillRatio >= 0.75) {
    return { label: 'Filling Fast', backgroundColor: 'rgba(255, 214, 10, 0.88)' }
  }

  return { label: 'Open', backgroundColor: 'rgba(0, 232, 124, 0.9)' }
}

function getCompactStatusIcon(label: string): keyof typeof Feather.glyphMap {
  const s = label.trim().toLowerCase()
  if (!s) return 'info'
  if (s.includes('admin')) return 'shield'
  if (s.includes('registered')) return 'check-circle'
  if (s.includes('wait')) return 'clock'
  if (s.includes('filling')) return 'trending-up'
  if (s.includes('closed')) return 'x-circle'
  if (s.includes('open')) return 'unlock'
  return 'info'
}

function isCompactHeroStatus(label: string) {
  const s = label.trim().toLowerCase()
  return s === 'admin' || s === 'registered' || s === 'waitlist'
}

type BracketPlacementTeam = { id: string; name: string }

/** Mirrors `components/BracketPyramid` `getWinner` for elimination matches from the public stage API. */
function getEliminationWinnerTeam(
  match: any,
  tournamentFormat?: string | null
): { id: string; name: string } | null {
  if (!match?.teamA || !match.teamB) return null
  const isMLP = Boolean((match as any).isMLP ?? tournamentFormat === 'MLP')
  const games = (match.games ?? []) as any[]

  if (isMLP && ((match as any).gamesCount === 4 || games.length === 4)) {
    if (match.tiebreaker?.winnerTeamId) {
      if (match.teamA.id === match.tiebreaker.winnerTeamId) return match.teamA
      if (match.teamB.id === match.tiebreaker.winnerTeamId) return match.teamB
    }
    if ((match as any).winnerTeamId) {
      const wId = String((match as any).winnerTeamId)
      if (match.teamA.id === wId) return match.teamA
      if (match.teamB.id === wId) return match.teamB
    }
    if (games.length === 4) {
      let teamAWins = 0
      let teamBWins = 0
      for (const game of games) {
        if (game.winner === 'A') teamAWins++
        else if (game.winner === 'B') teamBWins++
        else if (game.scoreA != null && game.scoreB != null) {
          if (game.scoreA > game.scoreB) teamAWins++
          else if (game.scoreB > game.scoreA) teamBWins++
        }
      }
      if (teamAWins >= 3) return match.teamA
      if (teamBWins >= 3) return match.teamB
    }
    return null
  }

  if (!games.length) return null
  const totalScoreA = games.reduce((sum, game) => sum + Number(game?.scoreA ?? 0), 0)
  const totalScoreB = games.reduce((sum, game) => sum + Number(game?.scoreB ?? 0), 0)
  if (totalScoreA > totalScoreB) return match.teamA
  if (totalScoreB > totalScoreA) return match.teamB
  return null
}

/** Same placement rules as `BracketPyramid` “Final Standings Plaques”. */
function getPlayoffPlacementsFromMatches(
  matches: any[],
  tournamentFormat?: string | null
): { champion: BracketPlacementTeam | null; second: BracketPlacementTeam | null; third: BracketPlacementTeam | null } {
  if (!matches.length) {
    return { champion: null, second: null, third: null }
  }
  const maxRound = Math.max(...matches.map((m) => Number(m.roundIndex ?? 0)), 0)
  const finalMatch = matches.find(
    (m) => Number(m.roundIndex ?? 0) === maxRound && (m as any).note !== 'Third Place Match'
  )
  const thirdPlaceMatch = matches.find(
    (m) => Number(m.roundIndex ?? 0) === maxRound && (m as any).note === 'Third Place Match'
  )
  const semiFinalMatches = matches.filter((m) => Number(m.roundIndex ?? 0) === maxRound - 1)

  if (!finalMatch) {
    return { champion: null, second: null, third: null }
  }

  const championTeam = getEliminationWinnerTeam(finalMatch, tournamentFormat)
  const champion: BracketPlacementTeam | null = championTeam
    ? { id: String(championTeam.id), name: String(championTeam.name ?? 'Team') }
    : null

  let second: BracketPlacementTeam | null = null
  if (championTeam && finalMatch.teamA && finalMatch.teamB) {
    const w = championTeam
    second =
      w.id === finalMatch.teamA.id
        ? { id: String(finalMatch.teamB.id), name: String(finalMatch.teamB.name ?? 'Team') }
        : { id: String(finalMatch.teamA.id), name: String(finalMatch.teamA.name ?? 'Team') }
  }

  let third: BracketPlacementTeam | null = null
  if (thirdPlaceMatch) {
    const w = getEliminationWinnerTeam(thirdPlaceMatch, tournamentFormat)
    if (w) third = { id: String(w.id), name: String(w.name ?? 'Team') }
  }
  if (!third && semiFinalMatches.length > 0) {
    const losers = semiFinalMatches
      .map((match) => {
        const w = getEliminationWinnerTeam(match, tournamentFormat)
        if (!w || !match.teamA || !match.teamB) return null
        return w.id === match.teamA.id
          ? { id: String(match.teamB.id), name: String(match.teamB.name ?? 'Team') }
          : { id: String(match.teamA.id), name: String(match.teamA.name ?? 'Team') }
      })
      .filter(Boolean) as BracketPlacementTeam[]
    third = losers[0] ?? null
  }

  return { champion, second, third }
}

export default function TournamentDetailScreen() {
  const { colors, theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createStyles(colors), [colors])
  const params = useLocalSearchParams<{ id: string; payment?: string }>()
  const tournamentId = String(params.id ?? '')
  const paymentState = typeof params.payment === 'string' ? params.payment : null
  const { token, user } = useAuth()
  const toast = useToast()
  const { height: windowHeight } = useWindowDimensions()
  const isAuthenticated = Boolean(token)
  const api = trpc as any
  const utils = trpc.useUtils() as any
  const scrollRef = useRef<RNScrollViewType>(null)
  const commentsThreadRef = useRef<RNScrollViewType>(null)

  const [activeTab, setActiveTab] = useState<DetailTab>('info')
  const [leaveTournamentSheetOpen, setLeaveTournamentSheetOpen] = useState(false)
  const [leaveTournamentPaidConfirmOpen, setLeaveTournamentPaidConfirmOpen] = useState(false)
  const [openPaidConfirmAfterDismiss, setOpenPaidConfirmAfterDismiss] = useState(false)
  const [paymentErrorMessage, setPaymentErrorMessage] = useState<string | null>(null)
  const [paymentSuccessNotice, setPaymentSuccessNotice] = useState(false)
  const [paymentSyncing, setPaymentSyncing] = useState(false)
  const paymentToastShownRef = useRef(false)
  const paymentAttemptedRef = useRef(false)
  const paymentSyncInFlightRef = useRef(false)
  const handledPaymentStateRef = useRef<string | null>(null)
  const [tournamentFeedbackOpen, setTournamentFeedbackOpen] = useState(false)
  const [tournamentFeedbackInfoOpen, setTournamentFeedbackInfoOpen] = useState(false)
  const [openTournamentFeedbackAfterInfoClose, setOpenTournamentFeedbackAfterInfoClose] = useState(false)
  const [tdFeedbackOpen, setTdFeedbackOpen] = useState(false)
  const [tdFeedbackInfoOpen, setTdFeedbackInfoOpen] = useState(false)
  const [tournamentDescriptionExpanded, setTournamentDescriptionExpanded] = useState(false)
  const [tournamentDescriptionExpandable, setTournamentDescriptionExpandable] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentsAnchorY, setCommentsAnchorY] = useState<number | null>(null)
  const [pendingScrollToComments, setPendingScrollToComments] = useState(false)
  const [commentsDeleteTargetId, setCommentsDeleteTargetId] = useState<string | null>(null)
  const [commentsKeyboardVisible, setCommentsKeyboardVisible] = useState(false)
  const [expandedDashboardTeamId, setExpandedDashboardTeamId] = useState<string | null>(null)

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true)
    }
  }, [])

  const toggleDashboardTeamExpand = useCallback(
    (rowKey: string) => {
      LayoutAnimation.configureNext({
        duration: 180,
        update: { type: LayoutAnimation.Types.easeInEaseOut },
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      })
      setExpandedDashboardTeamId((prev) => (prev === rowKey ? null : rowKey))
    },
    []
  )

  const toggleDashboardIndyMatchupExpand = useCallback((matchupKey: string) => {
    LayoutAnimation.configureNext({
      duration: 180,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    })
    setExpandedDashboardIndyMatchupId((prev) => (prev === matchupKey ? null : matchupKey))
  }, [])

  const toggleTournamentDescriptionExpanded = useCallback(() => {
    LayoutAnimation.configureNext({
      duration: 220,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    })
    setTournamentDescriptionExpanded((value) => !value)
  }, [])

  const cachedBoardsQuery = api.public.listBoards.useQuery(undefined, { enabled: false })
  const cachedTournament = useMemo(
    () =>
      (((cachedBoardsQuery.data ?? []) as any[]).find((item) => item.id === tournamentId) as any | undefined) ??
      null,
    [cachedBoardsQuery.data, tournamentId]
  )
  const initialTournamentData = useMemo(
    () => (cachedTournament ? normalizeTournamentForDetail(cachedTournament) : undefined),
    [cachedTournament]
  )

  const tournamentQuery = useQuery({
    queryKey: ['mobile-public-getBoardById', tournamentId],
    enabled: Boolean(tournamentId),
    retry: false,
    initialData: initialTournamentData,
    queryFn: () => fetchTournamentBoardById(tournamentId),
  })
  const fullTournamentQuery = useQuery({
    queryKey: ['mobile-public-getTournamentById', tournamentId],
    enabled: Boolean(tournamentId),
    retry: false,
    queryFn: () => fetchFullTournamentById(tournamentId),
  })

  useToastWhenEntityMissing({
    enabled: Boolean(tournamentId),
    entityKey: tournamentId,
    toastMessage: 'This tournament no longer exists or the link is invalid.',
    isLoading: tournamentQuery.isLoading,
    hasData: Boolean(tournamentQuery.data),
    isError: tournamentQuery.isError,
    errorMessage: tournamentQuery.error?.message,
  })

  const protectedQueriesEnabled =
    Boolean(tournamentId) && isAuthenticated && Boolean(tournamentQuery.data)
  const myStatusQuery = api.registration.getMyStatus.useQuery(
    { tournamentId },
    { enabled: protectedQueriesEnabled }
  )
  const accessQuery = useTournamentAccessInfo(tournamentId, protectedQueriesEnabled)
  const canLoadAdminTournament = Boolean(protectedQueriesEnabled && accessQuery.data?.userAccessInfo)
  const adminTournamentQuery = api.tournament.get.useQuery(
    { id: tournamentId },
    { enabled: canLoadAdminTournament, retry: false }
  )
  const myInvitationQuery = api.tournamentInvitation.getMineByTournament.useQuery(
    { tournamentId },
    { enabled: protectedQueriesEnabled }
  )

  const acceptInvitation = api.tournamentInvitation.accept.useMutation({
    onSuccess: async (result: any) => {
      await Promise.all([
        utils.notification.list.invalidate(),
        myInvitationQuery.refetch(),
        myStatusQuery.refetch(),
      ])
      router.push(`/tournaments/${result.tournamentId}/register`)
    },
  })
  const declineInvitation = api.tournamentInvitation.decline.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.notification.list.invalidate(),
        myInvitationQuery.refetch(),
      ])
    },
  })
  const createCheckout = api.payment.createCheckoutSession.useMutation()
  const myStatusRefetch = myStatusQuery.refetch
  const tournamentRefetch = tournamentQuery.refetch
  const fullTournamentRefetch = fullTournamentQuery.refetch
  const accessRefetch = accessQuery.refetch

  const syncPaymentStatus = useCallback(async () => {
    if (paymentSyncInFlightRef.current) return false
    paymentSyncInFlightRef.current = true
    setPaymentSyncing(true)
    setPaymentSuccessNotice(false)

    try {
      const maxAttempts = 10
      for (let i = 0; i < maxAttempts; i += 1) {
        const statusResult = await myStatusRefetch()
        void Promise.all([tournamentRefetch(), fullTournamentRefetch()])
        const paidNow = Boolean(
          statusResult.data?.isPaid === true || statusResult.data?.paymentStatus === 'PAID'
        )
        if (paidNow) {
          setPaymentSuccessNotice(true)
          setPaymentSyncing(false)
          paymentAttemptedRef.current = false
          paymentSyncInFlightRef.current = false
          return true
        }
        await new Promise((resolve) => setTimeout(resolve, 1200))
      }
      setPaymentSyncing(false)
      paymentAttemptedRef.current = false
      paymentSyncInFlightRef.current = false
      return false
    } catch {
      setPaymentSyncing(false)
      paymentAttemptedRef.current = false
      paymentSyncInFlightRef.current = false
      return false
    }
  }, [myStatusRefetch, tournamentRefetch, fullTournamentRefetch])

  const cancelRegistration = api.registration.cancelRegistration.useMutation({
    onSuccess: async () => {
      setLeaveTournamentSheetOpen(false)
      setLeaveTournamentPaidConfirmOpen(false)
      setOpenPaidConfirmAfterDismiss(false)
      await Promise.all([
        utils.registration.getMyStatus.invalidate({ tournamentId }),
        utils.registration.getMyStatuses.invalidate(),
        myStatusQuery.refetch(),
        tournamentQuery.refetch(),
        fullTournamentQuery.refetch(),
      ])
      toast.success('You left the tournament.')
    },
    onError: (e: any) => {
      setLeaveTournamentSheetOpen(false)
      setLeaveTournamentPaidConfirmOpen(false)
      setOpenPaidConfirmAfterDismiss(false)
      toast.error(e?.message || 'Failed to leave tournament.')
    },
  })

  const dashboardBoardQuery = api.public.getTournamentById.useQuery(
    { id: tournamentId },
    { enabled: Boolean(tournamentId) && activeTab === 'dashboard', retry: false }
  )
  const [dashboardDivisionId, setDashboardDivisionId] = useState<string | null>(null)
  const [dashboardLeagueDayMode, setDashboardLeagueDayMode] = useState<'DAY_ONLY' | 'SEASON_TO_DATE'>(
    'SEASON_TO_DATE'
  )
  const [dashboardLeagueDayId, setDashboardLeagueDayId] = useState<string | null>(null)
  const [expandedDashboardIndyMatchupId, setExpandedDashboardIndyMatchupId] = useState<string | null>(null)
  const dashboardDivisionsForQueries = (
    ((dashboardBoardQuery.data as any)?.divisions ??
      (adminTournamentQuery.data as any)?.divisions ??
      (fullTournamentQuery.data as any)?.divisions ??
      []) as any[]
  )
  const selectedDivisionForQueries =
    dashboardDivisionsForQueries.find((d: any) => d.id === dashboardDivisionId) ?? dashboardDivisionsForQueries[0]
  const canFetchDashboardStandings = Number(selectedDivisionForQueries?.teams?.length ?? 0) >= 2
  const dashboardTournamentFormat =
    ((dashboardBoardQuery.data as any)?.format ??
      (fullTournamentQuery.data as any)?.format ??
      (tournamentQuery.data as any)?.format) as string | undefined
  const isDashboardIndyLeague = dashboardTournamentFormat === 'INDY_LEAGUE'
  const isDashboardLeagueRrOrLadder =
    dashboardTournamentFormat === 'LEAGUE_ROUND_ROBIN' || dashboardTournamentFormat === 'LADDER_LEAGUE'
  const isMatchDayDashboardFormat = isDashboardIndyLeague || isDashboardLeagueRrOrLadder
  const dashboardLeagueMatchDaysQuery = api.public.getIndyMatchDays.useQuery(
    { tournamentId },
    {
      enabled: Boolean(tournamentId) && activeTab === 'dashboard' && isMatchDayDashboardFormat,
      retry: false,
    }
  )
  const leagueDayFilterReady =
    !isMatchDayDashboardFormat ||
    dashboardLeagueDayMode === 'SEASON_TO_DATE' ||
    Boolean(dashboardLeagueDayId)
  const dashboardStandingsQueryInput = {
    divisionId: dashboardDivisionId ?? '',
    ...(isDashboardLeagueRrOrLadder &&
    dashboardLeagueDayMode === 'DAY_ONLY' &&
    dashboardLeagueDayId
      ? { matchDayId: dashboardLeagueDayId }
      : {}),
  }
  const dashboardStageQueryInput = {
    divisionId: dashboardDivisionId ?? '',
    ...(isDashboardLeagueRrOrLadder &&
    dashboardLeagueDayMode === 'DAY_ONLY' &&
    dashboardLeagueDayId
      ? { matchDayId: dashboardLeagueDayId }
      : {}),
  }
  const dashboardStandingsQuery = api.public.getPublicStandings.useQuery(dashboardStandingsQueryInput, {
    enabled:
      Boolean(dashboardDivisionId) &&
      activeTab === 'dashboard' &&
      !isDashboardIndyLeague &&
      canFetchDashboardStandings &&
      leagueDayFilterReady,
    retry: false,
  })
  const dashboardStageQuery = api.public.getPublicDivisionStage.useQuery(dashboardStageQueryInput, {
    enabled:
      Boolean(dashboardDivisionId) &&
      activeTab === 'dashboard' &&
      !isDashboardIndyLeague &&
      leagueDayFilterReady,
    retry: false,
  })
  const dashboardIndyStandingsQuery = api.public.getPublicIndyStandings.useQuery(
    {
      tournamentId,
      divisionId: dashboardDivisionId ?? undefined,
      matchDayId: dashboardLeagueDayMode === 'DAY_ONLY' ? dashboardLeagueDayId ?? undefined : undefined,
      mode: dashboardLeagueDayMode,
    },
    {
      enabled:
        Boolean(tournamentId) &&
        activeTab === 'dashboard' &&
        isDashboardIndyLeague &&
        Boolean(dashboardDivisionId) &&
        canFetchDashboardStandings &&
        leagueDayFilterReady,
      retry: false,
    }
  )
  const dashboardIndyMatchupsQuery = api.public.getIndyMatchupsByDay.useQuery(
    { matchDayId: dashboardLeagueDayId ?? '' },
    {
      enabled:
        Boolean(tournamentId) &&
        activeTab === 'dashboard' &&
        isDashboardIndyLeague &&
        dashboardLeagueDayMode === 'DAY_ONLY' &&
        Boolean(dashboardLeagueDayId),
      retry: false,
    }
  )

  useEffect(() => {
    const days = (dashboardLeagueMatchDaysQuery.data ?? []) as { id: string }[]
    if (!days.length || dashboardLeagueDayMode !== 'DAY_ONLY') return
    setDashboardLeagueDayId((prev) => {
      if (prev && days.some((d) => d.id === prev)) return prev
      return days[0]?.id ?? null
    })
  }, [dashboardLeagueMatchDaysQuery.data, dashboardLeagueDayMode])

  useEffect(() => {
    setExpandedDashboardIndyMatchupId(null)
  }, [dashboardLeagueDayId])

  useFocusEffect(
    useCallback(() => {
      if (!tournamentId || !isAuthenticated) return
      void Promise.all([myStatusRefetch(), tournamentRefetch(), fullTournamentRefetch(), accessRefetch()])
    }, [tournamentId, isAuthenticated, myStatusRefetch, tournamentRefetch, fullTournamentRefetch, accessRefetch])
  )

  useEffect(() => {
    if (!tournamentId || !paymentState) return
    const paymentMarker = `${tournamentId}:${paymentState}`
    if (handledPaymentStateRef.current === paymentMarker) return
    handledPaymentStateRef.current = paymentMarker

    router.replace(`/tournaments/${tournamentId}`)
    void utils.registration.getMyStatuses.invalidate()
    void Promise.all([myStatusRefetch(), tournamentRefetch(), fullTournamentRefetch()])

    if (paymentState === 'success') {
      paymentAttemptedRef.current = true
      void syncPaymentStatus()
    }
  }, [paymentState, tournamentId, utils.registration.getMyStatuses, myStatusRefetch, tournamentRefetch, fullTournamentRefetch, syncPaymentStatus])

  const tournamentMissingStateHeader = (
    <View
      style={{
        paddingTop: insets.top,
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.sm,
        backgroundColor: colors.surfaceOverlay,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      <View style={styles.eventMiniBar}>
        <BackCircleButton onPress={() => router.back()} iconSize={18} style={styles.eventMiniBarButton} />
      </View>
    </View>
  )

  if (tournamentQuery.isLoading) {
    return (
      <View style={styles.screen}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        {tournamentMissingStateHeader}
        <View style={styles.loadingWrap}>
          <LoadingBlock label="Loading tournament..." />
        </View>
      </View>
    )
  }

  if (tournamentQuery.isError) {
    return (
      <View style={styles.screen}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        {tournamentMissingStateHeader}
        <View style={[styles.loadingWrap, { gap: 16 }]}>
          <EmptyState
            title="Could not load tournament"
            body="Check your network and EXPO_PUBLIC_API_URL, then try again."
          />
          <ActionButton label="Try again" onPress={() => tournamentQuery.refetch()} />
        </View>
      </View>
    )
  }

  if (!tournamentQuery.data) {
    return (
      <View style={styles.screen}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        {tournamentMissingStateHeader}
        <View style={styles.loadingWrap}>
          <SurfaceCard>
            <Text style={styles.muted}>Tournament not found.</Text>
          </SurfaceCard>
        </View>
      </View>
    )
  }

  const tournament = tournamentQuery.data as any
  const tdUserId = typeof tournament?.user?.id === 'string' ? tournament.user.id : null

  const commentCountQuery = api.comment.getTournamentCommentCount.useQuery(
    { tournamentId },
    { enabled: Boolean(tournamentId), retry: false },
  )
  const commentsQuery = api.comment.getTournamentComments.useQuery(
    { tournamentId },
    { enabled: Boolean(tournamentId), retry: false },
  )
  const createComment = api.comment.createComment.useMutation({
    onSuccess: async () => {
      setCommentDraft('')
      await Promise.all([commentsQuery.refetch(), commentCountQuery.refetch()])
      requestAnimationFrame(() => {
        commentsThreadRef.current?.scrollToEnd({ animated: true })
      })
    },
  })
  const deleteComment = api.comment.deleteComment.useMutation({
    onSuccess: async () => {
      await Promise.all([commentsQuery.refetch(), commentCountQuery.refetch()])
    },
  })
  const onRefreshTournamentDetail = useCallback(async () => {
    await Promise.all([
      tournamentQuery.refetch(),
      fullTournamentQuery.refetch(),
      myStatusQuery.refetch(),
      accessQuery.refetch(),
      myInvitationQuery.refetch(),
      commentsQuery.refetch(),
      commentCountQuery.refetch(),
    ])
  }, [accessQuery, fullTournamentQuery, myInvitationQuery, myStatusQuery, tournamentQuery, commentsQuery, commentCountQuery])

  const pullToRefresh = usePullToRefresh(onRefreshTournamentDetail)
  const feedbackSummaryQuery = api.feedback.getEntitySummary.useQuery(
    { entityType: 'TOURNAMENT', entityId: tournamentId },
    { enabled: FEEDBACK_API_ENABLED && Boolean(tournamentId) && isAuthenticated, retry: false },
  )
  const hasRatedQuery = api.feedback.hasRated.useQuery(
    { targets: [{ entityType: 'TOURNAMENT', entityId: tournamentId }] },
    { enabled: FEEDBACK_API_ENABLED && Boolean(tournamentId) && isAuthenticated, retry: false },
  )
  const hasRatedTournament = Boolean(hasRatedQuery.data?.map?.[`TOURNAMENT:${tournamentId}`])
  const tdSummaryQuery = api.feedback.getEntitySummary.useQuery(
    { entityType: 'TD', entityId: tdUserId ?? '' },
    { enabled: FEEDBACK_API_ENABLED && Boolean(tdUserId) && isAuthenticated, retry: false },
  )
  const tdHasRatedQuery = api.feedback.hasRated.useQuery(
    { targets: tdUserId ? [{ entityType: 'TD', entityId: tdUserId }] : [] },
    { enabled: FEEDBACK_API_ENABLED && Boolean(tdUserId) && isAuthenticated, retry: false },
  )
  const hasRatedTd = Boolean(tdUserId && tdHasRatedQuery.data?.map?.[`TD:${tdUserId}`])
  const feedbackAverage = feedbackSummaryQuery.data?.averageRating
  const feedbackTotal = feedbackSummaryQuery.data?.total ?? 0
  const feedbackCanPublish = Boolean(feedbackSummaryQuery.data?.canPublish)
  const fallbackSeed = String(tournamentId).split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const feedbackAverageEffective =
    feedbackAverage ?? (__DEV__ ? Number((3.8 + (fallbackSeed % 13) / 20).toFixed(1)) : null)
  const feedbackTotalEffective = feedbackTotal > 0 ? feedbackTotal : __DEV__ ? 5 + (fallbackSeed % 21) : 0
  const feedbackCanPublishEffective = feedbackCanPublish || (__DEV__ && feedbackTotalEffective >= 5)
  const tdAverage = tdSummaryQuery.data?.averageRating
  const tdTotal = tdSummaryQuery.data?.total ?? 0
  const tdCanPublish = Boolean(tdSummaryQuery.data?.canPublish)
  const tdFallbackSeed = String(tdUserId ?? tournamentId)
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const tdAverageEffective = tdAverage ?? (__DEV__ ? Number((4 + (tdFallbackSeed % 9) / 20).toFixed(1)) : null)
  const tdTotalEffective = tdTotal > 0 ? tdTotal : __DEV__ ? 5 + (tdFallbackSeed % 17) : 0
  const tdCanPublishEffective = tdCanPublish || (__DEV__ && tdTotalEffective >= 5)
  const myStatus = myStatusQuery.data?.status
  const accessInfo = accessQuery.data?.userAccessInfo
  const isOwner = Boolean(user?.id && tournament.user?.id === user.id)
  const hasPrivilegedAccess = Boolean(isOwner || accessInfo?.isOwner || accessInfo?.accessLevel === 'ADMIN')
  const pendingInvitation = myInvitationQuery.data?.status === 'PENDING' ? myInvitationQuery.data : null
  const entryFeeCents =
    typeof tournament.entryFeeCents === 'number'
      ? tournament.entryFeeCents
      : Number(tournament.entryFee ?? 0) > 0
      ? Math.round(Number(tournament.entryFee) * 100)
      : 0
  const feeLabel = entryFeeCents > 0 ? formatMoney(entryFeeCents) : '$ Free'
  const quickFeeLabel = entryFeeCents > 0 ? `$${Math.round(entryFeeCents / 100)}+` : 'Free'
  const venueNameLabel = String(tournament.venueName ?? '').trim()
  const venueAddressLabel = String(tournament.venueAddress ?? '').trim()
  const locationLabel = venueAddressLabel || 'Location not set'
  const playerCount = Number(tournament._count?.players ?? 0)
  const totalTeams = ((tournament.divisions ?? []) as any[]).reduce(
    (sum, division) => sum + Number(division?._count?.teams ?? 0),
    0
  )
  const tournamentAvailabilityData = ((fullTournamentQuery.data as any | null) ?? tournament) as any
  const registrationOpen = isRegistrationOpen(tournamentAvailabilityData)
  const isPublicBoardEnabled =
    (fullTournamentQuery.data as any | null)?.isPublicBoardEnabled ??
    (tournament as any)?.isPublicBoardEnabled ??
    tournamentAvailabilityData?.isPublicBoardEnabled
  const isClosedAccessTournament = isPublicBoardEnabled === false
  const organizerLabel = tournament.user?.name || tournament.user?.email || 'Piqle'
  const canLeaveTournament = myStatus === 'active'
  const requiresPaidLeaveConfirm = entryFeeCents > 0
  const isPaidByStatus = Boolean(
    myStatusQuery.data?.isPaid === true || myStatusQuery.data?.paymentStatus === 'PAID'
  )
  useEffect(() => {
    if (!paymentAttemptedRef.current) return
    if (isPaidByStatus) return
    void syncPaymentStatus()
  }, [isPaidByStatus, syncPaymentStatus])

  const canPayNow = !paymentSyncing && myStatus === 'active' && entryFeeCents > 0 && !isPaidByStatus

  useEffect(() => {
    if (!(myStatus === 'active' && isPaidByStatus)) return
    if (!paymentSuccessNotice) return
    if (paymentToastShownRef.current) return
    paymentToastShownRef.current = true
    toast.success('Payment successful.')
  }, [myStatus, isPaidByStatus, paymentSuccessNotice, toast])
  const shouldShowRegisterCta =
    registrationOpen &&
    !pendingInvitation &&
    myStatus !== 'active' &&
    myStatus !== 'waitlisted'
  const ctaLabel = pendingInvitation
    ? acceptInvitation.isPending
      ? 'Accepting...'
      : 'Accept Invitation'
    : canLeaveTournament
    ? cancelRegistration.isPending
      ? 'Leaving...'
      : 'Leave Tournament'
    : myStatus === 'waitlisted'
    ? 'View Waitlist Spot'
    : shouldShowRegisterCta
    ? 'Register for Tournament'
    : hasPrivilegedAccess
    ? 'Manage Registration'
    : `Register Now • ${feeLabel}`
  const amenityLabels = [
    locationLabel !== 'Location not set' ? 'Venue Details' : null,
    tournament.publicSlug ? 'Public Scoreboard' : null,
    tournament.registrationEndDate ? 'Online Registration' : null,
    tournament.divisions.length > 1 ? 'Multiple Divisions' : null,
    entryFeeCents > 0 ? 'Paid Entry' : 'Free Entry',
  ].filter(Boolean) as string[]
  const organizerMetaLabel = `${tournament.divisions.length} divisions • ${playerCount || totalTeams} ${
    playerCount ? 'players' : 'teams'
  }`
  const showPrimaryCta =
    Boolean(pendingInvitation) ||
    shouldShowRegisterCta ||
    canLeaveTournament ||
    myStatus === 'waitlisted' ||
    hasPrivilegedAccess
  const hasRestrictedRegistrationAccess =
    registrationOpen &&
    !shouldShowRegisterCta &&
    !pendingInvitation &&
    !canLeaveTournament &&
    !hasPrivilegedAccess &&
    myStatus !== 'waitlisted'
  const cannotRegisterForThisTournament =
    !shouldShowRegisterCta &&
    !pendingInvitation &&
    !canLeaveTournament &&
    !hasPrivilegedAccess &&
    myStatus !== 'waitlisted'
  const shouldShowClosedTournamentNotice =
    isClosedAccessTournament || hasRestrictedRegistrationAccess || cannotRegisterForThisTournament
  const shouldShowStickyCta = false
  const dashboardRegistrationSummary =
    myStatusQuery.data?.status === 'active' &&
    myStatusQuery.data?.divisionName &&
    myStatusQuery.data?.teamName
      ? `${myStatusQuery.data.divisionName} · ${myStatusQuery.data.teamName}`
      : null
  const myTeamId = myStatusQuery.data?.status === 'active' ? myStatusQuery.data?.teamId : null
  const dashboardTournamentData =
    (dashboardBoardQuery.data as any) ?? (adminTournamentQuery.data as any) ?? null
  const dashboardDivisionsData = ((dashboardTournamentData?.divisions ??
    (adminTournamentQuery.data as any)?.divisions ??
    (fullTournamentQuery.data as any)?.divisions ??
    tournament.divisions ??
    []) as any[])
  const myDivisionId = myStatusQuery.data?.status === 'active' ? myStatusQuery.data?.divisionId : null
  const myTeamName = myStatusQuery.data?.status === 'active' ? myStatusQuery.data?.teamName : null
  const statusMeta = getStatusMeta(tournamentAvailabilityData, myStatus, hasPrivilegedAccess)
  const compactHeroStatusLabel = isCompactHeroStatus(statusMeta.label) ? statusMeta.label : null
  const tournamentDescription = String(tournament.description ?? '').trim()
  const tournamentForClubMeta = (tournamentAvailabilityData ?? tournament) as any
  const linkedClubId = String(
    tournamentForClubMeta.clubId ??
      tournamentForClubMeta.club?.id ??
      tournamentForClubMeta.hostClubId ??
      tournamentForClubMeta.hostClub?.id ??
      ''
  ).trim()
  const linkedClubQuery = api.club.get.useQuery(
    { id: linkedClubId },
    { enabled: Boolean(linkedClubId), retry: false }
  )
  const resolvedClubId = linkedClubId
  const linkedClubName = String(
    linkedClubQuery.data?.name ??
    tournamentForClubMeta.club?.name ??
      tournamentForClubMeta.hostClub?.name ??
      ''
  ).trim()
  const clubLabel =
    linkedClubName ||
    (linkedClubQuery.isLoading && resolvedClubId ? 'Loading club...' : '')
  const hasLinkedClubLabel = Boolean(clubLabel)
  const canOpenLinkedClub = Boolean(resolvedClubId)
  const nowTs = Date.now()
  const tournamentStartTs = tournament.startDate ? new Date(tournament.startDate).getTime() : null
  const tournamentEndTs = tournament.endDate ? new Date(tournament.endDate).getTime() : null
  const timelineStatusLabel =
    tournamentEndTs != null && nowTs > tournamentEndTs
      ? 'Past'
      : tournamentStartTs != null && nowTs < tournamentStartTs
      ? 'Upcoming'
      : 'Ongoing'
  const divisionsForDisplay = Array.isArray((adminTournamentQuery.data as any)?.divisions)
    ? (((adminTournamentQuery.data as any)?.divisions ?? []) as any[])
    : Array.isArray((fullTournamentQuery.data as any)?.divisions)
    ? (((fullTournamentQuery.data as any)?.divisions ?? []) as any[])
    : ((tournament.divisions ?? []) as any[])
  const tournamentDateTimeRangeLabel = formatDateRange(tournament.startDate, tournament.endDate)
  const registrationDateTimeRangeLabel =
    tournamentAvailabilityData?.registrationStartDate || tournamentAvailabilityData?.registrationEndDate
      ? formatDateRange(tournamentAvailabilityData?.registrationStartDate, tournamentAvailabilityData?.registrationEndDate)
      : null

  const handlePayNow = async () => {
    paymentAttemptedRef.current = true
    setPaymentSyncing(true)
    setPaymentSuccessNotice(false)
    try {
      const result = await createCheckout.mutateAsync({
        tournamentId,
        returnPath: `/tournaments/${tournamentId}`,
      })
      if (result.url) {
        await Linking.openURL(result.url)
      }
    } catch (error: any) {
      setPaymentSyncing(false)
      paymentAttemptedRef.current = false
      setPaymentErrorMessage(error?.message || 'Unable to open checkout right now.')
    }
  }

  const handlePrimaryAction = () => {
    if (pendingInvitation) {
      acceptInvitation.mutate({ invitationId: pendingInvitation.id })
      return
    }

    if (!isAuthenticated) {
      router.push('/sign-in')
      return
    }

    if (canLeaveTournament) {
      setLeaveTournamentSheetOpen(true)
      return
    }

    router.push(`/tournaments/${tournament.id}/register`)
  }

  const handleLeaveTournament = () => {
    if (!isAuthenticated) {
      router.push('/sign-in')
      return
    }
    if (cancelRegistration.isPending) return
    setLeaveTournamentSheetOpen(true)
  }

  const handleShare = async () => {
    const url = buildWebUrl(`/scoreboard/${tournament.id}`)
    try {
      await Share.share({
        message: `${tournament.title}\n${url}`,
        url,
      })
    } catch {}
  }

  const handleOpenMaps = () => {
    if (!locationLabel || locationLabel === 'Location not set') return
    void Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationLabel)}`
    )
  }

  const handleOpenOrganizerProfile = () => {
    if (!tournament.user?.id) return
    router.push({ pathname: '/profile/[id]', params: { id: tournament.user.id } })
  }

  const scrollToComments = useCallback(() => {
    setActiveTab('info')
    if (commentsAnchorY == null) {
      setPendingScrollToComments(true)
      return
    }
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, commentsAnchorY - 12), animated: true })
    })
  }, [commentsAnchorY])

  const scrollToCommentsEnd = useCallback(() => {
    setActiveTab('info')
    if (commentsAnchorY == null) {
      setPendingScrollToComments(true)
      return
    }
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true })
      commentsThreadRef.current?.scrollToEnd({ animated: true })
    })
  }, [commentsAnchorY])

  useEffect(() => {
    if (!pendingScrollToComments) return
    if (activeTab !== 'info') return
    if (commentsAnchorY == null) return
    setPendingScrollToComments(false)
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, commentsAnchorY - 12), animated: true })
    })
  }, [activeTab, commentsAnchorY, pendingScrollToComments])

  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const s = Keyboard.addListener(showEv, () => setCommentsKeyboardVisible(true))
    const h = Keyboard.addListener(hideEv, () => setCommentsKeyboardVisible(false))
    const didShow = Keyboard.addListener('keyboardDidShow', () => {
      scrollToCommentsEnd()
      setTimeout(() => {
        commentsThreadRef.current?.scrollToEnd({ animated: true })
      }, 60)
    })
    return () => {
      s.remove()
      h.remove()
      didShow.remove()
    }
  }, [scrollToCommentsEnd])

  const commentsLen = (commentsQuery.data ?? []).length
  useEffect(() => {
    if (!commentsLen) return
    requestAnimationFrame(() => {
      commentsThreadRef.current?.scrollToEnd({ animated: true })
    })
  }, [commentsLen])

  useEffect(() => {
    if (activeTab !== 'dashboard') return
    const divisions = dashboardDivisionsData
    if (!divisions.length) return
    if (dashboardDivisionId && divisions.some((d: any) => d.id === dashboardDivisionId)) return
    const myDivision = myStatusQuery.data?.divisionId
    const preferred = (myDivision && divisions.find((d: any) => d.id === myDivision)) || divisions[0]
    setDashboardDivisionId(preferred?.id ?? null)
  }, [activeTab, dashboardDivisionsData, dashboardDivisionId, myStatusQuery.data?.divisionId])

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.heroWrap}>
          <View style={styles.eventMiniBar}>
            <BackCircleButton onPress={() => router.back()} iconSize={18} style={styles.eventMiniBarButton} />
            <View style={styles.eventMiniBarActions}>
                <Pressable
                onPress={handleShare}
                style={({ pressed }) => [styles.eventMiniBarButton, pressed && styles.eventMiniBarButtonPressed]}
              >
                <Feather name="share-2" size={18} color={colors.text} />
                </Pressable>
              {canLeaveTournament ? (
                <Pressable
                  onPress={() => setLeaveTournamentSheetOpen(true)}
                  style={({ pressed }) => [styles.eventMiniBarButton, pressed && styles.eventMiniBarButtonPressed]}
                  accessibilityLabel="Leave tournament"
                >
                  <Feather name="log-out" size={18} color={colors.text} />
                </Pressable>
              ) : null}
            </View>
          </View>

          <SurfaceCard padded={false} style={styles.eventHeroCard}>
            <View style={styles.eventHeroHeader}>
              <EventHeroDotPattern style={styles.eventHeroPattern} dotStyle={styles.eventHeroPatternDot} />
              <View style={styles.eventHeroRow}>
                <View style={styles.eventHeroAvatarWrap}>
                  <EntityImage
                    uri={tournament.image}
                    style={styles.eventHeroAvatar}
                    resizeMode="cover"
                    placeholderResizeMode="contain"
                  />
            </View>
                <View style={styles.eventHeroMain}>
                  <View style={styles.eventHeroTitleRow}>
                    <Text style={styles.eventHeroTitle} numberOfLines={2}>
                      {tournament.title}
                    </Text>
                    {compactHeroStatusLabel ? (
                      <View style={styles.eventHeroCompactStatusBadge}>
                        <Feather name={getCompactStatusIcon(compactHeroStatusLabel)} size={14} color={colors.white} />
                        <Text style={styles.eventHeroCompactStatusText} numberOfLines={1}>
                          {compactHeroStatusLabel}
              </Text>
            </View>
                    ) : null}
          </View>
                  <View style={styles.eventHeroMetaRow}>
                    <View style={styles.eventHeroChip}>
                      <Text style={styles.eventHeroChipText} numberOfLines={1}>
                        {formatTournamentFormat(tournament.format)}
                      </Text>
        </View>
                    <Pressable
                      onPress={() => setTournamentFeedbackInfoOpen(true)}
                      style={({ pressed }) => [styles.eventHeroRatingPill, pressed && styles.eventHeroRatingPillPressed]}
                    >
                      <RatingStarIcon size={16} filled color="#F4B000" />
                      {feedbackCanPublishEffective && feedbackAverageEffective ? (
                        <Text style={styles.eventHeroRatingText}>{feedbackAverageEffective.toFixed(1)}</Text>
                      ) : (
                        <Text style={styles.eventHeroRatingMuted}>New</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
            </SurfaceCard>
          </View>

        <PickleRefreshScrollView
          ref={scrollRef as any}
          style={styles.contentScroll}
          contentContainerStyle={[styles.scrollContent, styles.scrollContentNoCta]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshing={pullToRefresh.refreshing}
          onRefresh={pullToRefresh.onRefresh}
          bounces
        >
        {shouldShowClosedTournamentNotice ? (
          <View style={styles.closedTournamentNoticeWrap}>
            <View style={styles.closedTournamentNotice}>
              <Feather name="lock" size={16} color={colors.warning} />
              <View style={styles.closedTournamentNoticeCopy}>
                <Text style={styles.closedTournamentNoticeTitle}>
                  Registration is unavailable
                </Text>
                <Text style={styles.closedTournamentNoticeText}>
                  This tournament may be closed or invite-only
                </Text>
        </View>
            </View>
          </View>
        ) : null}

        {showPrimaryCta ? (
          <View style={styles.inlineCtaSection}>
            <View style={styles.inlineCtaStack}>
              {canPayNow ? (
                <Pressable
                  onPress={handlePayNow}
                  disabled={createCheckout.isPending}
                  style={({ pressed }) => [
                    styles.inlineCtaButton,
                    pressed && !createCheckout.isPending && styles.inlineCtaButtonPressed,
                  ]}
                >
                  <OptionalLinearGradient
                    colors={[colors.primary, colors.purple]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.inlineCtaGradient, createCheckout.isPending && styles.inlineCtaGradientDisabled]}
                  >
                    <Text style={styles.inlineCtaText}>
                      {createCheckout.isPending ? 'Opening payment...' : `Pay now ${feeLabel}`}
                  </Text>
                  </OptionalLinearGradient>
                </Pressable>
              ) : null}
              {paymentSyncing ? (
                <View style={styles.paymentSyncChip}>
                  <ActivityIndicator size="small" color={colors.white} />
                  <Text style={styles.paymentSyncChipText}>Confirming payment...</Text>
                </View>
              ) : null}

              {!canLeaveTournament ? (
                <Pressable
                  onPress={handlePrimaryAction}
                  disabled={acceptInvitation.isPending || cancelRegistration.isPending}
                  style={({ pressed }) => [
                    styles.inlineCtaButton,
                    pressed &&
                      !(acceptInvitation.isPending || cancelRegistration.isPending) &&
                      styles.inlineCtaButtonPressed,
                  ]}
                >
                  <OptionalLinearGradient
                    colors={shouldShowRegisterCta ? [colors.primary, colors.primary] : [colors.primary, colors.purple]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[
                      styles.inlineCtaGradient,
                      (acceptInvitation.isPending || cancelRegistration.isPending) && styles.inlineCtaGradientDisabled,
                    ]}
                  >
                    <Text style={styles.inlineCtaText}>{ctaLabel}</Text>
                  </OptionalLinearGradient>
                </Pressable>
              ) : null}
          </View>
          </View>
        ) : null}

        <View style={styles.contentSection}>
          <SegmentedControl
            value={activeTab}
            onChange={(value) => setActiveTab(value as DetailTab)}
            trackStyle={styles.segmentTrack}
            options={[
              { value: 'info', label: 'Info' },
              { value: 'divisions', label: 'Divisions' },
              { value: 'dashboard', label: 'Dashboard' },
            ]}
          />
          {dashboardRegistrationSummary ? (
            <Pressable
              onPress={() => setActiveTab('dashboard')}
              style={({ pressed }) => [styles.dashboardBanner, pressed && styles.dashboardBannerPressed]}
            >
              <Text style={styles.dashboardBannerText}>
                <Text style={styles.dashboardBannerStrong}>You&apos;re registered:</Text>{' '}
              </Text>
              <View style={styles.dashboardBannerChip}>
                <Text style={styles.dashboardBannerChipText}>
                  {myStatusQuery.data?.divisionName ?? 'Division'}
                </Text>
              </View>
              <View style={styles.dashboardBannerChip}>
                <Text style={styles.dashboardBannerChipText}>
                  {myStatusQuery.data?.teamName ?? 'Team'}
                </Text>
              </View>
            </Pressable>
          ) : null}
          {paymentSuccessNotice && myStatus === 'active' ? (
            <View style={styles.paymentSuccessNotice}>
              <Feather name="check-circle" size={14} color={colors.white} />
              <Text style={styles.paymentSuccessNoticeText}>Payment successful</Text>
            </View>
          ) : null}

          <SegmentedContentFade activeKey={activeTab} segmentOrder={['info', 'divisions', 'dashboard']}>
          {activeTab === 'info' ? (
            <View style={styles.sectionStack}>
              {pendingInvitation ? (
                <SurfaceCard tone="hero" style={styles.detailCard}>
                  <SectionTitle
                    title="Invitation pending"
                    subtitle="Accept this invite to jump straight into registration."
                  />
                  <View style={styles.invitationActions}>
                    <View style={{ flex: 1 }}>
                      <ActionButton
                        label="Accept"
                        loading={acceptInvitation.isPending}
                        onPress={() => acceptInvitation.mutate({ invitationId: pendingInvitation.id })}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ActionButton
                        label="Decline"
                        variant="secondary"
                        loading={declineInvitation.isPending}
                        onPress={() => declineInvitation.mutate({ invitationId: pendingInvitation.id })}
                      />
                    </View>
                  </View>
                </SurfaceCard>
              ) : null}

              {tournamentDescription ? (
              <SurfaceCard style={styles.detailCard}>
                  {tournamentDescriptionExpandable ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityHint="Tap to expand or collapse the full description"
                      onPress={toggleTournamentDescriptionExpanded}
                      style={({ pressed }) => [
                        styles.aboutDescriptionTapArea,
                        pressed && styles.aboutDescriptionTapAreaPressed,
                      ]}
                    >
                <Text style={[styles.cardTitle, styles.cardTitleTight]}>About</Text>
                      <Text
                        style={styles.descriptionText}
                        numberOfLines={tournamentDescriptionExpanded ? undefined : 3}
                      >
                        {tournamentDescription}
                </Text>
                      <View style={styles.descriptionLinkPressable}>
                        <Text style={styles.descriptionLinkText}>
                          {tournamentDescriptionExpanded ? 'Hide description' : 'Show full description'}
                        </Text>
                </View>
                    </Pressable>
                  ) : (
                    <>
                      <Text style={[styles.cardTitle, styles.cardTitleTight]}>About</Text>
                      {!tournamentDescriptionExpanded && !tournamentDescriptionExpandable ? (
                        <Text
                          style={[styles.descriptionText, styles.descriptionMeasureText]}
                          onTextLayout={(event) => {
                            if (tournamentDescriptionExpanded || tournamentDescriptionExpandable) return
                            if (event.nativeEvent.lines.length > 3) {
                              setTournamentDescriptionExpandable(true)
                            }
                          }}
                        >
                          {tournamentDescription}
                        </Text>
                      ) : null}
                      <Text style={styles.descriptionText} numberOfLines={tournamentDescriptionExpanded ? undefined : 3}>
                        {tournamentDescription}
                      </Text>
                    </>
                  )}
              </SurfaceCard>
              ) : null}

              <SurfaceCard style={styles.detailCard}>
                <View style={styles.infoHeaderRow}>
                  <Text style={[styles.cardTitle, styles.cardTitleLoose]}>Information</Text>
                  <View style={styles.heroTimelineChip}>
                    <Text style={styles.heroTimelineChipText}>{timelineStatusLabel}</Text>
                  </View>
                </View>
                <View style={styles.infoTopChips}>
                  <OptionalLinearGradient
                    colors={['#FFF3C4', '#F6D77B', '#E8B64B']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.infoPriceChip}
                    fallbackColor="#F6D77B"
                  >
                    <Text style={styles.infoPriceChipText}>{feeLabel}</Text>
                  </OptionalLinearGradient>
                </View>
                <View style={styles.infoDatesBlock}>
                  <View style={styles.infoDateRow}>
                    <Feather name="calendar" size={16} color={colors.textMuted} />
                    <Text style={styles.infoDateText} numberOfLines={1}>
                      {tournamentDateTimeRangeLabel}
                    </Text>
                  </View>
                  {registrationDateTimeRangeLabel ? (
                    <View style={styles.infoDateRow}>
                      <Feather name="clock" size={16} color={colors.textMuted} />
                      <Text style={styles.infoDateText} numberOfLines={1}>
                        {registrationDateTimeRangeLabel}
                      </Text>
                    </View>
                  ) : null}
                </View>
                    <Pressable
                      disabled={locationLabel === 'Location not set'}
                      onPress={handleOpenMaps}
                  style={({ pressed }) => [styles.infoLocationRow, pressed && locationLabel !== 'Location not set' && styles.inlineLinkPressed]}
                    >
                  <Feather
                    name="map-pin"
                    size={14}
                    color={colors.textMuted}
                  />
                      <Text
                    numberOfLines={1}
                        style={[
                      styles.infoLocationText,
                      locationLabel === 'Location not set' && styles.infoLocationTextDisabled,
                        ]}
                      >
                    {locationLabel}
                      </Text>
                    </Pressable>

                {hasLinkedClubLabel ? (
                  canOpenLinkedClub ? (
                    <Pressable
                      onPress={() => {
                        if (!resolvedClubId) return
                        router.push({ pathname: '/clubs/[id]', params: { id: resolvedClubId } })
                      }}
                      hitSlop={8}
                      style={({ pressed }) => [styles.infoClubLinkWrap, pressed && styles.inlineLinkPressed]}
                    >
                      <View style={styles.infoClubLinkRow}>
                        <Feather name="flag" size={14} color={colors.textMuted} />
                        <Text numberOfLines={1} style={styles.infoClubLinkText}>
                          {clubLabel}
                        </Text>
                  </View>
                    </Pressable>
                  ) : (
                    <View style={styles.infoClubLinkWrap}>
                      <View style={styles.infoClubLinkRow}>
                        <Feather name="flag" size={14} color={colors.textMuted} />
                        <Text numberOfLines={1} style={styles.infoClubLinkText}>
                          {clubLabel}
                        </Text>
                </View>
                    </View>
                  )
                ) : null}

                <View style={styles.infoAmenitiesRow}>
                {amenityLabels.length ? (
                  <View style={styles.badgeWrap}>
                    {amenityLabels.map((label) => (
                      <View key={label} style={styles.secondaryBadge}>
                        <Text style={styles.secondaryBadgeText}>{label}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.mutedBodyText}>More venue details will be added by the organizer soon.</Text>
                )}
                </View>
              </SurfaceCard>

              <SurfaceCard style={styles.detailCard}>
                <Text style={[styles.cardTitle, styles.cardTitleLoose]}>Organizer</Text>
                <View style={styles.organizerRow}>
                  <Pressable
                    disabled={!tournament.user?.id}
                    onPress={handleOpenOrganizerProfile}
                    style={({ pressed }) => [pressed && tournament.user?.id && styles.organizerAvatarPressed]}
                  >
                    <RemoteUserAvatar
                      uri={tournament.user?.image}
                      size={48}
                      fallback="initials"
                      initialsLabel={organizerLabel}
                    />
                  </Pressable>
                  <Pressable
                    disabled={!tournament.user?.id}
                    onPress={handleOpenOrganizerProfile}
                    hitSlop={8}
                    style={({ pressed }) => [styles.organizerInfoTap, pressed && tournament.user?.id && styles.organizerNamePressed]}
                  >
                    <Text style={styles.organizerName}>{organizerLabel}</Text>
                    <Text style={styles.organizerMeta}>{organizerMetaLabel}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setTdFeedbackInfoOpen(true)}
                    style={({ pressed }) => [styles.ratingPillBtn, pressed && styles.ratingPillBtnPressed]}
                  >
                    <RatingStarIcon size={17} filled color="#F4B000" />
                    {tdCanPublishEffective && tdAverageEffective ? (
                      <Text style={styles.feedbackValue}>{tdAverageEffective.toFixed(1)}</Text>
                    ) : (
                      <Text style={styles.feedbackValueMuted}>No rating yet</Text>
                    )}
                  </Pressable>
                  </View>
              </SurfaceCard>

            </View>
          ) : null}

          {activeTab === 'divisions' ? (
            <View style={styles.sectionStack}>
              {divisionsForDisplay.length ? (
                divisionsForDisplay.map((division: any) => {
                  const divisionSlotMetrics = getDivisionSlotMetrics(division, tournament.format)
                  const playersPerTeam = getPlayersPerTeam(division.teamKind, tournament.format, division.name)
                  const maxTeams = Number(division.maxTeams ?? 0)
                  const maxPlayers =
                    maxTeams > 0 && playersPerTeam !== null ? maxTeams * playersPerTeam : 0
                  const createdTeams = divisionSlotMetrics.createdTeams
                  const createdSlots = divisionSlotMetrics.createdSlots
                  const filledSlots = divisionSlotMetrics.filledSlots
                  const isMyDivision = Boolean(myDivisionId && division.id === myDivisionId)

                  return (
                    <SurfaceCard key={division.id} style={styles.detailCard}>
                      <View style={styles.divisionHeader}>
                        <Text style={styles.divisionTitle}>{division.name}</Text>
                        {isMyDivision ? (
                          <View style={styles.divisionMyBadge}>
                            <Text style={styles.divisionMyBadgeText}>My division</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.divisionMetaGrid}>
                        <View style={styles.divisionMetaCell}>
                          <View style={styles.metaRow}>
                            <Feather name="users" size={16} color={colors.textMuted} />
                            <Text style={styles.mutedBodyText}>
                              {createdSlots !== null && filledSlots !== null && createdSlots > 0
                                ? `${filledSlots} / ${createdSlots} spots filled`
                                : createdSlots !== null && createdSlots > 0
                                ? `${createdSlots} created spots`
                                : createdTeams > 0
                                ? `${createdTeams} teams created`
                                : maxPlayers > 0
                                ? `${maxPlayers} max players`
                                : 'No teams created yet'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.divisionPriceWrap}>
                          <OptionalLinearGradient
                            colors={['#FFF3C4', '#F6D77B', '#E8B64B']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.divisionPriceChip}
                            fallbackColor="#F6D77B"
                          >
                            <Text style={styles.divisionPriceChipText}>{feeLabel}</Text>
                          </OptionalLinearGradient>
                        </View>
                      </View>
                      {isMyDivision && myTeamName ? (
                        <View style={styles.divisionMyTeamRow}>
                          <Feather name="users" size={16} color={colors.primary} />
                          <Text style={styles.divisionMyTeamText}>My team: {myTeamName}</Text>
                        </View>
                      ) : null}
                      {registrationOpen && !canLeaveTournament ? (
                        <Pressable
                          onPress={() =>
                            isAuthenticated
                              ? router.push(`/tournaments/${tournament.id}/register`)
                              : router.push('/sign-in')
                          }
                          style={({ pressed }) => [styles.smallCtaButton, pressed && styles.smallCtaButtonPressed]}
                        >
                          <OptionalLinearGradient
                            colors={[colors.primary, colors.purple]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.smallCtaGradient}
                          >
                            <Text style={styles.smallCtaText}>{`Register for ${division.name}`}</Text>
                          </OptionalLinearGradient>
                        </Pressable>
                      ) : null}
                    </SurfaceCard>
                  )
                })
              ) : (
                <EmptyState
                  title="No divisions yet"
                  body="This tournament will show its divisions here once the organizer publishes them."
                />
              )}
            </View>
          ) : null}

          {activeTab === 'dashboard' ? (
            <View style={styles.sectionStack}>
              {dashboardBoardQuery.isLoading ? (
                <View style={styles.dashboardLoadingState}>
                  <LoadingBlock label="Loading dashboard..." />
                </View>
              ) : dashboardDivisionsData.length > 0 ? (
                <View style={styles.dashboardNativeStack}>
                  {(() => {
                    const divisions = dashboardDivisionsData
                    const selectedDivision = divisions.find((d: any) => d.id === dashboardDivisionId) ?? divisions[0]
                    if (!selectedDivision) return null

                    const playersPerTeam = getPlayersPerTeam(
                      selectedDivision.teamKind,
                      dashboardTournamentFormat ?? tournament.format,
                      selectedDivision.name
                    ) ?? 2
                    const stageMatches = ((dashboardStageQuery.data?.matches ?? selectedDivision.matches ?? []) as any[])
                    const standingsFromApi = (
                      isDashboardIndyLeague
                        ? (dashboardIndyStandingsQuery.data?.standings ?? [])
                        : (dashboardStandingsQuery.data?.standings ?? [])
                    ) as any[]
                    const teamStats = new Map<string, any>()
                    ;((selectedDivision.teams ?? []) as any[]).forEach((team: any, idx: number) => {
                      teamStats.set(team.id, {
                        teamId: team.id,
                        teamName: team.name,
                        rank: idx + 1,
                        wins: 0,
                        losses: 0,
                        pointsFor: 0,
                        pointsAgainst: 0,
                        pointDiff: 0,
                        slotSummary: `${Number(team?.teamPlayers?.length ?? 0)}/${playersPerTeam} slots`,
                      })
                    })

                    ;(stageMatches as any[]).forEach((match: any) => {
                      const teamA = teamStats.get(match.teamAId)
                      const teamB = teamStats.get(match.teamBId)
                      if (!teamA || !teamB) return
                      const games = (match.games ?? []) as any[]
                      if (!games.length) return
                      let a = 0
                      let b = 0
                      games.forEach((g: any) => {
                        const sa = Number(g?.scoreA ?? 0)
                        const sb = Number(g?.scoreB ?? 0)
                        teamA.pointsFor += sa
                        teamA.pointsAgainst += sb
                        teamB.pointsFor += sb
                        teamB.pointsAgainst += sa
                        if (sa > sb) a += 1
                        if (sb > sa) b += 1
                      })
                      if (a > b) {
                        teamA.wins += 1
                        teamB.losses += 1
                      } else if (b > a) {
                        teamB.wins += 1
                        teamA.losses += 1
                      }
                    })

                    const computedRows = Array.from(teamStats.values())
                      .map((r) => ({ ...r, pointDiff: r.pointsFor - r.pointsAgainst }))
                      .sort((a, b) => {
                        if (b.wins !== a.wins) return b.wins - a.wins
                        if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff
                        return b.pointsFor - a.pointsFor
                      })
                      .map((r, i) => ({ ...r, rank: i + 1 }))
                    const apiRows = standingsFromApi
                      .map((r: any) => ({
                        teamId: r.teamId,
                        teamName: r.teamName,
                        rank: Number(r.rank ?? 0),
                        wins: Number(r.wins ?? 0),
                        losses: Number(r.losses ?? 0),
                        pointsFor: Number(r.pointsFor ?? 0),
                        pointsAgainst: Number(r.pointsAgainst ?? 0),
                        pointDiff: Number(r.pointDiff ?? 0),
                      }))
                      .sort((a: any, b: any) => Number(a.rank ?? 999) - Number(b.rank ?? 999))
                    const rows =
                      isDashboardIndyLeague && dashboardIndyStandingsQuery.isLoading
                        ? []
                        : apiRows.length > 0
                          ? apiRows
                          : computedRows

                    const sortDashboardMatches = (list: any[]) =>
                      [...list].sort((a, b) => {
                        const ra = Number(a.roundIndex ?? 0)
                        const rb = Number(b.roundIndex ?? 0)
                        if (ra !== rb) return ra - rb
                        return String(a.id ?? '').localeCompare(String(b.id ?? ''))
                      })
                    const playInMatches = sortDashboardMatches(
                      stageMatches.filter((m: any) => m.stage === 'PLAY_IN') as any[]
                    )
                    const playoffMatches = sortDashboardMatches(
                      stageMatches.filter((m: any) => m.stage === 'ELIMINATION') as any[]
                    )
                    const rrMatchesForDashboardResults = sortDashboardMatches(
                      stageMatches.filter((m: any) => {
                        if (m.stage !== 'ROUND_ROBIN') return false
                        if (!isDashboardLeagueRrOrLadder) return false
                        return dashboardLeagueDayMode === 'DAY_ONLY'
                      }) as any[]
                    )
                    const playoffMaxRound = playoffMatches.length
                      ? Math.max(...playoffMatches.map((m: any) => Number(m.roundIndex ?? 0)), 0)
                      : -1
                    const playoffFinalMatch =
                      playoffMatches.find(
                        (m: any) =>
                          Number(m.roundIndex ?? 0) === playoffMaxRound &&
                          (m as any).note !== 'Third Place Match'
                      ) ?? null
                    const fmtResolved = dashboardTournamentFormat ?? tournament.format
                    const shouldShowDashboardBracketStages =
                      fmtResolved !== 'INDY_LEAGUE' &&
                      fmtResolved !== 'ROUND_ROBIN' &&
                      fmtResolved !== 'LEAGUE_ROUND_ROBIN' &&
                      fmtResolved !== 'LADDER_LEAGUE' &&
                      fmtResolved !== 'MLP'
                    const playoffPlacements = getPlayoffPlacementsFromMatches(
                      playoffMatches,
                      dashboardTournamentFormat ?? tournament.format
                    )
                    const hasMyTeam = Boolean(myTeamId && rows.some((row: any) => row.teamId === myTeamId))
                    const seedByTeamId = new Map<string, number>(
                      rows.map((row: any, idx: number) => [String(row.teamId ?? `team-${idx}`), Number(row.rank ?? idx + 1)])
                    )
                    const stageLabel = dashboardStageQuery.data?.stage
                      ? String(dashboardStageQuery.data.stage).replaceAll('_', ' ')
                      : formatTournamentFormat(tournament.format)
                    const teamMembersById = new Map<
                      string,
                      Array<{ id: string; profileId?: string | null; name: string; image?: string | null }>
                    >()
                    ;((selectedDivision.teams ?? []) as any[]).forEach((team: any) => {
                      const members = ((team?.teamPlayers ?? []) as any[]).map((tp: any, idx: number) => {
                        const player = tp?.player ?? {}
                        const user = player?.user ?? {}
                        const fullName = String(
                          user?.name ??
                            [player?.firstName, player?.lastName].filter(Boolean).join(' ') ??
                            player?.name ??
                            `Player ${idx + 1}`
                        ).trim()
                        return {
                          id: String(player?.id ?? user?.id ?? `${team?.id ?? 'team'}-${idx}`),
                          profileId: String(user?.id ?? player?.userId ?? '').trim() || null,
                          name: fullName || `Player ${idx + 1}`,
                          image: user?.image ?? player?.image ?? null,
                        }
                      })
                      teamMembersById.set(String(team.id), members)
                    })

                    const dashboardContentAnimKey = `${String(dashboardDivisionId ?? selectedDivision.id)}-${dashboardLeagueDayMode}-${dashboardLeagueDayId ?? 'season'}`
                    return (
                      <SegmentedContentFade
                        activeKey={dashboardContentAnimKey}
                        opacityOnly
                        style={styles.dashboardBlockStack}
                      >
                        {isMatchDayDashboardFormat ? (
                          <View style={styles.dashboardLeagueControls}>
                            <View style={styles.dashboardLeagueDaysRow}>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="All dates, season standings"
                                onPress={() => setDashboardLeagueDayMode('SEASON_TO_DATE')}
                                style={({ pressed }) => [
                                  styles.dashboardLeagueScopeButton,
                                  dashboardLeagueDayMode === 'SEASON_TO_DATE' &&
                                    styles.dashboardDivisionChipActive,
                                  pressed && styles.dashboardDivisionChipPressed,
                                ]}
                              >
                                <Feather
                                  name="calendar"
                                  size={16}
                                  color={
                                    dashboardLeagueDayMode === 'SEASON_TO_DATE'
                                      ? colors.text
                                      : colors.textMuted
                                  }
                                />
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    styles.dashboardLeagueScopeButtonLabel,
                                    dashboardLeagueDayMode === 'SEASON_TO_DATE' &&
                                      styles.dashboardDivisionChipTextActive,
                                  ]}
                                >
                                  All dates
                  </Text>
                              </Pressable>
                              <Text style={styles.dashboardLeagueDaysOr}>or</Text>
                              {dashboardLeagueMatchDaysQuery.isLoading ? (
                                <Text style={[styles.dashboardLeagueHint, styles.dashboardLeagueDaysRowHint]}>
                                  Loading days…
                                </Text>
                              ) : (dashboardLeagueMatchDaysQuery.data?.length ?? 0) > 0 ? (
                                <View style={styles.dashboardLeagueDayPickerClip}>
                                  <RNScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    style={styles.dashboardLeagueDayPickerScroll}
                                    contentContainerStyle={styles.dashboardLeagueDaysContent}
                                  >
                                  {(
                                    (dashboardLeagueMatchDaysQuery.data ?? []) as {
                                      id: string
                                      date: string | Date
                                    }[]
                                  ).map((day) => {
                                    const active =
                                      dashboardLeagueDayMode === 'DAY_ONLY' &&
                                      day.id === dashboardLeagueDayId
                                    const dayLabel = new Date(day.date).toLocaleDateString(undefined, {
                                      month: 'short',
                                      day: 'numeric',
                                    })
                                    return (
                                      <Pressable
                                        key={day.id}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Match day ${dayLabel}`}
                                        onPress={() => {
                                          setDashboardLeagueDayMode('DAY_ONLY')
                                          setDashboardLeagueDayId(String(day.id))
                                        }}
                                        style={({ pressed }) => [
                                          styles.dashboardLeagueDayChip,
                                          active && styles.dashboardLeagueDayChipActive,
                                          pressed && styles.dashboardLeagueDayChipPressed,
                                        ]}
                                      >
                                        <Text
                                          numberOfLines={1}
                                          style={[
                                            styles.dashboardLeagueDayChipText,
                                            active && styles.dashboardLeagueDayChipTextActive,
                                          ]}
                                        >
                                          {dayLabel}
                                        </Text>
                                      </Pressable>
                                    )
                                  })}
                                  </RNScrollView>
                                </View>
                              ) : (
                                <Text style={[styles.dashboardLeagueHint, styles.dashboardLeagueDaysRowHint]}>
                                  No match days yet.
                                </Text>
                              )}
                            </View>
                </View>
              ) : null}

                        {divisions.length > 1 ? (
                          <View
                            style={[
                              styles.dashboardDivisionTabsOuter,
                              !isMatchDayDashboardFormat && styles.dashboardDivisionTabsOuterFirstBlock,
                            ]}
                          >
                            <RNScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                              contentContainerStyle={styles.dashboardDivisionTabsContent}
                              style={styles.dashboardDivisionTabsScroll}
                            >
                              {divisions.map((division: any) => {
                                const isActive = division.id === selectedDivision.id
                                return (
                                  <Pressable
                                    key={`dash-division-chip-${division.id}`}
                                    onPress={() => setDashboardDivisionId(String(division.id))}
                                    style={({ pressed }) => [
                                      styles.dashboardDivisionChip,
                                      isActive && styles.dashboardDivisionChipActive,
                                      pressed && styles.dashboardDivisionChipPressed,
                                    ]}
                                  >
                                    <Text
                                      numberOfLines={1}
                                      style={[
                                        styles.dashboardDivisionChipText,
                                        isActive && styles.dashboardDivisionChipTextActive,
                                      ]}
                                    >
                                      {division.name}
                    </Text>
                                  </Pressable>
                                )
                              })}
                            </RNScrollView>
                  </View>
                        ) : null}

                        <View style={[styles.dashboardDivisionCard, hasMyTeam && styles.dashboardDivisionCardActive]}>
                          <View style={styles.dashboardDivisionHeader}>
                            <Text style={styles.dashboardDivisionTitle}>{selectedDivision.name}</Text>
                            <Text style={styles.dashboardDivisionMeta}>
                              {rows.length} teams{stageLabel ? ` · ${stageLabel}` : ''}
                            </Text>
                          </View>
                          <View style={styles.dashboardStageBlock}>
                            <Text style={styles.dashboardStageTitle}>Round Robin table</Text>
                            {isMatchDayDashboardFormat ? (
                              <Text style={styles.dashboardLeagueTableHint}>
                                {dashboardLeagueDayMode === 'DAY_ONLY'
                                  ? 'Standings for the selected day only'
                                  : 'Standings across all match days (season)'}
                              </Text>
                            ) : null}
                          </View>
                          <View style={styles.dashboardStandingsList}>
                            <View style={styles.dashboardStandingsHead}>
                              <Text style={styles.dashboardHeadTeam}>Team</Text>
                              <Text style={styles.dashboardHeadStat}>W</Text>
                              <Text style={styles.dashboardHeadStat}>L</Text>
                              <Text style={styles.dashboardHeadStat}>PF</Text>
                              <Text style={styles.dashboardHeadStat}>PA</Text>
                              <Text style={styles.dashboardHeadStat}>Diff</Text>
                            </View>
                            {rows.length === 0 && isDashboardIndyLeague && dashboardIndyStandingsQuery.isLoading ? (
                              <View style={styles.dashboardStandingsLoadingWrap}>
                                <LoadingBlock label="Loading standings…" />
                              </View>
                            ) : null}
                            {rows.map((row: any, idx: number) => {
                              const isMine = Boolean(myTeamId && row.teamId === myTeamId)
                              const rowKey = String(row.teamId ?? idx)
                              const isExpanded = expandedDashboardTeamId === rowKey
                              const members = row.teamId ? teamMembersById.get(String(row.teamId)) ?? [] : []
                              return (
                                <View
                                  key={rowKey}
                                  style={[styles.dashboardStandingItem, idx === rows.length - 1 && styles.dashboardStandingItemLast]}
                                >
                                  <View
                                    style={[
                                      styles.dashboardStandingRow,
                                      isMine && styles.dashboardStandingRowMine,
                                      isExpanded && styles.dashboardStandingRowExpanded,
                                      idx === rows.length - 1 && styles.dashboardStandingRowLast,
                                    ]}
                                  >
                  <Pressable
                                      onPress={() => toggleDashboardTeamExpand(rowKey)}
                                      style={({ pressed }) => [styles.dashboardStandingRowMain, pressed && styles.dashboardStandingRowPressed]}
                                    >
                                      <View style={styles.dashboardStandingTeamWrap}>
                                        <Feather
                                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                          size={14}
                                          color={isMine ? colors.primary : colors.textMuted}
                                          style={styles.dashboardStandingExpandIcon}
                                        />
                                        <Text style={[styles.dashboardStandingTeam, isMine && styles.dashboardStandingTextMine]} numberOfLines={1}>
                                          {row.teamName ?? 'Team'}
                                        </Text>
                                      </View>
                                      <Text style={[styles.dashboardStandingCell, isMine && styles.dashboardStandingTextMine]}>{Number(row.wins ?? 0)}</Text>
                                      <Text style={[styles.dashboardStandingCell, isMine && styles.dashboardStandingTextMine]}>{Number(row.losses ?? 0)}</Text>
                                      <Text style={[styles.dashboardStandingCell, isMine && styles.dashboardStandingTextMine]}>{Number(row.pointsFor ?? 0)}</Text>
                                      <Text style={[styles.dashboardStandingCell, isMine && styles.dashboardStandingTextMine]}>{Number(row.pointsAgainst ?? 0)}</Text>
                                      <Text style={[styles.dashboardStandingCell, isMine && styles.dashboardStandingTextMine]}>{Number(row.pointDiff ?? 0)}</Text>
                  </Pressable>
                                    {isExpanded ? (
                                      <View style={styles.dashboardTeamMembersList}>
                                        {members.length ? (
                                          members.map((member, memberIdx) => (
                                            <Pressable
                                              key={`${rowKey}-member-${member.id}-${memberIdx}`}
                                              disabled={!member.profileId}
                                              onPress={() => {
                                                if (!member.profileId) return
                                                router.push({ pathname: '/profile/[id]', params: { id: member.profileId } })
                                              }}
                                              style={({ pressed }) => [
                                                styles.dashboardTeamMemberRow,
                                                pressed && member.profileId && styles.dashboardTeamMemberRowPressed,
                                              ]}
                                            >
                                              <RemoteUserAvatar
                                                uri={member.image}
                                                size={28}
                                                fallback="initials"
                                                initialsLabel={member.name}
                                              />
                                              <Text style={styles.dashboardTeamMemberName} numberOfLines={1}>
                                                {member.name}
                                              </Text>
                                            </Pressable>
                                          ))
                                        ) : (
                                          <Text style={styles.dashboardStageEmpty}>No players assigned yet.</Text>
                                        )}
                                      </View>
                                    ) : null}
                                  </View>
                                </View>
                              )
                            })}
                          </View>
                </View>

                        {isMatchDayDashboardFormat &&
                        dashboardLeagueDayMode === 'DAY_ONLY' &&
                        dashboardLeagueDayId ? (
                          <View style={styles.dashboardSectionCard}>
                            <View style={styles.dashboardMatchResultsStageBlock}>
                              <Text style={styles.dashboardMatchResultsTitle}>Match results</Text>
                              {isDashboardIndyLeague ? (
                                <>
                                  {dashboardIndyMatchupsQuery.isLoading ? (
                                    <Text style={styles.dashboardStageEmpty}>Loading matchups…</Text>
                                  ) : (dashboardIndyMatchupsQuery.data?.length ?? 0) === 0 ? (
                                    <Text style={styles.dashboardStageEmpty}>No matchups for this day.</Text>
                                  ) : (
                                    <View style={styles.dashboardMatchResultsList}>
                                      {((dashboardIndyMatchupsQuery.data ?? []) as any[]).map((mu: any) => {
                                        const key = String(mu.id ?? '')
                                        const isExpanded = expandedDashboardIndyMatchupId === key
                                        const homePlayers = getActiveIndyMatchupRosterPlayers(mu, mu.homeTeamId)
                                        const awayPlayers = getActiveIndyMatchupRosterPlayers(mu, mu.awayTeamId)
                                        return (
                                          <View key={key} style={styles.dashboardMatchResultCard}>
                                            <Pressable
                                              accessibilityRole="button"
                                              accessibilityState={{ expanded: isExpanded }}
                                              accessibilityLabel={`${mu.homeTeam?.name ?? 'Home'} vs ${mu.awayTeam?.name ?? 'Away'}, ${Number(mu.gamesWonHome ?? 0)}–${Number(mu.gamesWonAway ?? 0)}`}
                                              onPress={() => toggleDashboardIndyMatchupExpand(key)}
                                              style={({ pressed }) => [
                                                styles.dashboardMatchResultPress,
                                                pressed && styles.dashboardMatchResultPressPressed,
                                              ]}
                                            >
                                              <View style={styles.dashboardMatchResultRowHeaderInner}>
                                                <View style={styles.dashboardMatchResultRowHeaderText}>
                                                  <Text style={styles.dashboardMatchResultTeams} numberOfLines={2}>
                                                    {mu.homeTeam?.name ?? 'Home'} vs {mu.awayTeam?.name ?? 'Away'}
                                                  </Text>
                                                  <Text
                                                    style={[styles.dashboardMatchResultTeams, styles.dashboardMatchResultScoreLine]}
                                                  >
                                                    {Number(mu.gamesWonHome ?? 0)} – {Number(mu.gamesWonAway ?? 0)}
                                                  </Text>
                                                  {mu.court?.name ? (
                                                    <Text style={styles.dashboardMatchResultCourtMeta} numberOfLines={1}>
                                                      {mu.court.name}
                                                    </Text>
                                                  ) : null}
                        </View>
                                                <Feather
                                                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                                  size={18}
                                                  color={colors.textMuted}
                                                />
                                              </View>
                                            </Pressable>
                                            {isExpanded ? (
                                              <View style={styles.dashboardMatchResultExpanded}>
                                                <View style={styles.dashboardMatchResultRosterCol}>
                                                  <Text style={styles.dashboardMatchResultRosterTeamTitle} numberOfLines={2}>
                                                    {mu.homeTeam?.name ?? 'Home'}
                                                  </Text>
                                                  {homePlayers.length > 0 ? (
                                                    homePlayers.map((p) => (
                                                      <Text
                                                        key={`${key}-h-${p.id}-${p.letter}`}
                                                        style={styles.dashboardMatchResultRosterLine}
                                                      >
                                                        {p.letter}: {p.name}
                                                      </Text>
                                                    ))
                                                  ) : (
                                                    <Text style={styles.dashboardMatchResultRosterEmpty}>
                                                      No active players with letters.
                                                    </Text>
                                                  )}
                                                </View>
                                                <View style={styles.dashboardMatchResultRosterCol}>
                                                  <Text style={styles.dashboardMatchResultRosterTeamTitle} numberOfLines={2}>
                                                    {mu.awayTeam?.name ?? 'Away'}
                                                  </Text>
                                                  {awayPlayers.length > 0 ? (
                                                    awayPlayers.map((p) => (
                                                      <Text
                                                        key={`${key}-a-${p.id}-${p.letter}`}
                                                        style={styles.dashboardMatchResultRosterLine}
                                                      >
                                                        {p.letter}: {p.name}
                                                      </Text>
                                                    ))
                                                  ) : (
                                                    <Text style={styles.dashboardMatchResultRosterEmpty}>
                                                      No active players with letters.
                                                    </Text>
                                                  )}
                                                </View>
                                              </View>
                                            ) : null}
                                          </View>
                                        )
                                      })}
                                    </View>
                                  )}
                                </>
                              ) : isDashboardLeagueRrOrLadder ? (
                                rrMatchesForDashboardResults.length === 0 ? (
                                  <Text style={styles.dashboardStageEmpty}>No round-robin matches for this day.</Text>
                                ) : (
                                  <RNScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    style={styles.dashboardPlayInRowScroll}
                                    contentContainerStyle={styles.dashboardPlayInRowContent}
                                  >
                                    {rrMatchesForDashboardResults.map((m: any, midx: number) => {
                                      const key = String(m.id ?? `rr-${midx}`)
                                      const games = (m.games ?? []) as any[]
                                      const totalScoreA = games.reduce((s, g) => s + Number(g?.scoreA ?? 0), 0)
                                      const totalScoreB = games.reduce((s, g) => s + Number(g?.scoreB ?? 0), 0)
                                      return (
                                        <View key={key} style={styles.dashboardMatchResultLeagueCard}>
                                          <Text style={styles.dashboardMatchResultLeagueLabel}>Round Robin</Text>
                                          <Text style={styles.dashboardMatchResultTeams} numberOfLines={2}>
                                            {m.teamA?.name ?? 'TBD'} vs {m.teamB?.name ?? 'TBD'}
                                          </Text>
                                          <Text style={styles.dashboardMatchResultScore}>
                                            {totalScoreA} – {totalScoreB}
                                          </Text>
                                        </View>
                                      )
                                    })}
                                  </RNScrollView>
                                )
                              ) : null}
                            </View>
                          </View>
                        ) : null}

                        {!shouldShowDashboardBracketStages ? null : (
                          <View style={styles.dashboardPlayInPlayoffStack}>
                        <View style={styles.dashboardSectionCard}>
                          <View style={styles.dashboardStageBlock}>
                            <Text style={styles.dashboardStageTitle}>Play-in</Text>
                            <Text style={styles.dashboardStageSubtitle}>
                              Preliminary stage to reduce to the required number of participants
                            </Text>
                            {playInMatches.length ? (
                              <RNScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.dashboardPlayInRowScroll}
                                contentContainerStyle={styles.dashboardPlayInRowContent}
                              >
                                {playInMatches.map((m: any, idx: number) => {
                                  const key = String(m.id ?? `play-in-${idx}-${m.teamAId ?? 'a'}-${m.teamBId ?? 'b'}`)
                                  const firstGame = (m.games ?? [])[0]
                                  const scoreA = Number.isFinite(Number(firstGame?.scoreA)) ? Number(firstGame?.scoreA) : null
                                  const scoreB = Number.isFinite(Number(firstGame?.scoreB)) ? Number(firstGame?.scoreB) : null
                                  const hasResults = scoreA !== null && scoreB !== null
                                  const winner =
                                    hasResults && scoreA !== null && scoreB !== null
                                      ? scoreA > scoreB
                                        ? 'A'
                                        : scoreB > scoreA
                                        ? 'B'
                                        : null
                                      : null
                                  const teamASeed = seedByTeamId.get(String(m.teamA?.id ?? m.teamAId ?? '')) ?? null
                                  const teamBSeed = seedByTeamId.get(String(m.teamB?.id ?? m.teamBId ?? '')) ?? null

                                  return (
                                    <View key={key} style={styles.dashboardPlayInCard}>
                                      <View style={styles.dashboardPlayInCardHeader}>
                                        <Text style={styles.dashboardPlayInCardLabel}>Play-in</Text>
                                        {hasResults ? (
                                          <View style={styles.dashboardPlayInStatusDoneRow}>
                                            <Feather name="check" size={14} color={colors.primary} />
                                            <Text style={styles.dashboardPlayInStatusDoneLabel}>Completed</Text>
                                          </View>
                                        ) : (
                                          <View style={[styles.dashboardPlayInStatusBadge, styles.dashboardPlayInStatusBadgeScheduled]}>
                                            <Text
                                              style={[styles.dashboardPlayInStatusBadgeText, styles.dashboardPlayInStatusBadgeTextScheduled]}
                                            >
                                              Scheduled
                                            </Text>
                                          </View>
                                        )}
                                      </View>

                                      <View style={styles.dashboardPlayInTeams}>
                                        <View style={styles.dashboardPlayInTeamRow}>
                                          <View style={styles.dashboardPlayInTeamMain}>
                                            <Text style={styles.dashboardPlayInSeedText}>#{teamASeed ?? '?'}</Text>
                                            <Text style={styles.dashboardPlayInTeamName} numberOfLines={1}>
                                              {m.teamA?.name ?? 'TBD'}
                                            </Text>
                                            {winner === 'A' ? (
                                              <View style={styles.dashboardPlayInWinnerBadge}>
                                                <Text style={styles.dashboardPlayInWinnerBadgeText}>Winner</Text>
                                              </View>
                                            ) : null}
                                          </View>
                                          <Text style={styles.dashboardPlayInScore}>{scoreA ?? '—'}</Text>
                                        </View>

                                        <View style={styles.dashboardPlayInDivider} />

                                        <View style={styles.dashboardPlayInTeamRow}>
                                          <View style={styles.dashboardPlayInTeamMain}>
                                            <Text style={styles.dashboardPlayInSeedText}>#{teamBSeed ?? '?'}</Text>
                                            <Text style={styles.dashboardPlayInTeamName} numberOfLines={1}>
                                              {m.teamB?.name ?? 'TBD'}
                                            </Text>
                                            {winner === 'B' ? (
                                              <View style={styles.dashboardPlayInWinnerBadge}>
                                                <Text style={styles.dashboardPlayInWinnerBadgeText}>Winner</Text>
                                              </View>
                                            ) : null}
                                          </View>
                                          <Text style={styles.dashboardPlayInScore}>{scoreB ?? '—'}</Text>
                                        </View>
                                      </View>
                                    </View>
                                  )
                                })}
                              </RNScrollView>
                            ) : (
                              <Text style={styles.dashboardStageEmpty}>No play-in matches yet.</Text>
                            )}
                          </View>
                        </View>

                        <View style={styles.dashboardSectionCard}>
                          <View style={styles.dashboardStageBlock}>
                            <Text style={styles.dashboardStageTitle}>Playoff / Bracket</Text>
                            <Text style={styles.dashboardStageSubtitle}>
                              Elimination stage with knockout rounds and finals
                            </Text>
                            {playoffMatches.length ? (
                              <RNScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.dashboardPlayInRowScroll}
                                contentContainerStyle={styles.dashboardPlayInRowContent}
                              >
                                {playoffMatches.map((m: any, idx: number) => {
                                  const key = String(
                                    m.id ??
                                      `playoff-${m.roundIndex ?? 'na'}-${m.teamAId ?? m.teamA?.id ?? 'a'}-${m.teamBId ?? m.teamB?.id ?? 'b'}-${idx}`
                                  )
                                  const totalScoreA = Array.isArray(m.games)
                                    ? m.games.reduce((sum: number, g: any) => sum + Number(g?.scoreA ?? 0), 0)
                                    : null
                                  const totalScoreB = Array.isArray(m.games)
                                    ? m.games.reduce((sum: number, g: any) => sum + Number(g?.scoreB ?? 0), 0)
                                    : null
                                  const hasResults = Boolean(
                                    m.isCompleted ??
                                      (totalScoreA !== null &&
                                        totalScoreB !== null &&
                                        (Number(totalScoreA) > 0 || Number(totalScoreB) > 0))
                                  )
                                  const winnerId =
                                    m.winner?.id ??
                                    (hasResults &&
                                    totalScoreA !== null &&
                                    totalScoreB !== null &&
                                    totalScoreA !== totalScoreB
                                      ? totalScoreA > totalScoreB
                                        ? String(m.teamA?.id ?? m.teamAId ?? '')
                                        : String(m.teamB?.id ?? m.teamBId ?? '')
                                      : null)

                                  const teamASeed =
                                    Number(m.teamA?.seed ?? seedByTeamId.get(String(m.teamA?.id ?? m.teamAId ?? '')) ?? 0) || null
                                  const teamBSeed =
                                    Number(m.teamB?.seed ?? seedByTeamId.get(String(m.teamB?.id ?? m.teamBId ?? '')) ?? 0) || null

                                  return (
                                    <View key={key} style={styles.dashboardPlayoffCard}>
                                      <View style={styles.dashboardPlayInCardHeader}>
                                        <Text style={styles.dashboardPlayInCardLabel}>
                                          Round {Number(m.roundIndex ?? 0) + 1}
                                        </Text>
                                        {hasResults ? (
                                          <View style={styles.dashboardPlayInStatusDoneRow}>
                                            <Feather name="check" size={14} color={colors.primary} />
                                            <Text style={styles.dashboardPlayInStatusDoneLabel}>Completed</Text>
                                          </View>
                                        ) : (
                                          <View style={[styles.dashboardPlayInStatusBadge, styles.dashboardPlayInStatusBadgeScheduled]}>
                                            <Text
                                              style={[styles.dashboardPlayInStatusBadgeText, styles.dashboardPlayInStatusBadgeTextScheduled]}
                                            >
                                              Scheduled
                                            </Text>
                                          </View>
                                        )}
                                      </View>

                                      <View style={styles.dashboardPlayInTeams}>
                                        <View style={styles.dashboardPlayInTeamRow}>
                                          <View style={styles.dashboardPlayInTeamMain}>
                                            <Text style={styles.dashboardPlayInSeedText}>#{teamASeed ?? '?'}</Text>
                                            <Text style={styles.dashboardPlayInTeamName} numberOfLines={1}>
                                              {m.teamA?.name ?? 'TBD'}
                                            </Text>
                                            {winnerId && String(winnerId) === String(m.teamA?.id ?? m.teamAId ?? '') ? (
                                              <View style={styles.dashboardPlayInWinnerBadge}>
                                                <Text style={styles.dashboardPlayInWinnerBadgeText}>Winner</Text>
                                              </View>
                                            ) : null}
                                          </View>
                                          <Text style={styles.dashboardPlayInScore}>
                                            {totalScoreA !== null ? totalScoreA : '—'}
                                          </Text>
                                        </View>

                                        <View style={styles.dashboardPlayInDivider} />

                                        <View style={styles.dashboardPlayInTeamRow}>
                                          <View style={styles.dashboardPlayInTeamMain}>
                                            <Text style={styles.dashboardPlayInSeedText}>#{teamBSeed ?? '?'}</Text>
                                            <Text style={styles.dashboardPlayInTeamName} numberOfLines={1}>
                                              {m.teamB?.name ?? 'TBD'}
                                            </Text>
                                            {winnerId && String(winnerId) === String(m.teamB?.id ?? m.teamBId ?? '') ? (
                                              <View style={styles.dashboardPlayInWinnerBadge}>
                                                <Text style={styles.dashboardPlayInWinnerBadgeText}>Winner</Text>
                                              </View>
                                            ) : null}
                                          </View>
                                          <Text style={styles.dashboardPlayInScore}>
                                            {totalScoreB !== null ? totalScoreB : '—'}
                                          </Text>
                                        </View>
                                      </View>
                                    </View>
                                  )
                                })}
                              </RNScrollView>
                            ) : (
                              <Text style={styles.dashboardStageEmpty}>Bracket will appear after round-robin.</Text>
                            )}
                          </View>
                        </View>
                          </View>
                        )}

                        {playoffFinalMatch && shouldShowDashboardBracketStages ? (
                          <View style={styles.dashboardSectionCard}>
                            <View style={styles.dashboardStageBlock}>
                              <Text style={styles.dashboardStageTitle}>Champion & placements</Text>
                              <Text style={styles.dashboardStageSubtitle}>
                                Champion, 2nd and 3rd place from the bracket (final and third-place match)
                              </Text>
                              {playoffPlacements.champion || playoffPlacements.second || playoffPlacements.third ? (
                                <View style={styles.dashboardPlayoffResultsList}>
                                  {playoffPlacements.champion ? (
                                    <View
                                      style={[styles.dashboardPlayoffResultPill, styles.dashboardPlayoffResultPillChampion]}
                                    >
                                      <View style={styles.dashboardPlayoffResultTrophyRow}>
                                        <GradientTrophyIcon size={40} colors={TROPHY_GRADIENT_GOLD} />
                                      </View>
                                      <Text style={[styles.dashboardPlayoffResultPlaceLabel, styles.dashboardPlayoffResultPlaceLabelChampion]}>
                                        Champion
                                      </Text>
                                      <Text
                                        style={[styles.dashboardPlayoffResultTeamName, styles.dashboardPlayoffResultTeamNameChampion]}
                                        numberOfLines={2}
                                      >
                                        {playoffPlacements.champion.name}
                                      </Text>
                                    </View>
                                  ) : null}
                                  {playoffPlacements.second ? (
                                    <View
                                      style={[styles.dashboardPlayoffResultPill, styles.dashboardPlayoffResultPillSecond]}
                                    >
                                      <GradientTrophyIcon size={30} colors={TROPHY_GRADIENT_SILVER} />
                                      <Text style={[styles.dashboardPlayoffResultPlaceLabel, styles.dashboardPlayoffResultPlaceLabelSecond]}>
                                        2nd place
                                      </Text>
                                      <Text
                                        style={[styles.dashboardPlayoffResultTeamName, styles.dashboardPlayoffResultTeamNameSecond]}
                                        numberOfLines={2}
                                      >
                                        {playoffPlacements.second.name}
                                      </Text>
                                    </View>
                                  ) : null}
                                  {playoffPlacements.third ? (
                                    <View
                                      style={[styles.dashboardPlayoffResultPill, styles.dashboardPlayoffResultPillThird]}
                                    >
                                      <GradientTrophyIcon size={26} colors={TROPHY_GRADIENT_BRONZE} />
                                      <Text style={[styles.dashboardPlayoffResultPlaceLabel, styles.dashboardPlayoffResultPlaceLabelThird]}>
                                        3rd place
                                      </Text>
                                      <Text
                                        style={[styles.dashboardPlayoffResultTeamName, styles.dashboardPlayoffResultTeamNameThird]}
                                        numberOfLines={2}
                                      >
                                        {playoffPlacements.third.name}
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>
                              ) : (
                                <Text style={styles.dashboardStageEmpty}>No final results yet.</Text>
                              )}
                            </View>
                          </View>
                        ) : null}
                      </SegmentedContentFade>
                    )
                  })()}
                  </View>
                ) : (
                  <View style={styles.dashboardEmptyWrap}>
                    <EmptyState
                      title="Dashboard unavailable"
                      body="The public scoreboard could not be prepared for this tournament yet."
                    />
                  </View>
                )}
            </View>
          ) : null}

          </SegmentedContentFade>

        </View>
        </PickleRefreshScrollView>

        {/* composer is inside Comments card */}
      </KeyboardAvoidingView>

      {shouldShowStickyCta ? <View /> : null}

      <AppBottomSheet
        open={leaveTournamentSheetOpen}
        onClose={() => {
          setLeaveTournamentSheetOpen(false)
          setOpenPaidConfirmAfterDismiss(false)
        }}
        onDismissed={() => {
          if (!openPaidConfirmAfterDismiss) return
          setOpenPaidConfirmAfterDismiss(false)
          setLeaveTournamentPaidConfirmOpen(true)
        }}
        title="Leave tournament?"
        subtitle="Your registration will be cancelled and your slot will be released."
        footer={
          <AppConfirmActions
            intent="destructive"
            cancelLabel="Keep spot"
            confirmLabel="Leave Tournament"
            onCancel={() => setLeaveTournamentSheetOpen(false)}
            onConfirm={() => {
              if (requiresPaidLeaveConfirm) {
                // Вторая шторка должна открываться только после полного закрытия первой,
                // иначе iOS/Android могут «залипнуть» из-за одновременных Modal.
                setOpenPaidConfirmAfterDismiss(true)
                setLeaveTournamentSheetOpen(false)
                return
              }
              setLeaveTournamentSheetOpen(false)
              cancelRegistration.mutate({ tournamentId })
            }}
            confirmLoading={cancelRegistration.isPending}
          />
        }
      />
      <AppBottomSheet
        open={leaveTournamentPaidConfirmOpen}
        onClose={() => setLeaveTournamentPaidConfirmOpen(false)}
        title="Paid registration refund"
        subtitle="This is a paid tournament. After cancellation, the refund is initiated automatically. Final posting time depends on your bank and Stripe processing policies and may take several business days."
        footer={
          <AppConfirmActions
            intent="destructive"
            cancelLabel="Back"
            confirmLabel="Confirm leave"
            onCancel={() => setLeaveTournamentPaidConfirmOpen(false)}
            onConfirm={() => {
              setLeaveTournamentPaidConfirmOpen(false)
              cancelRegistration.mutate({ tournamentId })
            }}
            confirmLoading={cancelRegistration.isPending}
          />
        }
      />
      <AppBottomSheet
        open={Boolean(paymentErrorMessage)}
        onClose={() => setPaymentErrorMessage(null)}
        title="Payment unavailable"
        subtitle={paymentErrorMessage ?? ''}
        footer={<AppInfoFooter onPress={() => setPaymentErrorMessage(null)} />}
      />
      <FeedbackRatingModal
        open={tournamentFeedbackOpen}
        onClose={() => setTournamentFeedbackOpen(false)}
        entityType="TOURNAMENT"
        entityId={tournamentId}
        title="Rate this tournament"
        subtitle="Your feedback helps improve tournament quality."
        contextCard={
          <FeedbackEntityContextCard
            entityType="TOURNAMENT"
            title={tournament.title}
            imageUrl={tournament.image}
            formatLabel={formatTournamentFormat(tournament.format)}
            dateLabel={formatHeroDateRange(tournament.startDate, tournament.endDate)}
            addressLabel={locationLabel === 'Location not set' ? null : locationLabel}
          />
        }
        onSubmitted={() => {
          void Promise.all([feedbackSummaryQuery.refetch(), hasRatedQuery.refetch()])
        }}
      />
      <AppBottomSheet
        open={tournamentFeedbackInfoOpen}
        onClose={() => setTournamentFeedbackInfoOpen(false)}
        onDismissed={() => {
          if (!openTournamentFeedbackAfterInfoClose) return
          setOpenTournamentFeedbackAfterInfoClose(false)
          setTournamentFeedbackOpen(true)
        }}
        title="Tournament rating"
        subtitle={
          feedbackCanPublishEffective && feedbackAverageEffective ? '' : 'No public rating yet. Need at least 5 ratings.'
        }
        footer={
          !hasRatedTournament ? (
            <ActionButton
              label="Rate this tournament"
              onPress={() => {
                setTournamentFeedbackInfoOpen(false)
                setOpenTournamentFeedbackAfterInfoClose(true)
              }}
            />
          ) : undefined
        }
      >
        {feedbackCanPublishEffective && feedbackAverageEffective ? (
          <View style={styles.modalStarsRow}>
            {[1, 2, 3, 4, 5].map((star) => {
              const active = star <= Math.round(feedbackAverageEffective)
              return (
                <RatingStarIcon key={star} size={40} filled={active} color="#F2C94C" inactiveColor="#C7C7CC" />
              )
            })}
            <Text style={styles.modalRatingValueInline}>{feedbackAverageEffective.toFixed(1)}</Text>
          </View>
        ) : null}
        <View style={styles.feedbackChipsWrap}>
          {(feedbackSummaryQuery.data?.topChips ?? []).length > 0 || __DEV__ ? (
            (feedbackSummaryQuery.data?.topChips?.length
              ? feedbackSummaryQuery.data.topChips
              : [
                  { label: 'Great organization', count: 9 },
                  { label: 'Clear schedule', count: 8 },
                  { label: 'Strong opponents', count: 6 },
                ]
            ).map((chip: { label: string; count: number }) => (
              <View key={chip.label} style={styles.feedbackChip}>
                <Text style={styles.feedbackChipText}>{chip.label}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.feedbackEmptyText}>Not enough public data yet.</Text>
          )}
        </View>
      </AppBottomSheet>
      <FeedbackRatingModal
        open={tdFeedbackOpen}
        onClose={() => setTdFeedbackOpen(false)}
        entityType="TD"
        entityId={tdUserId ?? ''}
        title="Rate tournament director"
        subtitle="Your feedback helps improve director quality."
        contextCard={
          <FeedbackEntityContextCard
            entityType="TD"
            name={organizerLabel}
            avatarUrl={tournament.user?.image ?? null}
            tournamentLabel={`${tournament.title}${tournament.startDate ? ` (${formatHeroDateRange(tournament.startDate, tournament.endDate)})` : ''}`}
          />
        }
        onSubmitted={() => {
          void Promise.all([tdSummaryQuery.refetch(), tdHasRatedQuery.refetch()])
        }}
      />
      <AppBottomSheet
        open={tdFeedbackInfoOpen}
        onClose={() => setTdFeedbackInfoOpen(false)}
        title="Tournament director rating"
        subtitle={
          tdCanPublishEffective && tdAverageEffective ? '' : 'No public rating yet. Need at least 5 ratings.'
        }
      >
        {tdCanPublishEffective && tdAverageEffective ? (
          <View style={styles.modalStarsRow}>
            {[1, 2, 3, 4, 5].map((star) => {
              const active = star <= Math.round(tdAverageEffective)
              return (
                <RatingStarIcon key={star} size={40} filled={active} color="#F2C94C" inactiveColor="#C7C7CC" />
              )
            })}
            <Text style={styles.modalRatingValueInline}>{tdAverageEffective.toFixed(1)}</Text>
          </View>
              ) : null}
        <View style={styles.feedbackChipsWrap}>
          {(tdSummaryQuery.data?.topChips ?? []).length > 0 || __DEV__ ? (
            (tdSummaryQuery.data?.topChips?.length
              ? tdSummaryQuery.data.topChips
              : [
                  { label: 'Clear communication', count: 10 },
                  { label: 'Fair decisions', count: 8 },
                  { label: 'On-time schedule', count: 7 },
                ]
            ).map((chip: { label: string; count: number }) => (
              <View key={chip.label} style={styles.feedbackChip}>
                <Text style={styles.feedbackChipText}>{chip.label}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.feedbackEmptyText}>Not enough public data yet.</Text>
          )}
        </View>
        {!hasRatedTd ? (
              <Pressable
            disabled={!tdUserId}
            onPress={() => {
              if (!tdUserId) return
              setTdFeedbackInfoOpen(false)
              setTimeout(() => setTdFeedbackOpen(true), 260)
            }}
                style={({ pressed }) => [
              styles.primaryFeedbackCtaBtn,
              pressed && tdUserId && styles.primaryFeedbackCtaBtnPressed,
              !tdUserId && styles.outlineButtonDisabled,
            ]}
          >
            <Text style={styles.primaryFeedbackCtaText}>Rate this organizer</Text>
              </Pressable>
        ) : (
          <Text style={styles.feedbackThanksText}>You already rated this tournament director.</Text>
        )}
      </AppBottomSheet>

    </SafeAreaView>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
  kav: {
    flex: 1,
  },
  contentScroll: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  scrollContent: {
    paddingBottom: 136,
  },
  scrollContentNoCta: {
    paddingBottom: spacing.xl,
  },
  heroWrap: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  eventMiniBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventMiniBarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  eventMiniBarButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eventMiniBarButtonPressed: {
    opacity: 1,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.brandPrimaryBorder,
    transform: [{ scale: 0.94 }],
  },
  commentBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  commentBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
  eventHeroCard: {
    overflow: 'hidden',
    borderWidth: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    backgroundColor: colors.eventHeroBackground,
  },
  eventHeroHeader: {
    position: 'relative',
    overflow: 'hidden',
    padding: spacing.md,
    backgroundColor: 'transparent',
  },
  eventHeroPattern: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '40%',
    zIndex: 0,
  },
  eventHeroPatternDot: {
    position: 'absolute',
    width: EVENT_PATTERN_DOT,
    height: EVENT_PATTERN_DOT,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  eventHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    zIndex: 1,
  },
  eventHeroAvatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  eventHeroAvatar: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  eventHeroMain: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  eventHeroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eventHeroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'nowrap',
  },
  eventHeroTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
    flex: 1,
    minWidth: 0,
  },
  eventHeroChip: {
    alignSelf: 'flex-start',
    minHeight: 28,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  eventHeroChipText: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
  },
  eventHeroRatingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 120,
    marginLeft: 'auto',
  },
  eventHeroRatingPillPressed: {
    opacity: 0.85,
  },
  eventHeroRatingText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  eventHeroRatingMuted: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    fontWeight: '600',
  },
  eventHeroCompactStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    maxWidth: 140,
    flexShrink: 0,
  },
  eventHeroCompactStatusText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  descriptionSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  heroTimelineChip: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroTimelineChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  descriptionBlock: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 6,
  },
  descriptionText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  descriptionMeasureText: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    top: spacing.md,
    opacity: 0,
    zIndex: -1,
  },
  aboutDescriptionTapArea: {
    marginHorizontal: -spacing.md,
    marginTop: -spacing.md,
    marginBottom: -spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  aboutDescriptionTapAreaPressed: {
    opacity: 0.92,
  },
  descriptionLinkPressable: {
    alignSelf: 'flex-start',
  },
  descriptionLinkText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  inlineCtaSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  closedTournamentNoticeWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  closedTournamentNotice: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 214, 10, 0.35)',
    backgroundColor: 'rgba(255, 214, 10, 0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  closedTournamentNoticeCopy: {
    flex: 1,
    gap: 2,
  },
  closedTournamentNoticeTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  closedTournamentNoticeText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  inlineCtaStack: {
    gap: 10,
  },
  inlineCtaButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  inlineCtaButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  inlineCtaGradient: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineCtaGradientDisabled: {
    opacity: 0.7,
  },
  inlineCtaText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  contentSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  segmentTrack: {
    marginHorizontal: 0,
  },
  tabSwitch: {
    flexDirection: 'row',
    gap: 4,
    minHeight: 36,
    backgroundColor: colors.surfaceMuted,
    padding: 3,
    borderRadius: radius.sm,
  },
  tabButton: {
    flex: 1,
    minHeight: 30,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
  },
  tabLabel: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 14,
  },
  tabLabelActive: {
    color: colors.text,
  },
  sectionStack: {
    marginTop: 16,
    gap: spacing.md,
  },
  invitationActions: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: 10,
  },
  muted: {
    color: colors.textMuted,
  },
  paragraph: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  detailCard: {
    borderRadius: radius.lg,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  cardTitleTight: {
    marginBottom: 8,
  },
  cardTitleLoose: {
    marginBottom: 12,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  valueText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  mutedBodyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  locationIcon: {
    marginTop: 2,
  },
  infoLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 28,
    marginBottom: 10,
  },
  infoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  infoTopChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    marginBottom: 10,
  },
  infoPriceChip: {
    minHeight: 30,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  infoPriceChipText: {
    color: colors.black,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  infoDatesBlock: {
    gap: 8,
    marginBottom: 10,
  },
  infoDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoDateText: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  infoClubLinkWrap: {
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  infoClubLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  infoClubLinkText: {
    color: colors.primary,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
  },
  infoLocationText: {
    flex: 1,
    minWidth: 0,
    color: colors.primary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  infoLocationTextDisabled: {
    color: colors.textMuted,
    fontWeight: '500',
  },
  infoAmenitiesRow: {
    marginTop: 12,
  },
  inlineLinkWrap: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  inlineLinkPressed: {
    opacity: 0.82,
  },
  inlineLinkText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  inlineLinkTextDisabled: {
    opacity: 0.45,
  },
  badgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  primaryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  primaryBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  secondaryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.secondary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  secondaryBadgeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
  },
  divisionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  divisionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  divisionMyBadge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'rgba(40, 205, 65, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  divisionMyBadgeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  divisionMetaGrid: {
    marginTop: 12,
    marginBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  divisionMetaCell: {
    flex: 1,
    justifyContent: 'center',
  },
  divisionMyTeamRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  divisionMyTeamText: {
    color: colors.primary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  divisionPriceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  divisionPriceChip: {
    minHeight: 30,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 180,
    justifyContent: 'center',
  },
  divisionPriceChipText: {
    color: colors.black,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  smallCtaButton: {
    marginTop: 12,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  smallCtaButtonPressed: {
    opacity: 0.94,
  },
  smallCtaGradient: {
    minHeight: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  smallCtaText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  organizerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  commentsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  commentsCount: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  commentsBlock: {
    flexShrink: 1,
    flexDirection: 'column',
  },
  commentsThreadScroll: {
    flexGrow: 0,
  },
  commentsThreadContent: {
    paddingBottom: 8,
  },
  organizerName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  organizerMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 14,
  },
  organizerAvatarPressed: {
    opacity: 0.82,
  },
  organizerInfoTap: {
    flex: 1,
    justifyContent: 'center',
  },
  organizerNamePressed: {
    opacity: 0.84,
  },
  ratingPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(10,10,10,0.08)',
    borderRadius: 9999,
    backgroundColor: 'rgba(10,10,10,0.03)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  ratingPillBtnPressed: {
    opacity: 0.86,
  },
  feedbackHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  feedbackLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(10,10,10,0.08)',
    borderRadius: 9999,
    backgroundColor: 'rgba(10,10,10,0.03)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  feedbackValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  feedbackValueMuted: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '700',
  },
  feedbackCount: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  feedbackInfoBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  feedbackInfoBtnText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  primaryFeedbackCtaBtn: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  primaryFeedbackCtaBtnPressed: {
    opacity: 0.9,
  },
  primaryFeedbackCtaText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  feedbackThanksText: {
    marginTop: spacing.md,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  feedbackChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: spacing.xs,
  },
  modalStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'flex-start',
    marginBottom: spacing.md,
  },
  modalRatingValueInline: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    marginLeft: 8,
  },
  feedbackChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  feedbackChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  feedbackChipCount: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  achievementDotsRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  achievementDot: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#9CD9A3',
    backgroundColor: '#E8F7EB',
    paddingHorizontal: 10,
    paddingVertical: 7,
    maxWidth: '100%',
  },
  achievementDotText: {
    color: '#1E7A32',
    fontSize: 12,
    fontWeight: '700',
  },
  achievementBadgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: spacing.xs,
  },
  achievementBadgeItem: {
    width: 92,
    alignItems: 'center',
    gap: 6,
  },
  achievementBadgeCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#9CD9A3',
    backgroundColor: '#E8F7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  achievementBadgeText: {
    color: '#1E7A32',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  feedbackEmptyText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  dashboardBanner: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    backgroundColor: 'rgba(40, 205, 65, 0.12)',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    marginTop: spacing.md,
    marginBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'nowrap',
  },
  dashboardBannerPressed: {
    opacity: 0.96,
  },
  dashboardBannerText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  dashboardBannerStrong: {
    fontWeight: '700',
  },
  dashboardBannerChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dashboardBannerChipText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  paymentSuccessNotice: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    backgroundColor: colors.eventHeroBackground,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  paymentSuccessNoticeText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  paymentSyncChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: colors.eventHeroBackground,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  paymentSyncChipText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  dashboardCard: {
    overflow: 'hidden',
  },
  dashboardNativeStack: {
    paddingBottom: spacing.md,
  },
  /** Вертикальные отступы между блоками дашборда (передаётся в `SegmentedContentFade` как `style`). */
  dashboardBlockStack: {
    width: '100%',
    gap: 8,
  },
  dashboardDivisionTabsOuter: {
    marginBottom: 8,
  },
  /** Когда сверху нет блока дней лиги — отступ как снизу у ряда дивизионов. */
  dashboardDivisionTabsOuterFirstBlock: {
    marginTop: 8,
  },
  dashboardDivisionTabsScroll: {
    marginHorizontal: -spacing.md,
  },
  dashboardDivisionTabsContent: {
    paddingHorizontal: spacing.md,
    gap: 8,
  },
  dashboardDivisionChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  dashboardDivisionChipActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(40, 205, 65, 0.12)',
  },
  dashboardDivisionChipPressed: {
    opacity: 0.9,
  },
  dashboardDivisionChipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  dashboardDivisionChipTextActive: {
    color: colors.text,
  },
  dashboardLeagueControls: {
    marginTop: 4,
    marginBottom: 8,
    gap: 10,
  },
  dashboardLeagueDaysRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
    gap: 8,
  },
  dashboardLeagueDaysOr: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 0,
    textTransform: 'lowercase',
  },
  dashboardLeagueDaysRowHint: {
    flex: 1,
    minWidth: 0,
  },
  dashboardLeagueScopeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    backgroundColor: 'rgba(148, 163, 184, 0.14)',
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dashboardLeagueScopeButtonLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 96,
  },
  /** Левый край как у pill-чипа (minHeight 38 → 19), чтобы скролл не упирался в «стену». */
  dashboardLeagueDayPickerClip: {
    flex: 1,
    minWidth: 0,
    borderTopLeftRadius: 19,
    borderBottomLeftRadius: 19,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  dashboardLeagueDayPickerScroll: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.background,
  },
  dashboardLeagueDaysContent: {
    gap: 8,
    paddingLeft: 19,
    paddingRight: 4,
    alignItems: 'center',
  },
  dashboardLeagueDayChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    backgroundColor: 'rgba(148, 163, 184, 0.14)',
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: 200,
  },
  dashboardLeagueDayChipActive: {
    borderColor: 'rgba(51, 65, 85, 0.45)',
    backgroundColor: colors.surface,
  },
  dashboardLeagueDayChipPressed: {
    opacity: 0.9,
  },
  dashboardLeagueDayChipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  dashboardLeagueDayChipTextActive: {
    color: colors.text,
  },
  dashboardLeagueHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  dashboardLeagueTableHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },
  dashboardStandingsLoadingWrap: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  dashboardPlayInPlayoffStack: {
    gap: 10,
  },
  dashboardMatchResultsStageBlock: {
    gap: 0,
  },
  dashboardMatchResultsTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  dashboardMatchResultsList: {
    gap: 10,
    marginTop: 0,
  },
  dashboardMatchResultCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  dashboardMatchResultPress: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  dashboardMatchResultPressPressed: {
    opacity: 0.92,
  },
  dashboardMatchResultRowHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dashboardMatchResultRowHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  dashboardMatchResultExpanded: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: spacing.sm,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  dashboardMatchResultRosterCol: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  dashboardMatchResultRosterTeamTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  dashboardMatchResultRosterLine: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  dashboardMatchResultRosterEmpty: {
    color: colors.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  dashboardMatchResultTeams: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  dashboardMatchResultMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  dashboardMatchResultScoreLine: {
    marginTop: 6,
  },
  dashboardMatchResultCourtMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  dashboardMatchResultLeagueCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    width: 220,
  },
  dashboardMatchResultLeagueLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  dashboardMatchResultScore: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  dashboardDivisionCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 0,
    gap: spacing.sm,
  },
  dashboardDivisionCardActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(40, 205, 65, 0.08)',
  },
  dashboardSectionCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  dashboardDivisionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dashboardDivisionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  dashboardDivisionMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  dashboardStandingsList: {
    gap: 0,
    marginHorizontal: -spacing.md,
    backgroundColor: 'rgba(148, 163, 184, 0.0375)',
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    overflow: 'hidden',
  },
  dashboardStandingsHead: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(148, 163, 184, 0.0375)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.12)',
  },
  dashboardHeadTeam: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    paddingLeft: 20,
  },
  dashboardHeadStat: {
    width: 28,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  dashboardStandingItem: {
    gap: 0,
  },
  dashboardStandingItemLast: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    overflow: 'hidden',
  },
  dashboardStandingRow: {
    minHeight: 34,
    borderRadius: 0,
    flexDirection: 'column',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: 'rgba(148, 163, 184, 0.0375)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.12)',
  },
  dashboardStandingRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 34,
  },
  dashboardStandingRowMine: {
    backgroundColor: 'rgba(40, 205, 65, 0.1)',
    borderColor: 'rgba(40, 205, 65, 0.28)',
  },
  dashboardStandingRowExpanded: {
    borderColor: colors.primary,
  },
  dashboardStandingRowLast: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  dashboardStandingRowPressed: {
    opacity: 0.95,
  },
  dashboardStandingRank: {
    width: 18,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  dashboardStandingTeam: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  dashboardStandingTeamWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dashboardStandingExpandIcon: {
    marginRight: 2,
  },
  dashboardStandingCell: {
    width: 28,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  dashboardStageBlock: {
    marginTop: 0,
    gap: spacing.xs,
  },
  dashboardTeamsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dashboardTeamPill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dashboardTeamPillMine: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(40, 205, 65, 0.12)',
  },
  dashboardTeamPillText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 170,
  },
  dashboardTeamPillMeta: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  dashboardStageTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  dashboardStageSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  dashboardPlayInRowScroll: {
    marginHorizontal: -spacing.md,
    marginTop: 4,
  },
  dashboardPlayInRowContent: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingBottom: 2,
  },
  dashboardPlayInCard: {
    width: 260,
    flexShrink: 0,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 10,
    gap: 8,
  },
  dashboardPlayoffCard: {
    width: 260,
    flexShrink: 0,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 10,
    gap: 8,
  },
  dashboardPlayoffResultsList: {
    marginTop: 8,
    gap: 12,
    width: '100%',
    alignItems: 'center',
  },
  dashboardPlayoffResultPill: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  dashboardPlayoffResultPillChampion: {
    backgroundColor: 'rgba(254, 243, 199, 0.55)',
    borderColor: 'rgba(234, 179, 8, 0.45)',
  },
  dashboardPlayoffResultPillSecond: {
    backgroundColor:
      colors.surface === '#ffffff' ? colors.surfaceElevated : 'rgba(255, 255, 255, 0.09)',
    borderColor: colors.border,
  },
  dashboardPlayoffResultPillThird: {
    backgroundColor: 'rgba(255, 237, 213, 0.65)',
    borderColor: 'rgba(249, 115, 22, 0.35)',
  },
  dashboardPlayoffResultTrophyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dashboardPlayoffResultPlaceLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  dashboardPlayoffResultPlaceLabelChampion: {
    color: 'rgba(133, 77, 14, 0.95)',
  },
  dashboardPlayoffResultPlaceLabelSecond: {
    color: colors.textMuted,
  },
  dashboardPlayoffResultPlaceLabelThird: {
    color: 'rgba(194, 65, 12, 0.95)',
  },
  dashboardPlayoffResultTeamName: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: 4,
  },
  dashboardPlayoffResultTeamNameChampion: {
    color: 'rgba(55, 48, 40, 0.98)',
  },
  dashboardPlayoffResultTeamNameSecond: {
    color: colors.text,
  },
  dashboardPlayoffResultTeamNameThird: {
    color: 'rgba(67, 20, 7, 0.98)',
  },
  dashboardPlayInCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dashboardPlayInCardLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  dashboardPlayInStatusDoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dashboardPlayInStatusDoneLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  dashboardPlayInStatusBadge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dashboardPlayInStatusBadgeScheduled: {
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  dashboardPlayInStatusBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  dashboardPlayInStatusBadgeTextScheduled: {
    color: colors.textMuted,
  },
  dashboardPlayInTeams: {
    gap: 6,
  },
  dashboardPlayInTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 28,
  },
  dashboardPlayInTeamMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  dashboardPlayInSeedText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 0,
    paddingRight: 2,
  },
  dashboardPlayInTeamName: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  dashboardPlayInWinnerBadge: {
    borderRadius: radius.pill,
    backgroundColor: 'rgba(40, 205, 65, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dashboardPlayInWinnerBadgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  dashboardPlayInScore: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    minWidth: 18,
    textAlign: 'right',
  },
  dashboardPlayInDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dashboardStageMatch: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  dashboardStageEmpty: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  dashboardStandingTextMine: {
    color: colors.primary,
  },
  dashboardTeamMembersList: {
    marginTop: 8,
    paddingLeft: 20,
    paddingBottom: 2,
    backgroundColor: 'transparent',
    gap: 6,
  },
  dashboardTeamMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 32,
  },
  dashboardTeamMemberRowPressed: {
    opacity: 0.78,
  },
  dashboardTeamMemberName: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  dashboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: spacing.md,
  },
  dashboardHeaderCopy: {
    flex: 1,
    gap: 6,
  },
  dashboardFormatChip: {
    alignSelf: 'flex-start',
    marginTop: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dashboardFormatChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  dashboardFrame: {
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  dashboardWebView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  dashboardLoadingState: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  dashboardEmptyWrap: {
    padding: spacing.md,
  },
  outlineButton: {
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  outlineButtonPressed: {
    backgroundColor: colors.secondary,
  },
  outlineButtonDisabled: {
    opacity: 0.5,
  },
  outlineButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  ctaShell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  ctaFade: {
    height: 44,
  },
  ctaSafeArea: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  ctaStack: {
    gap: 10,
  },
  ctaButton: {
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  ctaButtonPressed: {
    opacity: 0.94,
  },
  ctaGradient: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  ctaGradientDisabled: {
    opacity: 0.75,
  },
  ctaText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
})

