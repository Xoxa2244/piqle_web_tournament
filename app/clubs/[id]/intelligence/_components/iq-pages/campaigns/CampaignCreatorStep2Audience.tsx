'use client'

import React, { useEffect } from 'react'
import { motion } from 'motion/react'
import { Mail, MessageSquare, Layers, Loader2 } from 'lucide-react'
import { useTheme } from '../../IQThemeProvider'
import {
  useReactivationCandidates,
  useMemberHealth,
  useUnderfilledSessions,
  useNewMembers,
} from '../../../_hooks/use-intelligence'

interface Step2Props {
  clubId: string
  type: string
  channel: string
  onChannelChange: (ch: 'email' | 'sms' | 'both') => void
  audience: { memberIds: string[]; count: number; label: string }
  onAudienceChange: (a: { memberIds: string[]; count: number; label: string }) => void
  sessionId: string | null
  onSessionIdChange: (id: string | null) => void
  inactivityDays: number
  onInactivityDaysChange: (d: number) => void
  riskSegment: string
  onRiskSegmentChange: (s: string) => void
  onContinue: () => void
}

const CHANNEL_OPTIONS = [
  { value: 'email' as const, label: 'Email', icon: Mail },
  { value: 'sms' as const, label: 'SMS', icon: MessageSquare },
  { value: 'both' as const, label: 'Both', icon: Layers },
]

function SegmentButton({ label, active, count, onClick }: { label: string; active: boolean; count?: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-2 rounded-lg text-xs transition-all"
      style={{
        background: active ? 'rgba(139,92,246,0.15)' : 'var(--subtle)',
        border: `1px solid ${active ? '#8B5CF6' : 'transparent'}`,
        color: active ? '#8B5CF6' : 'var(--t2)',
        fontWeight: active ? 700 : 500,
      }}
    >
      {label}
      {count != null && <span className="ml-1.5 text-[10px]" style={{ opacity: 0.7 }}>({count})</span>}
    </button>
  )
}

function ReactivationAudience({ clubId, inactivityDays, onDaysChange, onAudienceChange }: {
  clubId: string; inactivityDays: number; onDaysChange: (d: number) => void; onAudienceChange: Step2Props['onAudienceChange']
}) {
  const { data, isLoading } = useReactivationCandidates(clubId, inactivityDays)
  const candidates = (data as any)?.candidates ?? data ?? []
  const list = Array.isArray(candidates) ? candidates : []

  useEffect(() => {
    if (list.length > 0) {
      onAudienceChange({
        memberIds: list.map((c: any) => c.userId ?? c.id),
        count: list.length,
        label: `${list.length} inactive ${inactivityDays}+ days`,
      })
    }
  }, [list.length, inactivityDays]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="text-[11px] mb-2" style={{ color: 'var(--t3)', fontWeight: 600 }}>Inactivity threshold</div>
      <div className="flex gap-2 mb-3">
        {[14, 30, 60].map(d => (
          <SegmentButton key={d} label={`${d} days`} active={inactivityDays === d} onClick={() => onDaysChange(d)} />
        ))}
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t4)' }}><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading members...</div>
      ) : (
        <div className="text-xs" style={{ color: '#8B5CF6', fontWeight: 600 }}>{list.length} inactive members found</div>
      )}
    </div>
  )
}

function HealthAudience({ clubId, riskSegment, onSegmentChange, onAudienceChange, defaultSegment }: {
  clubId: string; riskSegment: string; onSegmentChange: (s: string) => void; onAudienceChange: Step2Props['onAudienceChange']; defaultSegment: string
}) {
  const { data, isLoading } = useMemberHealth(clubId)
  const members = (data as any)?.members ?? []

  const segments = ['watch', 'at_risk', 'critical'] as const
  const counts: Record<string, number> = { watch: 0, at_risk: 0, critical: 0 }
  for (const m of members) {
    const seg = (m as any).segment ?? (m as any).riskSegment ?? ''
    if (seg in counts) counts[seg]++
  }

  const filtered = members.filter((m: any) => (m.segment ?? m.riskSegment) === riskSegment)

  useEffect(() => {
    if (filtered.length > 0) {
      onAudienceChange({
        memberIds: filtered.map((m: any) => m.userId ?? m.id),
        count: filtered.length,
        label: `${filtered.length} ${riskSegment.replace('_', ' ')} members`,
      })
    }
  }, [filtered.length, riskSegment]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="text-[11px] mb-2" style={{ color: 'var(--t3)', fontWeight: 600 }}>Risk segment</div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t4)' }}><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</div>
      ) : (
        <div className="flex gap-2 mb-3">
          {segments.map(s => (
            <SegmentButton key={s} label={s.replace('_', ' ')} active={riskSegment === s} count={counts[s]} onClick={() => onSegmentChange(s)} />
          ))}
        </div>
      )}
      {!isLoading && <div className="text-xs" style={{ color: '#8B5CF6', fontWeight: 600 }}>{filtered.length} members in segment</div>}
    </div>
  )
}

function SessionAudience({ clubId, sessionId, onSessionIdChange, onAudienceChange }: {
  clubId: string; sessionId: string | null; onSessionIdChange: (id: string | null) => void; onAudienceChange: Step2Props['onAudienceChange']
}) {
  const { data, isLoading } = useUnderfilledSessions(clubId)
  const sessions = (data as any)?.sessions ?? data ?? []
  const list = Array.isArray(sessions) ? sessions : []

  useEffect(() => {
    if (sessionId) {
      const s = list.find((sess: any) => (sess.id ?? sess.sessionId) === sessionId)
      if (s) {
        onAudienceChange({
          memberIds: [],
          count: (s as any).recommendedCount ?? (((s as any).capacity - (s as any).booked) || 5),
          label: `Session: ${(s as any).title ?? (s as any).name ?? sessionId}`,
        })
      }
    }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="text-[11px] mb-2" style={{ color: 'var(--t3)', fontWeight: 600 }}>Select session</div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t4)' }}><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading sessions...</div>
      ) : list.length === 0 ? (
        <div className="text-xs" style={{ color: 'var(--t4)' }}>No underfilled sessions found</div>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {list.map((s: any) => {
            const id = s.id ?? s.sessionId
            const booked = s.booked ?? s.currentPlayers ?? 0
            const capacity = s.capacity ?? s.maxPlayers ?? 1
            const pct = Math.round((booked / capacity) * 100)
            const selected = sessionId === id
            return (
              <button
                key={id}
                onClick={() => onSessionIdChange(id)}
                className="w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all"
                style={{
                  background: selected ? 'rgba(139,92,246,0.1)' : 'var(--subtle)',
                  border: `1px solid ${selected ? '#8B5CF6' : 'transparent'}`,
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span style={{ color: 'var(--heading)', fontWeight: 600 }}>{s.title ?? s.name ?? s.format ?? 'Session'}</span>
                  <span style={{ color: 'var(--t4)' }}>{booked}/{capacity}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--card-border)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct < 50 ? '#EF4444' : pct < 75 ? '#F59E0B' : '#10B981' }} />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NewMemberAudience({ clubId, onAudienceChange }: {
  clubId: string; onAudienceChange: Step2Props['onAudienceChange']
}) {
  const [days, setDays] = React.useState(14)
  const { data, isLoading } = useNewMembers(clubId, days)
  const members = (data as any)?.members ?? data ?? []
  const list = Array.isArray(members) ? members : []

  useEffect(() => {
    if (list.length > 0) {
      onAudienceChange({
        memberIds: list.map((m: any) => m.userId ?? m.id),
        count: list.length,
        label: `${list.length} new members (${days}d)`,
      })
    }
  }, [list.length, days]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="text-[11px] mb-2" style={{ color: 'var(--t3)', fontWeight: 600 }}>Joined within</div>
      <div className="flex gap-2 mb-3">
        {[7, 14, 30].map(d => (
          <SegmentButton key={d} label={`${d} days`} active={days === d} onClick={() => setDays(d)} />
        ))}
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t4)' }}><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</div>
      ) : (
        <div className="text-xs" style={{ color: '#8B5CF6', fontWeight: 600 }}>{list.length} new members</div>
      )}
    </div>
  )
}

export function CampaignCreatorStep2Audience(props: Step2Props) {
  const { isDark } = useTheme()
  const { type, channel, onChannelChange, audience, onAudienceChange, onContinue } = props

  return (
    <div>
      <h3 className="text-xs mb-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>Select audience</h3>
      <p className="text-[11px] mb-5" style={{ color: 'var(--t4)' }}>Choose who receives this campaign</p>

      {/* Type-specific audience selector */}
      <div className="mb-5">
        {type === 'REACTIVATION' && (
          <ReactivationAudience clubId={props.clubId} inactivityDays={props.inactivityDays} onDaysChange={props.onInactivityDaysChange} onAudienceChange={onAudienceChange} />
        )}
        {(type === 'SLOT_FILLER' || type === 'EVENT_INVITE') && (
          <SessionAudience clubId={props.clubId} sessionId={props.sessionId} onSessionIdChange={props.onSessionIdChange} onAudienceChange={onAudienceChange} />
        )}
        {(type === 'CHECK_IN' || type === 'RETENTION_BOOST') && (
          <HealthAudience clubId={props.clubId} riskSegment={props.riskSegment} onSegmentChange={props.onRiskSegmentChange} onAudienceChange={onAudienceChange} defaultSegment={type === 'CHECK_IN' ? 'watch' : 'at_risk'} />
        )}
        {type === 'NEW_MEMBER_WELCOME' && (
          <NewMemberAudience clubId={props.clubId} onAudienceChange={onAudienceChange} />
        )}
      </div>

      {/* Channel picker */}
      <div className="mb-5">
        <div className="text-[11px] mb-2" style={{ color: 'var(--t3)', fontWeight: 600 }}>Channel</div>
        <div className="flex gap-2">
          {CHANNEL_OPTIONS.map(opt => {
            const Icon = opt.icon
            const active = channel === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => onChannelChange(opt.value)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-all"
                style={{
                  background: active ? 'rgba(139,92,246,0.15)' : 'var(--subtle)',
                  border: `1px solid ${active ? '#8B5CF6' : 'transparent'}`,
                  color: active ? '#8B5CF6' : 'var(--t2)',
                  fontWeight: active ? 700 : 500,
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--card-border)' }}>
        {audience.count > 0 && (
          <span className="px-2.5 py-1 rounded-full text-[10px]" style={{ background: 'rgba(139,92,246,0.15)', color: '#8B5CF6', fontWeight: 700 }}>
            {audience.count} members
          </span>
        )}
        <div className="flex-1" />
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          disabled={audience.count === 0}
          onClick={onContinue}
          className="px-5 py-2 rounded-xl text-xs text-white"
          style={{
            background: audience.count > 0 ? 'linear-gradient(135deg, #8B5CF6, #06B6D4)' : 'var(--subtle)',
            fontWeight: 600,
            opacity: audience.count > 0 ? 1 : 0.5,
            cursor: audience.count > 0 ? 'pointer' : 'not-allowed',
          }}
        >
          Continue
        </motion.button>
      </div>
    </div>
  )
}
