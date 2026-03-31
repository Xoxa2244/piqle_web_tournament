'use client'

import React, { useState } from 'react'
import { motion } from 'motion/react'
import { Sparkles, Eye, EyeOff, ArrowLeft, Loader2, Wand2, PenLine, User } from 'lucide-react'
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
  /** When true, each member gets their personal AI message from MemberAiProfile */
  usePersonalized?: boolean
  onPersonalizedChange?: (v: boolean) => void
  /** Sample AI messages from member profiles for preview */
  sampleMessages?: { name: string; message: string }[]
  onContinue: () => void
  onBack: () => void
}

export function CampaignCreatorStep3Message({
  clubId, type, channel, audienceCount, message, onMessageChange, context,
  usePersonalized = true, onPersonalizedChange, sampleMessages,
  onContinue, onBack,
}: Step3Props) {
  const { isDark } = useTheme()
  const [preview, setPreview] = useState(false)
  const generate = useGenerateCampaignMessage()
  const [personalized, setPersonalized] = useState(usePersonalized)

  const showEmail = channel === 'email' || channel === 'both'
  const showSms = channel === 'sms' || channel === 'both'

  const togglePersonalized = (v: boolean) => {
    setPersonalized(v)
    onPersonalizedChange?.(v)
  }

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

  // For personalized mode, "continue" is always allowed (messages come from profiles)
  // For custom mode, require message fields to be filled
  const canContinue = personalized
    ? true
    : (showEmail ? message.subject.trim() && message.body.trim() : true) && (showSms ? message.smsBody.trim() : true)

  return (
    <div>
      {/* Mode toggle */}
      <div className="flex items-center gap-2 mb-5 p-1 rounded-xl" style={{ background: 'var(--subtle)' }}>
        <button
          onClick={() => togglePersonalized(true)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs transition-all"
          style={{
            background: personalized ? 'var(--card-bg)' : 'transparent',
            color: personalized ? '#8B5CF6' : 'var(--t4)',
            fontWeight: personalized ? 700 : 500,
            boxShadow: personalized ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          <Wand2 className="w-3.5 h-3.5" />
          AI Personalized
        </button>
        <button
          onClick={() => togglePersonalized(false)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs transition-all"
          style={{
            background: !personalized ? 'var(--card-bg)' : 'transparent',
            color: !personalized ? '#06B6D4' : 'var(--t4)',
            fontWeight: !personalized ? 700 : 500,
            boxShadow: !personalized ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          <PenLine className="w-3.5 h-3.5" />
          Custom Template
        </button>
      </div>

      {personalized ? (
        /* ── AI Personalized Mode ── */
        <div>
          <div className="rounded-xl p-4 mb-4" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(6,182,212,0.05))', border: '1px solid rgba(139,92,246,0.15)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4" style={{ color: '#A78BFA' }} />
              <span className="text-xs font-bold" style={{ color: 'var(--heading)' }}>Each member gets a unique message</span>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--t3)' }}>
              AI has already generated personalized messages based on each member&apos;s play history, preferences, and engagement pattern. Messages are tailored to their archetype and activity level.
            </p>
          </div>

          {/* Sample previews */}
          {sampleMessages && sampleMessages.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>
                Sample messages ({sampleMessages.length} of {audienceCount})
              </p>
              {sampleMessages.slice(0, 3).map((s, i) => (
                <div key={i} className="rounded-lg p-3" style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <User className="w-3 h-3" style={{ color: 'var(--t4)' }} />
                    <span className="text-[10px] font-semibold" style={{ color: '#A78BFA' }}>{s.name}</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--t2)' }}>{s.message}</p>
                </div>
              ))}
              {audienceCount > 3 && (
                <p className="text-[10px] text-center" style={{ color: 'var(--t4)' }}>
                  + {audienceCount - 3} more personalized messages
                </p>
              )}
            </div>
          )}

          {!sampleMessages?.length && (
            <div className="rounded-lg p-4 text-center" style={{ background: 'var(--subtle)' }}>
              <p className="text-xs" style={{ color: 'var(--t3)' }}>
                {audienceCount} member{audienceCount !== 1 ? 's' : ''} will each receive a unique AI-crafted message
              </p>
            </div>
          )}
        </div>
      ) : (
        /* ── Custom Template Mode ── */
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs mb-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>Write your message</h3>
              <p className="text-[11px]" style={{ color: 'var(--t4)' }}>Same message for all {audienceCount} members. Use {'{{name}}'} for personalization.</p>
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
                    style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--t1)' }}
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
                    style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--t1)', minHeight: 80 }}
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
                    style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--t1)', minHeight: 48 }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}

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
