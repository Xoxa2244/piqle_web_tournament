'use client'

import { Mail, MessageSquare, Send, Sparkles, X } from 'lucide-react'

type OutreachConfirmIQModalProps = {
  open: boolean
  channel: 'email' | 'sms'
  title?: string
  description?: string
  memberName?: string | null
  memberEmail?: string | null
  messagePreview?: string | null
  confirmText?: string
  cancelText?: string
  isPending?: boolean
  confirmDisabled?: boolean
  onClose: () => void
  onConfirm: () => void
  children?: React.ReactNode
}

export function OutreachConfirmIQModal({
  open,
  channel,
  title,
  description,
  memberName,
  memberEmail,
  messagePreview,
  confirmText,
  cancelText = 'Cancel',
  isPending = false,
  confirmDisabled = false,
  onClose,
  onConfirm,
  children,
}: OutreachConfirmIQModalProps) {
  if (!open) return null

  const isEmail = channel === 'email'
  const ChannelIcon = isEmail ? Mail : MessageSquare

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-[rgba(6,10,24,0.78)] px-4 py-6 backdrop-blur-md"
      onClick={isPending ? undefined : onClose}
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/12 bg-[#0D1224]/95 shadow-[0_24px_80px_rgba(3,8,24,0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
        <div className="absolute -left-24 top-0 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-56 w-56 rounded-full bg-violet-500/10 blur-3xl" />

        <div className="relative p-6 sm:p-7">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.24em]"
                style={{
                  color: '#9BDCF8',
                  borderColor: 'rgba(103,232,249,0.18)',
                  background: 'linear-gradient(135deg, rgba(8,145,178,0.16), rgba(76,29,149,0.14))',
                }}
              >
                <Sparkles className="h-3 w-3" />
                Outreach Confirm
              </div>
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-2xl"
                  style={{
                    background: isEmail
                      ? 'linear-gradient(135deg, rgba(14,165,233,0.24), rgba(139,92,246,0.26))'
                      : 'linear-gradient(135deg, rgba(249,115,22,0.22), rgba(236,72,153,0.22))',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <ChannelIcon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">
                    {title || (isEmail ? 'Send Re-engagement Email' : 'Send Re-engagement SMS')}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-300">
                    {description || `This will send a ${isEmail ? 'reactivation email' : 'reactivation message'} from the current platform environment.`}
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div
              className="grid gap-3 rounded-2xl border border-white/8 bg-[rgba(15,23,42,0.62)] p-4 sm:grid-cols-2"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}
            >
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Recipient</div>
                <div className="mt-2 text-sm font-semibold text-white">{memberName || 'Selected member'}</div>
                {memberEmail ? <div className="mt-1 text-xs text-slate-400">{memberEmail}</div> : null}
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Channel</div>
                <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200">
                  <ChannelIcon className="h-3.5 w-3.5" />
                  {isEmail ? 'Email' : 'SMS'}
                </div>
              </div>
            </div>

            {messagePreview ? (
              <div
                className="rounded-2xl border border-violet-400/16 bg-[linear-gradient(135deg,rgba(76,29,149,0.18),rgba(8,47,73,0.18))] p-4"
                style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}
              >
                <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-violet-300">
                  <Send className="h-3.5 w-3.5" />
                  Message Preview
                </div>
                <div className="text-sm leading-6 text-slate-200">{messagePreview}</div>
              </div>
            ) : null}

            {children ? <div className="rounded-2xl border border-white/8 bg-black/10 p-4">{children}</div> : null}
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isPending || confirmDisabled}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: isEmail
                  ? 'linear-gradient(135deg, #8B5CF6, #06B6D4)'
                  : 'linear-gradient(135deg, #F97316, #EC4899)',
                boxShadow: '0 12px 30px rgba(79,70,229,0.24)',
              }}
            >
              <Send className="h-4 w-4" />
              {isPending ? 'Sending…' : confirmText || (isEmail ? 'Send Email' : 'Send SMS')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
