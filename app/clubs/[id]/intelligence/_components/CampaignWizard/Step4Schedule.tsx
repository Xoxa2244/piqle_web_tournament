'use client'

/**
 * Wizard Step 4 — Schedule + Channel + Launch (P4-T5).
 *
 * Final step. Three send modes (now / scheduled / triggered),
 * channel toggles, preview, send-to-test, Launch CTA.
 *
 * Launch is gated by Live Mode. When Live Mode = OFF (Shadow), the
 * Launch button is disabled with a helper that points the user to
 * Settings → Automation.
 */

import { useState } from 'react'
import { Send, Calendar, Zap, Mail, MessageSquare, AlertTriangle } from 'lucide-react'
import type { ScheduleSettings } from './types'

interface Step4Props {
  schedule: ScheduleSettings
  onChange: (next: ScheduleSettings) => void
  liveMode: 'disabled' | 'shadow' | 'live'
  onLaunch: () => void
  isLaunching: boolean
}

export function Step4Schedule({ schedule, onChange, liveMode, onLaunch, isLaunching }: Step4Props) {
  const [testEmail, setTestEmail] = useState('')

  const isLive = liveMode === 'live'
  const launchDisabled = isLaunching || !isLive

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-bold mb-1" style={{ color: 'var(--heading)' }}>When &amp; how to send</h3>
        <p className="text-xs" style={{ color: 'var(--t3)' }}>Schedule, channel selection, and launch.</p>
      </div>

      {/* Send mode */}
      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>Send mode</label>
        {([
          { mode: 'now' as const, label: 'Send now', icon: Send, hint: 'Immediate send to the entire audience.' },
          { mode: 'scheduled' as const, label: 'Schedule for later', icon: Calendar, hint: 'Pick a date and time.' },
          { mode: 'triggered' as const, label: 'Trigger on condition', icon: Zap, hint: 'Send when a member becomes at-risk, etc. (P5+ wiring)', disabled: true },
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
          <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>Scheduled date & time</label>
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

      {/* Test send */}
      <div>
        <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>Send test to</label>
        <div className="flex gap-2 mt-1">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="admin@yourclub.com"
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--heading)' }}
          />
          <button
            disabled
            title="Test-send wires up alongside real Launch"
            className="px-3 py-2 rounded-lg text-xs opacity-50 cursor-not-allowed"
            style={{ background: 'var(--subtle)', color: 'var(--t3)', fontWeight: 600 }}
          >
            Send test
          </button>
        </div>
      </div>

      {/* Live Mode warning + Launch */}
      {!isLive && (
        <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#F59E0B' }} />
          <div className="text-xs" style={{ color: 'var(--heading)' }}>
            Live Mode is <strong>{liveMode}</strong>. Real sends are blocked.{' '}
            Switch to <strong>Live</strong> in <em>Settings → Automation</em> to launch.
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          onClick={onLaunch}
          disabled={launchDisabled}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm text-white transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 600 }}
        >
          {isLaunching ? '...' : '✅ Launch'}
        </button>
      </div>
    </div>
  )
}
