'use client'

import { useState, useCallback } from 'react'

export interface CampaignCreatorState {
  step: 0 | 1 | 2 | 3
  type: string | null
  channel: 'email' | 'sms' | 'both'
  audience: { memberIds: string[]; count: number; label: string }
  message: { subject: string; body: string; smsBody: string }
  sessionId: string | null
  inactivityDays: number
  riskSegment: string
}

const INITIAL_STATE: CampaignCreatorState = {
  step: 0,
  type: null,
  channel: 'email',
  audience: { memberIds: [], count: 0, label: '' },
  message: { subject: '', body: '', smsBody: '' },
  sessionId: null,
  inactivityDays: 30,
  riskSegment: 'watch',
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
      riskSegment: type === 'CHECK_IN' ? 'watch' : type === 'RETENTION_BOOST' ? 'at_risk' : s.riskSegment,
    }))
  }, [])

  const setChannel = useCallback((channel: 'email' | 'sms' | 'both') => {
    setState(s => ({ ...s, channel }))
  }, [])

  const setAudience = useCallback((audience: CampaignCreatorState['audience']) => {
    setState(s => ({ ...s, audience }))
  }, [])

  const setMessage = useCallback((message: CampaignCreatorState['message']) => {
    setState(s => ({ ...s, message }))
  }, [])

  const setSessionId = useCallback((sessionId: string | null) => {
    setState(s => ({ ...s, sessionId }))
  }, [])

  const setInactivityDays = useCallback((inactivityDays: number) => {
    setState(s => ({ ...s, inactivityDays }))
  }, [])

  const setRiskSegment = useCallback((riskSegment: string) => {
    setState(s => ({ ...s, riskSegment }))
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
  }
}
