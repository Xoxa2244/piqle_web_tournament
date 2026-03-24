import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'

import { OptionalLinearGradient } from '../../src/components/OptionalLinearGradient'
import { SubpageHeader } from '../../src/components/navigation/SubpageHeader'
import { SurfaceCard } from '../../src/components/ui'
import { buildWebUrl } from '../../src/lib/config'
import { getPalette, radius, spacing, type ThemePalette } from '../../src/lib/theme'
import { trpc } from '../../src/lib/trpc'
import { useAuth } from '../../src/providers/AuthProvider'
import { useAppTheme } from '../../src/providers/ThemeProvider'

type ToggleGroups = {
  notifications: {
    tournamentUpdates: boolean
    matchReminders: boolean
    chatMessages: boolean
    clubAnnouncements: boolean
    emailNotifications: boolean
    pushNotifications: boolean
  }
  privacy: {
    publicProfile: boolean
    showStats: boolean
    showLocation: boolean
    allowMessages: boolean
    showActivity: boolean
  }
  preferences: {
    soundEffects: boolean
    hapticFeedback: boolean
    autoPlayVideos: boolean
  }
}

const SettingItem = ({
  icon,
  title,
  description,
  value,
  onChange,
  type = 'switch',
  onPress,
  colors,
}: {
  icon: keyof typeof Feather.glyphMap
  title: string
  description?: string
  value?: boolean
  onChange?: () => void
  type?: 'switch' | 'link'
  onPress?: () => void
  colors: ThemePalette
}) => (
  <Pressable
    onPress={type === 'link' ? onPress : onChange}
    style={({ pressed }) => [
      styles.settingRow,
      { borderBottomColor: colors.border },
      pressed && styles.settingRowPressed,
    ]}
  >
    <View style={styles.settingRowLeft}>
      <View style={[styles.settingIconWrap, { backgroundColor: colors.brandPrimaryTint }]}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.settingTitle, { color: colors.text }]}>{title}</Text>
        {description ? <Text style={[styles.settingDescription, { color: colors.textMuted }]}>{description}</Text> : null}
      </View>
    </View>

    {type === 'switch' && value !== undefined && onChange ? (
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.switchBackground, true: colors.primary }}
        thumbColor={colors.white}
        ios_backgroundColor={colors.switchBackground}
      />
    ) : (
      <Feather name="chevron-right" size={18} color={colors.textMuted} />
    )}
  </Pressable>
)

const ActionRowButton = ({
  icon,
  label,
  destructive,
  onPress,
  colors,
}: {
  icon: keyof typeof Feather.glyphMap
  label: string
  destructive?: boolean
  onPress?: () => void
  colors: ThemePalette
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.actionRowButton,
      destructive
        ? [styles.actionRowButtonDestructive, { backgroundColor: colors.dangerSoft, borderColor: 'rgba(255, 0, 110, 0.16)' }]
        : [styles.actionRowButtonDefault, { backgroundColor: colors.surface, borderColor: colors.border }],
      pressed && styles.actionRowButtonPressed,
    ]}
  >
    <Feather name={icon} size={16} color={destructive ? colors.danger : colors.text} />
    <Text
      style={[
        styles.actionRowButtonText,
        { color: destructive ? colors.danger : colors.text },
      ]}
    >
      {label}
    </Text>
  </Pressable>
)

const AppearanceThemeToggle = ({
  theme,
  colors,
  onToggle,
}: {
  theme: 'light' | 'dark'
  colors: ThemePalette
  onToggle: () => void
}) => {
  const isDark = theme === 'dark'
  const themeSwitchThumbStyle = {
    left: isDark ? 28 : 4,
  } as const

  return (
    <View style={styles.appearanceBlock}>
      <View style={styles.themeLabelRow}>
        <Feather name="moon" size={16} color={colors.textMuted} />
        <Text style={[styles.themeLabelText, { color: colors.text }]}>Theme</Text>
      </View>

      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          styles.themeToggleCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
          pressed && styles.settingRowPressed,
        ]}
      >
        <View style={styles.themeToggleLeft}>
          <OptionalLinearGradient
            colors={[colors.primary, colors.purple]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.themeToggleIconFrame}
            fallbackColor={colors.primary}
          >
            <View style={[styles.themeToggleIconWrap, { backgroundColor: colors.surface }]}>
              <Feather
                name={isDark ? 'moon' : 'sun'}
                size={24}
                color={isDark ? colors.primary : colors.warning}
              />
            </View>
          </OptionalLinearGradient>

          <View style={styles.themeToggleCopy}>
            <Text style={[styles.themeToggleTitle, { color: colors.text }]}>
              {isDark ? 'Dark Mode' : 'Light Mode'}
            </Text>
            <Text style={[styles.themeToggleSubtitle, { color: colors.textMuted }]}>
              {isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            </Text>
          </View>
        </View>

        {isDark ? (
          <OptionalLinearGradient
            colors={[colors.primary, colors.purple]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.themeSwitchTrack}
            fallbackColor={colors.primary}
          >
            <View style={[styles.themeSwitchThumb, themeSwitchThumbStyle]} />
          </OptionalLinearGradient>
        ) : (
          <View style={[styles.themeSwitchTrack, { backgroundColor: colors.switchBackground }]}>
            <View style={[styles.themeSwitchThumb, themeSwitchThumbStyle]} />
          </View>
        )}
      </Pressable>
    </View>
  )
}

export default function ProfileSettingsScreen() {
  const { token, signOut } = useAuth()
  const { theme, toggleTheme } = useAppTheme()
  const isAuthenticated = Boolean(token)
  const api = trpc as any
  const utils = trpc.useUtils() as any
  const profileQuery = api.user.getProfile.useQuery(undefined, { enabled: isAuthenticated })
  const colors = getPalette(theme)
  const themedCardStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    shadowColor: colors.shadow,
  } as const
  const themedNoticeCardStyle = {
    backgroundColor: colors.hero,
    borderColor: colors.brandPrimaryBorder,
    shadowColor: 'transparent',
  } as const
  const themedPlaceholderCardStyle = {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    shadowColor: 'transparent',
  } as const

  const [notice, setNotice] = useState<string | null>(null)
  const [settings, setSettings] = useState<ToggleGroups>({
    notifications: {
      tournamentUpdates: true,
      matchReminders: false,
      chatMessages: true,
      clubAnnouncements: true,
      emailNotifications: false,
      pushNotifications: true,
    },
    privacy: {
      publicProfile: true,
      showStats: true,
      showLocation: true,
      allowMessages: true,
      showActivity: false,
    },
    preferences: {
      soundEffects: true,
      hapticFeedback: true,
      autoPlayVideos: false,
    },
  })

  const toggleSetting = <T extends keyof ToggleGroups>(group: T, key: keyof ToggleGroups[T]) => {
    setSettings((current) => ({
      ...current,
      [group]: {
        ...current[group],
        [key]: !current[group][key],
      },
    }))
  }

  const openExternal = async (path?: string) => {
    try {
      await Linking.openURL(path ?? buildWebUrl('/'))
    } catch {}
  }

  const clearCache = async () => {
    await utils.invalidate()
    setNotice('Cached app data has been refreshed.')
  }

  const requestDeleteAccount = async () => {
    try {
      await Linking.openURL('mailto:info@piqle.io?subject=Delete%20Account%20Request')
    } catch {}
  }

  if (!isAuthenticated) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <SubpageHeader title="Settings" themeMode={theme} />
        <View style={styles.bodyPad}>
          <SurfaceCard style={themedPlaceholderCardStyle}>
            <Text style={[styles.placeholderTitle, { color: colors.text }]}>Sign in required</Text>
            <Text style={[styles.placeholderBody, { color: colors.textMuted }]}>Sign in to manage your account settings.</Text>
          </SurfaceCard>
        </View>
      </View>
    )
  }

  if (profileQuery.isLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <SubpageHeader title="Settings" themeMode={theme} />
        <View style={styles.bodyPad}>
          <SurfaceCard style={themedPlaceholderCardStyle}>
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.loadingLabel, { color: colors.textMuted }]}>Loading settings…</Text>
            </View>
          </SurfaceCard>
        </View>
      </View>
    )
  }

  const profile = profileQuery.data as any

  if (!profile) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <SubpageHeader title="Settings" themeMode={theme} />
        <View style={styles.bodyPad}>
          <SurfaceCard style={themedPlaceholderCardStyle}>
            <Text style={[styles.placeholderTitle, { color: colors.text }]}>Settings unavailable</Text>
            <Text style={[styles.placeholderBody, { color: colors.textMuted }]}>
              We could not load your account settings right now.
            </Text>
          </SurfaceCard>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SubpageHeader title="Settings" themeMode={theme} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {notice ? (
          <SurfaceCard tone="hero" style={themedNoticeCardStyle}>
            <Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text>
          </SurfaceCard>
        ) : null}

        <SurfaceCard style={[styles.card, themedCardStyle]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Account</Text>
          <View style={[styles.dividedGroup, { borderTopColor: colors.border }]}>
            <SettingItem colors={colors} icon="mail" title="Email" description={profile.email} type="link" />
            <SettingItem
              colors={colors}
              icon="lock"
              title="Change Password"
              description="Manage password reset from the auth screen"
              type="link"
              onPress={() => router.push('/sign-in')}
            />
            <SettingItem
              colors={colors}
              icon="smartphone"
              title="Two-Factor Authentication"
              description="Add extra security to your account"
              type="link"
            />
          </View>
        </SurfaceCard>

        <SurfaceCard style={[styles.card, themedCardStyle]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Appearance</Text>
          <View style={styles.appearanceSection}>
            <AppearanceThemeToggle theme={theme} colors={colors} onToggle={toggleTheme} />

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <SettingItem colors={colors} icon="globe" title="Language" description="English (US)" type="link" />
          </View>
        </SurfaceCard>

        <SurfaceCard style={[styles.card, themedCardStyle]}>
          <View style={styles.sectionTitleRow}>
            <Feather name="bell" size={18} color={colors.primary} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Notifications</Text>
          </View>
          <View style={[styles.dividedGroup, { borderTopColor: colors.border }]}>
            <SettingItem
              colors={colors}
              icon="bell"
              title="Push Notifications"
              description="Receive notifications on your device"
              value={settings.notifications.pushNotifications}
              onChange={() => toggleSetting('notifications', 'pushNotifications')}
            />
            <SettingItem
              colors={colors}
              icon="mail"
              title="Email Notifications"
              description="Get updates via email"
              value={settings.notifications.emailNotifications}
              onChange={() => toggleSetting('notifications', 'emailNotifications')}
            />
            <SettingItem
              colors={colors}
              icon="bell"
              title="Tournament Updates"
              description="Schedule changes and announcements"
              value={settings.notifications.tournamentUpdates}
              onChange={() => toggleSetting('notifications', 'tournamentUpdates')}
            />
            <SettingItem
              colors={colors}
              icon="clock"
              title="Match Reminders"
              description="Remind me before scheduled matches"
              value={settings.notifications.matchReminders}
              onChange={() => toggleSetting('notifications', 'matchReminders')}
            />
            <SettingItem
              colors={colors}
              icon="message-circle"
              title="Chat Messages"
              description="New messages from chats"
              value={settings.notifications.chatMessages}
              onChange={() => toggleSetting('notifications', 'chatMessages')}
            />
            <SettingItem
              colors={colors}
              icon="users"
              title="Club Announcements"
              description="Updates from your clubs"
              value={settings.notifications.clubAnnouncements}
              onChange={() => toggleSetting('notifications', 'clubAnnouncements')}
            />
          </View>
        </SurfaceCard>

        <SurfaceCard style={[styles.card, themedCardStyle]}>
          <View style={styles.sectionTitleRow}>
            <Feather name="shield" size={18} color={colors.primary} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Privacy & Security</Text>
          </View>
          <View style={[styles.dividedGroup, { borderTopColor: colors.border }]}>
            <SettingItem
              colors={colors}
              icon="eye"
              title="Public Profile"
              description="Allow others to view your profile"
              value={settings.privacy.publicProfile}
              onChange={() => toggleSetting('privacy', 'publicProfile')}
            />
            <SettingItem
              colors={colors}
              icon="bar-chart-2"
              title="Show Stats"
              description="Display your stats publicly"
              value={settings.privacy.showStats}
              onChange={() => toggleSetting('privacy', 'showStats')}
            />
            <SettingItem
              colors={colors}
              icon="map-pin"
              title="Show Location"
              description="Display your location on profile"
              value={settings.privacy.showLocation}
              onChange={() => toggleSetting('privacy', 'showLocation')}
            />
            <SettingItem
              colors={colors}
              icon="mail"
              title="Allow Messages"
              description="Let other users message you"
              value={settings.privacy.allowMessages}
              onChange={() => toggleSetting('privacy', 'allowMessages')}
            />
            <SettingItem
              colors={colors}
              icon="activity"
              title="Show Activity"
              description="Let others see your recent activity"
              value={settings.privacy.showActivity}
              onChange={() => toggleSetting('privacy', 'showActivity')}
            />
            <SettingItem colors={colors} icon="user-x" title="Blocked Users" type="link" />
          </View>
        </SurfaceCard>

        <SurfaceCard style={[styles.card, themedCardStyle]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>About & Support</Text>
          <View style={[styles.dividedGroup, { borderTopColor: colors.border }]}>
            <SettingItem colors={colors} icon="help-circle" title="Help Center" type="link" onPress={() => void openExternal()} />
            <SettingItem colors={colors} icon="external-link" title="Terms of Service" type="link" onPress={() => void openExternal()} />
            <SettingItem colors={colors} icon="external-link" title="Privacy Policy" type="link" onPress={() => void openExternal()} />
            <SettingItem
              colors={colors}
              icon="mail"
              title="Contact Support"
              type="link"
              onPress={() => void Linking.openURL('mailto:info@piqle.io')}
            />
          </View>
          <Text style={[styles.versionText, { borderTopColor: colors.border, color: colors.textMuted }]}>Piqle v1.0.0</Text>
        </SurfaceCard>

        <SurfaceCard style={[styles.card, themedCardStyle]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Data & Storage</Text>
          <View style={[styles.dividedGroup, { borderTopColor: colors.border }]}>
            <SettingItem
              colors={colors}
              icon="download"
              title="Download My Data"
              description="Get a copy of your account data"
              type="link"
              onPress={() => void Linking.openURL('mailto:info@piqle.io?subject=Download%20My%20Data')}
            />
            <SettingItem
              colors={colors}
              icon="trash-2"
              title="Clear Cache"
              description="Refresh locally cached app data"
              type="link"
              onPress={() => void clearCache()}
            />
          </View>
        </SurfaceCard>

        <SurfaceCard style={[styles.card, themedCardStyle]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Account Actions</Text>
          <View style={styles.actionButtons}>
            <ActionRowButton
              colors={colors}
              icon="log-out"
              label="Log Out"
              onPress={async () => {
                await signOut()
                router.replace('/(tabs)')
              }}
            />
            <ActionRowButton
              colors={colors}
              icon="trash-2"
              label="Delete Account"
              destructive
              onPress={() => void requestDeleteAccount()}
            />
          </View>
        </SurfaceCard>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  bodyPad: {
    padding: spacing.md,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  noticeText: {
    fontSize: 14,
    lineHeight: 20,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  placeholderBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    gap: spacing.md,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  dividedGroup: {
    borderTopWidth: 1,
  },
  settingRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderBottomWidth: 1,
    paddingVertical: 12,
  },
  settingRowPressed: {
    opacity: 0.88,
  },
  settingRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  settingDescription: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  appearanceSection: {
    gap: spacing.md,
  },
  appearanceBlock: {
    gap: 12,
  },
  themeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  themeLabelText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  themeToggleCard: {
    minHeight: 80,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  themeToggleLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  themeToggleIconFrame: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    padding: 2,
  },
  themeToggleIconWrap: {
    flex: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeToggleCopy: {
    flex: 1,
  },
  themeToggleTitle: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  themeToggleSubtitle: {
    marginTop: 2,
    fontSize: 14,
    lineHeight: 20,
  },
  themeSwitchTrack: {
    width: 56,
    height: 32,
    borderRadius: radius.pill,
    position: 'relative',
  },
  themeSwitchThumb: {
    position: 'absolute',
    top: 4,
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  divider: {
    height: 1,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingLabel: {
    fontSize: 15,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  versionText: {
    marginTop: 4,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    fontSize: 13,
    textAlign: 'center',
  },
  actionButtons: {
    gap: 10,
  },
  actionRowButton: {
    minHeight: 50,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionRowButtonDefault: {
    borderWidth: 1,
  },
  actionRowButtonDestructive: {
    borderWidth: 1,
  },
  actionRowButtonPressed: {
    opacity: 0.88,
  },
  actionRowButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
})
