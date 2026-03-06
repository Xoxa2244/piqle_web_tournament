import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { router } from 'expo-router'

import { PageLayout } from '../../src/components/navigation/PageLayout'
import {
  ActionButton,
  AvatarBadge,
  EmptyState,
  InputField,
  LoadingBlock,
  MetricTile,
  Pill,
  Screen,
  SectionTitle,
  SurfaceCard,
} from '../../src/components/ui'
import { palette, spacing } from '../../src/lib/theme'
import { trpc } from '../../src/lib/trpc'
import { useAuth } from '../../src/providers/AuthProvider'

export default function ProfileTab() {
  const { token, signOut } = useAuth()
  const isAuthenticated = Boolean(token)
  const api = trpc as any
  const profileQuery = api.user.getProfile.useQuery(undefined, { enabled: isAuthenticated })
  const updateProfile = api.user.updateProfile.useMutation({
    onSuccess: async () => {
      await profileQuery.refetch()
      setEditing(false)
    },
  })

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [gender, setGender] = useState<'M' | 'F' | 'X' | ''>('')
  const [duprLink, setDuprLink] = useState('')

  useEffect(() => {
    if (!profileQuery.data || editing) return
    setName(profileQuery.data.name || '')
    setCity(profileQuery.data.city || '')
    setGender((profileQuery.data.gender as 'M' | 'F' | 'X' | null) || '')
    setDuprLink(profileQuery.data.duprLink || '')
  }, [profileQuery.data, editing])

  if (!isAuthenticated) {
    return (
      <PageLayout>
        <SurfaceCard tone="hero">
          <Text style={{ color: palette.text, fontWeight: '700', fontSize: 18 }}>You are browsing as a guest</Text>
          <Text style={{ marginTop: 8, color: palette.textMuted, lineHeight: 20 }}>
            The mobile app keeps tournaments and clubs public, but profile editing and chats require authentication.
          </Text>
        </SurfaceCard>
        <ActionButton label="Sign in" onPress={() => router.push('/sign-in')} />
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      {profileQuery.isLoading ? <LoadingBlock label="Loading profile…" /> : null}

      {profileQuery.data ? (
        <>
          <SurfaceCard tone="hero">
            <View style={styles.profileHeader}>
              <AvatarBadge label={profileQuery.data.name || profileQuery.data.email} size={86} />
              <View style={{ flex: 1 }}>
                <Text style={styles.heroName}>{profileQuery.data.name || profileQuery.data.email}</Text>
                <Text style={styles.heroEmail}>{profileQuery.data.email}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md }}>
                  <Pill label={`${profileQuery.data.clubsJoinedCount} clubs`} tone="success" />
                  <Pill label={`${profileQuery.data.tournamentsPlayedCount} played`} />
                  {profileQuery.data.duprLinked ? <Pill label="DUPR linked" tone="primary" /> : null}
                </View>
              </View>
            </View>
          </SurfaceCard>

          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <MetricTile label="Played" value={`${profileQuery.data.tournamentsPlayedCount}`} subtitle="Tracked from web" />
            <MetricTile label="Created" value={`${profileQuery.data.tournamentsCreatedCount}`} subtitle="Organizer activity" />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <MetricTile label="Singles" value={`${profileQuery.data.duprRatingSingles ?? '—'}`} subtitle="DUPR" />
            <MetricTile label="Doubles" value={`${profileQuery.data.duprRatingDoubles ?? '—'}`} subtitle="DUPR" />
          </View>

          <SurfaceCard>
            <SectionTitle
              title="Player details"
              subtitle="The same user record and DUPR-linked data that powers the web experience."
              action={
                editing ? undefined : <ActionButton label="Edit" variant="secondary" onPress={() => setEditing(true)} />
              }
            />
            <View style={{ gap: 12, marginTop: spacing.md }}>
              <Text style={styles.label}>Name</Text>
              <InputField value={name} onChangeText={setName} placeholder="Your name" editable={editing} />

              <Text style={styles.label}>City</Text>
              <InputField value={city} onChangeText={setCity} placeholder="Your city" editable={editing} />

              <Text style={styles.label}>Gender</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {(['', 'M', 'F', 'X'] as const).map((value) => (
                  <ActionButton
                    key={value || 'unset'}
                    label={value || 'Unset'}
                    variant={gender === value ? 'primary' : 'secondary'}
                    disabled={!editing}
                    onPress={() => setGender(value)}
                  />
                ))}
              </View>

              <Text style={styles.label}>DUPR link</Text>
              <InputField value={duprLink} onChangeText={setDuprLink} placeholder="https://..." editable={editing} />
            </View>

            {editing ? (
              <View style={{ marginTop: spacing.md, gap: 10 }}>
                <ActionButton
                  label="Save changes"
                  loading={updateProfile.isPending}
                  onPress={() =>
                    updateProfile.mutate({
                      name: name || undefined,
                      city: city || undefined,
                      gender: gender || undefined,
                      duprLink: duprLink || undefined,
                    })
                  }
                />
                <ActionButton
                  label="Cancel"
                  variant="secondary"
                  onPress={() => {
                    setEditing(false)
                    if (profileQuery.data) {
                      setName(profileQuery.data.name || '')
                      setCity(profileQuery.data.city || '')
                      setGender((profileQuery.data.gender as 'M' | 'F' | 'X' | null) || '')
                      setDuprLink(profileQuery.data.duprLink || '')
                    }
                  }}
                />
              </View>
            ) : null}
          </SurfaceCard>

          <SurfaceCard tone="soft">
            <Text style={styles.metricTitle}>Profile notes</Text>
            <Text style={styles.metric}>
              Clubs joined: {profileQuery.data.clubsJoinedCount} · DUPR linked: {profileQuery.data.duprLinked ? 'Yes' : 'No'}
            </Text>
            <Text style={styles.metric}>
              Mobile keeps profile, clubs, and tournament history in sync with the main web experience.
            </Text>
          </SurfaceCard>

          <ActionButton
            label="Sign out"
            variant="danger"
            onPress={async () => {
              await signOut()
              router.replace('/(tabs)')
            }}
          />
        </>
      ) : (
        <EmptyState title="Profile unavailable" body="We could not load your player profile right now." />
      )}
    </PageLayout>
  )
}

const styles = {
  profileHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
  },
  heroName: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '700' as const,
  },
  heroEmail: {
    marginTop: 4,
    color: palette.textMuted,
    fontSize: 14,
  },
  label: {
    color: palette.textMuted,
    fontSize: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.6,
  },
  metricTitle: {
    color: palette.text,
    fontWeight: '700' as const,
    fontSize: 16,
  },
  metric: {
    marginTop: 10,
    color: palette.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
}



