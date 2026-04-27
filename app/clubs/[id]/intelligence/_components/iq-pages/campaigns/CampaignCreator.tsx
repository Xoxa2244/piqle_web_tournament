'use client'

import React from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X } from 'lucide-react'
import { useTheme } from '../../IQThemeProvider'
import { useCampaignCreator } from './useCampaignCreator'
import { useCreateCampaign } from '../../../_hooks/use-intelligence'
import { CampaignCreatorStep1Type } from './CampaignCreatorStep1Type'
import { CampaignCreatorStep2Audience } from './CampaignCreatorStep2Audience'
import { CampaignCreatorStep3Message } from './CampaignCreatorStep3Message'
import { CampaignCreatorStep4Confirm } from './CampaignCreatorStep4Confirm'

interface CampaignCreatorProps {
  clubId: string
  initialType?: string | null
  onClose: () => void
  onSuccess: () => void
}

const STEP_LABELS = ['Type', 'Audience', 'Message', 'Confirm']

export function CampaignCreator({ clubId, initialType, onClose, onSuccess }: CampaignCreatorProps) {
  const { isDark } = useTheme()
  const creator = useCampaignCreator(initialType ?? undefined)
  const { state } = creator
  const campaign = useCreateCampaign()

  const handleSend = () => {
    campaign.mutate(
      {
        clubId,
        type: state.type as 'CHECK_IN' | 'RETENTION_BOOST' | 'REACTIVATION' | 'SLOT_FILLER' | 'EVENT_INVITE' | 'NEW_MEMBER_WELCOME',
        channel: state.channel,
        memberIds: state.audience.memberIds,
        subject: state.message.subject,
        body: state.message.body,
        smsBody: state.message.smsBody,
        sessionId: state.sessionId ?? undefined,
      },
      { onSuccess: () => onSuccess() }
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{ background: isDark ? '#0B1220' : '#FFFFFF', border: '1px solid var(--card-border)', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--card-border)' }}>
          <div className="flex items-center gap-3">
            <h2 className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>New Campaign</h2>
            <div className="flex items-center gap-1.5">
              {STEP_LABELS.map((label, i) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: i <= state.step ? '#8B5CF6' : 'var(--subtle)' }} />
                  {i < STEP_LABELS.length - 1 && <div className="w-3 h-px" style={{ background: i < state.step ? '#8B5CF6' : 'var(--subtle)' }} />}
                </div>
              ))}
            </div>
            <span className="text-[10px]" style={{ color: 'var(--t4)' }}>Step {state.step + 1} of 4</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg transition-colors hover:bg-white/10">
            <X className="w-4 h-4" style={{ color: 'var(--t3)' }} />
          </button>
        </div>

        {/* Step content */}
        <div className="px-6 py-5">
          <AnimatePresence mode="wait">
            <motion.div key={state.step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              {state.step === 0 && <CampaignCreatorStep1Type onSelect={creator.setType} />}
              {state.step === 1 && (
                <CampaignCreatorStep2Audience
                  clubId={clubId}
                  type={state.type!}
                  channel={state.channel}
                  onChannelChange={creator.setChannel}
                  audience={state.audience}
                  onAudienceChange={creator.setAudience}
                  sessionId={state.sessionId}
                  onSessionIdChange={creator.setSessionId}
                  inactivityDays={state.inactivityDays}
                  onInactivityDaysChange={creator.setInactivityDays}
                  riskSegment={state.riskSegment}
                  onRiskSegmentChange={creator.setRiskSegment}
                  onContinue={creator.nextStep}
                />
              )}
              {state.step === 2 && (
                <CampaignCreatorStep3Message
                  clubId={clubId}
                  type={state.type!}
                  channel={state.channel}
                  audienceCount={state.audience.count}
                  audienceLabel={state.audience.label}
                  previewMembers={state.audience.previewMembers}
                  message={state.message}
                  onMessageChange={creator.setMessage}
                  onGeneratedMessage={creator.setGeneratedMessage}
                  context={{
                    sessionTitle: state.sessionId
                      ? state.audience.label.replace(/^(Slot filler|Event invite):\s*/, '')
                      : undefined,
                    riskSegment: state.riskSegment,
                    inactivityDays: state.inactivityDays,
                  }}
                  onContinue={creator.nextStep}
                  onBack={creator.prevStep}
                />
              )}
              {state.step === 3 && (
                <CampaignCreatorStep4Confirm
                  clubId={clubId}
                  state={state}
                  onSend={handleSend}
                  isSending={campaign.isPending}
                  result={campaign.data as any ?? null}
                  error={campaign.error?.message ?? null}
                  onBack={creator.prevStep}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
