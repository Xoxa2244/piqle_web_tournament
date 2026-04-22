'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/use-toast'

export type ReactivationChannel = 'email' | 'sms'
export type ReactivationSendState = 'sent' | 'failed' | 'skipped'

type SendStatusEntry = {
  channel: ReactivationChannel
  state: ReactivationSendState
  reason?: string
}

type SendArgs = {
  memberId: string
  channel: ReactivationChannel
  memberName?: string
  customMessage?: string
}

type SendCallbacks = {
  onSuccess?: (result: any) => void
  onError?: (error: any) => void
  onSettled?: () => void
}

type UseReactivationSendFlowOptions = {
  sendReactivation?: any
  clubId?: string
}

export function useReactivationSendFlow({ sendReactivation, clubId }: UseReactivationSendFlowOptions) {
  const { toast } = useToast()
  const [sentOutreach, setSentOutreach] = useState<Record<string, string>>({})
  const [sendStatus, setSendStatus] = useState<Record<string, SendStatusEntry>>({})
  const [pendingSend, setPendingSend] = useState<{ memberId: string; channel: ReactivationChannel } | null>(null)

  const markStatus = (memberId: string, channel: ReactivationChannel, state: ReactivationSendState, reason?: string) => {
    if (state === 'sent') {
      setSentOutreach((prev) => ({ ...prev, [memberId]: channel }))
    }
    setSendStatus((prev) => ({ ...prev, [memberId]: { channel, state, reason } }))
  }

  const clearPending = (memberId: string, channel: ReactivationChannel) => {
    setPendingSend((current) => {
      if (!current) return null
      if (current.memberId !== memberId || current.channel !== channel) return current
      return null
    })
  }

  const send = ({ memberId, channel, memberName, customMessage }: SendArgs, callbacks?: SendCallbacks) => {
    const channelLabel = channel === 'email' ? 'email' : 'SMS'
    setPendingSend({ memberId, channel })
    toast({
      title: channel === 'email' ? 'Preparing email…' : 'Preparing SMS…',
      description: memberName
        ? `We’re sending a reactivation ${channelLabel} to ${memberName}.`
        : `We’re sending a reactivation ${channelLabel}.`,
    })

    if (!sendReactivation || !clubId) {
      markStatus(memberId, channel, 'sent')
      toast({
        title: channel === 'email' ? 'Email sent' : 'Message sent',
        description: 'The outreach was marked as sent in demo mode.',
      })
      clearPending(memberId, channel)
      callbacks?.onSuccess?.({ sent: 1, failed: 0, results: [{ memberId, channel, status: 'sent' }] })
      callbacks?.onSettled?.()
      return
    }

    sendReactivation.mutate(
      {
        clubId,
        candidates: [{ memberId, channel }],
        ...(customMessage ? { customMessage } : {}),
      },
      {
        onSuccess: (result: any) => {
          const item = Array.isArray(result?.results)
            ? result.results.find((entry: any) => entry.memberId === memberId && entry.channel === channel)
            : null

          if (item?.status === 'sent' || (!item && result?.sent > 0)) {
            markStatus(memberId, channel, 'sent')
            toast({
              title: channel === 'email' ? 'Email sent' : 'Message sent',
              description: memberName
                ? `The outreach to ${memberName} was delivered successfully.`
                : 'The outreach was delivered successfully.',
            })
            callbacks?.onSuccess?.(result)
            return
          }

          if (item?.status === 'skipped') {
            const reason = item.error || 'This member was skipped by the contact policy.'
            markStatus(memberId, channel, 'skipped', reason)
            toast({
              title: 'Send skipped',
              description: reason,
              variant: 'destructive',
            })
            callbacks?.onSuccess?.(result)
            return
          }

          const errorMessage = item?.error || 'The message was not accepted by the delivery pipeline.'
          markStatus(memberId, channel, 'failed', errorMessage)
          toast({
            title: 'Send failed',
            description: errorMessage,
            variant: 'destructive',
          })
          callbacks?.onSuccess?.(result)
        },
        onError: (error: any) => {
          const message = error?.message || 'Unable to send outreach right now.'
          markStatus(memberId, channel, 'failed', message)
          toast({
            title: 'Send failed',
            description: message,
            variant: 'destructive',
          })
          callbacks?.onError?.(error)
        },
        onSettled: () => {
          clearPending(memberId, channel)
          callbacks?.onSettled?.()
        },
      },
    )
  }

  return {
    sentOutreach,
    sendStatus,
    send,
    pendingSend,
    isPendingFor: (memberId: string, channel?: ReactivationChannel) =>
      !!pendingSend && pendingSend.memberId === memberId && (!channel || pendingSend.channel === channel),
  }
}
