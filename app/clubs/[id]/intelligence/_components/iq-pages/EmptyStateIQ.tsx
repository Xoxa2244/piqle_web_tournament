'use client'

import { motion } from 'motion/react'
import { Upload, ArrowRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Props = {
  icon: LucideIcon
  title: string
  description: string
  ctaLabel?: string
  ctaHref?: string
  onCtaClick?: () => void
  secondaryLabel?: string
  secondaryHref?: string
}

export function EmptyStateIQ({
  icon: Icon,
  title,
  description,
  ctaLabel = 'Import Data',
  ctaHref,
  onCtaClick,
  secondaryLabel,
  secondaryHref,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center py-20 px-8 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
        className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
        style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.15))',
          border: '1px solid rgba(139,92,246,0.1)',
        }}
      >
        <Icon className="w-10 h-10" style={{ color: '#8B5CF6' }} />
      </motion.div>

      <h3 className="text-lg mb-2" style={{ fontWeight: 700, color: 'var(--heading)' }}>
        {title}
      </h3>
      <p className="text-sm max-w-md mb-8" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>
        {description}
      </p>

      <div className="flex items-center gap-3">
        {ctaHref ? (
          <a
            href={ctaHref}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm text-white transition-all"
            style={{
              background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
              fontWeight: 600,
              boxShadow: '0 4px 15px rgba(139,92,246,0.3)',
            }}
          >
            <Upload className="w-4 h-4" /> {ctaLabel}
          </a>
        ) : onCtaClick ? (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onCtaClick}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm text-white transition-all"
            style={{
              background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
              fontWeight: 600,
              boxShadow: '0 4px 15px rgba(139,92,246,0.3)',
            }}
          >
            <Upload className="w-4 h-4" /> {ctaLabel}
          </motion.button>
        ) : null}

        {secondaryLabel && secondaryHref && (
          <a
            href={secondaryHref}
            className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm transition-all"
            style={{ color: 'var(--t3)', fontWeight: 500 }}
          >
            {secondaryLabel} <ArrowRight className="w-4 h-4" />
          </a>
        )}
      </div>
    </motion.div>
  )
}
