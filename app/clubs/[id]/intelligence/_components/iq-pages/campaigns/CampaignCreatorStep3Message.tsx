'use client'

import React, { useCallback, useEffect } from 'react'
import { motion } from 'motion/react'
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react'
import { useGenerateCampaignMessage } from '../../../_hooks/use-intelligence'
import { CampaignAudiencePreviewList } from './CampaignAudiencePreviewList'
import type { CampaignAudiencePreviewMember, CampaignMessageState } from './useCampaignCreator'

interface Step3Props {
  clubId: string
  type: string
  channel: string
  audienceCount: number
  audienceLabel: string
  previewMembers: CampaignAudiencePreviewMember[]
  message: CampaignMessageState
  onMessageChange: (msg: CampaignMessageState) => void
  onGeneratedMessage: (msg: CampaignMessageState) => void
  context?: {
    sessionTitle?: string
    riskSegment?: string
    inactivityDays?: number
  }
  onContinue: () => void
  onBack: () => void
}

export function CampaignCreatorStep3Message({
  clubId,
  type,
  channel,
  audienceCount,
  audienceLabel,
  previewMembers,
  message,
  onMessageChange,
  onGeneratedMessage,
  context,
  onContinue,
  onBack,
}: Step3Props) {
  const generate = useGenerateCampaignMessage()

  const showEmail = channel === 'email' || channel === 'both'
  const showSms = channel === 'sms' || channel === 'both'

  const handleGenerate = useCallback(() => {
    generate.mutate(
      {
        clubId,
        campaignType: type as 'CHECK_IN' | 'RETENTION_BOOST' | 'REACTIVATION' | 'SLOT_FILLER' | 'EVENT_INVITE' | 'NEW_MEMBER_WELCOME',
        channel: channel as 'email' | 'sms' | 'both',
        audienceCount,
        context,
      },
      {
        onSuccess: (data: any) => {
          onGeneratedMessage({
            subject: data.subject ?? message.subject,
            body: data.body ?? data.emailBody ?? message.body,
            smsBody: data.smsBody ?? message.smsBody,
          })
        },
      }
    )
  }, [audienceCount, channel, clubId, context, generate, message.body, message.smsBody, message.subject, onGeneratedMessage, type])

  useEffect(() => {
    const needsEmailDraft = showEmail && (!message.subject.trim() || !message.body.trim())
    const needsSmsDraft = showSms && !message.smsBody.trim()

    if (!audienceCount || generate.isPending || (!needsEmailDraft && !needsSmsDraft)) {
      return
    }

    handleGenerate()
  }, [audienceCount, generate.isPending, handleGenerate, message.body, message.smsBody, message.subject, showEmail, showSms])

  const canContinue = Boolean(
    (showEmail ? message.subject.trim() && message.body.trim() : true) &&
    (showSms ? message.smsBody.trim() : true)
  )

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-xs mb-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>
            Create your message
          </h3>
          <p className="text-[11px]" style={{ color: 'var(--t4)' }}>
            Generate a draft with AI, then edit it manually before sending to {audienceCount} member{audienceCount !== 1 ? 's' : ''}.
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleGenerate}
          disabled={generate.isPending}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-white shrink-0"
          style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 600 }}
        >
          {generate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {generate.isPending ? 'Generating...' : 'Generate with AI'}
        </motion.button>
      </div>

      <div
        className="rounded-xl p-4 mb-4"
        style={{
          background: 'linear-gradient(135deg, #161E33, #111A2C)',
          border: '1px solid rgba(139,92,246,0.22)',
        }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="w-4 h-4" style={{ color: '#A78BFA' }} />
          <span className="text-xs font-bold" style={{ color: 'var(--heading)' }}>
            One editable draft
          </span>
        </div>
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--t3)' }}>
          AI can suggest the first version of the message, but you stay in control and can rewrite any part before launch.
        </p>
      </div>

      <div className="space-y-3 mb-4">
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        >
          <div className="text-[11px] mb-1" style={{ color: 'var(--t3)', fontWeight: 600 }}>
            Who will receive this campaign
          </div>
          <div className="text-xs" style={{ color: 'var(--heading)', fontWeight: 700 }}>
            {audienceLabel || `${audienceCount} members`}
          </div>
          <div className="text-[11px] mt-1" style={{ color: 'var(--t4)' }}>
            {audienceCount} recipient{audienceCount !== 1 ? 's' : ''} selected
          </div>
        </div>
        <CampaignAudiencePreviewList
          members={previewMembers}
          title="Recipient preview"
          emptyText="Recipients will appear here after the audience is selected"
          compact
        />
      </div>

      <div className="space-y-4">
        {showEmail && (
          <div>
            <label className="block text-[11px] mb-1" style={{ color: 'var(--t3)', fontWeight: 600 }}>
              Subject
            </label>
            <input
              value={message.subject}
              onChange={(e) => onMessageChange({ ...message, subject: e.target.value })}
              placeholder="Email subject line..."
              className="w-full px-3 py-2 rounded-lg text-xs outline-none"
              style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--t1)' }}
            />
          </div>
        )}

        {showEmail && (
          <div>
            <label className="block text-[11px] mb-1" style={{ color: 'var(--t3)', fontWeight: 600 }}>
              Email body
            </label>
            <textarea
              value={message.body}
              onChange={(e) => onMessageChange({ ...message, body: e.target.value })}
              placeholder="Write your email message here..."
              rows={7}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
              style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--t1)', minHeight: 140 }}
            />
          </div>
        )}

        {showSms && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px]" style={{ color: 'var(--t3)', fontWeight: 600 }}>
                SMS body
              </label>
              <span className="text-[10px]" style={{ color: message.smsBody.length > 160 ? '#EF4444' : 'var(--t4)' }}>
                {message.smsBody.length}/160
              </span>
            </div>
            <textarea
              value={message.smsBody}
              onChange={(e) => onMessageChange({ ...message, smsBody: e.target.value })}
              placeholder="Write your SMS here..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
              style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--t1)', minHeight: 84 }}
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 mt-4" style={{ borderTop: '1px solid var(--card-border)' }}>
        <button onClick={onBack} className="flex items-center gap-1 text-xs transition-colors" style={{ color: 'var(--t3)' }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          disabled={!canContinue}
          onClick={onContinue}
          className="px-5 py-2 rounded-xl text-xs text-white"
          style={{
            background: canContinue ? 'linear-gradient(135deg, #8B5CF6, #06B6D4)' : 'var(--subtle)',
            fontWeight: 600,
            opacity: canContinue ? 1 : 0.5,
            cursor: canContinue ? 'pointer' : 'not-allowed',
          }}
        >
          Continue
        </motion.button>
      </div>
    </div>
  )
}
