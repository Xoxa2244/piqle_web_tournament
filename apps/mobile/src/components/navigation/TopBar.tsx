import { useNavigation } from '@react-navigation/native'
import { Feather } from '@expo/vector-icons'
import { router, usePathname } from 'expo-router'
import { useEffect, useRef } from 'react'
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import type { ReactNode } from 'react'

import { useEffectivePathname } from '../../hooks/useEffectivePathname'
import { palette, spacing } from '../../lib/theme'
import { trpc } from '../../lib/trpc'
import { useAuth } from '../../providers/AuthProvider'
import { PiqleLogo } from './PiqleLogo'
import { RemoteUserAvatar } from '../RemoteUserAvatar'

/** Главная вкладка (Expo Router может отдавать `/` или сегмент `(tabs)`). */
const isHomeRoute = (pathname: string) =>
  pathname === '/' ||
  pathname === '/(tabs)' ||
  pathname === '/(tabs)/' ||
  pathname === '/(tabs)/index'

const usesBrandHeader = (pathname: string) =>
  isHomeRoute(pathname) || pathname === '/search'

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

const IconBubble = ({
  icon,
  onPress,
  showDot,
  active,
}: {
  icon: keyof typeof Feather.glyphMap
  onPress: () => void
  showDot?: boolean
  /** Текущий экран — подсветка primary (как активная вкладка) */
  active?: boolean
}) => (
  <Pressable onPress={onPress} style={({ pressed }) => [styles.iconBubble, pressed && styles.iconBubblePressed]}>
    <Feather name={icon} size={20} color={active ? palette.primary : palette.text} />
    {showDot ? <View style={styles.dot} /> : null}
  </Pressable>
)

const wantsTopBarBack = (pathname: string) =>
  pathname === '/notifications' ||
  pathname === '/profile' ||
  pathname.startsWith('/profile/') ||
  pathname.startsWith('/chats/club/') ||
  pathname.startsWith('/chats/event/tournament/')

/** Сдвиг логотипа влево за пределы видимой зоны (до анимации «домой») */
const LOGO_OFF_X = -72
const TEXT_HIDE_MS = 85
const LOGO_IN_MS = 360
const LOGO_OUT_MS = 300
const TEXT_SHOW_MS = 180

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
      <Animated.Text
        style={[styles.title, styles.titleLayerAbs, showBack && styles.titleAlignedWithBack, { opacity: textOp }]}
        numberOfLines={1}
        pointerEvents={showLogo ? 'none' : 'auto'}
      >
        {titleText}
      </Animated.Text>
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
  titleOverride,
  ambient = false,
  refreshPulseKey,
}: {
  titleAccessory?: ReactNode
  /** Заголовок вместо автоматического по pathname */
  titleOverride?: string
  /** Прозрачный фон под градиентом чата (AI и т.п.) */
  ambient?: boolean
  /** Триггер «уехал/вернулся» для лого на главной при pull-to-refresh */
  refreshPulseKey?: number
}) => {
  /** Заголовок / лого: на вкладках — путь активного таба (видно при swipe поверх модалок). Иконки — по глобальному URL. */
  const pathname = useEffectivePathname()
  const routePathname = usePathname()
  const navigation = useNavigation()
  const { user, token } = useAuth()
  const api = trpc as any
  const profileQuery = api.user.getProfile.useQuery(undefined, { enabled: Boolean(token) })
  const notificationsQuery = api.notification.list.useQuery(undefined, { enabled: Boolean(token) })
  const unreadCount = Number(notificationsQuery.data?.unreadCount ?? 0)
  const showNotificationDot = Boolean(token && unreadCount > 0)
  const title = titleOverride ?? getTitle(pathname)
  const showBack = wantsTopBarBack(pathname) && navigation.canGoBack()
  const showBrandLogo = !titleOverride && !showBack && usesBrandHeader(pathname)
  const hasTitleAccessory = Boolean(titleAccessory)
  const profile = profileQuery.data as { name?: string | null; email?: string | null; image?: string | null } | undefined
  const avatarUri = profile?.image ?? user?.image ?? null
  const initialsLabel = profile?.name || profile?.email || user?.name || user?.email || ''
  const searchReturnTo = routePathname || pathname || '/'

  /** С аксессуаром заголовок не должен иметь flexGrow: иначе строка растягивается и кнопка уезжает к иконке поиска. */
  const titleBesideAccessory = hasTitleAccessory && (Boolean(titleOverride) || !showBrandLogo)

  return (
    <View style={[styles.header, ambient && styles.headerAmbient]}>
      <View style={styles.titleRow}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => navigation.goBack()}
            hitSlop={12}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          >
            <Feather name="arrow-left" size={22} color={palette.text} />
          </Pressable>
        ) : null}
        <View style={styles.titleCluster}>
          {hasTitleAccessory && titleBesideAccessory ? (
            <View style={styles.titleWithAccessoryRow}>
              <Text
                style={[
                  styles.title,
                  styles.titleNextToAccessory,
                  showBack && styles.titleAlignedWithBack,
                ]}
                numberOfLines={1}
              >
                {title}
              </Text>
              <View style={styles.titleAccessory}>{titleAccessory}</View>
            </View>
          ) : hasTitleAccessory && showBrandLogo ? (
            <View style={styles.titleWithAccessoryRow}>
              <View style={styles.titleLogoSlot}>
                <AnimatedHomeTitle showLogo={showBrandLogo} titleText={title} showBack={showBack} refreshPulseKey={refreshPulseKey} />
              </View>
              <View style={styles.titleAccessory}>{titleAccessory}</View>
            </View>
          ) : titleOverride != null && titleOverride !== '' ? (
            <Text
              style={[
                styles.title,
                styles.titleInCluster,
                showBack && styles.titleWithBack,
                showBack && styles.titleAlignedWithBack,
              ]}
              numberOfLines={1}
            >
              {title}
            </Text>
          ) : (
            <AnimatedHomeTitle showLogo={showBrandLogo} titleText={title} showBack={showBack} refreshPulseKey={refreshPulseKey} />
          )}
        </View>
      </View>
      <View style={styles.actions}>
        <IconBubble
          icon="search"
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
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.surfaceOverlay,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  headerAmbient: {
    backgroundColor: 'transparent',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  /** Заголовок и titleAccessory в одной группе */
  titleCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  /** Текст + аксессуар в одном ряду; без flexGrow у текста — кнопка не уезжает к поиску */
  titleWithAccessoryRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minWidth: 0,
    gap: 6,
  },
  titleNextToAccessory: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
  },
  /** Редкий кейс: лого + аксессуар — слот сжимается, не забирает всю ширину */
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
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -4,
  },
  backBtnPressed: {
    backgroundColor: palette.surfaceMuted,
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
    color: palette.primary,
    letterSpacing: -0.4,
    lineHeight: 24,
    ...(Platform.OS === 'android' ? { textAlignVertical: 'center' as const, includeFontPadding: false } : {}),
  },
  /** Рядом со стрелкой «назад» визуально выравниваем по центру с иконкой 36×36 */
  titleAlignedWithBack: Platform.select({
    ios: { paddingTop: 5 },
    android: { paddingTop: 2 },
    default: {},
  }),
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
  },
  iconBubblePressed: {
    backgroundColor: palette.surfaceMuted,
  },
  dot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.accent,
  },
  avatarBtn: {
    marginLeft: 4,
  },
  avatarBtnPressed: {
    opacity: 0.85,
  },
})
