import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { OptionalLinearGradient } from '../../src/components/OptionalLinearGradient'
import { SubpageHeader } from '../../src/components/navigation/SubpageHeader'
import { ActionButton, EmptyState, InputField, LoadingBlock, SurfaceCard } from '../../src/components/ui'
import { radius, spacing, type ThemePalette } from '../../src/lib/theme'
import { trpc } from '../../src/lib/trpc'
import { useAuth } from '../../src/providers/AuthProvider'
import { useAppTheme } from '../../src/providers/ThemeProvider'
import { useToast } from '../../src/providers/ToastProvider'

const splitName = (value?: string | null) => {
  const parts = String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  }
}

const formatRating = (value?: string | number | null) => {
  if (value === null || value === undefined || value === '') return '—'
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '—'
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
  const { theme, colors } = useAppTheme()
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

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [city, setCity] = useState('')
  const [gender, setGender] = useState<'M' | 'F' | 'X' | ''>('')
  const [duprLink, setDuprLink] = useState('')
  const scrollRef = useRef<ScrollView | null>(null)
  const contactCardY = useRef<number | null>(null)
  const cityFieldOffsetY = useRef<number | null>(null)
  const didScrollToAnchor = useRef(false)

  useEffect(() => {
    if (!profileQuery.data) return
    const nextName = splitName(profileQuery.data.name)
    setFirstName(nextName.firstName)
    setLastName(nextName.lastName)
    setCity(profileQuery.data.city || '')
    setGender((profileQuery.data.gender as 'M' | 'F' | 'X' | null) || '')
    setDuprLink(profileQuery.data.duprLink || '')
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
  const username = useMemo(() => String(profile?.email || '').split('@')[0] || '', [profile?.email])
  const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ').trim()

  const handleSave = () => {
    updateProfile.mutate({
      name: fullName || undefined,
      city: city.trim() || undefined,
      gender: gender || undefined,
      duprLink: duprLink.trim(),
    })
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.screen}>
        <SubpageHeader title="Edit Profile" />
        <View style={styles.bodyPad}>
          <EmptyState title="Sign in required" body="Sign in to edit your profile details." />
        </View>
      </View>
    )
  }

  if (profileQuery.isLoading && !user) {
    return (
      <View style={styles.screen}>
        <SubpageHeader title="Edit Profile" right={<HeaderSaveButton loading colors={colors} styles={styles} />} />
        <View style={styles.bodyPad}>
          <LoadingBlock label="Loading profile…" />
        </View>
      </View>
    )
  }

  if (!profile) {
    return (
      <View style={styles.screen}>
        <SubpageHeader title="Edit Profile" />
        <View style={styles.bodyPad}>
          <EmptyState title="Profile unavailable" body="We could not load your profile editor right now." />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <SubpageHeader
        title="Edit Profile"
        right={<HeaderSaveButton onPress={handleSave} loading={updateProfile.isPending} colors={colors} styles={styles} />}
      />

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SurfaceCard style={styles.card}>
          <Text style={styles.cardTitle}>Profile Photo</Text>
          <View style={styles.photoRow}>
            <View style={styles.photoAvatar}>
              <OptionalLinearGradient
                colors={[colors.purple, colors.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.photoAvatarGradient}
              >
                <Text style={styles.photoAvatarText}>
                  {String(profile.name || profile.email || 'P')
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase())
                    .join('') || 'P'}
                </Text>
              </OptionalLinearGradient>

              <View style={styles.photoCameraButton}>
                <Feather name="camera" size={16} color={colors.white} />
              </View>
            </View>

            <View style={styles.photoTextBlock}>
              <Text style={styles.photoHelper}>Avatar uploads will be shared with the web profile editor soon.</Text>
              <Text style={styles.photoSubhelper}>Recommended: square image, at least 400x400 px</Text>
            </View>
          </View>
        </SurfaceCard>

        <SurfaceCard style={styles.card}>
          <Text style={styles.cardTitle}>Personal Information</Text>
          <View style={styles.fieldStack}>
            <View>
              <Text style={styles.fieldLabel}>First Name</Text>
              <InputField value={firstName} onChangeText={setFirstName} placeholder="First name" />
            </View>

            <View>
              <Text style={styles.fieldLabel}>Last Name</Text>
              <InputField value={lastName} onChangeText={setLastName} placeholder="Last name" />
            </View>

            <View>
              <Text style={styles.fieldLabel}>Username</Text>
              <InputField value={username} onChangeText={() => {}} placeholder="@username" editable={false} />
            </View>

            <View>
              <Text style={styles.fieldLabel}>Bio</Text>
              <InputField
                value=""
                onChangeText={() => {}}
                placeholder="More profile fields will sync from the web profile soon."
                editable={false}
                multiline
              />
            </View>
          </View>
        </SurfaceCard>

        <View
          onLayout={(event) => {
            contactCardY.current = event.nativeEvent.layout.y
            tryScrollToCityAnchor()
          }}
        >
        <SurfaceCard style={styles.card}>
          <Text style={styles.cardTitle}>Contact Information</Text>
          <View style={styles.fieldStack}>
            <View>
              <Text style={styles.fieldLabel}>Email</Text>
              <InputField value={profile.email} onChangeText={() => {}} editable={false} keyboardType="email-address" />
            </View>

            <View>
              <Text style={styles.fieldLabel}>Phone</Text>
              <InputField value="" onChangeText={() => {}} placeholder="Add from web profile" editable={false} keyboardType="phone-pad" />
            </View>

            <View
              onLayout={(event) => {
                cityFieldOffsetY.current = event.nativeEvent.layout.y
                tryScrollToCityAnchor()
              }}
            >
              <Text style={styles.fieldLabel}>Location</Text>
              <InputField value={city} onChangeText={setCity} placeholder="City, State" />
            </View>

            <View>
              <Text style={styles.fieldLabel}>Birth Date</Text>
              <InputField value="" onChangeText={() => {}} placeholder="Managed on web" editable={false} />
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
          </View>
        </SurfaceCard>
        </View>

        <SurfaceCard style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Feather name="award" size={18} color={colors.primary} />
            <Text style={styles.cardTitle}>Pickleball Profile</Text>
          </View>

          <View style={styles.fieldStack}>
            <View>
              <Text style={styles.fieldLabel}>DUPR Rating</Text>
              <InputField
                value={formatRating(profile.duprRatingSingles || profile.duprRatingDoubles)}
                onChangeText={() => {}}
                editable={false}
              />
              <Text style={styles.helperText}>Current rating synced from your linked DUPR profile</Text>
            </View>

            <View>
              <Text style={styles.fieldLabel}>Preferred Position</Text>
              <InputField value="" onChangeText={() => {}} placeholder="Managed on web" editable={false} />
            </View>

            <View>
              <Text style={styles.fieldLabel}>DUPR Link</Text>
              <InputField
                value={duprLink}
                onChangeText={setDuprLink}
                placeholder="https://..."
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>
          </View>
        </SurfaceCard>

        <SurfaceCard style={styles.card}>
          <Text style={styles.cardTitle}>Social Links</Text>
          <View style={styles.fieldStack}>
            <View>
              <Text style={styles.fieldLabel}>Instagram</Text>
              <InputField value="" onChangeText={() => {}} placeholder="@username" editable={false} />
            </View>
            <View>
              <Text style={styles.fieldLabel}>Twitter / X</Text>
              <InputField value="" onChangeText={() => {}} placeholder="@username" editable={false} />
            </View>
            <View>
              <Text style={styles.fieldLabel}>Website</Text>
              <InputField value="" onChangeText={() => {}} placeholder="https://your-site.com" editable={false} />
            </View>
          </View>
        </SurfaceCard>
      </ScrollView>
    </View>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
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
  photoAvatarGradient: {
    flex: 1,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAvatarText: {
    color: colors.white,
    fontSize: 28,
    fontWeight: '700',
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
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  helperText: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 12,
  },
  })
