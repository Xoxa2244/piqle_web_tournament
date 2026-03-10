import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'

import { SubpageHeader } from '../../src/components/navigation/SubpageHeader'
import { EmptyState, LoadingBlock, SurfaceCard } from '../../src/components/ui'
import { buildWebUrl } from '../../src/lib/config'
import { palette, radius, spacing } from '../../src/lib/theme'
import { trpc } from '../../src/lib/trpc'
import { useAuth } from '../../src/providers/AuthProvider'

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

const ThemeOption = ({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress?: () => void
}) => (
  <Pressable onPress={onPress} style={[styles.themeOption, active && styles.themeOptionActive]}>
    <Text style={[styles.themeOptionText, active && styles.themeOptionTextActive]}>{label}</Text>
  </Pressable>
)

const SettingItem = ({
  icon,
  title,
  description,
  value,
  onChange,
  type = 'switch',
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap
  title: string
  description?: string
  value?: boolean
  onChange?: () => void
  type?: 'switch' | 'link'
  onPress?: () => void
}) => (
  <Pressable onPress={type === 'link' ? onPress : onChange} style={({ pressed }) => [styles.settingRow, pressed && styles.settingRowPressed]}>
    <View style={styles.settingRowLeft}>
      <View style={styles.settingIconWrap}>
        <Feather name={icon} size={18} color={palette.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingTitle}>{title}</Text>
        {description ? <Text style={styles.settingDescription}>{description}</Text> : null}
      </View>
    </View>

    {type === 'switch' && value !== undefined && onChange ? (
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#d9dee3', true: 'rgba(40, 205, 65, 0.35)' }}
        thumbColor={value ? palette.primary : '#ffffff'}
      />
    ) : (
      <Feather name="chevron-right" size={18} color={palette.textMuted} />
    )}
  </Pressable>
)

const ActionRowButton = ({
  icon,
  label,
  destructive,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap
  label: string
  destructive?: boolean
  onPress?: () => void
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.actionRowButton,
      destructive ? styles.actionRowButtonDestructive : styles.actionRowButtonDefault,
      pressed && styles.actionRowButtonPressed,
    ]}
  >
    <Feather name={icon} size={16} color={destructive ? palette.danger : palette.text} />
    <Text style={[styles.actionRowButtonText, destructive && styles.actionRowButtonTextDestructive]}>{label}</Text>
  </Pressable>
)

export default function ProfileSettingsScreen() {
  const { token, signOut } = useAuth()
  const isAuthenticated = Boolean(token)
  const api = trpc as any
  const utils = trpc.useUtils() as any
  const profileQuery = api.user.getProfile.useQuery(undefined, { enabled: isAuthenticated })

  const [theme, setTheme] = useState<'Light' | 'Dark' | 'System'>('Light')
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
      <View style={styles.screen}>
        <SubpageHeader title="Settings" />
        <View style={styles.bodyPad}>
          <EmptyState title="Sign in required" body="Sign in to manage your account settings." />
        </View>
      </View>
    )
  }

  if (profileQuery.isLoading) {
    return (
      <View style={styles.screen}>
        <SubpageHeader title="Settings" />
        <View style={styles.bodyPad}>
          <LoadingBlock label="Loading settings…" />
        </View>
      </View>
    )
  }

  const profile = profileQuery.data as any

  if (!profile) {
    return (
      <View style={styles.screen}>
        <SubpageHeader title="Settings" />
        <View style={styles.bodyPad}>
          <EmptyState title="Settings unavailable" body="We could not load your account settings right now." />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <SubpageHeader title="Settings" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {notice ? (
          <SurfaceCard tone="hero">
            <Text style={styles.noticeText}>{notice}</Text>
          </SurfaceCard>
        ) : null}

        <SurfaceCard style={styles.card}>
          <Text style={styles.cardTitle}>Account</Text>
          <View style={styles.dividedGroup}>
            <SettingItem icon="mail" title="Email" description={profile.email} type="link" />
            <SettingItem
              icon="lock"
              title="Change Password"
              description="Manage password reset from the auth screen"
              type="link"
              onPress={() => router.push('/sign-in')}
            />
            <SettingItem
              icon="smartphone"
              title="Two-Factor Authentication"
              description="Add extra security to your account"
              type="link"
            />
          </View>
        </SurfaceCard>

        <SurfaceCard style={styles.card}>
          <Text style={styles.cardTitle}>Appearance</Text>
          <View style={styles.appearanceBlock}>
            <View>
              <Text style={styles.fieldLabel}>Theme</Text>
              <View style={styles.themeRow}>
                {(['Light', 'Dark', 'System'] as const).map((option) => (
                  <ThemeOption key={option} label={option} active={theme === option} onPress={() => setTheme(option)} />
                ))}
              </View>
            </View>

            <View style={styles.divider} />

            <SettingItem icon="globe" title="Language" description="English (US)" type="link" />
          </View>
        </SurfaceCard>

        <SurfaceCard style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Feather name="bell" size={18} color={palette.primary} />
            <Text style={styles.cardTitle}>Notifications</Text>
          </View>
          <View style={styles.dividedGroup}>
            <SettingItem
              icon="bell"
              title="Push Notifications"
              description="Receive notifications on your device"
              value={settings.notifications.pushNotifications}
              onChange={() => toggleSetting('notifications', 'pushNotifications')}
            />
            <SettingItem
              icon="mail"
              title="Email Notifications"
              description="Get updates via email"
              value={settings.notifications.emailNotifications}
              onChange={() => toggleSetting('notifications', 'emailNotifications')}
            />
            <SettingItem
              icon="bell"
              title="Tournament Updates"
              description="Schedule changes and announcements"
              value={settings.notifications.tournamentUpdates}
              onChange={() => toggleSetting('notifications', 'tournamentUpdates')}
            />
            <SettingItem
              icon="clock"
              title="Match Reminders"
              description="Remind me before scheduled matches"
              value={settings.notifications.matchReminders}
              onChange={() => toggleSetting('notifications', 'matchReminders')}
            />
            <SettingItem
              icon="message-circle"
              title="Chat Messages"
              description="New messages from chats"
              value={settings.notifications.chatMessages}
              onChange={() => toggleSetting('notifications', 'chatMessages')}
            />
            <SettingItem
              icon="users"
              title="Club Announcements"
              description="Updates from your clubs"
              value={settings.notifications.clubAnnouncements}
              onChange={() => toggleSetting('notifications', 'clubAnnouncements')}
            />
          </View>
        </SurfaceCard>

        <SurfaceCard style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Feather name="shield" size={18} color={palette.primary} />
            <Text style={styles.cardTitle}>Privacy & Security</Text>
          </View>
          <View style={styles.dividedGroup}>
            <SettingItem
              icon="eye"
              title="Public Profile"
              description="Allow others to view your profile"
              value={settings.privacy.publicProfile}
              onChange={() => toggleSetting('privacy', 'publicProfile')}
            />
            <SettingItem
              icon="bar-chart-2"
              title="Show Stats"
              description="Display your stats publicly"
              value={settings.privacy.showStats}
              onChange={() => toggleSetting('privacy', 'showStats')}
            />
            <SettingItem
              icon="map-pin"
              title="Show Location"
              description="Display your location on profile"
              value={settings.privacy.showLocation}
              onChange={() => toggleSetting('privacy', 'showLocation')}
            />
            <SettingItem
              icon="mail"
              title="Allow Messages"
              description="Let other users message you"
              value={settings.privacy.allowMessages}
              onChange={() => toggleSetting('privacy', 'allowMessages')}
            />
            <SettingItem
              icon="activity"
              title="Show Activity"
              description="Let others see your recent activity"
              value={settings.privacy.showActivity}
              onChange={() => toggleSetting('privacy', 'showActivity')}
            />
            <SettingItem icon="user-x" title="Blocked Users" type="link" />
          </View>
        </SurfaceCard>

        <SurfaceCard style={styles.card}>
          <Text style={styles.cardTitle}>About & Support</Text>
          <View style={styles.dividedGroup}>
            <SettingItem icon="help-circle" title="Help Center" type="link" onPress={() => void openExternal()} />
            <SettingItem icon="external-link" title="Terms of Service" type="link" onPress={() => void openExternal()} />
            <SettingItem icon="external-link" title="Privacy Policy" type="link" onPress={() => void openExternal()} />
            <SettingItem
              icon="mail"
              title="Contact Support"
              type="link"
              onPress={() => void Linking.openURL('mailto:info@piqle.io')}
            />
          </View>
          <Text style={styles.versionText}>Piqle v1.0.0</Text>
        </SurfaceCard>

        <SurfaceCard style={styles.card}>
          <Text style={styles.cardTitle}>Data & Storage</Text>
          <View style={styles.dividedGroup}>
            <SettingItem
              icon="download"
              title="Download My Data"
              description="Get a copy of your account data"
              type="link"
              onPress={() => void Linking.openURL('mailto:info@piqle.io?subject=Download%20My%20Data')}
            />
            <SettingItem
              icon="trash-2"
              title="Clear Cache"
              description="Refresh locally cached app data"
              type="link"
              onPress={() => void clearCache()}
            />
          </View>
        </SurfaceCard>

        <SurfaceCard style={styles.card}>
          <Text style={styles.cardTitle}>Account Actions</Text>
          <View style={styles.actionButtons}>
            <ActionRowButton
              icon="log-out"
              label="Log Out"
              onPress={async () => {
                await signOut()
                router.replace('/(tabs)')
              }}
            />
            <ActionRowButton
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
    backgroundColor: palette.background,
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
    color: palette.text,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    gap: spacing.md,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
  },
  dividedGroup: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  settingRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
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
    backgroundColor: palette.brandPrimaryTint,
  },
  settingTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '600',
  },
  settingDescription: {
    marginTop: 4,
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  appearanceBlock: {
    gap: spacing.md,
  },
  fieldLabel: {
    marginBottom: 10,
    color: palette.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  themeRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceElevated,
  },
  themeOption: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeOptionActive: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  themeOptionText: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  themeOptionTextActive: {
    color: palette.text,
  },
  divider: {
    height: 1,
    backgroundColor: palette.border,
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
    borderTopColor: palette.border,
    color: palette.textMuted,
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
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  actionRowButtonDestructive: {
    backgroundColor: palette.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(255, 0, 110, 0.16)',
  },
  actionRowButtonPressed: {
    opacity: 0.88,
  },
  actionRowButtonText: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '600',
  },
  actionRowButtonTextDestructive: {
    color: palette.danger,
  },
})
