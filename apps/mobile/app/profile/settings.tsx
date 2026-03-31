import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native'

import { AppBottomSheet } from '../../src/components/AppBottomSheet'
import { PageLayout } from '../../src/components/navigation/PageLayout'
import { AuthRequiredCard } from '../../src/components/AuthRequiredCard'
import { ActionButton, InputField, SurfaceCard } from '../../src/components/ui'
import { buildWebUrl } from '../../src/lib/config'
import { getPalette, spacing, type ThemePalette } from '../../src/lib/theme'
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
  showBottomDivider = true,
}: {
  icon: keyof typeof Feather.glyphMap
  title: string
  description?: string
  value?: boolean
  onChange?: () => void
  type?: 'switch' | 'link'
  onPress?: () => void
  colors: ThemePalette
  /** Ложь у последней строки в блоке — без линии у нижнего края карточки. */
  showBottomDivider?: boolean
}) => (
  <Pressable
    onPress={type === 'link' ? onPress : onChange}
    style={({ pressed }) => [
      styles.settingRow,
      {
        borderBottomColor: colors.border,
        borderBottomWidth: showBottomDivider ? 1 : 0,
      },
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

export default function ProfileSettingsScreen() {
  const { token, user, signOut, requestPasswordReset } = useAuth()
  const { theme, themeMode, setThemeMode } = useAppTheme()
  const isAuthenticated = Boolean(token)
  const api = trpc as any
  const profileQuery = api.user.getProfile.useQuery(undefined, { enabled: isAuthenticated })
  const [notificationApiMissing, setNotificationApiMissing] = useState(false)
  const notificationSettingsQuery = api.user.getNotificationSettings.useQuery(undefined, {
    enabled: isAuthenticated && !notificationApiMissing,
    retry: false,
    onError: (err: any) => {
      const message = String(err?.message ?? '')
      if (message.includes('No "query"-procedure on path "user.getNotificationSettings"')) {
        setNotificationApiMissing(true)
      }
    },
  })
  const updateNotificationSettings = api.user.updateNotificationSettings.useMutation({
    onError: () => {
      setNotice('Failed to save notification settings.')
      void notificationSettingsQuery.refetch()
    },
  })
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
  const [passwordSheetOpen, setPasswordSheetOpen] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
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

  useEffect(() => {
    if (!notificationSettingsQuery.data) return
    setSettings((current) => ({
      ...current,
      notifications: {
        tournamentUpdates: Boolean(notificationSettingsQuery.data.tournamentUpdates),
        matchReminders: Boolean(notificationSettingsQuery.data.matchReminders),
        chatMessages: Boolean(notificationSettingsQuery.data.chatMessages),
        clubAnnouncements: Boolean(notificationSettingsQuery.data.clubAnnouncements),
        emailNotifications: Boolean(notificationSettingsQuery.data.emailNotifications),
        pushNotifications: Boolean(notificationSettingsQuery.data.pushNotifications),
      },
    }))
  }, [notificationSettingsQuery.data])

  const toggleSetting = <T extends keyof ToggleGroups>(group: T, key: keyof ToggleGroups[T]) => {
    setSettings((current) => ({
      ...current,
      [group]: {
        ...current[group],
        [key]: !current[group][key],
      },
    }))
  }

  const toggleNotificationSetting = (key: keyof ToggleGroups['notifications']) => {
    const nextValue = !settings.notifications[key]
    setSettings((current) => ({
      ...current,
      notifications: {
        ...current.notifications,
        [key]: nextValue,
      },
    }))
    if (notificationApiMissing) return
    void updateNotificationSettings
      .mutateAsync({ [key]: nextValue })
      .catch((err: any) => {
        const message = String(err?.message ?? '')
        if (message.includes('No "mutation"-procedure on path "user.updateNotificationSettings"')) {
          setNotificationApiMissing(true)
          setNotice('Backend update required for notification sync. Local toggles remain active.')
          return
        }
        setNotice('Failed to save notification settings.')
      })
  }

  const openExternal = async (path?: string) => {
    try {
      await Linking.openURL(path ?? buildWebUrl('/'))
    } catch {}
  }

  const requestDeleteAccount = async () => {
    try {
      await Linking.openURL('mailto:info@piqle.io?subject=Delete%20Account%20Request')
    } catch {}
  }

  if (!isAuthenticated) {
    return (
      <PageLayout topBarTitle="Settings" topBarRightSlot={null} contentStyle={styles.bodyPad}>
        <AuthRequiredCard title="Sign in required" body="Sign in to manage your account settings." />
      </PageLayout>
    )
  }

  if (profileQuery.isLoading && !user) {
    return (
      <PageLayout topBarTitle="Settings" topBarRightSlot={null} contentStyle={styles.bodyPad}>
        <SurfaceCard style={themedPlaceholderCardStyle}>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loadingLabel, { color: colors.textMuted }]}>Loading settings…</Text>
          </View>
        </SurfaceCard>
      </PageLayout>
    )
  }

  const profile =
    (profileQuery.data as any) ??
    (user
      ? {
          email: user.email,
          name: user.name,
          image: user.image,
        }
      : null)

  const openPasswordSheet = () => {
    setResetEmail(String(profile?.email ?? ''))
    setNotice(null)
    setPasswordSheetOpen(true)
  }

  const sendPasswordResetRequest = async () => {
    const email = resetEmail.trim()
    if (!email) {
      setNotice('Please enter your email first.')
      return
    }
    try {
      setResetLoading(true)
      await requestPasswordReset(email)
      setNotice('Password reset request sent. Check your email for the code.')
      setPasswordSheetOpen(false)
    } catch (err: any) {
      setNotice(err?.message || 'Failed to send password reset request.')
    } finally {
      setResetLoading(false)
    }
  }

  if (!profile) {
    return (
      <PageLayout topBarTitle="Settings" topBarRightSlot={null} contentStyle={styles.bodyPad}>
        <SurfaceCard style={themedPlaceholderCardStyle}>
          <Text style={[styles.placeholderTitle, { color: colors.text }]}>Settings unavailable</Text>
          <Text style={[styles.placeholderBody, { color: colors.textMuted }]}>
            We could not load your account settings right now.
          </Text>
        </SurfaceCard>
      </PageLayout>
    )
  }

  return (
    <PageLayout topBarTitle="Settings" topBarRightSlot={null} contentStyle={styles.content}>
        {notice ? (
          <SurfaceCard tone="hero" style={themedNoticeCardStyle}>
            <Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text>
          </SurfaceCard>
        ) : null}

        <SurfaceCard style={[styles.card, themedCardStyle]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Account</Text>
          <View>
            <SettingItem colors={colors} icon="mail" title="Email" description={profile.email} type="link" />
            <SettingItem
              colors={colors}
              icon="mail"
              title="Change Email"
              description="Request email change via support"
              type="link"
              onPress={() => void Linking.openURL('mailto:info@piqle.io?subject=Change%20Email%20Request')}
            />
            <SettingItem
              colors={colors}
              icon="lock"
              title="Change Password"
              description="Open password reset flow"
              type="link"
              showBottomDivider={false}
              onPress={openPasswordSheet}
            />
          </View>
        </SurfaceCard>

        <SurfaceCard style={[styles.card, themedCardStyle]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Theme</Text>
          <Text style={[styles.cardDescription, { color: colors.textMuted }]}>
            Choose how the app looks on your device.
          </Text>
          <View style={styles.themeIconRow}>
            {([
              { mode: 'light', label: 'Light', icon: 'sun' },
              { mode: 'dark', label: 'Dark', icon: 'moon' },
              { mode: 'system', label: 'System', icon: 'monitor' },
            ] as const).map((item) => {
              const active = themeMode === item.mode
              return (
                <Pressable
                  key={item.mode}
                  onPress={() => setThemeMode(item.mode)}
                  style={({ pressed }) => [
                    styles.themeIconButton,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.brandPrimaryTint : colors.surface,
                    },
                    pressed && styles.settingRowPressed,
                  ]}
                >
                  <Feather
                    name={item.icon}
                    size={18}
                    color={active ? colors.primary : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.themeIconLabel,
                      { color: active ? colors.primary : colors.textMuted },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </SurfaceCard>

        <SurfaceCard style={[styles.card, themedCardStyle]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Notifications</Text>
          <View>
            <SettingItem
              colors={colors}
              icon="bell"
              title="Push Notifications"
              description="Receive notifications on your device"
              value={settings.notifications.pushNotifications}
              onChange={() => toggleNotificationSetting('pushNotifications')}
            />
            <SettingItem
              colors={colors}
              icon="mail"
              title="Email Notifications"
              description="Get updates via email"
              value={settings.notifications.emailNotifications}
              onChange={() => toggleNotificationSetting('emailNotifications')}
            />
            <SettingItem
              colors={colors}
              icon="bell"
              title="Tournament Updates"
              description="Schedule changes and announcements"
              value={settings.notifications.tournamentUpdates}
              onChange={() => toggleNotificationSetting('tournamentUpdates')}
            />
            <SettingItem
              colors={colors}
              icon="clock"
              title="Match Reminders"
              description="Remind me before scheduled matches"
              value={settings.notifications.matchReminders}
              onChange={() => toggleNotificationSetting('matchReminders')}
            />
            <SettingItem
              colors={colors}
              icon="message-circle"
              title="Chat Messages"
              description="New messages from chats"
              value={settings.notifications.chatMessages}
              onChange={() => toggleNotificationSetting('chatMessages')}
            />
            <SettingItem
              colors={colors}
              icon="users"
              title="Club Announcements"
              description="Updates from your clubs"
              value={settings.notifications.clubAnnouncements}
              onChange={() => toggleNotificationSetting('clubAnnouncements')}
              showBottomDivider={false}
            />
          </View>
        </SurfaceCard>

        <SurfaceCard style={[styles.card, themedCardStyle]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>About & Support</Text>
          <View>
            <SettingItem colors={colors} icon="external-link" title="Terms of Service" type="link" onPress={() => void openExternal()} />
            <SettingItem colors={colors} icon="external-link" title="Privacy Policy" type="link" onPress={() => void openExternal()} />
            <SettingItem
              colors={colors}
              icon="mail"
              title="Contact Support"
              type="link"
              onPress={() => void Linking.openURL('mailto:info@piqle.io')}
              showBottomDivider={false}
            />
          </View>
        </SurfaceCard>

        <SurfaceCard style={[styles.card, themedCardStyle]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Account Actions</Text>
          <View style={styles.actionButtons}>
            <ActionButton
              label="Log Out"
              variant="secondary"
              onPress={async () => {
                await signOut()
                router.replace('/(tabs)')
              }}
              icon={<Feather name="log-out" size={18} color={colors.text} />}
            />
            <ActionButton
              label="Delete Account"
              variant="neutral"
              onPress={() => void requestDeleteAccount()}
              icon={<Feather name="trash-2" size={18} color={colors.textMuted} />}
            />
          </View>
        </SurfaceCard>

        <Text style={[styles.versionText, { color: colors.textMuted }]}>Piqle v1.0.0</Text>

        <AppBottomSheet
          open={passwordSheetOpen}
          onClose={() => setPasswordSheetOpen(false)}
          title="Password reset"
          subtitle="Enter your email and we will send a password reset request."
          footer={
            <ActionButton
              label="Send request"
              onPress={() => void sendPasswordResetRequest()}
              loading={resetLoading}
            />
          }
        >
          <View style={styles.sheetContent}>
            <Text style={[styles.sheetLabel, { color: colors.textMuted }]}>Email</Text>
            <InputField
              value={resetEmail}
              onChangeText={setResetEmail}
              placeholder="your@email.com"
              autoCapitalize="none"
              keyboardType="email-address"
              left={<Feather name="mail" size={18} color={colors.textMuted} />}
            />
            <Text style={[styles.sheetHint, { color: colors.textMuted }]}>
              We will send a verification code to this email so you can set a new password.
            </Text>
          </View>
        </AppBottomSheet>
    </PageLayout>
  )
}

const styles = StyleSheet.create({
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
  settingRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
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
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingLabel: {
    fontSize: 15,
  },
  versionText: {
    marginTop: spacing.xs,
    fontSize: 13,
    textAlign: 'center',
  },
  actionButtons: {
    gap: spacing.sm,
    alignSelf: 'stretch',
  },
  sheetContent: {
    gap: spacing.sm,
  },
  sheetLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sheetHint: {
    fontSize: 13,
    lineHeight: 18,
  },
  themeModeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cardDescription: {
    marginTop: -6,
    fontSize: 13,
    lineHeight: 18,
  },
  themeIconRow: {
    flexDirection: 'row',
    gap: 8,
  },
  themeIconButton: {
    flex: 1,
    minHeight: 74,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  themeIconLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  themeModeChip: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeModeChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
})
