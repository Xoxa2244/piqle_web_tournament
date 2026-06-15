'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import {
  CalendarRange,
  CheckCircle2,
  Clock3,
  Database,
  HelpCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useTheme } from '../../IQThemeProvider'

const stages = [
  {
    icon: LockKeyhole,
    title: '1. Connect read-only access',
    body: 'Use the CourtReserve API username and password from Settings > API. IQSport imports data from CourtReserve and never writes changes back.',
    color: '#3B82F6',
  },
  {
    icon: Database,
    title: '2. Build the operating layer',
    body: 'We sync courts, membership types, members, reservations, events, registrations, and waitlists with idempotent upserts so reruns stay safe.',
    color: '#8B5CF6',
  },
  {
    icon: CalendarRange,
    title: '3. Prioritize recent and upcoming data',
    body: 'The first pass focuses on recent history plus the next month of scheduled activity so dashboards and agent recommendations become useful quickly.',
    color: '#06B6D4',
  },
  {
    icon: Clock3,
    title: '4. Backfill history in phases',
    body: 'Older months are pulled in resumable windows until roughly one year of history is covered. If CourtReserve returns a rate-limit wait, we pause the connector and resume automatically.',
    color: '#F59E0B',
  },
  {
    icon: RefreshCw,
    title: '5. Keep it fresh',
    body: 'After the initial backfill completes, regular incremental syncs keep the last week and upcoming month current for daily operations.',
    color: '#10B981',
  },
]

export function CourtReserveHowItWorksButton({
  align = 'left',
  size = 'md',
}: {
  align?: 'left' | 'right'
  size?: 'sm' | 'md'
}) {
  const { isDark } = useTheme()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const modalSurface = isDark ? '#12172A' : '#FFFFFF'
  const modalInset = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)'
  const modalBorder = isDark ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.10)'

  const modal = mounted ? createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[120]"
            style={{ background: 'rgba(2,6,23,0.78)', backdropFilter: 'blur(8px)' }}
          />
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl pointer-events-auto"
              role="dialog"
              aria-modal="true"
              aria-labelledby="courtreserve-how-it-works-title"
              style={{
                background: modalSurface,
                border: `1px solid ${modalBorder}`,
                boxShadow: '0 28px 80px rgba(0,0,0,0.42)',
              }}
            >
              <div className="flex items-start justify-between gap-4 px-5 py-4" style={{ borderBottom: `1px solid ${modalBorder}` }}>
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)' }}
                  >
                    <ShieldCheck className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 id="courtreserve-how-it-works-title" className="text-lg" style={{ color: 'var(--heading)', fontWeight: 800, margin: 0 }}>
                      How CourtReserve sync works
                    </h2>
                    <p className="text-sm mt-1" style={{ color: 'var(--t3)', lineHeight: 1.5 }}>
                      IQSport connects once, imports the highest-value data first, then fills older history as the CourtReserve API allows.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-xl transition-colors"
                  aria-label="Close"
                  style={{ color: 'var(--t3)', background: modalInset }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5">
                <div className="space-y-3">
                  {stages.map((stage) => {
                    const Icon = stage.icon
                    return (
                      <div
                        key={stage.title}
                        className="flex gap-3 rounded-xl p-4"
                        style={{ background: modalInset, border: `1px solid ${modalBorder}` }}
                      >
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: `${stage.color}18`, color: stage.color }}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm" style={{ color: 'var(--heading)', fontWeight: 700, margin: 0 }}>
                            {stage.title}
                          </p>
                          <p className="text-xs mt-1" style={{ color: 'var(--t3)', lineHeight: 1.55, marginBottom: 0 }}>
                            {stage.body}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div
                  className="mt-4 rounded-xl p-4 flex gap-3"
                  style={{ background: isDark ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.20)' }}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#10B981' }} />
                  <p className="text-xs" style={{ color: 'var(--t3)', lineHeight: 1.55, margin: 0 }}>
                    You can leave the page after connecting. Sync status stays visible in Integrations, and paused phases resume through the existing connector schedule.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  ) : null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 rounded-xl transition-all ${align === 'right' ? 'ml-auto' : ''}`}
        style={{
          padding: size === 'sm' ? '8px 11px' : '9px 13px',
          background: isDark ? 'rgba(59,130,246,0.10)' : 'rgba(59,130,246,0.08)',
          border: '1px solid rgba(59,130,246,0.22)',
          color: '#60A5FA',
          fontSize: size === 'sm' ? 12 : 13,
          fontWeight: 700,
        }}
      >
        <HelpCircle className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        How does it work?
      </button>
      {modal}
    </>
  )
}
