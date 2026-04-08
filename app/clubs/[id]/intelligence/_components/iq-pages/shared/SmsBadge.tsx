'use client'

import { Smartphone } from 'lucide-react'

/** SMS badge — active (A2P verified) */
export function SmsBadge({ size = 'sm', active }: { size?: 'sm' | 'xs'; active?: boolean }) {
  const px = size === 'sm' ? 'px-2.5 py-1' : 'px-2 py-0.5'
  const text = size === 'sm' ? 'text-[10px]' : 'text-[9px]'
  return (
    <span
      className={`${px} rounded-lg ${text} flex items-center gap-1`}
      style={{
        background: active ? 'rgba(16,185,129,0.1)' : 'rgba(139,92,246,0.1)',
        color: active ? '#10B981' : '#8B5CF6',
        fontWeight: 600,
      }}
      title="SMS available (A2P verified)"
    >
      <Smartphone className="w-3 h-3" /> SMS
    </span>
  )
}

/** @deprecated Use SmsBadge instead */
export const SmsComingSoon = SmsBadge

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
