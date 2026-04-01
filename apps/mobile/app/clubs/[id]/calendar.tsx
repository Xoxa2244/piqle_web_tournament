import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'

import { ClubTournamentCard } from '../../../src/components/ClubTournamentCard'
import { EmptyState, LoadingBlock, SegmentedControl } from '../../../src/components/ui'
import { BackCircleButton } from '../../../src/components/navigation/BackCircleButton'
import { BrandGradientText } from '../../../src/components/navigation/BrandGradientText'
import { useToastWhenEntityMissing } from '../../../src/hooks/useToastWhenEntityMissing'
import {
  CLUB_CALENDAR_DAY_LABELS,
  addMonths,
  addWeeks,
  buildEventsByDay,
  buildMonthGrid,
  formatMonthYear,
  formatWeekRange,
  mapClubTournamentsToCalendarEvents,
  parseYmd,
  startOfMonth,
  startOfWeek,
  toLocalYmd,
} from '../../../src/lib/clubCalendar'
import { trpc } from '../../../src/lib/trpc'
import { radius, spacing, type ThemePalette } from '../../../src/lib/theme'
import { useAppTheme } from '../../../src/providers/ThemeProvider'

export default function ClubCalendarScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const clubId = String(params.id ?? '')
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  const clubQuery = trpc.club.get.useQuery({ id: clubId }, { enabled: Boolean(clubId) })
  useToastWhenEntityMissing({
    enabled: Boolean(clubId),
    entityKey: clubId,
    toastMessage: 'This club no longer exists or the link is invalid.',
    isLoading: clubQuery.isLoading,
    hasData: Boolean(clubQuery.data),
    isError: clubQuery.isError,
    errorMessage: clubQuery.error?.message,
  })

  const calendarEvents = useMemo(
    () => mapClubTournamentsToCalendarEvents(clubQuery.data?.tournaments ?? []),
    [clubQuery.data?.tournaments],
  )
  const eventsByDay = useMemo(() => buildEventsByDay(calendarEvents), [calendarEvents])
  const initialBaseDate = calendarEvents[0]?.startDate ? new Date(calendarEvents[0].startDate) : new Date()
  const [mode, setMode] = useState<'month' | 'week'>('month')
  const [month, setMonth] = useState(() => startOfMonth(initialBaseDate))
  const [weekStart, setWeekStart] = useState(() => startOfWeek(initialBaseDate))
  const [selectedKey, setSelectedKey] = useState<string | null>(
    calendarEvents[0]?.startDate ? toLocalYmd(new Date(calendarEvents[0].startDate)) : null,
  )
  const [monthGridWidth, setMonthGridWidth] = useState(0)

  const grid = useMemo(() => buildMonthGrid(month), [month])
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  }), [weekStart])
  const todayKey = toLocalYmd(new Date())
  const monthCellGap = 6
  const monthCellWidth = useMemo(() => {
    if (monthGridWidth <= 0) return 0
    return (monthGridWidth - monthCellGap * 6) / 7
  }, [monthGridWidth])
  const selectedEvents = selectedKey ? (eventsByDay.get(selectedKey) ?? []) : []

  if (clubQuery.isLoading) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.loadingWrap}>
          <LoadingBlock label="Loading calendar..." />
        </View>
      </SafeAreaView>
    )
  }

  if (!clubQuery.data) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.loadingWrap}>
          <EmptyState title="Club not found" body="This club could not be loaded." />
        </View>
      </SafeAreaView>
    )
  }

  const club = clubQuery.data

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.headerShell}>
        <View style={styles.backRow}>
          <BackCircleButton onPress={() => router.back()} style={styles.backButton} />
          <BrandGradientText style={styles.title}>Club calendar</BrandGradientText>
        </View>

        <SegmentedControl
          value={mode}
          onChange={(value) => {
            const next = value as 'month' | 'week'
            setMode(next)
            if (next === 'week') {
              setWeekStart(startOfWeek(selectedKey ? parseYmd(selectedKey) : new Date()))
            }
          }}
          options={[
            { value: 'month', label: 'Month' },
            { value: 'week', label: 'Week' },
          ]}
        />

        <View style={styles.navRow}>
          <View style={styles.navControls}>
            <Pressable
              onPress={() => (mode === 'month' ? setMonth((m) => addMonths(m, -1)) : setWeekStart((w) => addWeeks(w, -1)))}
              style={({ pressed }) => [styles.navIconBtn, pressed && styles.navIconBtnPressed]}
            >
              <Feather name="chevron-left" size={18} color={colors.text} />
            </Pressable>
            <Pressable
              onPress={() => (mode === 'month' ? setMonth((m) => addMonths(m, 1)) : setWeekStart((w) => addWeeks(w, 1)))}
              style={({ pressed }) => [styles.navIconBtn, pressed && styles.navIconBtnPressed]}
            >
              <Feather name="chevron-right" size={18} color={colors.text} />
            </Pressable>
            <Text style={styles.navLabel}>{mode === 'month' ? formatMonthYear(month) : formatWeekRange(weekStart)}</Text>
          </View>
          <Pressable
            onPress={() => {
              const now = new Date()
              setSelectedKey(toLocalYmd(now))
              if (mode === 'month') setMonth(startOfMonth(now))
              else setWeekStart(startOfWeek(now))
            }}
            style={({ pressed }) => [styles.todayBtn, pressed && styles.todayBtnPressed]}
          >
            <Text style={styles.todayBtnText}>Today</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView style={styles.scrollBody} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {mode === 'month' ? (
          <View
            style={styles.monthWrap}
            onLayout={(event) => {
              const nextWidth = event.nativeEvent.layout.width
              if (nextWidth > 0 && Math.abs(nextWidth - monthGridWidth) > 0.5) {
                setMonthGridWidth(nextWidth)
              }
            }}
          >
            <View style={styles.weekHeaderRow}>
              {CLUB_CALENDAR_DAY_LABELS.map((label) => (
                <Text key={label} style={[styles.weekHeaderCell, monthCellWidth > 0 ? { width: monthCellWidth } : null]}>
                  {label}
                </Text>
              ))}
            </View>
            <View style={styles.gridWrap}>
              {grid.map((date) => {
                const key = toLocalYmd(date)
                const inMonth = date.getMonth() === month.getMonth()
                const count = eventsByDay.get(key)?.length ?? 0
                const isSelected = selectedKey === key
                const isToday = key === todayKey
                return (
                  <Pressable
                    key={key}
                    onPress={() => setSelectedKey(key)}
                    style={({ pressed }) => [
                      styles.dayCell,
                      monthCellWidth > 0 ? { width: monthCellWidth } : null,
                      !inMonth && styles.dayCellMuted,
                      isSelected && styles.dayCellSelected,
                      isToday && !isSelected && styles.dayCellToday,
                      pressed && styles.dayCellPressed,
                    ]}
                  >
                    <Text style={styles.dayNumber}>{date.getDate()}</Text>
                    {count > 0 ? (
                      <View style={styles.dayCountPill}>
                        <Text style={styles.dayCountText}>{count}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                )
              })}
            </View>
          </View>
        ) : (
          <View style={styles.weekWrap}>
            {weekDays.map((date) => {
              const key = toLocalYmd(date)
              const count = eventsByDay.get(key)?.length ?? 0
              const isSelected = selectedKey === key
              const isToday = key === todayKey
              return (
                <Pressable
                  key={key}
                  onPress={() => setSelectedKey(key)}
                  style={({ pressed }) => [
                    styles.weekDayCard,
                    isSelected && styles.weekDayCardSelected,
                    isToday && !isSelected && styles.weekDayCardToday,
                    pressed && styles.dayCellPressed,
                  ]}
                >
                  <Text style={styles.weekDayTitle}>
                    {CLUB_CALENDAR_DAY_LABELS[date.getDay()]} {date.getDate()}
                  </Text>
                  <Text style={styles.weekDayMeta}>
                    {count > 0 ? `${count} event${count === 1 ? '' : 's'}` : 'No events'}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        )}

        <View style={styles.detailsWrap}>
          <Text style={styles.detailsTitle}>
            {selectedKey ? `Events on ${parseYmd(selectedKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Select a day'}
          </Text>
          {!selectedKey ? (
            <EmptyState title="Pick a date" body="Select a date to see club events." />
          ) : selectedEvents.length === 0 ? (
            <EmptyState title="No events" body="No events planned on this day." />
          ) : (
            <View style={styles.eventsList}>
              {selectedEvents.map((event) => (
                <ClubTournamentCard
                  key={event.id}
                  tournament={event as any}
                  onPress={() => router.push(`/tournaments/${event.id}`)}
                />
              ))}
            </View>
          )}
          <Pressable
            onPress={() => router.push(`/clubs/${club.id}/events`)}
            style={({ pressed }) => [styles.allEventsBtn, pressed && styles.todayBtnPressed]}
          >
            <Text style={styles.allEventsBtnText}>Open all upcoming events</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    screen: { flex: 1 },
    loadingWrap: { flex: 1, justifyContent: 'center', padding: spacing.lg },
    headerShell: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      gap: spacing.md,
    },
    scrollBody: {
      flex: 1,
    },
    content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
    backRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36, gap: 16 },
    backButton: { width: 36, height: 36 },
    title: { color: colors.primary, fontSize: 22, fontWeight: '800', letterSpacing: -0.4, lineHeight: 36 },
    navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    navControls: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
    navIconBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navIconBtnPressed: { opacity: 0.9 },
    navLabel: { color: colors.text, fontSize: 14, fontWeight: '700', flexShrink: 1 },
    todayBtn: {
      minHeight: 34,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.brandPrimaryBorder,
      backgroundColor: colors.brandPrimaryTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    todayBtnPressed: { opacity: 0.86 },
    todayBtnText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
    monthWrap: { gap: 8 },
    weekHeaderRow: { flexDirection: 'row', gap: 6 },
    weekHeaderCell: { flex: 1, textAlign: 'center', color: colors.textMuted, fontSize: 12, fontWeight: '600' },
    gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    dayCell: {
      minHeight: 52,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 6,
    },
    dayCellMuted: { opacity: 0.55 },
    dayCellSelected: { borderColor: colors.primary, backgroundColor: colors.brandPrimaryTint },
    dayCellToday: { borderColor: colors.primary },
    dayCellPressed: { opacity: 0.88 },
    dayNumber: { color: colors.text, fontSize: 12, fontWeight: '700' },
    dayCountPill: {
      marginTop: 6,
      alignSelf: 'flex-start',
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 6,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayCountText: { color: colors.white, fontSize: 10, fontWeight: '800' },
    weekWrap: { gap: 8 },
    weekDayCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.sm,
      gap: 4,
    },
    weekDayCardSelected: { borderColor: colors.primary, backgroundColor: colors.brandPrimaryTint },
    weekDayCardToday: { borderColor: colors.primary },
    weekDayTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
    weekDayMeta: { color: colors.textMuted, fontSize: 12 },
    detailsWrap: { gap: 10, marginTop: spacing.sm },
    detailsTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
    eventsList: { gap: 12 },
    allEventsBtn: {
      minHeight: 42,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    allEventsBtnText: { color: colors.text, fontWeight: '600' },
  })
