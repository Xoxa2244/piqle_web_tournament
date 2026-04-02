import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import { AppBottomSheet, AppConfirmActions } from './AppBottomSheet'
import { RatingStarIcon } from './icons/RatingStarIcon'
import { FEEDBACK_API_ENABLED } from '../lib/config'
import { keyboardAppearanceForTheme, radius, spacing, type ThemePalette } from '../lib/theme'
import { trpc } from '../lib/trpc'
import { useAppTheme } from '../providers/ThemeProvider'
import { useToast } from '../providers/ToastProvider'

type EntityType = 'TOURNAMENT' | 'CLUB' | 'TD' | 'APP'
const DEV_COMMENT_LIMIT = 400
const DEV_SURVEY_CHIPS: Record<EntityType, Record<number, string[]>> = {
  TOURNAMENT: {
    5: ['Excellent organization', 'Clear schedule', 'Strong opponents', 'Great atmosphere', 'No delays'],
    4: ['Good, but delays happened', 'Not enough updates/announcements', 'Registration felt hard', 'Matches felt slow', 'Organization could be better'],
    3: ['Frequent delays', 'Poor communication', 'Unclear rules', 'Bracket/schedule issues', 'Long waits between matches'],
    2: ['Chaotic schedule', 'Refereeing/rules felt questionable', 'Conflicts were not resolved', 'Poor court conditions', 'Reality did not match expectations'],
    1: ['Very poorly organized', 'Disrespectful behavior', 'Would not recommend'],
  },
  TD: {
    5: ['Solved issues quickly', 'Great communication', 'Fair decisions', 'Professional', 'Handled conflicts well'],
    4: ['Overall good, but responses were not always fast', 'Sometimes lacked clarity', 'Issues were solved, but slowly'],
    3: ['Slow responses', 'Weak announcements/instructions', 'Limited process control'],
    2: ['Ignored problems', 'Harsh/disrespectful communication', 'Questionable decisions'],
    1: ['Very unprofessional', 'Conflict-prone / toxic', 'Situations were not resolved'],
  },
  CLUB: {
    5: ['Regular events', 'Good value for money', 'Great atmosphere', 'Active community', 'Helpful support'],
    4: ['Overall good, but with some issues', 'Queues / event organization issues', 'Issues were solved, but slowly'],
    3: ['Rare events', 'Too expensive', 'Low community engagement', 'Low support quality'],
    2: ['Poor service', 'No events', 'Ignored requests'],
    1: ['Toxic/conflict atmosphere', 'No events'],
  },
  APP: {
    5: ['User-friendly interface', 'Fast tournament creation', 'Easy payments', 'Everything is clear', 'Convenient navigation'],
    4: ['Hard to find what I need', 'Too many steps', 'Unclear statuses/rules', 'Weak calendar/timezone flow', 'Navigation could be better'],
    3: ['Lags', 'Bugs', 'Errors'],
    2: ['Poor service', 'Lags', 'Bugs', 'Errors'],
    1: ['I am a hater'],
  },
}

const getFriendlySubmitError = (entityType: EntityType, rawMessage?: string) => {
  const message = (rawMessage ?? '').trim()
  if (!message) return 'Could not submit feedback.'

  if (entityType === 'CLUB') {
    if (message === 'Club not found.') return 'Club not found.'
    if (message === 'Only club members can rate this club.') return 'Join this club first to leave a rating.'
    if (message === 'Only club members or admins can rate this club.') return 'Join this club first to leave a rating.'
    if (message === 'You can rate this club after 3 days of membership or after participating in a club event.') {
      return 'You can rate this club after 3 days in the club or after playing a club event.'
    }
  }

  return message
}

export function FeedbackRatingModal({
  open,
  onClose,
  entityType,
  entityId,
  title,
  titleBelow,
  subtitle,
  contextCard,
  onSubmitted,
}: {
  open: boolean
  onClose: () => void
  entityType: EntityType
  entityId: string
  title: string
  titleBelow?: ReactNode
  subtitle?: string
  contextCard?: ReactNode
  onSubmitted?: () => void
}) {
  const { colors, theme } = useAppTheme()
  const toast = useToast()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [rating, setRating] = useState<number>(0)
  const [chips, setChips] = useState<string[]>([])
  const [comment, setComment] = useState('')

  const chipsQuery = trpc.feedback.getSurveyChips.useQuery(
    { entityType, rating: Math.max(1, rating || 5) },
    { enabled: FEEDBACK_API_ENABLED && open && rating > 0 },
  )
  const submitMutation = trpc.feedback.submit.useMutation({
    onSuccess: (result) => {
      const payload = result as { ok?: boolean; pendingMigration?: boolean } | undefined
      if (!payload?.ok) {
        if (payload?.pendingMigration) {
          toast.error('Feedback is temporarily unavailable. Please try again later.')
          return
        }
        toast.error('Could not submit feedback.')
        return
      }
      toast.success('Thanks — your feedback was sent.')
      onSubmitted?.()
      onClose()
    },
    onError: (e) => {
      toast.error(getFriendlySubmitError(entityType, e.message))
    },
  })

  useEffect(() => {
    if (!open) return
    setRating(0)
    setChips([])
    setComment('')
  }, [open, entityId, entityType])

  const useLocalFallback = !FEEDBACK_API_ENABLED
  const availableChips = useLocalFallback
    ? DEV_SURVEY_CHIPS[entityType]?.[Math.max(1, rating || 5)] ?? []
    : chipsQuery.data?.chips ?? []
  const canComment = rating > 0 && rating < 5
  const commentLimit = useLocalFallback ? DEV_COMMENT_LIMIT : chipsQuery.data?.commentMaxLength ?? DEV_COMMENT_LIMIT

  useEffect(() => {
    if (!rating || chips.length === 0) return
    const allowed = new Set(availableChips)
    if (chips.every((chip) => allowed.has(chip))) return
    setChips(chips.filter((chip) => allowed.has(chip)))
  }, [rating, availableChips, chips])

  const canSubmit = useMemo(() => rating >= 1 && rating <= 5 && !submitMutation.isPending, [rating, submitMutation.isPending])

  return (
    <AppBottomSheet
      open={open}
      onClose={onClose}
      title={title}
      titleBelow={titleBelow}
      subtitle={subtitle}
      footer={
        <AppConfirmActions
          intent="positive"
          cancelLabel="Cancel"
          confirmLabel={submitMutation.isPending ? 'Submitting...' : 'Submit'}
          onCancel={onClose}
          onConfirm={() => {
            if (!canSubmit) return
            if (useLocalFallback) {
              toast.success('Thanks — feedback recorded (offline).')
              onSubmitted?.()
              onClose()
              return
            }
            submitMutation.mutate({
              entityType,
              entityId,
              rating,
              chips,
              comment: canComment ? comment.trim() || undefined : undefined,
            })
          }}
          confirmLoading={submitMutation.isPending}
        />
      }
    >
      <View style={styles.body}>
        {contextCard ? <View style={styles.contextCardWrap}>{contextCard}</View> : null}
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((star) => {
            const active = rating >= star
            return (
              <Pressable
                key={star}
                onPress={() => setRating(star)}
                hitSlop={8}
                style={({ pressed }) => [styles.starBtn, pressed && styles.starBtnPressed]}
              >
                <RatingStarIcon size={34} filled={active} color="#F4B000" inactiveColor={colors.textMuted} />
              </Pressable>
            )
          })}
        </View>

        {rating > 0 ? (
          <View style={styles.chipsWrap}>
            {availableChips.map((chip) => {
              const selected = chips.includes(chip)
              return (
                <Pressable
                  key={chip}
                  onPress={() => {
                    setChips((prev) => (prev.includes(chip) ? prev.filter((x) => x !== chip) : [...prev, chip]))
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    pressed && styles.chipPressed,
                  ]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{chip}</Text>
                </Pressable>
              )
            })}
          </View>
        ) : null}

        {canComment ? (
          <View style={styles.commentWrap}>
            <TextInput
              value={comment}
              onChangeText={(text) => setComment(text.slice(0, commentLimit))}
              placeholder="Optional comment"
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={keyboardAppearanceForTheme(theme)}
              multiline
              maxLength={commentLimit}
              style={styles.commentInput}
            />
            <Text style={styles.commentCount}>{comment.length}/{commentLimit}</Text>
          </View>
        ) : null}
      </View>
    </AppBottomSheet>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
  body: {
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  contextCardWrap: {
    marginBottom: 0,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  starBtn: {
    padding: 3,
  },
  starBtnPressed: {
    opacity: 0.85,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.brandPrimaryTint,
  },
  chipPressed: {
    opacity: 0.9,
  },
  chipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: colors.primary,
  },
  commentWrap: {
    gap: 8,
  },
  commentInput: {
    minHeight: 94,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  commentCount: {
    alignSelf: 'flex-end',
    color: colors.textMuted,
    fontSize: 12,
  },
})

