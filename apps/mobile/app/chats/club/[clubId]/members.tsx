import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { AppBottomSheet, AppConfirmActions } from '../../../../src/components/AppBottomSheet'
import { PageLayout } from '../../../../src/components/navigation/PageLayout'
import { RemoteUserAvatar } from '../../../../src/components/RemoteUserAvatar'
import { ActionButton, EmptyState, InputField, SurfaceCard } from '../../../../src/components/ui'
import { spacing, type ThemePalette } from '../../../../src/lib/theme'
import { trpc } from '../../../../src/lib/trpc'
import { useAuth } from '../../../../src/providers/AuthProvider'
import { useAppTheme } from '../../../../src/providers/ThemeProvider'
import { useToast } from '../../../../src/providers/ToastProvider'

const ONLINE_WINDOW_MS = 5 * 60 * 1000

function formatPresenceLabel(lastActiveAt?: string | Date | null) {
  if (!lastActiveAt) return 'Offline'
  const last = new Date(lastActiveAt)
  const diffMs = Date.now() - last.getTime()
  if (!Number.isFinite(diffMs)) return 'Offline'
  if (diffMs < 0 || diffMs <= ONLINE_WINDOW_MS) return 'Online'
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000))
  if (diffMinutes < 60) return `last seen ${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `last seen ${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `last seen ${diffDays}d ago`
}

type MemberMenuTarget = {
  userId: string
  name: string
  chatTag: string | null
}

type PendingMemberAction =
  | { kind: 'editTag'; target: MemberMenuTarget }
  | { kind: 'removeTag'; target: MemberMenuTarget }
  | { kind: 'ban'; target: MemberMenuTarget }
  | null

export default function ClubChatMembersScreen() {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { user } = useAuth()
  const toast = useToast()
  const params = useLocalSearchParams<{ clubId: string; name?: string }>()
  const clubId = params.clubId
  const title = 'Club chat users'
  const utils = trpc.useUtils()
  const membersQuery = trpc.club.listMembers.useQuery({ clubId }, { enabled: Boolean(clubId) })
  const setChatTag = trpc.club.setChatMemberTag.useMutation({
    onSuccess: async () => {
      await utils.club.listMembers.invalidate({ clubId })
      toast.success('Tag saved.')
    },
    onError: (error: any) => toast.error(error?.message || 'Failed to save tag.'),
  })
  const deleteChatTag = trpc.club.deleteChatMemberTag.useMutation({
    onSuccess: async () => {
      await utils.club.listMembers.invalidate({ clubId })
      toast.success('Tag removed.')
    },
    onError: (error: any) => toast.error(error?.message || 'Failed to remove tag.'),
  })
  const banUser = trpc.club.banUser.useMutation({
    onSuccess: async () => {
      await utils.club.listMembers.invalidate({ clubId })
      toast.success('User banned.')
    },
    onError: (error: any) => toast.error(error?.message || 'Failed to ban user.'),
  })

  const [memberMenuTarget, setMemberMenuTarget] = useState<MemberMenuTarget | null>(null)
  const [tagEditorTarget, setTagEditorTarget] = useState<MemberMenuTarget | null>(null)
  const [tagDraft, setTagDraft] = useState('')
  const [banTarget, setBanTarget] = useState<MemberMenuTarget | null>(null)
  const [banReason, setBanReason] = useState('')
  const pendingAfterMenuClose = useRef<PendingMemberAction>(null)

  const onMenuDismissed = () => {
    const pending = pendingAfterMenuClose.current
    pendingAfterMenuClose.current = null
    if (!pending) return
    if (pending.kind === 'editTag') {
      setTagEditorTarget(pending.target)
      setTagDraft(pending.target.chatTag ?? '')
      return
    }
    if (pending.kind === 'removeTag') {
      deleteChatTag.mutate({ clubId, userId: pending.target.userId })
      return
    }
    if (pending.kind === 'ban') {
      setBanReason('')
      setBanTarget(pending.target)
    }
  }

  const members = useMemo(() => ((membersQuery.data?.members ?? []) as any[]), [membersQuery.data?.members])
  const canModerate = Boolean(membersQuery.data?.canModerate)

  return (
    <PageLayout topBarTitle={title} topBarRightSlot={null} contentStyle={styles.content}>
      {membersQuery.isLoading ? (
        <SurfaceCard>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading users...</Text>
          </View>
        </SurfaceCard>
      ) : null}

      {!membersQuery.isLoading && members.length === 0 ? (
        <EmptyState title="No users found" body="Chat users will appear here." />
      ) : null}

      {members.map((member: any) => {
        const canShowMenu = canModerate && member.userId !== user?.id
        const chatTag = String(member.chatTag ?? '').trim() || null
        const roleLabel = String(member.role ?? '').trim() || null
        return (
          <SurfaceCard key={String(member.userId)}>
            <View style={styles.row}>
              <Pressable
                onPress={() => router.push({ pathname: '/profile/[id]', params: { id: member.userId } })}
                style={({ pressed }) => [styles.identity, pressed && styles.rowPressed]}
              >
                <RemoteUserAvatar
                  uri={member.user?.image}
                  size={48}
                  fallback="initials"
                  initialsLabel={member.user?.name ?? 'Member'}
                />
                <View style={styles.copy}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                      {member.user?.name || 'Member'}
                    </Text>
                    {roleLabel ? (
                      <View style={[styles.roleChip, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                        <Text style={[styles.roleChipText, { color: colors.text }]} numberOfLines={1}>
                          {roleLabel}
                        </Text>
                      </View>
                    ) : null}
                    {chatTag ? (
                      <View style={[styles.tagChip, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                        <Text style={[styles.tagChipText, { color: colors.primary }]} numberOfLines={1}>
                          {chatTag}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                    {formatPresenceLabel(member.lastActiveAt)}
                  </Text>
                </View>
              </Pressable>

              {canShowMenu ? (
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    setMemberMenuTarget({
                      userId: member.userId,
                      name: member.user?.name || 'Member',
                      chatTag,
                    })
                  }
                  style={({ pressed }) => [
                    styles.menuButton,
                    { borderColor: colors.border, backgroundColor: colors.surfaceMuted },
                    pressed && styles.menuButtonPressed,
                  ]}
                >
                  <Feather name="more-vertical" size={18} color={colors.text} />
                </Pressable>
              ) : null}
            </View>
          </SurfaceCard>
        )
      })}

      <AppBottomSheet
        open={Boolean(memberMenuTarget)}
        onClose={() => setMemberMenuTarget(null)}
        onDismissed={onMenuDismissed}
        title={memberMenuTarget?.name ?? 'User actions'}
      >
        <View style={styles.sheetBody}>
          <ActionButton
            label={memberMenuTarget?.chatTag ? 'Edit tag' : 'Assign tag'}
            variant="outline"
            onPress={() => {
              if (!memberMenuTarget) return
              pendingAfterMenuClose.current = { kind: 'editTag', target: memberMenuTarget }
              setMemberMenuTarget(null)
            }}
          />
          {memberMenuTarget?.chatTag ? (
            <ActionButton
              label="Remove tag"
              variant="secondary"
              onPress={() => {
                if (!memberMenuTarget) return
                pendingAfterMenuClose.current = { kind: 'removeTag', target: memberMenuTarget }
                setMemberMenuTarget(null)
              }}
            />
          ) : null}
          <ActionButton
            label="Ban user"
            variant="neutral"
            onPress={() => {
              if (!memberMenuTarget) return
              pendingAfterMenuClose.current = { kind: 'ban', target: memberMenuTarget }
              setMemberMenuTarget(null)
            }}
          />
        </View>
      </AppBottomSheet>

      <AppBottomSheet
        open={Boolean(tagEditorTarget)}
        onClose={() => {
          setTagEditorTarget(null)
          setTagDraft('')
        }}
        title={tagEditorTarget?.chatTag ? 'Edit chat tag' : 'Assign chat tag'}
        footer={
          <AppConfirmActions
            cancelLabel="Cancel"
            confirmLabel={setChatTag.isPending ? 'Saving…' : 'Save'}
            onCancel={() => {
              setTagEditorTarget(null)
              setTagDraft('')
            }}
            onConfirm={() => {
              if (!tagEditorTarget) return
              setChatTag.mutate(
                { clubId, userId: tagEditorTarget.userId, label: tagDraft.trim() },
                {
                  onSuccess: () => {
                    setTagEditorTarget(null)
                    setTagDraft('')
                  },
                }
              )
            }}
            confirmLoading={setChatTag.isPending}
          />
        }
      >
        <InputField
          value={tagDraft}
          onChangeText={setTagDraft}
          placeholder="Enter chat tag"
          autoCapitalize="words"
          maxLength={24}
          containerStyle={styles.inputWrap}
        />
      </AppBottomSheet>

      <AppBottomSheet
        open={Boolean(banTarget)}
        onClose={() => {
          setBanTarget(null)
          setBanReason('')
        }}
        title="Ban user?"
        subtitle={banTarget?.name ? `${banTarget.name} will be banned from the club.` : 'This user will be banned from the club.'}
        footer={
          <AppConfirmActions
            intent="destructive"
            cancelLabel="Cancel"
            confirmLabel={banUser.isPending ? 'Banning…' : 'Ban'}
            onCancel={() => {
              setBanTarget(null)
              setBanReason('')
            }}
            onConfirm={() => {
              if (!banTarget) return
              banUser.mutate(
                { clubId, userId: banTarget.userId, reason: banReason.trim() || undefined },
                {
                  onSuccess: () => {
                    setBanTarget(null)
                    setBanReason('')
                  },
                }
              )
            }}
            confirmLoading={banUser.isPending}
          />
        }
      >
        <InputField
          value={banReason}
          onChangeText={setBanReason}
          placeholder="Reason (optional)"
          maxLength={300}
          containerStyle={styles.inputWrap}
        />
      </AppBottomSheet>
    </PageLayout>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xxl,
      gap: spacing.md,
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    loadingText: {
      fontSize: 14,
      fontWeight: '600',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    rowPressed: {
      opacity: 0.92,
    },
    identity: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minWidth: 0,
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
    },
    name: {
      flexShrink: 1,
      fontSize: 16,
      fontWeight: '700',
    },
    meta: {
      fontSize: 13,
      fontWeight: '500',
    },
    menuButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    menuButtonPressed: {
      opacity: 0.92,
      transform: [{ scale: 0.96 }],
    },
    sheetBody: {
      gap: spacing.sm,
    },
    inputWrap: {
      marginTop: spacing.xs,
    },
    tagChip: {
      maxWidth: 120,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderWidth: 1,
      flexShrink: 1,
    },
    tagChipText: {
      fontSize: 10,
      fontWeight: '500',
    },
    roleChip: {
      maxWidth: 120,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderWidth: 1,
      flexShrink: 1,
    },
    roleChipText: {
      fontSize: 10,
      fontWeight: '500',
    },
  })
