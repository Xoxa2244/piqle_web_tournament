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
import { CampaignAudiencePreviewList } from '../iq-pages/campaigns/CampaignAudiencePreviewList'
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
  const suggestedPreviewUserIds = useMemo(
    () => activeKind === 'ai_suggested'
      ? Array.from(new Set(visibleSuggestedAudiences.flatMap((audienceOption) => audienceOption.userIds))).slice(0, 200)
      : [],
    [activeKind, visibleSuggestedAudiences],
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

  const goalLabel = getCampaignGoalLabel(goal)

  const setKind = (kind: AudienceSourceKind) => {
    setActiveKind(kind)

    if (audience?.kind === kind) return

    if (kind === 'inline_userIds' && initialUserIds?.length) {
      onChange({ kind, cohortId: null, cohortName: `Hand-picked selection (${initialUserIds.length})`, userIds: initialUserIds, memberCount: initialUserIds.length })
    } else {
      onChange(null)
    }
  }

  const pickSaved = (id: string, name: string, memberCount: number) => {
    setActiveKind('saved_cohort')
    onChange({ kind: 'saved_cohort', cohortId: id, cohortName: name, userIds: [], memberCount })
  }

  const pickSuggested = (id: string, name: string, memberCount: number, userIds: string[]) => {
    setActiveKind('ai_suggested')
    const selectedAudience = visibleSuggestedAudiences.find((audienceOption) => audienceOption.id === id)
    onChange({ kind: 'ai_suggested', cohortId: selectedAudience?.cohortId ?? null, cohortName: name, userIds, memberCount })
  }

  return (
    <div className="space-y-5">
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
        <div className="space-y-2 max-h-[320px] overflow-y-auto">
          {savedCohorts.length === 0 ? (
            <div className="text-xs p-4 rounded-xl text-center" style={{ background: 'var(--subtle)', color: 'var(--t4)' }}>
              No saved cohorts yet. Create one on the Cohorts page first.
            </div>
          ) : (
            savedCohorts.map((c) => {
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
            })
          )}
        </div>
      )}

      {activeKind === 'ai_suggested' && (
        <div className="space-y-2 max-h-[320px] overflow-y-auto">
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
            visibleSuggestedAudiences.map((c) => {
              const selected = audience?.cohortId === c.id
                || (audience?.cohortId == null && c.cohortId == null && audience?.cohortName === c.name)
              const previewMembers = c.userIds
                .map((userId) => previewMembersById.get(userId))
                .filter((member): member is CampaignAudiencePreviewMember => !!member)
              return (
                <div
                  key={c.id}
                  className="rounded-xl p-3"
                  style={{
                    background: selected ? 'rgba(139,92,246,0.08)' : 'var(--card-bg)',
                    border: `1px solid ${selected ? '#8B5CF6' : 'var(--card-border)'}`,
                  }}
                >
                  <button
                    onClick={() => pickSuggested(c.id, c.name, c.memberCount, c.userIds)}
                    className="w-full text-left transition-all flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--heading)' }}>
                        {c.emoji ?? '🎯'} {c.name}
                      </div>
                      <div className="text-[11px] mt-1 line-clamp-2" style={{ color: 'var(--t4)' }}>{c.description}</div>
                      <div className="text-[11px] mt-1" style={{ color: '#A78BFA', fontWeight: 600 }}>{c.memberCount} members</div>
                    </div>
                    {selected && <Check className="w-4 h-4 shrink-0" style={{ color: '#8B5CF6' }} />}
                  </button>

                  <div className="mt-3">
                    {previewMembersLoading ? (
                      <div className="flex items-center gap-2 text-xs p-3 rounded-xl" style={{ background: 'var(--subtle)', color: 'var(--t4)' }}>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Loading suggested members...
                      </div>
                    ) : (
                      <CampaignAudiencePreviewList
                        members={previewMembers}
                        title="Suggested members"
                        emptyText="No member preview available yet"
                        compact
                      />
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {activeKind === 'inline_userIds' && audience && (
        <div className="rounded-xl p-3" style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>{audience.cohortName}</div>
          <div className="text-[11px] mt-1" style={{ color: 'var(--t4)' }}>
            {audience.userIds.length} hand-picked recipients (from previous selection).
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
