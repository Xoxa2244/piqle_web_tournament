import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

import { OptionalLinearGradient } from '../../src/components/OptionalLinearGradient'
import { AppBottomSheet, AppConfirmActions } from '../../src/components/AppBottomSheet'
import { AuthRequiredCard } from '../../src/components/AuthRequiredCard'
import { PageLayout } from '../../src/components/navigation/PageLayout'
import { RemoteUserAvatar } from '../../src/components/RemoteUserAvatar'
import { ActionButton, EmptyState, InputField, LoadingBlock, SurfaceCard } from '../../src/components/ui'
import { authApi } from '../../src/lib/authApi'
import { radius, spacing, type ThemePalette } from '../../src/lib/theme'
import { trpc } from '../../src/lib/trpc'
import { useAuth } from '../../src/providers/AuthProvider'
import { useAppTheme } from '../../src/providers/ThemeProvider'
import { useToast } from '../../src/providers/ToastProvider'

const formatRating = (value?: string | number | null) => {
  if (value === null || value === undefined || value === '') return '—'
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '—'
}

const isInvalidImageUrlValidationError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return message.includes('"path":["image"]') && message.includes('"validation":"url"')
}

const HeaderSaveButton = ({
  onPress,
  loading,
  colors,
  styles,
}: {
  onPress?: () => void
  loading?: boolean
  colors: ThemePalette
  styles: ReturnType<typeof createStyles>
}) => (
  <Pressable onPress={onPress} disabled={loading} style={({ pressed }) => [pressed && styles.headerSavePressed]}>
    <OptionalLinearGradient
      colors={[colors.primary, colors.purple]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.headerSaveButton}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <View style={styles.headerSaveContent}>
          <Feather name="save" size={14} color={colors.white} />
          <Text style={styles.headerSaveText}>Save</Text>
        </View>
      )}
    </OptionalLinearGradient>
  </Pressable>
)

export default function ProfileEditScreen() {
  const params = useLocalSearchParams<{ anchor?: string | string[] }>()
  const { token, user } = useAuth()
  const toast = useToast()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const isAuthenticated = Boolean(token)
  const api = trpc as any
  const utils = trpc.useUtils() as any
  const profileQuery = api.user.getProfile.useQuery(undefined, { enabled: isAuthenticated })
  const updateProfile = api.user.updateProfile.useMutation({
    onSuccess: async () => {
      await utils.user.getProfile.invalidate()
      toast.success('Profile saved.')
      router.back()
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || 'Could not save profile.')
    },
  })

  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [gender, setGender] = useState<'M' | 'F' | 'X' | ''>('')
  const [duprLink, setDuprLink] = useState('')
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [removeAvatarOpen, setRemoveAvatarOpen] = useState(false)
  const scrollRef = useRef<ScrollView | null>(null)
  const contactCardY = useRef<number | null>(null)
  const cityFieldOffsetY = useRef<number | null>(null)
  const didScrollToAnchor = useRef(false)

  useEffect(() => {
    if (!profileQuery.data) return
    setName(profileQuery.data.name || '')
    setCity(profileQuery.data.city || '')
    setGender((profileQuery.data.gender as 'M' | 'F' | 'X' | null) || '')
    setDuprLink(profileQuery.data.duprLink || '')
    setAvatarUri(profileQuery.data.image || null)
  }, [profileQuery.data])

  const anchorTarget = Array.isArray(params.anchor) ? params.anchor[0] : params.anchor

  const tryScrollToCityAnchor = () => {
    if (
      anchorTarget !== 'city' ||
      didScrollToAnchor.current ||
      contactCardY.current == null ||
      cityFieldOffsetY.current == null
    ) {
      return
    }
    didScrollToAnchor.current = true
    requestAnimationFrame(() => {
      const targetY = Math.max(contactCardY.current! + cityFieldOffsetY.current! - 20, 0)
      scrollRef.current?.scrollTo({ y: targetY, animated: true })
    })
  }

  useEffect(() => {
    tryScrollToCityAnchor()
  }, [anchorTarget])

  const profile =
    (profileQuery.data as any) ??
    (user
      ? {
          email: user.email,
          name: user.name,
          image: user.image,
          city: '',
          gender: null,
          duprLink: '',
          duprRatingSingles: null,
          duprRatingDoubles: null,
        }
      : null)
  const handleSave = () => {
    updateProfile.mutate({
      name: name.trim() || undefined,
      city: city.trim() || undefined,
      gender: gender || undefined,
      duprLink: duprLink.trim(),
    })
  }

  const editTopBarRight =
    profileQuery.isLoading && !user ? (
      <HeaderSaveButton loading colors={colors} styles={styles} />
    ) : profile ? (
      <HeaderSaveButton onPress={handleSave} loading={updateProfile.isPending} colors={colors} styles={styles} />
    ) : undefined

  const handleAvatarPick = async () => {
    if (!token || avatarUploading) return
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      toast.error('Please allow photo access to update your avatar.')
      return
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.9,
      aspect: [1, 1],
    })
    if (picked.canceled || !picked.assets?.length) return
    const asset = picked.assets[0]
    if (!asset.uri) return

    try {
      setAvatarUploading(true)
      setAvatarUri(asset.uri)
      const upload = await authApi.uploadAvatar(token, {
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
      })
      await updateProfile.mutateAsync({ image: upload.url })
      setAvatarUri(upload.url)
      await utils.user.getProfile.invalidate()
      toast.success('Avatar updated.')
    } catch (err: any) {
      setAvatarUri(profile?.image || null)
      toast.error(err?.message || 'Could not update avatar.')
    } finally {
      setAvatarUploading(false)
    }
  }

  const hasUploadedAvatar = Boolean((avatarUri || profile?.image || '').trim())

  const handleAvatarDelete = async () => {
    if (avatarUploading) return
    try {
      setAvatarUploading(true)
      await updateProfile.mutateAsync({ image: '' })
      setAvatarUri(null)
      await utils.user.getProfile.invalidate()
      setRemoveAvatarOpen(false)
      toast.success('Avatar removed.')
    } catch (err: any) {
      if (isInvalidImageUrlValidationError(err)) {
        toast.error('Avatar removal requires backend update. Please use the latest API deployment.')
      } else {
        toast.error(err?.message || 'Could not remove avatar.')
      }
    } finally {
      setAvatarUploading(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <PageLayout scroll={false} topBarTitle="Edit Profile" contentStyle={styles.pageRoot}>
        <View style={styles.bodyPad}>
          <AuthRequiredCard title="Sign in required" body="Sign in to edit your profile details." />
        </View>
      </PageLayout>
    )
  }

  if (profileQuery.isLoading && !user) {
    return (
      <PageLayout scroll={false} topBarTitle="Edit Profile" topBarRightSlot={editTopBarRight} contentStyle={styles.pageRoot}>
        <View style={styles.bodyPad}>
          <LoadingBlock label="Loading profile…" />
        </View>
      </PageLayout>
    )
  }

  if (!profile) {
    return (
      <PageLayout scroll={false} topBarTitle="Edit Profile" contentStyle={styles.pageRoot}>
        <View style={styles.bodyPad}>
          <EmptyState title="Profile unavailable" body="We could not load your profile editor right now." />
        </View>
      </PageLayout>
    )
  }

  return (
    <PageLayout
      scroll={false}
      topBarTitle="Edit Profile"
      topBarRightSlot={editTopBarRight}
      contentStyle={styles.pageRoot}
    >
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.scrollFill}>
        <Pressable
          onPress={() => void handleAvatarPick()}
          disabled={avatarUploading}
          style={({ pressed }) => [styles.photoCardPressable, pressed && !avatarUploading && styles.photoCardPressablePressed]}
        >
          <SurfaceCard style={styles.card}>
            <Text style={styles.cardTitle}>Profile Photo</Text>
            <View style={styles.photoRow}>
              <View style={styles.photoAvatar}>
                <RemoteUserAvatar
                  uri={avatarUri}
                  size={96}
                  fallback="initials"
                  initialsLabel={profile.name || profile.email || 'Player'}
                />

                <View style={styles.photoCameraButton}>
                  {avatarUploading ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Pressable
                      hitSlop={8}
                      onPress={(e: any) => {
                        e?.stopPropagation?.()
                        if (hasUploadedAvatar) {
                          setRemoveAvatarOpen(true)
                        } else {
                          void handleAvatarPick()
                        }
                      }}
                    >
                      <Feather name={hasUploadedAvatar ? 'trash-2' : 'camera'} size={16} color={colors.white} />
                    </Pressable>
                  )}
                </View>
              </View>

              <View style={styles.photoTextBlock}>
                <Text style={styles.photoHelper}>Upload a new profile photo</Text>
                <Text style={styles.photoSubhelper}>Tap anywhere on this card to choose an image.</Text>
              </View>
            </View>
          </SurfaceCard>
        </Pressable>

        <View
          onLayout={(event) => {
            contactCardY.current = event.nativeEvent.layout.y
            tryScrollToCityAnchor()
          }}
        >
          <SurfaceCard style={styles.card}>
            <Text style={styles.cardTitle}>Profile</Text>
            <View style={styles.fieldStack}>
              <View>
                <Text style={styles.fieldLabel}>Name</Text>
                <InputField value={name} onChangeText={setName} placeholder="Your name" />
              </View>

              <View>
                <Text style={styles.fieldLabel}>Gender</Text>
                <View style={styles.genderRow}>
                  {(['', 'M', 'F', 'X'] as const).map((value) => (
                    <ActionButton
                      key={value || 'unset'}
                      label={value || 'Unset'}
                      variant={gender === value ? 'primary' : 'secondary'}
                      onPress={() => setGender(value)}
                    />
                  ))}
                </View>
              </View>

              <View
                onLayout={(event) => {
                  cityFieldOffsetY.current = event.nativeEvent.layout.y
                  tryScrollToCityAnchor()
                }}
              >
                <Text style={styles.fieldLabel}>City</Text>
                <InputField value={city} onChangeText={setCity} placeholder="Enter your city" />
              </View>
            </View>
          </SurfaceCard>
        </View>

        <SurfaceCard style={styles.card}>
          <Text style={styles.cardTitle}>DUPR</Text>
          <View style={styles.fieldStack}>
            <View>
              <Text style={styles.fieldLabel}>DUPR rating</Text>
              <InputField
                value={formatRating(profile.duprRatingSingles || profile.duprRatingDoubles)}
                onChangeText={() => {}}
                editable={false}
              />
              <Text style={styles.helperText}>Synced from your linked DUPR account</Text>
            </View>

            <View>
              <Text style={styles.fieldLabel}>DUPR link</Text>
              <InputField
                value={duprLink}
                onChangeText={setDuprLink}
                placeholder="https://..."
                autoCapitalize="none"
                keyboardType="url"
                editable={false}
              />
              <Text style={styles.helperText}>Connect or manage DUPR from your profile on the web or in the app.</Text>
            </View>
          </View>
        </SurfaceCard>
      </ScrollView>

      <AppBottomSheet
        open={removeAvatarOpen}
        onClose={() => setRemoveAvatarOpen(false)}
        title="Remove profile photo?"
        subtitle="Your avatar will be cleared and replaced with initials."
        footer={
          <AppConfirmActions
            intent="destructive"
            cancelLabel="Cancel"
            confirmLabel="Remove"
            confirmLoading={avatarUploading}
            onCancel={() => setRemoveAvatarOpen(false)}
            onConfirm={() => void handleAvatarDelete()}
          />
        }
      />
    </PageLayout>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
  pageRoot: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 0,
  },
  scrollFill: {
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
  headerSaveButton: {
    minHeight: 36,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSavePressed: {
    opacity: 0.88,
  },
  headerSaveContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerSaveText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  card: {
    gap: spacing.md,
  },
  photoCardPressable: {
    borderRadius: radius.lg,
  },
  photoCardPressablePressed: {
    opacity: 0.94,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  photoAvatar: {
    position: 'relative',
    width: 96,
    height: 96,
  },
  photoCameraButton: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 4,
    borderColor: colors.surface,
  },
  photoCameraButtonPressed: {
    opacity: 0.88,
  },
  photoTextBlock: {
    flex: 1,
    gap: 6,
  },
  photoHelper: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  photoSubhelper: {
    color: colors.textMuted,
    fontSize: 12,
  },
  fieldStack: {
    gap: 14,
  },
  fieldLabel: {
    marginBottom: 8,
    color: colors.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  genderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  helperText: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 12,
  },
  })
