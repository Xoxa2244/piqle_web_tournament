'use client'

import React from 'react'
import { motion } from 'motion/react'
import { Heart, Shield, UserPlus, Calendar, Megaphone, Sparkles } from 'lucide-react'
import { useTheme } from '../../IQThemeProvider'

interface Step1Props {
  onSelect: (type: string) => void
}

const CAMPAIGN_TYPES = [
  {
    id: 'CHECK_IN',
    icon: Heart,
    color: '#F59E0B',
    title: 'Check-in',
    description: 'Light check-in for watch members',
  },
  {
    id: 'RETENTION_BOOST',
    icon: Shield,
    color: '#F97316',
    title: 'Retention Boost',
    description: 'Outreach for at-risk members',
  },
  {
    id: 'REACTIVATION',
    icon: UserPlus,
    color: '#A855F7',
    title: 'Reactivation',
    description: 'Win back inactive members',
  },
  {
    id: 'SLOT_FILLER',
    icon: Calendar,
    color: '#3B82F6',
    title: 'Slot Filler',
    description: 'Fill underfilled sessions',
  },
  {
    id: 'EVENT_INVITE',
    icon: Megaphone,
    color: '#6366F1',
    title: 'Event Invite',
    description: 'Invite members to events',
  },
  {
    id: 'NEW_MEMBER_WELCOME',
    icon: Sparkles,
    color: '#10B981',
    title: 'Welcome',
    description: 'Welcome new members',
  },
] as const

export function CampaignCreatorStep1Type({ onSelect }: Step1Props) {
  const { isDark } = useTheme()

  return (
    <div>
      <h3 className="text-xs mb-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>Choose campaign type</h3>
      <p className="text-[11px] mb-5" style={{ color: 'var(--t4)' }}>Select what kind of outreach you want to send</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {CAMPAIGN_TYPES.map((t) => {
          const Icon = t.icon
          return (
            <motion.button
              key={t.id}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelect(t.id)}
              className="flex flex-col items-start gap-2.5 p-4 rounded-xl text-left transition-colors"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--card-border)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLElement).style.borderColor = t.color
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--card-border)'
              }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: `${t.color}20` }}
              >
                <Icon className="w-4.5 h-4.5" style={{ color: t.color }} />
              </div>
              <div>
                <div className="text-xs" style={{ fontWeight: 700, color: 'var(--heading)' }}>{t.title}</div>
                <div className="text-[10px] mt-0.5 leading-tight" style={{ color: 'var(--t3)' }}>{t.description}</div>
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
