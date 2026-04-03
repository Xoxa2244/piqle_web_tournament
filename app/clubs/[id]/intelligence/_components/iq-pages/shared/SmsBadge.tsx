'use client'

import { Smartphone } from 'lucide-react'

/** SMS button that shows "Coming Soon" tooltip. Disabled until A2P approval. */
export function SmsComingSoon({ size = 'sm' }: { size?: 'sm' | 'xs' }) {
  const px = size === 'sm' ? 'px-2.5 py-1' : 'px-2 py-0.5'
  const text = size === 'sm' ? 'text-[10px]' : 'text-[9px]'
  return (
    <span
      className={`${px} rounded-lg ${text} flex items-center gap-1 cursor-not-allowed relative group`}
      style={{ background: 'rgba(100,100,100,0.1)', color: 'var(--t4)', fontWeight: 600 }}
      title="SMS coming soon — awaiting A2P approval"
    >
      <Smartphone className="w-3 h-3" /> SMS
      <span className="absolute -top-1 -right-1 px-1 py-px rounded text-[7px] leading-none" style={{ background: '#F59E0B', color: '#000', fontWeight: 700 }}>
        SOON
      </span>
    </span>
  )
}

/** DUPR rating badge with brand blue color */
export function DuprBadge({ rating }: { rating: number }) {
  if (rating <= 0) return null
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-lg flex items-center gap-1"
      style={{ background: 'rgba(0,102,204,0.12)', color: '#0066CC', fontWeight: 700 }}
    >
      <span style={{ fontWeight: 800, fontSize: 8, letterSpacing: 0.5 }}>DUPR</span>
      {rating.toFixed(1)}
    </span>
  )
}
