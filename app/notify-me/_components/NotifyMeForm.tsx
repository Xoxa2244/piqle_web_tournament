'use client'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const SHORT_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const FORMATS = [
  { value: 'OPEN_PLAY', label: 'Open Play' },
  { value: 'CLINIC', label: 'Clinic' },
  { value: 'DRILL', label: 'Drills' },
  { value: 'LEAGUE_PLAY', label: 'Doubles / League' },
  { value: 'SOCIAL', label: 'Social' },
]
const TIMES = [
  { key: 'morning' as const, label: '☀️ Morning', sub: 'Before noon' },
  { key: 'afternoon' as const, label: '🌤 Afternoon', sub: '12–5pm' },
  { key: 'evening' as const, label: '🌙 Evening', sub: 'After 5pm' },
]

type Props = {
  token: string
  memberName: string
  clubName: string
  existing?: { preferredDays: string[]; preferredFormats: string[]; preferredTimeSlots: { morning: boolean; afternoon: boolean; evening: boolean } }
}

export function NotifyMeForm({ token, memberName, clubName, existing }: Props) {
  const [days, setDays] = useState<string[]>(existing?.preferredDays || [])
  const [formats, setFormats] = useState<string[]>(existing?.preferredFormats || [])
  const [times, setTimes] = useState({
    morning: existing?.preferredTimeSlots?.morning ?? false,
    afternoon: existing?.preferredTimeSlots?.afternoon ?? false,
    evening: existing?.preferredTimeSlots?.evening ?? false,
  })
  const [done, setDone] = useState(false)

  const submit = trpc.intelligence.submitInterestRequest.useMutation({
    onSuccess: () => setDone(true),
  })

  const toggle = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]

  if (done) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ background: '#111118', border: '1px solid rgba(139,92,246,0.3)' }}>
        <div className="text-5xl mb-4">🎾</div>
        <div className="text-xl font-bold text-white mb-2">You're on the list!</div>
        <div className="text-sm mb-4" style={{ color: '#9CA3AF' }}>
          We'll ping you as soon as a matching session opens at <span className="text-white font-semibold">{clubName}</span>.
        </div>
        <div className="text-xs px-3 py-2 rounded-xl inline-block" style={{ background: 'rgba(16,185,129,0.1)', color: '#34D399' }}>
          ✓ Preferences saved
        </div>
      </div>
    )
  }

  const hasSelection = days.length > 0 || formats.length > 0 || Object.values(times).some(Boolean)

  return (
    <div className="rounded-2xl p-6 space-y-6" style={{ background: '#111118', border: '1px solid #1F2937' }}>
      <div>
        <div className="text-lg font-bold text-white mb-1">Hey {memberName.split(' ')[0]}! 👋</div>
        <div className="text-sm" style={{ color: '#9CA3AF' }}>
          Tell us when you'd like to play and we'll notify you the moment a matching session opens up.
        </div>
      </div>

      {/* Days */}
      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold mb-3" style={{ color: '#6B7280' }}>
          Preferred Days
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map((day, i) => (
            <button key={day} onClick={() => setDays(toggle(days, day))}
              className="py-2 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: days.includes(day) ? 'rgba(139,92,246,0.8)' : '#1F2937',
                color: days.includes(day) ? 'white' : '#9CA3AF',
              }}>
              {SHORT_DAYS[i]}
            </button>
          ))}
        </div>
      </div>

      {/* Time slots */}
      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold mb-3" style={{ color: '#6B7280' }}>
          Preferred Time
        </div>
        <div className="grid grid-cols-3 gap-2">
          {TIMES.map(t => (
            <button key={t.key} onClick={() => setTimes(prev => ({ ...prev, [t.key]: !prev[t.key] }))}
              className="py-3 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: times[t.key] ? 'rgba(139,92,246,0.8)' : '#1F2937',
                color: times[t.key] ? 'white' : '#9CA3AF',
              }}>
              <div>{t.label}</div>
              <div className="text-[10px] mt-0.5 opacity-70">{t.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Formats */}
      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold mb-3" style={{ color: '#6B7280' }}>
          Type of Play
        </div>
        <div className="flex flex-wrap gap-2">
          {FORMATS.map(f => (
            <button key={f.value} onClick={() => setFormats(toggle(formats, f.value))}
              className="py-1.5 px-3 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: formats.includes(f.value) ? 'rgba(139,92,246,0.8)' : '#1F2937',
                color: formats.includes(f.value) ? 'white' : '#9CA3AF',
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => submit.mutate({ token, preferredDays: days, preferredFormats: formats, preferredTimeSlots: times })}
        disabled={submit.isPending || !hasSelection}
        className="w-full py-3.5 rounded-xl font-bold text-sm transition-all"
        style={{
          background: hasSelection ? 'linear-gradient(135deg, #7C3AED, #6D28D9)' : '#1F2937',
          color: hasSelection ? 'white' : '#4B5563',
          cursor: hasSelection ? 'pointer' : 'not-allowed',
        }}>
        {submit.isPending ? 'Saving…' : 'Notify Me When Ready →'}
      </button>

      {submit.isError && (
        <div className="text-xs text-center" style={{ color: '#F87171' }}>
          {(submit.error as any)?.message || 'Something went wrong. Please try again.'}
        </div>
      )}
    </div>
  )
}
