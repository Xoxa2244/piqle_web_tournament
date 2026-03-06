import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { router } from 'expo-router'

import { ActionButton, EmptyState, InputField, LoadingBlock, Pill, Screen, SectionTitle, SurfaceCard } from '../../src/components/ui'
import { palette, spacing } from '../../src/lib/theme'
import { trpc } from '../../src/lib/trpc'
import { useAuth } from '../../src/providers/AuthProvider'

export default function ProfileTab() {
  const { token, signOut } = useAuth()
  const isAuthenticated = Boolean(token)
  const profileQuery = trpc.user.getProfile.useQuery(undefined, { enabled: isAuthenticated })
  const updateProfile = trpc.user.updateProfile.useMutation({
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
      <Screen title="Profile" subtitle="Sign in to edit your player profile and view your stats.">
        <EmptyState title="You are browsing as a guest" body="The mobile app keeps tournaments and clubs public, but profile editing and chats require authentication." />
        <ActionButton label="Sign in" onPress={() => router.push('/sign-in')} />
      </Screen>
    )
  }

  return (
    <Screen title="Profile" subtitle="The same user record and DUPR-linked data that powers the web experience.">
      {profileQuery.isLoading ? <LoadingBlock label="Loading profile…" /> : null}

      {profileQuery.data ? (
        <>
          <SurfaceCard>
            <SectionTitle title={profileQuery.data.name || profileQuery.data.email} subtitle={profileQuery.data.email} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md }}>
              <Pill label={`${profileQuery.data.clubsJoinedCount} clubs`} tone="success" />
              <Pill label={`${profileQuery.data.tournamentsPlayedCount} played`} />
              <Pill label={`${profileQuery.data.tournamentsCreatedCount} created`} />
              {profileQuery.data.duprLinked ? <Pill label="DUPR linked" tone="primary" /> : null}
            </View>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle
              title="Player details"
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
              <View style={{ flexDirection: 'row', gap: 8 }}>
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

          <SurfaceCard>
            <SectionTitle title="Ratings" subtitle="Read-only DUPR values are shared from the same backend profile." />
            <Text style={styles.metric}>Singles: {profileQuery.data.duprRatingSingles ?? '—'}</Text>
            <Text style={styles.metric}>Doubles: {profileQuery.data.duprRatingDoubles ?? '—'}</Text>
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
      ) : null}
    </Screen>
  )
}

const styles = {
  label: {
    color: palette.textMuted,
    fontSize: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.6,
  },
  metric: {
    marginTop: 10,
    color: palette.text,
    fontSize: 16,
    fontWeight: '600' as const,
  },
}



