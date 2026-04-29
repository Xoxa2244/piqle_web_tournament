'use client'

/**
 * Member Detail side-drawer.
 *
 * P2-T4 (see docs/ENGAGE_REDESIGN_SPEC.md §4) — slide-in drawer that
 * wraps the existing PlayerProfileIQ component. Replaces the previous
 * full-page navigation pattern. URL stays on /members but adds
 * `?member=<userId>` for shareability + browser back support.
 *
 * Cross-cutting concern CC-2: this drawer becomes the single source
 * of truth for member detail across Members / Cohorts / Campaigns
 * (any list view that wants to drill into a member uses this).
 */

import React, { useEffect, type MouseEvent } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X } from 'lucide-react'
import { PlayerProfileIQ } from './iq-pages/PlayerProfileIQ'

interface MemberDetailDrawerProps {
  /** When non-null, the drawer is open with the given userId. */
  memberId: string | null
  clubId: string
  onClose: () => void
}

export function MemberDetailDrawer({ memberId, clubId, onClose }: MemberDetailDrawerProps) {
  const isOpen = !!memberId

  // Esc key closes drawer
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (!isOpen) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [isOpen])

  return (
    <AnimatePresence>
      {isOpen && memberId && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          />

          {/* Drawer panel */}
          <motion.aside
            key="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed top-0 right-0 z-50 h-screen overflow-y-auto"
            style={{
              width: 'min(960px, 100vw)',
              background: 'var(--bg, #0B0B14)',
              borderLeft: '1px solid var(--card-border)',
              boxShadow: '-12px 0 32px rgba(0,0,0,0.35)',
            }}
            // Prevent backdrop click from triggering when clicking inside drawer
            onClick={(e: MouseEvent<HTMLElement>) => e.stopPropagation()}
            aria-label="Member detail panel"
          >
            <div className="flex items-center justify-end p-3 sticky top-0 z-10" style={{ background: 'var(--bg, #0B0B14)' }}>
              <button
                onClick={onClose}
                aria-label="Close member detail"
                className="p-2 rounded-lg transition-colors hover:bg-[var(--hover)]"
                style={{ color: 'var(--t3)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-2 pb-8">
              <PlayerProfileIQ userId={memberId} clubId={clubId} onBack={onClose} />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
