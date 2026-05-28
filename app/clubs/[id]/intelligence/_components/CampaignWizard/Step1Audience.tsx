'use client'

/**
 * Wizard Step 1 — Audience (P4-T2).
 *
 * Three picker modes:
 *   • Pick from saved cohorts (user-created via Cohort Builder)
 *   • Pick from suggested audiences (goal-matched members or saved suggestions)
 *   • Use a userId list passed in from a previous selection
 *     (e.g. Members bulk-select handoff — P3-T2 / P2-T3)
 *
 * Inline cohort builder embed (per spec) is deferred to a follow-up;
 * for v1 the user can switch to the Cohorts page and come back.
 */

import { useEffect, useMemo, useState } from 'react'
import { Users, Sparkles, Check, Loader2 } from 'lucide-react'
import { useAudiencePreviewMembers } from '../../_hooks/use-intelligence'
import { getCampaignGoalLabel } from './audience-utils'
import type { AudienceSelection, AudienceSourceKind, CampaignGoal } from './types'
import type { CampaignAudiencePreviewMember } from '../iq-pages/campaigns/useCampaignCreator'

interface Step1Props {
  clubId: string
  audience: AudienceSelection | null
  goal: CampaignGoal | null
  onChange: (next: AudienceSelection | null) => void
  savedCohorts: Array<{ id: string; name: string; memberCount: number }>
  suggestedAudiences: Array<{
    id: string
    cohortId: string | null
    name: string
    memberCount: number
    userIds: string[]
    emoji?: string
    description: string
  }>
  suggestedAudiencesLoading?: boolean
  /** When opened from Members bulk-select, pre-populated userIds. */
  initialUserIds?: string[]
  /** Display label for the initialUserIds audience (e.g. a tier + bucket from
   *  Membership Health). Falls back to "Hand-picked selection (N)". */
  initialUserIdsLabel?: string | null
}

export function Step1Audience({
  clubId,
  audience,
  goal,
  onChange,
  savedCohorts,
  suggestedAudiences,
  suggestedAudiencesLoading = false,
  initialUserIds,
  initialUserIdsLabel,
}: Step1Props) {
  const [activeKind, setActiveKind] = useState<AudienceSourceKind>(
    audience?.kind ?? (initialUserIds?.length ? 'inline_userIds' : 'saved_cohort')
  )

  useEffect(() => {
    if (audience?.kind) {
      setActiveKind(audience.kind)
    }
  }, [audience?.kind])

  const visibleSuggestedAudiences = useMemo(() => suggestedAudiences, [suggestedAudiences])
  const selectedSuggestedAudienceId = useMemo(() => {
    if (audience?.kind !== 'ai_suggested') return null

    const byCohortId = audience.cohortId
      ? visibleSuggestedAudiences.find((audienceOption) => audienceOption.cohortId === audience.cohortId)
      : null
    if (byCohortId) return byCohortId.id

    const byName = visibleSuggestedAudiences.find((audienceOption) => audienceOption.name === audience.cohortName)
    return byName?.id ?? null
  }, [audience?.cohortId, audience?.cohortName, audience?.kind, visibleSuggestedAudiences])
  const [activeSuggestedAudienceId, setActiveSuggestedAudienceId] = useState<string | null>(null)

  useEffect(() => {
    if (visibleSuggestedAudiences.length === 0) {
      setActiveSuggestedAudienceId(null)
      return
    }

    if (selectedSuggestedAudienceId) {
      setActiveSuggestedAudienceId(selectedSuggestedAudienceId)
      return
    }

    setActiveSuggestedAudienceId((current) =>
      current && visibleSuggestedAudiences.some((audienceOption) => audienceOption.id === current)
        ? current
        : visibleSuggestedAudiences[0]?.id ?? null,
    )
  }, [selectedSuggestedAudienceId, visibleSuggestedAudiences])

  const activeSuggestedAudience = useMemo(
    () =>
      visibleSuggestedAudiences.find((audienceOption) => audienceOption.id === activeSuggestedAudienceId)
      ?? visibleSuggestedAudiences[0]
      ?? null,
    [activeSuggestedAudienceId, visibleSuggestedAudiences],
  )
  const suggestedPreviewUserIds = useMemo(
    () =>
      activeKind === 'ai_suggested' && activeSuggestedAudience
        ? Array.from(new Set(activeSuggestedAudience.userIds)).slice(0, 200)
        : [],
    [activeKind, activeSuggestedAudience],
  )
  const { data: previewMembersRaw = [], isLoading: previewMembersLoading } = useAudiencePreviewMembers(
    clubId,
    suggestedPreviewUserIds,
    { enabled: activeKind === 'ai_suggested' && suggestedPreviewUserIds.length > 0 },
  )
  const previewMembersById = useMemo(() => {
    const map = new Map<string, CampaignAudiencePreviewMember>()
    for (const member of previewMembersRaw as any[]) {
      const subtitle = typeof member.daysSinceLastVisit === 'number'
        ? `${member.daysSinceLastVisit}d since last play`
        : typeof member.joinedDaysAgo === 'number'
          ? `Joined ${member.joinedDaysAgo}d ago`
          : member.email || undefined
      map.set(member.id, {
        id: member.id,
        name: member.name || member.email || 'Unknown member',
        email: member.email || undefined,
        subtitle,
      })
    }
    return map
  }, [previewMembersRaw])
  const activeSuggestedPreviewMembers = useMemo(
    () =>
      activeSuggestedAudience
        ? activeSuggestedAudience.userIds
            .map((userId) => previewMembersById.get(userId))
            .filter((member): member is CampaignAudiencePreviewMember => !!member)
        : [],
    [activeSuggestedAudience, previewMembersById],
  )
  const selectedSuggestedUserIds = useMemo(() => {
    if (audience?.kind !== 'ai_suggested' || !activeSuggestedAudience || selectedSuggestedAudienceId !== activeSuggestedAudience.id) {
      return []
    }

    const allowedUserIds = new Set(activeSuggestedAudience.userIds)
    return Array.from(
      new Set((audience.userIds ?? []).filter((userId) => allowedUserIds.has(userId))),
    )
  }, [activeSuggestedAudience, audience?.kind, audience?.userIds, selectedSuggestedAudienceId])
  const selectedSuggestedUserIdSet = useMemo(
    () => new Set(selectedSuggestedUserIds),
    [selectedSuggestedUserIds],
  )
  const allSuggestedMembersSelected = !!activeSuggestedAudience
    && activeSuggestedAudience.userIds.length > 0
    && selectedSuggestedUserIds.length === activeSuggestedAudience.userIds.length

  const goalLabel = getCampaignGoalLabel(goal)

  const setKind = (kind: AudienceSourceKind) => {
    setActiveKind(kind)

    if (audience?.kind === kind) return

    if (kind === 'inline_userIds' && initialUserIds?.length) {
      onChange({ kind, cohortId: null, cohortName: initialUserIdsLabel || `Hand-picked selection (${initialUserIds.length})`, userIds: initialUserIds, memberCount: initialUserIds.length })
    } else {
      onChange(null)
    }
  }

  const pickSaved = (id: string, name: string, memberCount: number) => {
    setActiveKind('saved_cohort')
    onChange({ kind: 'saved_cohort', cohortId: id, cohortName: name, userIds: [], memberCount })
  }

  const pickSuggested = (id: string, name: string, userIds: string[], cohortId: string | null = null) => {
    setActiveKind('ai_suggested')
    setActiveSuggestedAudienceId(id)
    const normalizedUserIds = Array.from(
      new Set(userIds.filter((userId): userId is string => typeof userId === 'string' && userId.length > 0)),
    )

    if (normalizedUserIds.length === 0) {
      onChange(null)
      return
    }

    onChange({
      kind: 'ai_suggested',
      cohortId,
      cohortName: name,
      userIds: normalizedUserIds,
      memberCount: normalizedUserIds.length,
    })
  }
  const toggleSuggestedUser = (userId: string) => {
    if (!activeSuggestedAudience) return

    const nextSelectedUserIds = selectedSuggestedUserIdSet.has(userId)
      ? selectedSuggestedUserIds.filter((id) => id !== userId)
      : [...selectedSuggestedUserIds, userId]

    pickSuggested(
      activeSuggestedAudience.id,
      activeSuggestedAudience.name,
      nextSelectedUserIds,
      activeSuggestedAudience.cohortId && nextSelectedUserIds.length === activeSuggestedAudience.userIds.length
        ? activeSuggestedAudience.cohortId
        : null,
    )
  }
  const toggleSelectAllSuggestedUsers = () => {
    if (!activeSuggestedAudience) return

    pickSuggested(
      activeSuggestedAudience.id,
      activeSuggestedAudience.name,
      allSuggestedMembersSelected ? [] : activeSuggestedAudience.userIds,
      allSuggestedMembersSelected ? null : activeSuggestedAudience.cohortId,
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <div>
        <h3 className="text-base font-bold mb-1" style={{ color: 'var(--heading)' }}>Who should we send to?</h3>
        <p className="text-xs" style={{ color: 'var(--t3)' }}>Pick from saved cohorts or a suggested audience.</p>
      </div>

      {/* Source kind picker */}
      <div className="flex flex-wrap gap-2">
        {([
          { kind: 'saved_cohort' as const, label: 'Saved cohort', icon: Users },
          { kind: 'ai_suggested' as const, label: 'Suggested audience', icon: Sparkles },
          ...(initialUserIds?.length ? [{ kind: 'inline_userIds' as const, label: `Selected (${initialUserIds.length})`, icon: Check }] : []),
        ]).map(({ kind, label, icon: Icon }) => (
          <button
            key={kind}
            onClick={() => setKind(kind)}
            className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all"
            style={{
              background: activeKind === kind ? 'rgba(139,92,246,0.18)' : 'var(--subtle)',
              border: `1px solid ${activeKind === kind ? '#8B5CF6' : 'var(--card-border)'}`,
              color: activeKind === kind ? '#A78BFA' : 'var(--t3)',
              fontWeight: 600,
            }}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* List for the active kind */}
      {activeKind === 'saved_cohort' && (
        <div className="flex min-h-0 flex-1 flex-col">
          {savedCohorts.length === 0 ? (
            <div className="text-xs p-4 rounded-xl text-center" style={{ background: 'var(--subtle)', color: 'var(--t4)' }}>
              No saved cohorts yet. Create one on the Cohorts page first.
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {savedCohorts.map((c) => {
                const selected = audience?.cohortId === c.id
                return (
                  <button
                    key={c.id}
                    onClick={() => pickSaved(c.id, c.name, c.memberCount)}
                    className="w-full text-left rounded-xl p-3 transition-all flex items-center justify-between gap-3"
                    style={{
                      background: selected ? 'rgba(139,92,246,0.08)' : 'var(--card-bg)',
                      border: `1px solid ${selected ? '#8B5CF6' : 'var(--card-border)'}`,
                    }}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--heading)' }}>{c.name}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: 'var(--t4)' }}>{c.memberCount} members</div>
                    </div>
                    {selected && <Check className="w-4 h-4 shrink-0" style={{ color: '#8B5CF6' }} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeKind === 'ai_suggested' && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {goalLabel && (
            <div
              className="rounded-xl p-3 text-[11px]"
              style={{
                background: visibleSuggestedAudiences.length > 0 ? 'rgba(139,92,246,0.08)' : 'var(--subtle)',
                border: `1px solid ${visibleSuggestedAudiences.length > 0 ? 'rgba(139,92,246,0.24)' : 'var(--card-border)'}`,
                color: visibleSuggestedAudiences.length > 0 ? '#C4B5FD' : 'var(--t3)',
              }}
            >
              {visibleSuggestedAudiences.length > 0
                ? `Showing members who match ${goalLabel}.`
                : `No suggested audience is available for ${goalLabel} yet.`}
            </div>
          )}

          {suggestedAudiencesLoading ? (
            <div className="flex items-center gap-2 text-xs p-4 rounded-xl" style={{ background: 'var(--subtle)', color: 'var(--t4)' }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading matching members...
            </div>
          ) : visibleSuggestedAudiences.length === 0 ? (
            <div className="text-xs p-4 rounded-xl text-center" style={{ background: 'var(--subtle)', color: 'var(--t4)' }}>
              No suggested audience available yet.
            </div>
          ) : (
            <>
              {visibleSuggestedAudiences.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {visibleSuggestedAudiences.map((c) => {
                    const selected = activeSuggestedAudience?.id === c.id
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => pickSuggested(c.id, c.name, c.userIds, c.cohortId)}
                        className="rounded-lg px-3 py-2 text-left text-xs transition-all"
                        style={{
                          background: selected ? 'rgba(139,92,246,0.12)' : 'var(--subtle)',
                          border: `1px solid ${selected ? '#8B5CF6' : 'var(--card-border)'}`,
                          color: selected ? '#C4B5FD' : 'var(--t3)',
                          fontWeight: 600,
                        }}
                      >
                        <span className="mr-1.5">{c.emoji ?? '🎯'}</span>
                        {c.name}
                        <span className="ml-1.5 opacity-80">({c.memberCount})</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {activeSuggestedAudience && (
                <>
                  <div
                    className="rounded-xl p-3"
                    style={{
                      background: 'var(--card-bg)',
                      border: '1px solid var(--card-border)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--heading)' }}>
                          {activeSuggestedAudience.emoji ?? '🎯'} {activeSuggestedAudience.name}
                        </div>
                        <div className="text-[11px] mt-1 leading-5" style={{ color: 'var(--t4)' }}>
                          {activeSuggestedAudience.description}
                        </div>
                        <div className="text-[11px] mt-2" style={{ color: '#A78BFA', fontWeight: 600 }}>
                          {selectedSuggestedUserIds.length} of {activeSuggestedAudience.memberCount} selected
                        </div>
                      </div>

                      <label className="flex shrink-0 items-center gap-2 text-[11px]" style={{ color: 'var(--t3)', fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={allSuggestedMembersSelected}
                          onChange={toggleSelectAllSuggestedUsers}
                          className="h-4 w-4 rounded border border-[var(--card-border)] bg-transparent"
                          style={{ accentColor: '#8B5CF6' }}
                        />
                        Select all
                      </label>
                    </div>
                  </div>

                  {previewMembersLoading ? (
                    <div className="flex items-center gap-2 text-xs p-4 rounded-xl" style={{ background: 'var(--subtle)', color: 'var(--t4)' }}>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Loading suggested members...
                    </div>
                  ) : activeSuggestedPreviewMembers.length === 0 ? (
                    <div className="text-xs p-4 rounded-xl text-center" style={{ background: 'var(--subtle)', color: 'var(--t4)' }}>
                      No member preview available yet.
                    </div>
                  ) : (
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                      {activeSuggestedPreviewMembers.map((member) => {
                        const selected = selectedSuggestedUserIdSet.has(member.id)

                        return (
                          <label
                            key={member.id}
                            className="flex cursor-pointer items-center gap-3 rounded-xl p-3 transition-all"
                            style={{
                              background: selected ? 'rgba(139,92,246,0.08)' : 'var(--card-bg)',
                              border: `1px solid ${selected ? '#8B5CF6' : 'var(--card-border)'}`,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleSuggestedUser(member.id)}
                              className="h-4 w-4 rounded border border-[var(--card-border)] bg-transparent"
                              style={{ accentColor: '#8B5CF6' }}
                            />

                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold truncate" style={{ color: 'var(--heading)' }}>
                                {member.name}
                              </div>
                              {(member.subtitle || member.email) && (
                                <div className="mt-0.5 text-[11px] truncate" style={{ color: 'var(--t4)' }}>
                                  {member.subtitle ?? member.email}
                                </div>
                              )}
                            </div>

                            {selected && <Check className="h-4 w-4 shrink-0" style={{ color: '#8B5CF6' }} />}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {activeKind === 'inline_userIds' && audience && (
        <div className="rounded-xl p-3" style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>{audience.cohortName}</div>
          <div className="text-[11px] mt-1" style={{ color: 'var(--t4)' }}>
            {audience.userIds.length} {audience.userIds.length === 1 ? 'recipient' : 'recipients'} in this audience.
          </div>
        </div>
      )}

      {/* Selection summary */}
      {audience && (
        <div className="rounded-xl p-3 mt-2" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: '#10B981', fontWeight: 600 }}>
            <Check className="w-3.5 h-3.5" />
            Audience selected: <span style={{ color: 'var(--heading)' }}>{audience.cohortName}</span> ({audience.memberCount} members)
          </div>
        </div>
      )}
    </div>
  )
}
