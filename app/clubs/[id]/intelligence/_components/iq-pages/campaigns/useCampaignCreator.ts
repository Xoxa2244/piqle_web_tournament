'use client'

import { useState, useCallback } from 'react'

export interface CampaignAudiencePreviewMember {
  id: string
  name: string
  email?: string
  subtitle?: string
}

export interface CampaignAudienceState {
  memberIds: string[]
  count: number
  label: string
  previewMembers: CampaignAudiencePreviewMember[]
}

export interface CampaignMessageState {
  subject: string
  body: string
  smsBody: string
}

export interface CampaignCreatorState {
  step: 0 | 1 | 2 | 3
  type: string | null
  channel: 'email' | 'sms' | 'both'
  audience: CampaignAudienceState
  message: CampaignMessageState
  sessionId: string | null
  inactivityDays: number
  riskSegment: string
  messageEdited: boolean
}

const EMPTY_AUDIENCE: CampaignAudienceState = { memberIds: [], count: 0, label: '', previewMembers: [] }
const EMPTY_MESSAGE: CampaignMessageState = { subject: '', body: '', smsBody: '' }

const INITIAL_STATE: CampaignCreatorState = {
  step: 0,
  type: null,
  channel: 'email',
  audience: EMPTY_AUDIENCE,
  message: EMPTY_MESSAGE,
  sessionId: null,
  inactivityDays: 30,
  riskSegment: 'watch',
  messageEdited: false,
}

export function useCampaignCreator(initialType?: string) {
  const [state, setState] = useState<CampaignCreatorState>(() => {
    if (!initialType) return INITIAL_STATE
    return {
      ...INITIAL_STATE,
      type: initialType,
      step: 1 as const,
      riskSegment: initialType === 'CHECK_IN' ? 'watch' : initialType === 'RETENTION_BOOST' ? 'at_risk' : INITIAL_STATE.riskSegment,
    }
  })

  const setType = useCallback((type: string) => {
    setState(s => ({
      ...s,
      type,
      step: 1 as const,
      audience: EMPTY_AUDIENCE,
      message: EMPTY_MESSAGE,
      sessionId: null,
      riskSegment: type === 'CHECK_IN' ? 'watch' : type === 'RETENTION_BOOST' ? 'at_risk' : s.riskSegment,
      messageEdited: false,
    }))
  }, [])

  const setChannel = useCallback((channel: 'email' | 'sms' | 'both') => {
    setState(s => ({
      ...s,
      channel,
      message: s.messageEdited ? s.message : EMPTY_MESSAGE,
      messageEdited: s.messageEdited,
    }))
  }, [])

  const setAudience = useCallback((audience: CampaignAudienceState) => {
    setState(s => ({
      ...s,
      audience,
      message: s.messageEdited ? s.message : EMPTY_MESSAGE,
      messageEdited: s.messageEdited,
    }))
  }, [])

  const setMessage = useCallback((message: CampaignMessageState) => {
    setState(s => ({ ...s, message, messageEdited: true }))
  }, [])

  const setGeneratedMessage = useCallback((message: CampaignMessageState) => {
    setState(s => ({ ...s, message, messageEdited: false }))
  }, [])

  const setSessionId = useCallback((sessionId: string | null) => {
    setState(s => ({
      ...s,
      sessionId,
      audience: sessionId === s.sessionId ? s.audience : EMPTY_AUDIENCE,
      message: s.messageEdited ? s.message : EMPTY_MESSAGE,
      messageEdited: s.messageEdited,
    }))
  }, [])

  const setInactivityDays = useCallback((inactivityDays: number) => {
    setState(s => ({
      ...s,
      inactivityDays,
      message: s.messageEdited ? s.message : EMPTY_MESSAGE,
      messageEdited: s.messageEdited,
    }))
  }, [])

  const setRiskSegment = useCallback((riskSegment: string) => {
    setState(s => ({
      ...s,
      riskSegment,
      message: s.messageEdited ? s.message : EMPTY_MESSAGE,
      messageEdited: s.messageEdited,
    }))
  }, [])

  const nextStep = useCallback(() => {
    setState(s => (s.step < 3 ? { ...s, step: (s.step + 1) as 0 | 1 | 2 | 3 } : s))
  }, [])

  const prevStep = useCallback(() => {
    setState(s => (s.step > 0 ? { ...s, step: (s.step - 1) as 0 | 1 | 2 | 3 } : s))
  }, [])

  const reset = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  return {
    state,
    setType,
    setChannel,
    setAudience,
    setMessage,
    setSessionId,
    setInactivityDays,
    setRiskSegment,
    nextStep,
    prevStep,
    reset,
    setGeneratedMessage,
  }
}
