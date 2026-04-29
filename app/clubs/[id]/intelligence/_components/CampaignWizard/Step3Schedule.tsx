'use client'

/**
 * Wizard Step 3 — Send format + Schedule + Channels.
 *
 * Was Step 4 in the original wizard order. Moved earlier so Step 4
 * (Message) can render 1 vs N message editors based on the selected
 * SendFormat.
 *
 * v1 ships only `one_time`. `sequence` and `recurring` are visible
 * but disabled with a "Coming soon" pill — surfaces the future shape
 * of the product without lying about availability.
 *
 * Launch button lives on Step 4 (Message) — it's the natural final
 * action after writing copy.
 */

import { Send, Calendar, Zap, Mail, MessageSquare, Layers, Repeat } from 'lucide-react'
import type { ScheduleSettings, SendFormat } from './types'

interface Step3Props {
  schedule: ScheduleSettings
  onChange: (next: ScheduleSettings) => void
}

const FORMAT_OPTIONS: Array<{
  key: SendFormat
  label: string
  hint: string
  icon: typeof Send
  disabled?: boolean
  comingSoon?: boolean
}> = [
  {
    key: 'one_time',
    label: 'One-time',
    hint: 'Single email/SMS to the whole audience at once.',
    icon: Send,
  },
  {
    key: 'sequence',
    label: 'Sequence',
    hint: 'Drip series — multiple messages with delays (e.g. day 0, +3, +7).',
    icon: Layers,
    disabled: true,
    comingSoon: true,
  },
  {
    key: 'recurring',
    label: 'Recurring',
    hint: 'Repeats on a schedule — e.g. every Monday at 9am to whoever matches the cohort.',
    icon: Repeat,
    disabled: true,
    comingSoon: true,
  },
]

export function Step3Schedule({ schedule, onChange }: Step3Props) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-bold mb-1" style={{ color: 'var(--heading)' }}>When &amp; how to send</h3>
        <p className="text-xs" style={{ color: 'var(--t3)' }}>Pick a send format, schedule and channels. Step 4 will render the message editor for the format you choose.</p>
      </div>

      {/* Format selector */}
      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>Format</label>
        <div className="grid sm:grid-cols-3 gap-2">
          {FORMAT_OPTIONS.map(({ key, label, hint, icon: Icon, disabled, comingSoon }) => {
            const active = schedule.format === key
            return (
              <button
                key={key}
                onClick={() => !disabled && onChange({ ...schedule, format: key })}
                disabled={disabled}
                className="relative text-left rounded-xl p-3 transition-all flex flex-col gap-1"
                style={{
                  background: active ? 'rgba(139,92,246,0.08)' : 'var(--card-bg)',
                  border: `1px solid ${active ? '#8B5CF6' : 'var(--card-border)'}`,
                  opacity: disabled ? 0.55 : 1,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}
              >
                {comingSoon && (
                  <span
                    className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider"
                    style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B', fontWeight: 700 }}
                  >
                    Soon
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" style={{ color: active ? '#A78BFA' : 'var(--t3)' }} />
                  <span className="text-sm font-bold" style={{ color: 'var(--heading)' }}>{label}</span>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--t4)' }}>{hint}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Send mode (only meaningful for one_time today). */}
      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>When</label>
        {([
          { mode: 'now' as const, label: 'Send right after launch', icon: Send, hint: 'Goes out within minutes of clicking Launch.' },
          { mode: 'scheduled' as const, label: 'Schedule for later', icon: Calendar, hint: 'Pick a date and time.' },
          { mode: 'triggered' as const, label: 'Trigger on condition', icon: Zap, hint: 'Send when a member becomes at-risk, etc. (Phase 6 wiring)', disabled: true },
        ]).map(({ mode, label, icon: Icon, hint, disabled }) => {
          const active = schedule.mode === mode
          return (
            <button
              key={mode}
              onClick={() => !disabled && onChange({ ...schedule, mode })}
              disabled={disabled}
              className="w-full text-left rounded-xl p-3 transition-all flex items-start gap-3"
              style={{
                background: active ? 'rgba(139,92,246,0.08)' : 'var(--card-bg)',
                border: `1px solid ${active ? '#8B5CF6' : 'var(--card-border)'}`,
                opacity: disabled ? 0.4 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: active ? 'rgba(139,92,246,0.18)' : 'var(--subtle)' }}>
                <Icon className="w-4 h-4" style={{ color: active ? '#A78BFA' : 'var(--t3)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold" style={{ color: 'var(--heading)' }}>{label}</div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--t4)' }}>{hint}</div>
              </div>
            </button>
          )
        })}
      </div>

      {schedule.mode === 'scheduled' && (
        <div>
          <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>Scheduled date &amp; time</label>
          <input
            type="datetime-local"
            value={schedule.scheduledAt ?? ''}
            onChange={(e) => onChange({ ...schedule, scheduledAt: e.target.value })}
            className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--heading)' }}
          />
        </div>
      )}

      {/* Channels */}
      <div>
        <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>Channels</label>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => onChange({ ...schedule, channels: { ...schedule.channels, email: !schedule.channels.email } })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
            style={{
              background: schedule.channels.email ? 'rgba(139,92,246,0.18)' : 'var(--subtle)',
              border: `1px solid ${schedule.channels.email ? '#8B5CF6' : 'var(--card-border)'}`,
              color: schedule.channels.email ? '#A78BFA' : 'var(--t3)',
              fontWeight: 600,
            }}
          >
            <Mail className="w-3.5 h-3.5" />
            Email
          </button>
          <button
            onClick={() => onChange({ ...schedule, channels: { ...schedule.channels, sms: !schedule.channels.sms } })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
            style={{
              background: schedule.channels.sms ? 'rgba(16,185,129,0.18)' : 'var(--subtle)',
              border: `1px solid ${schedule.channels.sms ? '#10B981' : 'var(--card-border)'}`,
              color: schedule.channels.sms ? '#10B981' : 'var(--t3)',
              fontWeight: 600,
            }}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            SMS (opted-in only)
          </button>
        </div>
      </div>
    </div>
  )
}
