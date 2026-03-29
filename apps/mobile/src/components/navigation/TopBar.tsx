import { useNavigation } from '@react-navigation/native'
import { Feather } from '@expo/vector-icons'
import { router, usePathname } from 'expo-router'
import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native'

import { useEffectivePathname } from '../../hooks/useEffectivePathname'
import { realtimeAwareQueryOptions } from '../../lib/realtimePoll'
import { spacing, type ThemePalette } from '../../lib/theme'
import { trpc } from '../../lib/trpc'
import { useAuth } from '../../providers/AuthProvider'
import { useNotificationSwipeHidden } from '../../providers/NotificationSwipeHiddenProvider'
import { useAppTheme } from '../../providers/ThemeProvider'
import { RemoteUserAvatar } from '../RemoteUserAvatar'
import { BackCircleButton } from './BackCircleButton'
import { BrandGradientText } from './BrandGradientText'
import { PiqleLogo } from './PiqleLogo'

const HEADER_DIVIDER_COLOR = 'rgba(0,0,0,0.06)'
const HEADER_DIVIDER_WIDTH = StyleSheet.hairlineWidth

const isHomeRoute = (pathname: string) =>
  pathname === '/' ||
  pathname === '/(tabs)' ||
  pathname === '/(tabs)/' ||
  pathname === '/(tabs)/index'

const getTitle = (pathname: string) => {
  if (pathname === '/') return 'Piqle'
  if (pathname.startsWith('/tournaments')) return 'Events'
  if (pathname.startsWith('/clubs')) return 'Clubs'
  if (pathname.startsWith('/chats')) return pathname === '/chats/ai-assistant' ? 'AI Assistant' : 'Messages'
  if (pathname.startsWith('/ai')) return 'AI Assistant'
  if (pathname.startsWith('/profile')) return 'Profile'
  if (pathname.startsWith('/search')) return 'Search'
  if (pathname.startsWith('/notifications')) return 'Notifications'
  return 'Piqle'
}

const wantsTopBarBack = (pathname: string) =>
  pathname === '/notifications' ||
  pathname === '/search' ||
  pathname === '/profile' ||
  pathname.startsWith('/profile/') ||
  pathname.startsWith('/chats/club/') ||
  pathname.startsWith('/chats/event/tournament/')

const LOGO_OFF_X = -72
const TEXT_HIDE_MS = 85
const LOGO_IN_MS = 360
const LOGO_OUT_MS = 300
const TEXT_SHOW_MS = 180

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    header: {
      height: 56,
      paddingHorizontal: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceOverlay,
      borderBottomWidth: HEADER_DIVIDER_WIDTH,
      borderBottomColor: HEADER_DIVIDER_COLOR,
    },
    headerAmbient: {
      backgroundColor: 'transparent',
      borderBottomWidth: HEADER_DIVIDER_WIDTH,
      borderBottomColor: colors.border,
    },
    titleRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minWidth: 0,
    },
    titleCluster: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
    },
    titleWithAccessoryRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      minWidth: 0,
      gap: 6,
      paddingRight: 16,
    },
    titleNextToAccessory: {
      flexGrow: 0,
      flexShrink: 1,
      minWidth: 0,
    },
    titleLogoSlot: {
      flexGrow: 0,
      flexShrink: 1,
      minWidth: 0,
      maxWidth: '78%',
    },
    titleInCluster: {
      flex: 1,
      minWidth: 0,
    },
    titleTextWrap: {
      height: 36,
      justifyContent: 'center',
      flexShrink: 1,
    },
    backBtn: {
      marginRight: 0,
    },
    titleWithBack: {
      flex: 1,
    },
    titleAccessory: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    titleAnimContainer: {
      flex: 1,
      minWidth: 0,
      height: 36,
      justifyContent: 'center',
      overflow: 'hidden',
    },
    titleLayerAbs: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'flex-start',
    },
    logoSlideWrap: {
      zIndex: 1,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: -0.4,
      lineHeight: 36,
      ...(Platform.OS === 'android'
        ? { textAlignVertical: 'center' as const, includeFontPadding: false }
        : {}),
    },
    titleAlignedWithBack: {},
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    iconBubble: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconBubblePressed: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.brandPrimaryBorder,
      transform: [{ scale: 0.94 }],
    },
    dot: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.accent,
    },
    avatarBtn: {
      marginLeft: 4,
    },
    avatarBtnPressed: {
      opacity: 0.85,
    },
  })

function IconBubble({
  icon,
  onPress,
  showDot,
  active,
}: {
  icon: keyof typeof Feather.glyphMap
  onPress: () => void
  showDot?: boolean
  active?: boolean
}) {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.iconBubble, pressed && styles.iconBubblePressed]}>
      <Feather name={icon} size={18} color={active ? colors.primary : colors.text} />
      {showDot ? <View style={styles.dot} /> : null}
    </Pressable>
  )
}

function AnimatedHomeTitle({
  showLogo,
  titleText,
  showBack,
  refreshPulseKey,
}: {
  showLogo: boolean
  titleText: string
  showBack: boolean
  refreshPulseKey?: number
}) {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const textOp = useRef(new Animated.Value(showLogo ? 0 : 1)).current
  const logoX = useRef(new Animated.Value(showLogo ? 0 : LOGO_OFF_X)).current
  const didMount = useRef(false)

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      textOp.setValue(showLogo ? 0 : 1)
      logoX.setValue(showLogo ? 0 : LOGO_OFF_X)
      return
    }

    if (showLogo) {
      textOp.setValue(1)
      logoX.setValue(LOGO_OFF_X)
      Animated.sequence([
        Animated.timing(textOp, {
          toValue: 0,
          duration: TEXT_HIDE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(logoX, {
          toValue: 0,
          duration: LOGO_IN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      Animated.sequence([
        Animated.timing(logoX, {
          toValue: LOGO_OFF_X,
          duration: LOGO_OUT_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(textOp, {
          toValue: 1,
          duration: TEXT_SHOW_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start()
    }
  }, [showLogo, textOp, logoX])

  useEffect(() => {
    if (!showLogo || !refreshPulseKey) return
    logoX.stopAnimation()
    logoX.setValue(0)
    Animated.sequence([
      Animated.timing(logoX, {
        toValue: LOGO_OFF_X,
        duration: LOGO_OUT_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoX, {
        toValue: 0,
        duration: LOGO_IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()
  }, [showLogo, refreshPulseKey, logoX])

  return (
    <View style={[styles.titleAnimContainer, showBack && styles.titleWithBack]}>
      <Animated.View
        style={[styles.titleLayerAbs, showBack && styles.titleAlignedWithBack, { opacity: textOp }]}
        pointerEvents={showLogo ? 'none' : 'auto'}
      >
        <BrandGradientText style={styles.title} numberOfLines={1}>
          {titleText}
        </BrandGradientText>
      </Animated.View>
      <Animated.View
        style={[styles.titleLayerAbs, styles.logoSlideWrap, { transform: [{ translateX: logoX }] }]}
        pointerEvents={showLogo ? 'auto' : 'none'}
      >
        <PiqleLogo height={28} />
      </Animated.View>
    </View>
  )
}

export const TopBar = ({
  titleAccessory,
  titleAccessoryLeading = false,
  titleOverride,
  ambient = false,
  refreshPulseKey,
  /** Если задано — вместо поиска, колокольчика и аватара показывается этот слот (например экран уведомлений). */
  rightSlot,
}: {
  titleAccessory?: ReactNode
  titleAccessoryLeading?: boolean
  titleOverride?: string
  ambient?: boolean
  refreshPulseKey?: number
  rightSlot?: ReactNode
}) => {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const pathname = useEffectivePathname()
  const routePathname = usePathname()
  const navigation = useNavigation()
  const { user, token } = useAuth()
  const { swipeHiddenIds, swipeHiddenHydrated } = useNotificationSwipeHidden()
  const api = trpc as any
  const profileQuery = api.user.getProfile.useQuery(undefined, { enabled: Boolean(token) })
  const notificationsQuery = api.notification.list.useQuery(
    { limit: 40 },
    { enabled: Boolean(token), ...realtimeAwareQueryOptions }
  )
  const unreadCount = useMemo(() => {
    const server = Number(notificationsQuery.data?.unreadCount ?? 0)
    if (!swipeHiddenHydrated) return server
    const items = (notificationsQuery.data?.items ?? []) as { id?: string; readAt?: string | null }[]
    const hiddenUnread = items.filter(
      (i) => swipeHiddenIds.has(String(i.id ?? '')) && !(i.readAt ?? null),
    ).length
    return Math.max(0, server - hiddenUnread)
  }, [notificationsQuery.data?.unreadCount, notificationsQuery.data?.items, swipeHiddenHydrated, swipeHiddenIds])
  const showNotificationDot = Boolean(token && unreadCount > 0)
  const title = titleOverride ?? getTitle(pathname)
  const headerPathname =
    routePathname === '/search' || routePathname === '/notifications' ? routePathname : pathname
  const resolvedTitle = titleOverride ?? getTitle(headerPathname)
  const showBack = wantsTopBarBack(headerPathname) && navigation.canGoBack()
  const showHomeLogo = !titleOverride && !showBack && isHomeRoute(headerPathname)
  const hasTitleAccessory = Boolean(titleAccessory)
  const profile = profileQuery.data as
    | { name?: string | null; email?: string | null; image?: string | null }
    | undefined
  const avatarUri = profile?.image ?? user?.image ?? null
  const initialsLabel = profile?.name || profile?.email || user?.name || user?.email || ''
  const searchReturnTo = routePathname || pathname || '/'
  const titleBesideAccessory = hasTitleAccessory && (Boolean(titleOverride) || !showHomeLogo)

  return (
    <View style={[styles.header, ambient && styles.headerAmbient]}>
      <View style={styles.titleRow}>
        {showBack ? <BackCircleButton onPress={() => navigation.goBack()} style={styles.backBtn} /> : null}
        <View style={styles.titleCluster}>
          {hasTitleAccessory && titleBesideAccessory ? (
            <View style={styles.titleWithAccessoryRow}>
              {titleAccessoryLeading ? <View style={styles.titleAccessory}>{titleAccessory}</View> : null}
              <View style={styles.titleTextWrap}>
                <BrandGradientText
                  style={[
                    styles.title,
                    styles.titleNextToAccessory,
                    showBack && styles.titleAlignedWithBack,
                  ]}
                  numberOfLines={1}
                >
                  {resolvedTitle}
                </BrandGradientText>
              </View>
              {!titleAccessoryLeading ? <View style={styles.titleAccessory}>{titleAccessory}</View> : null}
            </View>
          ) : hasTitleAccessory && showHomeLogo ? (
            <View style={styles.titleWithAccessoryRow}>
              {titleAccessoryLeading ? <View style={styles.titleAccessory}>{titleAccessory}</View> : null}
              <View style={styles.titleLogoSlot}>
                <AnimatedHomeTitle
                  showLogo={showHomeLogo}
                  titleText={resolvedTitle}
                  showBack={showBack}
                  refreshPulseKey={refreshPulseKey}
                />
              </View>
              {!titleAccessoryLeading ? <View style={styles.titleAccessory}>{titleAccessory}</View> : null}
            </View>
          ) : titleOverride != null && titleOverride !== '' ? (
            <View style={styles.titleTextWrap}>
              <BrandGradientText
                style={[
                  styles.title,
                  styles.titleInCluster,
                  showBack && styles.titleWithBack,
                  showBack && styles.titleAlignedWithBack,
                ]}
                numberOfLines={1}
              >
                {resolvedTitle}
              </BrandGradientText>
            </View>
          ) : (
            <AnimatedHomeTitle
              showLogo={showHomeLogo}
              titleText={resolvedTitle}
              showBack={showBack}
              refreshPulseKey={refreshPulseKey}
            />
          )}
        </View>
      </View>
      <View style={styles.actions}>
        {rightSlot !== undefined ? (
          rightSlot
        ) : (
          <>
            <IconBubble
              icon="search"
              active={routePathname === '/search'}
              onPress={() => {
                if (routePathname === '/search') return
                router.push({ pathname: '/search', params: { returnTo: searchReturnTo } })
              }}
            />
            <IconBubble
              icon="bell"
              active={routePathname === '/notifications'}
              onPress={() => {
                if (routePathname === '/notifications') return
                router.push('/notifications')
              }}
              showDot={showNotificationDot}
            />
            <Pressable
              onPress={() => {
                if (routePathname === '/profile') return
                router.push('/profile')
              }}
              style={({ pressed }) => [styles.avatarBtn, pressed && styles.avatarBtnPressed]}
            >
              <RemoteUserAvatar uri={avatarUri} size={36} fallback="initials" initialsLabel={initialsLabel} />
            </Pressable>
          </>
        )}
      </View>
    </View>
  )
}
