'use client'

import React, { useState } from 'react'
import { motion } from 'motion/react'
import { Sparkles, Eye, EyeOff, ArrowLeft, Loader2 } from 'lucide-react'
import { useTheme } from '../../IQThemeProvider'
import { useGenerateCampaignMessage } from '../../../_hooks/use-intelligence'

interface Step3Props {
  clubId: string
  type: string
  channel: string
  audienceCount: number
  message: { subject: string; body: string; smsBody: string }
  onMessageChange: (msg: { subject: string; body: string; smsBody: string }) => void
  context?: any
  onContinue: () => void
  onBack: () => void
}

export function CampaignCreatorStep3Message({ clubId, type, channel, audienceCount, message, onMessageChange, context, onContinue, onBack }: Step3Props) {
  const { isDark } = useTheme()
  const [preview, setPreview] = useState(false)
  const generate = useGenerateCampaignMessage()

  const showEmail = channel === 'email' || channel === 'both'
  const showSms = channel === 'sms' || channel === 'both'

  const handleGenerate = () => {
    generate.mutate(
      { clubId, campaignType: type as 'CHECK_IN' | 'RETENTION_BOOST' | 'REACTIVATION' | 'SLOT_FILLER' | 'EVENT_INVITE' | 'NEW_MEMBER_WELCOME', channel: channel as 'email' | 'sms' | 'both', audienceCount, context },
      {
        onSuccess: (data: any) => {
          onMessageChange({
            subject: data.subject ?? message.subject,
            body: data.body ?? data.emailBody ?? message.body,
            smsBody: data.smsBody ?? message.smsBody,
          })
        },
      }
    )
  }

  const previewText = (text: string) => text.replace(/\{\{name\}\}/g, 'Sarah')

  const canContinue = (showEmail ? message.subject.trim() && message.body.trim() : true) && (showSms ? message.smsBody.trim() : true)

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-xs mb-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>Craft your message</h3>
          <p className="text-[11px]" style={{ color: 'var(--t4)' }}>Write or generate with AI</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleGenerate}
          disabled={generate.isPending}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-white"
          style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 600 }}
        >
          {generate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {generate.isPending ? 'AI is crafting...' : 'Generate with AI'}
        </motion.button>
      </div>

      {/* Preview toggle */}
      <button
        onClick={() => setPreview(!preview)}
        className="flex items-center gap-1.5 mb-4 text-[11px] transition-colors"
        style={{ color: '#8B5CF6', fontWeight: 600 }}
      >
        {preview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        {preview ? 'Edit' : 'Preview'}
      </button>

      <div className="space-y-4">
        {/* Subject */}
        {showEmail && (
          <div>
            <label className="block text-[11px] mb-1" style={{ color: 'var(--t3)', fontWeight: 600 }}>Subject</label>
            {preview ? (
              <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--subtle)', color: 'var(--t1)' }}>
                {previewText(message.subject) || 'No subject'}
              </div>
            ) : (
              <input
                value={message.subject}
                onChange={(e) => onMessageChange({ ...message, subject: e.target.value })}
                placeholder="Email subject line..."
                className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                style={{
                  background: 'var(--subtle)',
                  border: '1px solid var(--card-border)',
                  color: 'var(--t1)',
                }}
              />
            )}
          </div>
        )}

        {/* Email body */}
        {showEmail && (
          <div>
            <label className="block text-[11px] mb-1" style={{ color: 'var(--t3)', fontWeight: 600 }}>Email body</label>
            {preview ? (
              <div className="px-3 py-2 rounded-lg text-xs whitespace-pre-wrap" style={{ background: 'var(--subtle)', color: 'var(--t1)', minHeight: 80 }}>
                {previewText(message.body) || 'No body'}
              </div>
            ) : (
              <textarea
                value={message.body}
                onChange={(e) => onMessageChange({ ...message, body: e.target.value })}
                placeholder="Write your email message... Use {{name}} for personalization."
                rows={5}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
                style={{
                  background: 'var(--subtle)',
                  border: '1px solid var(--card-border)',
                  color: 'var(--t1)',
                  minHeight: 80,
                }}
              />
            )}
          </div>
        )}

        {/* SMS body */}
        {showSms && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px]" style={{ color: 'var(--t3)', fontWeight: 600 }}>SMS body</label>
              <span className="text-[10px]" style={{ color: message.smsBody.length > 160 ? '#EF4444' : 'var(--t4)' }}>
                {message.smsBody.length}/160
              </span>
            </div>
            {preview ? (
              <div className="px-3 py-2 rounded-lg text-xs whitespace-pre-wrap" style={{ background: 'var(--subtle)', color: 'var(--t1)', minHeight: 48 }}>
                {previewText(message.smsBody) || 'No SMS body'}
              </div>
            ) : (
              <textarea
                value={message.smsBody}
                onChange={(e) => onMessageChange({ ...message, smsBody: e.target.value })}
                placeholder="Short SMS message... Use {{name}} for personalization."
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
                style={{
                  background: 'var(--subtle)',
                  border: '1px solid var(--card-border)',
                  color: 'var(--t1)',
                  minHeight: 48,
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Footer */}
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
