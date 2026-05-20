'use client'

/**
 * LeaguesDrawer — wraps LeaguesIQ in a right-side drawer.
 *
 * Per DASHBOARD_AND_ACTION_CENTER_SPEC.md v1.3 §8.3 — Leagues is no
 * longer a top-level sidebar pick. It's a *form* of programming
 * (Tier 2), not a separate section, so the read-only league catalogue
 * lives inside Programming IQ as a drawer that opens from the toolbar.
 *
 * The wrapper:
 *   1. Reuses the existing LeaguesIQ component verbatim (no rewrite,
 *      no logic duplication).
 *   2. Mirrors the opacity treatment from PeriodComparisonDrawer:
 *      solid var(--page-bg) under the card layer + blurred backdrop,
 *      so themes with semi-transparent --card-bg don't leak through.
 *   3. Closes on backdrop click or Esc.
 *
 * The drawer is wide (max 960px) — the LeaguesIQ table needs room
 * for status, sponsors, fill rate and the 5-session drilldown.
 */

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X } from 'lucide-react'
import { LeaguesIQ } from './iq-pages/LeaguesIQ'

interface Props {
  open: boolean
  onClose: () => void
  clubId: string
}

export function LeaguesDrawer({ open, onClose, clubId }: Props) {
  // Esc to close — matches PeriodComparisonDrawer convention.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — opaque enough that Programming IQ content behind
              the drawer doesn't bleed through; matches the opacity fix
              applied to PeriodComparisonDrawer (Spec v1.2 UI fix). */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40"
            style={{
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-[960px] overflow-y-auto"
            style={{
              backgroundColor: 'var(--page-bg)',
              backgroundImage: 'linear-gradient(var(--card-bg), var(--card-bg))',
              borderLeft: '1px solid var(--card-border)',
              boxShadow: '-8px 0 24px rgba(0,0,0,0.35)',
            }}
          >
            {/* Close button (LeaguesIQ has its own header, so we only
                add a discrete close affordance here). */}
            <button
              type="button"
              onClick={onClose}
              className="fixed z-10 p-1.5 rounded-lg hover:bg-white/5"
              style={{
                color: 'var(--t3)',
                top: 16,
                right: 16,
              }}
              aria-label="Close Leagues drawer"
            >
              <X className="w-5 h-5" />
            </button>

            <LeaguesIQ clubId={clubId} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
