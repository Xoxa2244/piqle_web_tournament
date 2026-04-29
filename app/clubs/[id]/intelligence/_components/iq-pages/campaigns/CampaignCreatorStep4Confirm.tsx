'use client'

import React from 'react'
import { motion } from 'motion/react'
import { Send, CheckCircle, AlertCircle, ArrowLeft, Loader2 } from 'lucide-react'
import { useTheme } from '../../IQThemeProvider'
import type { CampaignCreatorState } from './useCampaignCreator'
import { CampaignAudiencePreviewList } from './CampaignAudiencePreviewList'

interface Step4Props {
  clubId: string
  state: CampaignCreatorState
  onSend: () => void
  isSending: boolean
  result: { sent: number; failed: number; skipped: number } | null
  error: string | null
  onBack: () => void
}

const TYPE_LABELS: Record<string, string> = {
  CHECK_IN: 'Check-in',
  RETENTION_BOOST: 'Retention Boost',
  REACTIVATION: 'Reactivation',
  SLOT_FILLER: 'Slot Filler',
  EVENT_INVITE: 'Event Invite',
  NEW_MEMBER_WELCOME: 'Welcome',
}

export function CampaignCreatorStep4Confirm({ clubId, state, onSend, isSending, result, error, onBack }: Step4Props) {
  const { isDark } = useTheme()

  // Success state
  if (result && !error) {
    return (
      <div className="flex flex-col items-center py-8">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }}>
          <CheckCircle className="w-14 h-14" style={{ color: '#10B981' }} />
        </motion.div>
        <motion.h3 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-sm mt-4 mb-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>
          Campaign sent!
        </motion.h3>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="text-xs text-center" style={{ color: 'var(--t3)' }}>
          {result.sent} members will receive your message
          {result.failed > 0 && <span style={{ color: '#EF4444' }}> ({result.failed} failed)</span>}
          {result.skipped > 0 && <span> ({result.skipped} skipped)</span>}
        </motion.p>
      </div>
    )
  }

  // Sending state
  if (isSending) {
    return (
      <div className="flex flex-col items-center py-12">
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: '#8B5CF6' }} />
        <p className="text-xs mt-4" style={{ color: 'var(--t3)', fontWeight: 600 }}>
          Sending to {state.audience.count} members...
        </p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="py-6">
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl mb-4" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#EF4444' }} />
          <div>
            <div className="text-xs" style={{ color: '#EF4444', fontWeight: 600 }}>Failed to send campaign</div>
            <div className="text-[11px] mt-0.5" style={{ color: '#EF4444', opacity: 0.8 }}>{error}</div>
          </div>
        </div>
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={onSend} className="w-full px-5 py-2.5 rounded-xl text-xs text-white" style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 600 }}>
          Try Again
        </motion.button>
      </div>
    )
  }

  // Confirmation state
  return (
    <div>
      <h3 className="text-xs mb-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>Review & send</h3>
      <p className="text-[11px] mb-5" style={{ color: 'var(--t4)' }}>Confirm the details before sending</p>

      {/* Summary card */}
      <div className="rounded-xl p-4 mb-5" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'var(--t3)' }}>Type</span>
            <span className="px-2 py-0.5 rounded-md text-[10px]" style={{ background: 'rgba(139,92,246,0.15)', color: '#8B5CF6', fontWeight: 700 }}>
              {TYPE_LABELS[state.type ?? ''] ?? state.type}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'var(--t3)' }}>Audience</span>
            <span style={{ color: 'var(--heading)', fontWeight: 600 }}>{state.audience.count} members</span>
          </div>
          {state.audience.label && (
            <div className="text-xs" style={{ color: 'var(--t2)' }}>
              {state.audience.label}
            </div>
          )}
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'var(--t3)' }}>Channel</span>
            <span style={{ color: 'var(--heading)', fontWeight: 600 }}>{state.channel}</span>
          </div>
        </div>
      </div>

      <div className="space-y-4 mb-5">
        <CampaignAudiencePreviewList
          members={state.audience.previewMembers}
          title="Recipients who will receive this campaign"
          emptyText="No recipients selected"
          compact
        />

        {state.message.subject && (
          <div className="rounded-xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
            <div className="text-[11px] mb-1" style={{ color: 'var(--t3)', fontWeight: 600 }}>
              Email subject
            </div>
            <div className="text-xs" style={{ color: 'var(--heading)', fontWeight: 700 }}>
              {state.message.subject}
            </div>
          </div>
        )}

        {state.message.body && (
          <div className="rounded-xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
            <div className="text-[11px] mb-2" style={{ color: 'var(--t3)', fontWeight: 600 }}>
              Email body
            </div>
            <div className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--t2)' }}>
              {state.message.body}
            </div>
          </div>
        )}

        {state.message.smsBody && (
          <div className="rounded-xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
            <div className="text-[11px] mb-2" style={{ color: 'var(--t3)', fontWeight: 600 }}>
              SMS copy
            </div>
            <div className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--t2)' }}>
              {state.message.smsBody}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-xs transition-colors" style={{ color: 'var(--t3)' }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onSend}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs text-white"
          style={{
            background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
            fontWeight: 700,
            boxShadow: '0 4px 15px rgba(139,92,246,0.3)',
          }}
        >
          <Send className="w-3.5 h-3.5" />
          Send Campaign
        </motion.button>
      </div>
    </div>
  )
}
