import { Feather } from '@expo/vector-icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'

import { formatLocation, formatMoney } from '../lib/formatters'
import { trpc } from '../lib/trpc'
import { getTournamentSlotMetrics } from '../lib/tournamentSlots'
import { radius, spacing, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'
import { AppBottomSheet } from './AppBottomSheet'
import { EntityImage } from './EntityImage'
import { OptionalLinearGradient } from './OptionalLinearGradient'
import { ActionButton, SurfaceCard } from './ui'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
})

const formatTournamentDateRange = (start?: string | Date | null, end?: string | Date | null) => {
  if (!start) return 'Date TBD'

  const startDate = new Date(start)
  if (!end) return dateFormatter.format(startDate)

  const endDate = new Date(end)
  const sameMonth =
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth()

  if (sameMonth) {
    return `${startDate.toLocaleString('en-US', { month: 'short' })} ${startDate.getDate()}-${endDate.getDate()}`
  }

  return `${dateFormatter.format(startDate)} - ${dateFormatter.format(endDate)}`
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

const formatTournamentFormatChip = (format?: string | null) => {
  // Chip в hero должен быть без троеточий и без скролла — делаем максимально короткие метки.
  switch (format) {
    case 'SINGLE_ELIMINATION':
      return 'Single Elim'
    case 'ROUND_ROBIN':
      return 'Round Robin'
    case 'MLP':
      return 'MLP'
    case 'INDY_LEAGUE':
      return 'Indy League'
    case 'LEAGUE_ROUND_ROBIN':
      return 'League RR'
    case 'ONE_DAY_LADDER':
      return '1‑Day Ladder'
    case 'LADDER_LEAGUE':
      return 'Ladder League'
    default:
      return 'Tournament'
  }
}

/** Плотнее сетка; DIAG < STEP — диагональ без дыр. */
const HERO_PATTERN_EDGE = 2
const HERO_PATTERN_STEP = 7
const HERO_PATTERN_DIAG = 3
const HERO_PATTERN_DOT = 3

function HeroDotPattern({
  patternStyle,
  fadeStyle,
  dotStyle,
}: {
  patternStyle: ViewStyle
  fadeStyle: ViewStyle
  dotStyle: ViewStyle
}) {
  const [layout, setLayout] = useState({ w: 0, h: 0 })
  const dots = useMemo(() => {
    const w = layout.w
    const h = layout.h
    if (w < 4 || h < 4) return []
    const EDGE = HERO_PATTERN_EDGE
    const STEP = HERO_PATTERN_STEP
    const DIAG = HERO_PATTERN_DIAG
    const DOT = HERO_PATTERN_DOT
    const spanX = Math.max(1, w - EDGE * 2)
    const rowMax = Math.max(0, Math.floor((h - EDGE - DOT) / STEP))
    const out: Array<{ key: string; left: number; top: number; opacity: number }> = []
    let index = 0
    for (let row = 0; row <= rowMax; row += 1) {
      const top = EDGE + row * STEP
      if (top + DOT > h) continue
      // Диагональ смещает строку вправо — без отрицательных col слева остаётся «дыра».
      const colStart = Math.ceil((-EDGE - row * DIAG) / STEP)
      const colEnd = Math.floor((w - DOT - EDGE - row * DIAG) / STEP)
      for (let col = colStart; col <= colEnd; col += 1) {
        const left = EDGE + col * STEP + row * DIAG
        if (left + DOT > w) continue
        const nx = spanX > 0 ? (left - EDGE) / spanX : 0
        const fade = 1 - Math.min(1, nx) ** 0.42
        const opacity = Math.max(0.04, Math.min(0.58, 0.06 + 0.52 * fade))
        out.push({
          key: `hero-dot-${index}`,
          left,
          top,
          opacity,
        })
        index += 1
      }
    }
    return out
  }, [layout.w, layout.h])

  return (
    <View
      pointerEvents="none"
      style={patternStyle}
      collapsable={false}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout
        if (width <= 0 || height <= 0) return
        setLayout((prev) => {
          if (prev.w === width && prev.h === height) return prev
          return { w: width, h: height }
        })
      }}
    >
      <OptionalLinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={fadeStyle}
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

function getStatusIcon(label: string): keyof typeof Feather.glyphMap {
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

function isCompactTopStatus(label: string) {
  const s = label.trim().toLowerCase()
  return s === 'admin' || s === 'registered' || s === 'waitlist'
}

function getAvailabilityStatusLabel(args: {
  endDate: string | Date | null | undefined
  createdSlots: number | null
  openSlots: number | null
  fillRatio: number | null
}) {
  const end = args.endDate ? new Date(args.endDate).getTime() : null
  if (end != null && end < Date.now()) return 'Closed'
  if (args.createdSlots != null && args.createdSlots > 0) {
    if (args.openSlots === 0) return 'Waitlist'
    if (args.fillRatio != null && args.fillRatio >= 0.75) return 'Filling Fast'
  }
  return 'Open'
}

const MARQUEE_OVERFLOW_ON_PX = 6
const MARQUEE_PX_PER_MS = 0.008

function DivisionsMarquee({
  divisions,
  onMarqueeActiveChange,
}: {
  divisions: string[]
  onMarqueeActiveChange?: (active: boolean) => void
}) {
  const [containerW, setContainerW] = useState(0)
  const [trackW, setTrackW] = useState(0)
  const [runMarquee, setRunMarquee] = useState(false)
  const translateX = useRef(new Animated.Value(0)).current
  const animRef = useRef<Animated.CompositeAnimation | null>(null)
  const divisionsKey = useMemo(() => divisions.join('||'), [divisions])

  const resolvedContainerW = Math.floor(containerW)
  const resolvedTrackW = Math.ceil(trackW)
  const maxOffset = Math.max(0, resolvedTrackW - resolvedContainerW)

  useEffect(() => {
    setTrackW(0)
    setRunMarquee(false)
  }, [divisionsKey])

  useEffect(() => {
    if (containerW <= 0 || trackW <= 0) {
      setRunMarquee(false)
      onMarqueeActiveChange?.(false)
      return
    }

    const overflow = resolvedTrackW - resolvedContainerW
    const enabled = overflow > MARQUEE_OVERFLOW_ON_PX
    setRunMarquee(enabled)
    onMarqueeActiveChange?.(enabled)
  }, [containerW, onMarqueeActiveChange, resolvedContainerW, resolvedTrackW, trackW])

  useEffect(() => {
    animRef.current?.stop()
    translateX.setValue(0)

    if (!runMarquee || maxOffset <= 0) return

    const duration = Math.max(1_600, Math.round(maxOffset / MARQUEE_PX_PER_MS))
    let cancelled = false

    const step = () => {
      if (cancelled) return
      const animation = Animated.timing(translateX, {
        toValue: -resolvedTrackW,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
      animRef.current = animation
      animation.start(({ finished }) => {
        if (!finished || cancelled) return
        translateX.setValue(0)
        step()
      })
    }
    step()

    return () => {
      cancelled = true
      animRef.current?.stop()
      animRef.current = null
    }
  }, [resolvedTrackW, maxOffset, runMarquee, translateX])

  return (
    <View style={stylesMarquee.clip} onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}>
      <Animated.View
        style={[
          stylesMarquee.animatedTrack,
          runMarquee ? { width: resolvedTrackW * 2, transform: [{ translateX }] } : null,
        ]}
        collapsable={false}
      >
        <View
          key={divisionsKey}
          style={stylesMarquee.track}
          onLayout={(e) => {
            const nextW = Math.ceil(e.nativeEvent.layout.width)
            if (nextW > 0) setTrackW(nextW)
          }}
        >
          {divisions.map((division, index) => (
            <View key={`${division}-${index}`} style={stylesMarquee.pill}>
              <Text style={stylesMarquee.pillText} numberOfLines={1} ellipsizeMode="tail">
                {division}
              </Text>
            </View>
          ))}
        </View>
        {runMarquee ? (
          <View style={stylesMarquee.track}>
            {divisions.map((division, index) => (
              <View key={`dup-${division}-${index}`} style={stylesMarquee.pill}>
                <Text style={stylesMarquee.pillText} numberOfLines={1} ellipsizeMode="tail">
                  {division}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Animated.View>
    </View>
  )
}

type TournamentSummary = {
  id: string
  title: string
  image?: string | null
  startDate: string | Date
  endDate: string | Date
  venueName?: string | null
  venueAddress?: string | null
  entryFee?: string | number | null
  entryFeeCents?: number | null
  format?: string | null
  divisions: Array<{
    id: string
    name: string
    teamKind?: string | null
    maxTeams?: number | null
    _count?: { teams?: number }
    teams?: Array<{
      teamPlayers?: Array<{
        slotIndex?: number | null
      } | null> | null
    } | null> | null
  }>
  _count?: { players?: number }
  user?: {
    id: string
    name?: string | null
    email?: string | null
  } | null
  clubId?: string | null
  club?: {
    id: string
    name?: string | null
  } | null
  feedbackSummary?: {
    averageRating: number | null
    total: number
    canPublish: boolean
  } | null
}

export const TournamentCard = ({
  tournament,
  onPress,
  statusLabel,
  statusTone = 'success',
  secondaryStatusLabel,
  secondaryStatusTone = 'warning',
}: {
  tournament: TournamentSummary
  onPress: () => void
  statusLabel?: string | null
  statusTone?: 'muted' | 'primary' | 'danger' | 'success' | 'warning'
  secondaryStatusLabel?: string | null
  secondaryStatusTone?: 'muted' | 'primary' | 'danger' | 'success' | 'warning'
}) => {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [divisionsTooltipOpen, setDivisionsTooltipOpen] = useState(false)
  const [divisionsTooltipEnabled, setDivisionsTooltipEnabled] = useState(false)
  const feeLabel = (() => {
    if (typeof tournament.entryFeeCents === 'number') {
      return tournament.entryFeeCents > 0 ? formatMoney(tournament.entryFeeCents) : '$ Free'
    }
    if (tournament.entryFee != null && Number(tournament.entryFee) > 0) {
      return `$${Number(tournament.entryFee).toFixed(2)}`
    }
    return '$ Free'
  })()
  const feeChipLabel = secondaryStatusLabel ? `${feeLabel} • ${secondaryStatusLabel}` : feeLabel
  const slotMetrics = getTournamentSlotMetrics(tournament)
  const teamCount = tournament.divisions.reduce((sum, division) => sum + Number(division._count?.teams ?? 0), 0)
  const teamCapacity = tournament.divisions.reduce((sum, division) => sum + Number(division.maxTeams ?? 0), 0)
  const playerCount = Number(tournament._count?.players ?? 0)
  const hasSlotMetrics =
    slotMetrics.createdSlots !== null &&
    slotMetrics.filledSlots !== null &&
    slotMetrics.createdSlots > 0
  const progress = hasSlotMetrics
    ? Math.min(100, (slotMetrics.filledSlots! / slotMetrics.createdSlots!) * 100)
    : teamCapacity > 0
      ? Math.min(100, (teamCount / teamCapacity) * 100)
      : 0
  const spotsLeft = hasSlotMetrics ? slotMetrics.openSlots : null
  const occupancyLabel = hasSlotMetrics
    ? `${slotMetrics.filledSlots} / ${slotMetrics.createdSlots} spots`
    : teamCapacity > 0
      ? `${teamCount} / ${teamCapacity} teams`
      : playerCount > 0
        ? `${playerCount} players registered`
        : 'Open registration'
  const progressWidth = progress > 0 ? `${Math.max(progress, 8)}%` : '0%'
  const divisionLabels = useMemo(() => tournament.divisions.map((d) => d.name), [tournament.divisions])
  const venueName = String(tournament.venueName ?? '').trim()
  const venueAddress = String(tournament.venueAddress ?? '').trim()
  const locationLabel = venueAddress || venueName || 'Location not set'
  /** Показываем флаг клуба только при реальной привязке турнира к клубу. */
  const linkedClubIdFromCard = String(tournament.clubId ?? tournament.club?.id ?? '').trim()
  const explicitClubName = String(tournament.club?.name ?? '').trim()
  const tournamentMetaQuery = trpc.public.getTournamentById.useQuery(
    { id: tournament.id },
    {
      enabled: !explicitClubName && !linkedClubIdFromCard,
      retry: false,
      staleTime: 60_000,
    },
  )
  const linkedClubId = String(
    linkedClubIdFromCard ||
      tournamentMetaQuery.data?.clubId ||
      tournamentMetaQuery.data?.club?.id ||
      '',
  ).trim()
  const linkedClubQuery = trpc.club.get.useQuery(
    { id: linkedClubId },
    {
      enabled: Boolean(linkedClubId) && !explicitClubName,
      retry: false,
      staleTime: 60_000,
    }
  )
  const resolvedClubName = String(linkedClubQuery.data?.name ?? '').trim()
  const clubLabel = explicitClubName || resolvedClubName || null
  const statusLabelText = String(statusLabel ?? '').trim()
  const compactTopStatusLabel =
    statusLabelText && isCompactTopStatus(statusLabelText) ? statusLabelText : null
  const availabilityStatusLabel = getAvailabilityStatusLabel({
    endDate: tournament.endDate,
    createdSlots: slotMetrics.createdSlots,
    openSlots: slotMetrics.openSlots,
    fillRatio: slotMetrics.fillRatio,
  })
  const compactTopStatus = Boolean(compactTopStatusLabel)
  const showClubLabel = Boolean(clubLabel)

  useEffect(() => {
    if (!divisionsTooltipEnabled && divisionsTooltipOpen) {
      setDivisionsTooltipOpen(false)
    }
  }, [divisionsTooltipEnabled, divisionsTooltipOpen])

  return (
    <>
      <SurfaceCard padded={false} style={styles.card}>
        <View style={styles.hero}>
          <HeroDotPattern
            patternStyle={styles.heroPattern}
            fadeStyle={styles.heroPatternFade}
            dotStyle={styles.heroPatternDot}
          />
          <View style={styles.heroHeader}>
            <Pressable onPress={onPress} style={styles.heroLogo}>
              <EntityImage
                uri={tournament.image ?? null}
                style={styles.heroLogoImage}
                resizeMode="cover"
                placeholderResizeMode="contain"
              />
            </Pressable>
            <View style={styles.heroMain}>
              <Pressable onPress={onPress} style={styles.heroTitlePress}>
                <View style={styles.titleRow}>
                  <Text numberOfLines={1} style={styles.title}>
                    {tournament.title}
                  </Text>
                  {compactTopStatusLabel ? (
                    <View style={styles.compactStatusBadge}>
                      <Feather name={getStatusIcon(compactTopStatusLabel)} size={14} color={colors.white} />
                      <Text style={styles.compactStatusText} numberOfLines={1}>
                        {compactTopStatusLabel}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
              <View style={styles.chipRow}>
                <Pressable
                  onPress={onPress}
                  style={[styles.heroChip, styles.heroChipNoShrink, styles.heroChipOutlined]}
                >
                  <Text style={styles.heroChipText} numberOfLines={1}>
                    {formatTournamentFormatChip(tournament.format)}
                  </Text>
                </Pressable>
                {divisionLabels.length ? (
                  <View style={styles.divisionsChipSlot}>
                    <DivisionsMarquee
                      divisions={divisionLabels}
                      onMarqueeActiveChange={setDivisionsTooltipEnabled}
                    />
                    <Pressable
                      style={styles.divisionsChipHitbox}
                      onPress={() => {
                        if (divisionsTooltipEnabled) {
                          setDivisionsTooltipOpen(true)
                        } else {
                          onPress()
                        }
                      }}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        <Pressable onPress={onPress} style={styles.body}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Feather name="calendar" size={16} color={colors.textMuted} style={styles.iconLight} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {formatTournamentDateRange(tournament.startDate, tournament.endDate)}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Feather
                  name={getStatusIcon(availabilityStatusLabel)}
                  size={16}
                  color={colors.textMuted}
                  style={styles.iconLight}
                />
                <Text style={styles.metaText} numberOfLines={1}>
                  {availabilityStatusLabel}
                </Text>
              </View>
            </View>

            <View style={[styles.row, styles.rowExtraGapTop]}>
              <View style={styles.rowLeft}>
                <Feather name="map-pin" size={16} color={colors.textMuted} style={styles.iconLight} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {locationLabel}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Feather name="users" size={16} color={colors.textMuted} style={styles.iconLight} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {occupancyLabel}
                </Text>
              </View>
            </View>

            <View style={[styles.row, styles.rowExtraGapTop]}>
              <View style={styles.rowLeft}>
                {showClubLabel ? (
                  <>
                    <Feather name="flag" size={16} color={colors.textMuted} style={styles.iconLight} />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {clubLabel}
                    </Text>
                  </>
                ) : null}
              </View>
              <View style={styles.rowRight}>
                <OptionalLinearGradient
                  colors={['#FFF3C4', '#F6D77B', '#E8B64B']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.priceChip, secondaryStatusLabel ? styles.priceChipNarrow : null]}
                  fallbackColor="#F6D77B"
                >
                  <Text style={styles.priceChipText} numberOfLines={1}>
                    {feeChipLabel}
                  </Text>
                </OptionalLinearGradient>
              </View>
            </View>
        </Pressable>
      </SurfaceCard>

      <AppBottomSheet
        open={divisionsTooltipOpen}
        onClose={() => setDivisionsTooltipOpen(false)}
        title="Divisions"
        footer={
          <ActionButton
            label="Open Tournament"
            variant="primary"
            onPress={() => {
              setDivisionsTooltipOpen(false)
              onPress()
            }}
          />
        }
      >
        <View style={styles.divisionsSheetBody}>
          <View style={styles.divisionsSheetList}>
            {divisionLabels.map((division, index) => (
              <View key={`tooltip-${division}-${index}`} style={styles.divisionsSheetPill}>
                <Text style={styles.divisionsSheetText}>{division}</Text>
              </View>
            ))}
          </View>
        </View>
      </AppBottomSheet>
    </>
  )
}

/** Высота колонки справа от логотипа: строка заголовка + зазор + строка чипов — как у карточки с Admin-бейджем. */
const HERO_TITLE_ROW_H = 30
const HERO_CHIP_ROW_H = 30
const HERO_MAIN_GAP = 6
const HERO_TEXT_COLUMN_H = HERO_TITLE_ROW_H + HERO_MAIN_GAP + HERO_CHIP_ROW_H

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    card: {
      borderRadius: radius.lg,
      overflow: 'hidden',
      borderWidth: 0,
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: 0,
    },
    hero: {
      position: 'relative',
      overflow: 'hidden',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      height: spacing.md * 2 + HERO_TEXT_COLUMN_H,
      justifyContent: 'center',
      backgroundColor: colors.eventHeroBackground,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      borderBottomWidth: 0,
    },
    heroPattern: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: '40%',
      zIndex: 0,
    },
    heroPatternFade: {
      ...StyleSheet.absoluteFillObject,
    },
    heroPatternDot: {
      position: 'absolute',
      width: 3,
      height: 3,
      borderRadius: 999,
      backgroundColor: '#FFFFFF',
    },
    heroHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      height: HERO_TEXT_COLUMN_H,
      justifyContent: 'space-between',
      gap: spacing.sm,
      zIndex: 1,
    },
    heroLogo: {
      width: 56,
      height: 56,
      borderRadius: 14,
      overflow: 'hidden',
      flexShrink: 0,
      backgroundColor: 'rgba(255, 255, 255, 0.18)',
    },
    heroLogoImage: {
      width: 56,
      height: 56,
      borderRadius: 14,
    },
    heroMain: {
      flex: 1,
      minWidth: 0,
      height: HERO_TEXT_COLUMN_H,
      justifyContent: 'flex-start',
      gap: HERO_MAIN_GAP,
    },
    heroTitlePress: {
      height: HERO_TITLE_ROW_H,
      minWidth: 0,
      justifyContent: 'center',
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      height: HERO_TITLE_ROW_H,
      minHeight: HERO_TITLE_ROW_H,
      maxHeight: HERO_TITLE_ROW_H,
    },
    title: {
      color: colors.white,
      fontSize: 18,
      lineHeight: 22,
      fontWeight: '700',
      flex: 1,
      minWidth: 0,
    },
    compactStatusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      height: HERO_TITLE_ROW_H,
      maxHeight: HERO_TITLE_ROW_H,
      backgroundColor: 'rgba(255, 255, 255, 0.22)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.28)',
      maxWidth: 140,
      flexShrink: 0,
    },
    compactStatusText: {
      color: colors.white,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    body: {
      padding: spacing.md,
      paddingBottom: spacing.md,
      gap: 10,
      backgroundColor: colors.surface,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
      borderBottomLeftRadius: radius.lg,
      borderBottomRightRadius: radius.lg,
    },
    metaText: {
      color: colors.text,
      fontSize: 13,
      lineHeight: 20,
      flexShrink: 1,
    },
    chipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'nowrap',
      gap: 8,
      height: HERO_CHIP_ROW_H,
      minHeight: HERO_CHIP_ROW_H,
      maxHeight: HERO_CHIP_ROW_H,
    },
    heroChip: {
      height: HERO_CHIP_ROW_H,
      minHeight: HERO_CHIP_ROW_H,
      maxHeight: HERO_CHIP_ROW_H,
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 999,
      backgroundColor: 'rgba(255, 255, 255, 0.18)',
      paddingHorizontal: 10,
      paddingVertical: 0,
      maxWidth: '100%',
      flexShrink: 1,
      alignSelf: 'center',
    },
    heroChipNoShrink: {
      flexShrink: 0,
    },
    heroChipOutlined: {
      backgroundColor: 'rgba(255, 255, 255, 0.16)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.28)',
    },
    divisionsChipSlot: {
      flex: 1,
      minWidth: 0,
      alignItems: 'flex-start',
      position: 'relative',
      zIndex: 2,
      elevation: 3,
    },
    divisionsChipHitbox: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: radius.pill,
    },
    heroChipText: {
      color: colors.white,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '600',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    rowExtraGapTop: {
      marginTop: 3,
    },
    rowLeft: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    rowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    iconLight: {
      opacity: 0.72,
    },
    priceChip: {
      minHeight: 30,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      maxWidth: 180,
      justifyContent: 'center',
    },
    priceChipNarrow: {
      maxWidth: 150,
    },
    priceChipText: {
      color: colors.black,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '600',
    },
    divisionsSheetBody: {
      gap: spacing.sm,
      paddingTop: spacing.xs,
    },
    divisionsSheetList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    divisionsSheetPill: {
      borderRadius: 999,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    divisionsSheetText: {
      color: colors.text,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '600',
    },
  })

const stylesMarquee = StyleSheet.create({
  clip: {
    alignSelf: 'stretch',
    minWidth: 0,
    overflow: 'hidden',
    height: HERO_CHIP_ROW_H,
    minHeight: HERO_CHIP_ROW_H,
    maxHeight: HERO_CHIP_ROW_H,
    borderRadius: radius.pill,
  },
  animatedTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingRight: 6,
  },
  pill: {
    height: HERO_CHIP_ROW_H,
    minHeight: HERO_CHIP_ROW_H,
    maxHeight: HERO_CHIP_ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 0,
    alignSelf: 'flex-start',
  },
  pillText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
})

