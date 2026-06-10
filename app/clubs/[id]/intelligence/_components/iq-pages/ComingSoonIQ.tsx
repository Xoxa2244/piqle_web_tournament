'use client'

/**
 * ComingSoonIQ — branded placeholder for sections muted on the lean build.
 *
 * sol2-lean trims the product surface to the core sections (Dashboard,
 * Schedule, Programming Health, Membership Health, AI Advisor, Members,
 * Billing). Every other /intelligence/* route is intercepted by the
 * IntelligenceLayout gate and renders this screen instead of the page.
 * The underlying pages and server code stay in the tree untouched, so
 * re-enabling a section is a one-line allowlist change in layout.tsx.
 */

import { motion } from 'motion/react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Sparkles, ArrowLeft } from 'lucide-react'

export function ComingSoonIQ({ sectionLabel }: { sectionLabel: string }) {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const clubId = (params?.id as string) || ''
  const demoSuffix = searchParams?.get('demo') === 'true' ? '?demo=true' : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center text-center px-8"
      style={{ minHeight: '60vh' }}
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
        <Sparkles className="w-10 h-10" style={{ color: '#8B5CF6' }} />
      </motion.div>

      <span
        className="text-[10px] tracking-[0.2em] uppercase mb-3 px-3 py-1 rounded-full"
        style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA', fontWeight: 700 }}
      >
        Coming soon
      </span>

      <h3 className="text-xl mb-2" style={{ fontWeight: 700, color: 'var(--heading)' }}>
        {sectionLabel} is on the way
      </h3>
      <p className="text-sm max-w-md mb-8" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>
        We&apos;re polishing this section. It will unlock in an upcoming
        release — your data is already being collected, so it will be ready
        on day one.
      </p>

      <motion.button
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => router.push(`/clubs/${clubId}/intelligence${demoSuffix}`)}
        className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm text-white transition-all"
        style={{
          background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
          fontWeight: 600,
          boxShadow: '0 4px 15px rgba(139,92,246,0.3)',
        }}
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </motion.button>
    </motion.div>
  )
}
