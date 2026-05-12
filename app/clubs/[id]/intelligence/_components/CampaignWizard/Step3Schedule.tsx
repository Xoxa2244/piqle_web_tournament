'use client'

/**
 * Wizard Step 3 — Send format + Schedule + Channels.
 *
 * Was Step 4 in the original wizard order. Moved earlier so Step 4
 * (Message) can render 1 vs N message editors based on the selected
 * SendFormat.
 *
 * Launch button lives on Step 4 (Message) — it's the natural final
 * action after writing copy.
 */

import { Send, Calendar, Zap, Mail, MessageSquare, Layers, Repeat } from 'lucide-react'
import type { ScheduleSettings, SendFormat, RecurringFrequency } from './types'
import { buildRecurringCron } from './types'

/** Curated dropdown of timezones admins are likely to need. UTC at the
 *  top, then North America (clubs are mostly there), then Europe and
 *  Asia/Pacific. "Use browser timezone" reads Intl at click time so
 *  it always reflects the current setup, not the SSR default. */
const TIMEZONE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Toronto', label: 'Eastern (Toronto)' },
  { value: 'America/Vancouver', label: 'Pacific (Vancouver)' },
  { value: 'America/Mexico_City', label: 'Mexico City' },
  { value: 'America/Sao_Paulo', label: 'São Paulo' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Europe/Moscow', label: 'Moscow' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Shanghai', label: 'Shanghai' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Pacific/Auckland', label: 'Auckland' },
]

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

function padHour(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`
}

function ordinalDay(day: number) {
  const mod100 = day % 100
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`
  switch (day % 10) {
    case 1: return `${day}st`
    case 2: return `${day}nd`
    case 3: return `${day}rd`
    default: return `${day}th`
  }
}

function getTimezoneLabel(timezone: string) {
  return TIMEZONE_OPTIONS.find((option) => option.value === timezone)?.label ?? timezone
}

function describeRecurringSchedule(schedule: ScheduleSettings) {
  const timezone = schedule.recurringTimezone ?? 'UTC'
  const time = padHour(Math.max(0, Math.min(23, schedule.recurringHour ?? 9)))

  switch (schedule.recurringFrequency) {
    case 'interval_minutes': {
      const minutes = Math.max(1, Math.min(59, schedule.recurringIntervalMinutes ?? 10))
      return `Runs every ${minutes} minute${minutes === 1 ? '' : 's'}. Good for QA on cron-enabled environments.`
    }
    case 'daily':
      return `Runs every day at ${time} (${getTimezoneLabel(timezone)}).`
    case 'monthly': {
      const day = Math.max(1, Math.min(28, schedule.recurringDayOfMonth ?? 1))
      return `Runs on the ${ordinalDay(day)} of every month at ${time} (${getTimezoneLabel(timezone)}).`
    }
    case 'weekly':
    default: {
      const dayOfWeek = Math.max(0, Math.min(6, schedule.recurringDayOfWeek ?? 1))
      return `Runs every ${WEEKDAY_LABELS[dayOfWeek]} at ${time} (${getTimezoneLabel(timezone)}).`
    }
  }
}

interface Step3Props {
  schedule: ScheduleSettings
  onChange: (next: ScheduleSettings) => void
}

const FORMAT_OPTIONS: Array<{
  key: SendFormat
  label: string
  hint: string
  icon: typeof Send
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
  },
  {
    key: 'recurring',
    label: 'Recurring',
    hint: 'Repeats on a schedule — e.g. every Monday at 9am to whoever matches the cohort.',
    icon: Repeat,
  },
]

export function Step3Schedule({ schedule, onChange }: Step3Props) {
  const recurringCron = buildRecurringCron(schedule)
  const recurringSummary = describeRecurringSchedule(schedule)

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
          {FORMAT_OPTIONS.map(({ key, label, hint, icon: Icon }) => {
            const active = schedule.format === key
            return (
              <div key={key} className="h-full">
                <button
                  onClick={() => onChange({ ...schedule, format: key })}
                  className="relative text-left rounded-xl p-3 transition-all flex h-full w-full flex-col gap-1"
                  style={{
                    background: active ? 'rgba(139,92,246,0.08)' : 'var(--card-bg)',
                    border: `1px solid ${active ? '#8B5CF6' : 'var(--card-border)'}`,
                    cursor: 'pointer',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" style={{ color: active ? '#A78BFA' : 'var(--t3)' }} />
                    <span className="text-sm font-bold" style={{ color: 'var(--heading)' }}>{label}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'var(--t4)' }}>{hint}</p>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recurring schedule editor — visible only when format='recurring'.
          UI generates a cron expression from a structured frequency
          selector. Custom cron text input is not in MVP. */}
      {schedule.format === 'recurring' && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <div className="flex items-center gap-2">
            <Repeat className="w-4 h-4" style={{ color: '#A78BFA' }} />
            <span className="text-sm font-bold" style={{ color: 'var(--heading)' }}>Recurring schedule</span>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>Frequency</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
              {(['interval_minutes', 'daily', 'weekly', 'monthly'] as RecurringFrequency[]).map((f) => {
                const active = (schedule.recurringFrequency ?? 'weekly') === f
                const label = f === 'interval_minutes' ? 'Every N min' : f
                return (
                  <button
                    key={f}
                    onClick={() => onChange({ ...schedule, recurringFrequency: f })}
                    className="px-3 py-2 rounded-lg text-xs transition-all"
                    style={{
                      background: active ? 'rgba(139,92,246,0.18)' : 'var(--subtle)',
                      border: `1px solid ${active ? '#8B5CF6' : 'var(--card-border)'}`,
                      color: active ? '#A78BFA' : 'var(--heading)',
                      fontWeight: 600,
                      textTransform: f === 'interval_minutes' ? 'none' : 'capitalize',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {schedule.recurringFrequency === 'interval_minutes' && (
            <div>
              <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>Interval (minutes)</label>
              <input
                type="number"
                min={1}
                max={59}
                value={schedule.recurringIntervalMinutes ?? 10}
                onChange={(e) => onChange({ ...schedule, recurringIntervalMinutes: Math.max(1, Math.min(59, Number(e.target.value) || 1)) })}
                className="mt-1 w-24 px-3 py-2 rounded-lg text-sm outline-none text-center"
                style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--heading)' }}
              />
              <div className="text-[10px] mt-1" style={{ color: 'var(--t4)' }}>
                Useful for fast QA. Automatic sends still depend on cron actually running in the current environment.
              </div>
            </div>
          )}

          {schedule.recurringFrequency === 'weekly' && (
            <div>
              <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>Day of week</label>
              <div className="grid grid-cols-7 gap-1 mt-1">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => {
                  const active = (schedule.recurringDayOfWeek ?? 1) === i
                  return (
                    <button
                      key={d}
                      onClick={() => onChange({ ...schedule, recurringDayOfWeek: i })}
                      className="px-1 py-1.5 rounded-lg text-[11px] transition-all"
                      style={{
                        background: active ? 'rgba(139,92,246,0.18)' : 'var(--subtle)',
                        border: `1px solid ${active ? '#8B5CF6' : 'var(--card-border)'}`,
                        color: active ? '#A78BFA' : 'var(--heading)',
                        fontWeight: 600,
                      }}
                    >
                      {d}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {schedule.recurringFrequency === 'monthly' && (
            <div>
              <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>Day of month (1–28)</label>
              <input
                type="number"
                min={1}
                max={28}
                value={schedule.recurringDayOfMonth ?? 1}
                onChange={(e) => onChange({ ...schedule, recurringDayOfMonth: Math.max(1, Math.min(28, Number(e.target.value) || 1)) })}
                className="mt-1 w-20 px-3 py-2 rounded-lg text-sm outline-none text-center"
                style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--heading)' }}
              />
              <div className="text-[10px] mt-1" style={{ color: 'var(--t4)' }}>
                Capped at 28 — months with fewer days would otherwise skip a run.
              </div>
            </div>
          )}

          {schedule.recurringFrequency !== 'interval_minutes' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>Hour (24h)</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={schedule.recurringHour ?? 9}
                  onChange={(e) => onChange({ ...schedule, recurringHour: Math.max(0, Math.min(23, Number(e.target.value) || 0)) })}
                  className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--heading)' }}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>Timezone</label>
                <select
                  value={(() => {
                    const cur = schedule.recurringTimezone ?? 'UTC'
                    return TIMEZONE_OPTIONS.some((o) => o.value === cur) ? cur : 'UTC'
                  })()}
                  onChange={(e) => {
                    if (e.target.value === '__browser__') {
                      try {
                        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
                        onChange({ ...schedule, recurringTimezone: browserTz || 'UTC' })
                      } catch {
                        onChange({ ...schedule, recurringTimezone: 'UTC' })
                      }
                    } else {
                      onChange({ ...schedule, recurringTimezone: e.target.value })
                    }
                  }}
                  className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--heading)' }}
                >
                  {TIMEZONE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                  <option value="__browser__">— Use browser timezone —</option>
                </select>
              </div>
            </div>
          )}

          <div className="rounded-lg p-2 text-[11px] space-y-1" style={{ background: 'var(--subtle)', color: 'var(--t3)' }}>
            <div>
              <span style={{ color: 'var(--heading)', fontWeight: 600 }}>{recurringSummary}</span>
            </div>
            <div>
              <span style={{ color: 'var(--t4)' }}>Technical schedule:</span>{' '}
              <code style={{ color: 'var(--heading)', fontWeight: 600 }}>{recurringCron ?? '—'}</code>
            </div>
          </div>

          <div className="text-[11px] leading-relaxed" style={{ color: 'var(--t4)' }}>
            Each time this runs, the cohort is checked again. Only members who match the filters at that moment will get the message. If someone no longer matches, they are skipped for that run and can be included again later if they qualify.
          </div>
        </div>
      )}

      {/* Send mode for one-time and sequence campaigns. */}
      {schedule.format !== 'recurring' && (
      <>
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
      </>
      )}

      {/* Sequence-only: exit-on-booking toggle. When ON, the runner stops
          sending follow-up steps to a recipient who books a session
          between steps. Mirrors Tier 1 conditional follow-up behaviour. */}
      {schedule.format === 'sequence' && (
        <div className="rounded-xl p-3 flex items-start gap-3" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <input
            type="checkbox"
            checked={schedule.exitOnBooking}
            onChange={(e) => onChange({ ...schedule, exitOnBooking: e.target.checked })}
            className="mt-0.5 w-4 h-4 cursor-pointer"
          />
          <label className="text-xs cursor-pointer flex-1" onClick={() => onChange({ ...schedule, exitOnBooking: !schedule.exitOnBooking })}>
            <span style={{ color: 'var(--heading)', fontWeight: 600 }}>Stop the series if the recipient books a session</span>
            <span className="block mt-0.5" style={{ color: 'var(--t4)' }}>
              Recommended on. Avoids nagging members who already responded by booking. Does not pause the campaign for everyone — only that one recipient.
            </span>
          </label>
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
