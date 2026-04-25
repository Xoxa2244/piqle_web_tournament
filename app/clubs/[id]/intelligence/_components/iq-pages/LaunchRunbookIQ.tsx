'use client'

/**
 * Launch Runbook — everything a club admin needs to decide "are we
 * ready to flip live mode on":
 *
 *   1. Preflight checks (deterministic, auto-refreshes)
 *   2. Voice / tone settings (presets + custom text)
 *   3. Preview panel (generate → judge → regenerate loop)
 *   4. Manual confirmations (6 human-in-the-loop checkboxes)
 *   5. Go Live button (gated on zero errors + all confirmations)
 *   6. Kill switch (always available once live)
 *   7. Audit log (recent go-live / kill-switch / failed preflight)
 */

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import {
  Rocket, CheckCircle2, AlertTriangle, XCircle, Loader2, RotateCcw,
  Power, Mic, ShieldAlert, Activity, Send, Sparkles,
} from 'lucide-react'

interface Props {
  clubId: string
}

type PreviewType = 'slot_filler' | 'reactivation' | 'check_in' | 'event_invite'

const PREVIEW_TYPE_LABELS: Record<PreviewType, { title: string; description: string }> = {
  slot_filler: { title: 'Slot Filler', description: 'Fill empty spots in an upcoming session' },
  reactivation: { title: 'Reactivation', description: 'Win back a member who has not played in 30+ days' },
  check_in: { title: 'Check-in', description: 'Light touch for someone whose frequency dropped' },
  event_invite: { title: 'Event Invite', description: 'Invite to a specific clinic / league / mixer' },
}

const FEEDBACK_PRESETS = [
  { key: 'too_formal', label: 'Too formal' },
  { key: 'too_casual', label: 'Too casual' },
  { key: 'too_long', label: 'Shorter' },
  { key: 'too_short', label: 'Longer' },
  { key: 'too_generic', label: 'More specific' },
  { key: 'too_pushy', label: 'Less pushy' },
] as const

const MANUAL_CHECK_DEFS = [
  { key: 'previewSlotFiller', label: 'I reviewed the slot-filler preview — tone is right' },
  { key: 'previewReactivation', label: 'I reviewed the reactivation preview — tone is right' },
  { key: 'fromNameConfirmed', label: 'The From: display name is correct for our club' },
  { key: 'killSwitchKnown', label: 'I know where the Kill Switch is (bottom of this page)' },
  { key: 'teamNotified', label: 'I notified our team that AI will start sending real messages' },
  { key: 'willMonitor48h', label: "I'll check the dashboard 1-2 times per day for the first 48 hours" },
] as const

type ManualCheckKey = (typeof MANUAL_CHECK_DEFS)[number]['key']

function StatusIcon({ status }: { status: 'ok' | 'warn' | 'error' }) {
  if (status === 'ok') return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
  if (status === 'warn') return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
  return <XCircle className="w-4 h-4 text-red-500 shrink-0" />
}

export function LaunchRunbookIQ({ clubId }: Props) {
  const utils = trpc.useContext()
  const preflight = trpc.club.getLaunchPreflight.useQuery({ clubId })
  const voice = trpc.club.getVoiceSettings.useQuery({ clubId })
  const audit = trpc.club.getLaunchAuditLog.useQuery({ clubId, limit: 5 })

  const [manualConfirms, setManualConfirms] = useState<Record<ManualCheckKey, boolean>>({
    previewSlotFiller: false,
    previewReactivation: false,
    fromNameConfirmed: false,
    killSwitchKnown: false,
    teamNotified: false,
    willMonitor48h: false,
  })
  const [goLiveError, setGoLiveError] = useState<string | null>(null)
  const [killReason, setKillReason] = useState('')
  const [showKillConfirm, setShowKillConfirm] = useState(false)

  // ── Voice edit state ──
  const voiceData = voice.data
  const [voiceForm, setVoiceForm] = useState({
    tone: 'friendly' as 'friendly' | 'professional' | 'energetic' | 'warm',
    length: 'medium' as 'short' | 'medium' | 'long',
    formality: 'casual' as 'casual' | 'neutral' | 'formal',
    useEmoji: false,
    customInstructions: '',
  })
  // Seed from loaded data once
  const [voiceSeeded, setVoiceSeeded] = useState(false)
  if (voiceData && !voiceSeeded) {
    setVoiceForm({
      tone: voiceData.tone,
      length: voiceData.length,
      formality: voiceData.formality,
      useEmoji: voiceData.useEmoji,
      customInstructions: voiceData.customInstructions,
    })
    setVoiceSeeded(true)
  }

  const updateVoice = trpc.club.updateVoiceSettings.useMutation({
    onSuccess: () => utils.club.getVoiceSettings.invalidate({ clubId }),
  })

  // ── Preview state ──
  const [activePreview, setActivePreview] = useState<PreviewType | null>(null)
  const [previewResult, setPreviewResult] = useState<{ subject: string; body: string } | null>(null)
  const preview = trpc.club.previewAiMessage.useMutation({
    onSuccess: (data) => setPreviewResult({ subject: data.subject, body: data.body }),
  })
  const regenerate = trpc.club.regenerateAiPreview.useMutation({
    onSuccess: (data) => setPreviewResult({ subject: data.subject, body: data.body }),
  })

  const goLive = trpc.club.goLive.useMutation({
    onSuccess: () => {
      setGoLiveError(null)
      utils.club.getLaunchPreflight.invalidate({ clubId })
      utils.club.getLaunchAuditLog.invalidate({ clubId })
    },
    onError: (err) => setGoLiveError(err.message),
  })
  const kill = trpc.club.killSwitch.useMutation({
    onSuccess: () => {
      setShowKillConfirm(false)
      setKillReason('')
      utils.club.getLaunchPreflight.invalidate({ clubId })
      utils.club.getLaunchAuditLog.invalidate({ clubId })
    },
  })

  const checks = preflight.data?.checks || []
  const errors = checks.filter((c) => c.status === 'error').length
  const allManualConfirmed = Object.values(manualConfirms).every(Boolean)
  const canGoLive = errors === 0 && allManualConfirmed && !preflight.data?.agentLive
  const isLive = !!preflight.data?.agentLive

  return (
    <div className="px-6 py-6 space-y-6" style={{ maxWidth: 980 }}>
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25">
            <Rocket className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--heading)' }}>Launch Runbook</h1>
            <p style={{ fontSize: 13, color: 'var(--t3)' }}>
              Pre-flight checks, tone preview, and the Go Live switch for AI outreach
            </p>
          </div>
          {isLive && (
            <div className="ml-auto">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}
              >
                <Activity className="w-3 h-3" /> LIVE
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Preflight Checks ── */}
      <section
        className="rounded-xl p-5"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
            Automatic checks
          </h2>
          {preflight.data && (
            <div className="text-xs" style={{ color: 'var(--t3)' }}>
              {preflight.data.summary.ok} passed · {preflight.data.summary.warn} warnings ·{' '}
              <span style={{ color: errors > 0 ? '#EF4444' : 'var(--t3)', fontWeight: errors > 0 ? 600 : 400 }}>
                {preflight.data.summary.error} blockers
              </span>
            </div>
          )}
        </div>

        {preflight.isLoading && (
          <div className="text-xs flex items-center gap-2" style={{ color: 'var(--t3)' }}>
            <Loader2 className="w-3 h-3 animate-spin" /> Running checks...
          </div>
        )}

        <div className="space-y-2">
          {checks.map((c) => (
            <div
              key={c.key}
              className="flex items-start gap-3 p-3 rounded-lg"
              style={{ background: 'var(--subtle)' }}
            >
              <StatusIcon status={c.status} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: 'var(--heading)' }}>
                  {c.label}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>
                  {c.message}
                </div>
              </div>
              {c.actionHref && (
                <a
                  href={c.actionHref}
                  className="text-xs px-2 py-1 rounded-md font-medium shrink-0"
                  style={{ background: 'var(--card-bg)', color: '#3B82F6', border: '1px solid var(--card-border)' }}
                >
                  {c.actionLabel}
                </a>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => preflight.refetch()}
          disabled={preflight.isFetching}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium"
          style={{ color: 'var(--t2)' }}
        >
          <RotateCcw className={`w-3 h-3 ${preflight.isFetching ? 'animate-spin' : ''}`} />
          Re-run checks
        </button>
      </section>

      {/* ── Voice / Tone ── */}
      <section
        className="rounded-xl p-5"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Mic className="w-4 h-4 text-indigo-500" />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
            Voice &amp; tone
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
          <label className="text-xs" style={{ color: 'var(--t3)' }}>
            <span className="block mb-1">Tone</span>
            <select
              value={voiceForm.tone}
              onChange={(e) => setVoiceForm({ ...voiceForm, tone: e.target.value as any })}
              className="w-full px-2 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
            >
              <option value="friendly">Friendly</option>
              <option value="professional">Professional</option>
              <option value="energetic">Energetic</option>
              <option value="warm">Warm</option>
            </select>
          </label>

          <label className="text-xs" style={{ color: 'var(--t3)' }}>
            <span className="block mb-1">Length</span>
            <select
              value={voiceForm.length}
              onChange={(e) => setVoiceForm({ ...voiceForm, length: e.target.value as any })}
              className="w-full px-2 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
            >
              <option value="short">Short (2-3 sentences)</option>
              <option value="medium">Medium</option>
              <option value="long">Long (up to 2 paragraphs)</option>
            </select>
          </label>

          <label className="text-xs" style={{ color: 'var(--t3)' }}>
            <span className="block mb-1">Formality</span>
            <select
              value={voiceForm.formality}
              onChange={(e) => setVoiceForm({ ...voiceForm, formality: e.target.value as any })}
              className="w-full px-2 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
            >
              <option value="casual">Casual (Hi Alex!)</option>
              <option value="neutral">Neutral (Hi Alex,)</option>
              <option value="formal">Formal (Hello Alex,)</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--t2)' }}>
            <input
              type="checkbox"
              checked={voiceForm.useEmoji}
              onChange={(e) => setVoiceForm({ ...voiceForm, useEmoji: e.target.checked })}
              className="w-4 h-4"
            />
            <span>Use emoji (1 per message max)</span>
          </label>
        </div>

        <label className="block text-xs" style={{ color: 'var(--t3)' }}>
          <span className="block mb-1">Custom instructions (free-form)</span>
          <textarea
            value={voiceForm.customInstructions}
            onChange={(e) => setVoiceForm({ ...voiceForm, customInstructions: e.target.value })}
            rows={3}
            maxLength={1500}
            placeholder="Example: We're a friendly Austin pickleball community. Use Texan phrases when they fit ('y'all', 'fixing to'). Avoid corporate speak. Sign off as 'Coach Mike & the APC crew'."
            className="w-full px-3 py-2 rounded-lg text-sm outline-none font-normal"
            style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
          />
        </label>

        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => updateVoice.mutate({ clubId, ...voiceForm })}
            disabled={updateVoice.isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: '#6366F1', color: 'white' }}
          >
            {updateVoice.isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Save voice settings
          </button>
          {updateVoice.isSuccess && !updateVoice.isLoading && (
            <span className="text-xs text-emerald-500 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Saved
            </span>
          )}
        </div>
      </section>

      {/* ── Preview + Regenerate ── */}
      <section
        className="rounded-xl p-5"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
            Preview what will actually go out
          </h2>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--t3)' }}>
          Pick a message type. We generate a realistic example with your voice profile — no send.
          If you don&apos;t like the tone, hit a feedback button and we&apos;ll regenerate.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {(Object.keys(PREVIEW_TYPE_LABELS) as PreviewType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setActivePreview(t)
                setPreviewResult(null)
                preview.mutate({ clubId, type: t })
              }}
              disabled={preview.isLoading || regenerate.isLoading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-60"
              style={{
                background: activePreview === t ? '#3B82F6' : 'var(--subtle)',
                color: activePreview === t ? 'white' : 'var(--t2)',
                border: '1px solid var(--card-border)',
              }}
            >
              {PREVIEW_TYPE_LABELS[t].title}
            </button>
          ))}
        </div>

        {(preview.isLoading || regenerate.isLoading) && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t3)' }}>
            <Loader2 className="w-3 h-3 animate-spin" /> Generating...
          </div>
        )}

        {previewResult && activePreview && (
          <div
            className="rounded-lg p-4"
            style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}
          >
            <div className="text-xs mb-1" style={{ color: 'var(--t3)' }}>
              Subject
            </div>
            <div className="text-sm font-semibold mb-3" style={{ color: 'var(--heading)' }}>
              {previewResult.subject}
            </div>
            <div className="text-xs mb-1" style={{ color: 'var(--t3)' }}>
              Body
            </div>
            <div
              className="text-sm whitespace-pre-wrap mb-4"
              style={{ color: 'var(--t1)', lineHeight: 1.5 }}
            >
              {previewResult.body}
            </div>

            <div className="pt-3 border-t" style={{ borderColor: 'var(--card-border)' }}>
              <div className="text-xs mb-2" style={{ color: 'var(--t3)' }}>
                Not quite right? Pick one:
              </div>
              <div className="flex flex-wrap gap-2">
                {FEEDBACK_PRESETS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() =>
                      regenerate.mutate({
                        clubId,
                        type: activePreview,
                        previousSubject: previewResult.subject,
                        previousBody: previewResult.body,
                        feedback: f.key,
                      })
                    }
                    disabled={regenerate.isLoading}
                    className="px-2.5 py-1 rounded-md text-xs font-medium"
                    style={{ background: 'var(--card-bg)', color: 'var(--t2)', border: '1px solid var(--card-border)' }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Manual Confirmations ── */}
      <section
        className="rounded-xl p-5"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--heading)' }}>
          Manual confirmations
        </h2>
        <div className="space-y-2">
          {MANUAL_CHECK_DEFS.map((m) => (
            <label
              key={m.key}
              className="flex items-start gap-2 text-sm cursor-pointer py-1"
              style={{ color: 'var(--t2)' }}
            >
              <input
                type="checkbox"
                checked={manualConfirms[m.key]}
                onChange={(e) => setManualConfirms({ ...manualConfirms, [m.key]: e.target.checked })}
                className="w-4 h-4 mt-0.5"
              />
              <span>{m.label}</span>
            </label>
          ))}
        </div>
      </section>

      {/* ── Go Live ── */}
      {!isLive && (
        <section
          className="rounded-xl p-5"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        >
          {goLiveError && (
            <div
              className="flex items-start gap-2 text-sm rounded-lg p-3 mb-3"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#EF4444' }}
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{goLiveError}</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => goLive.mutate({ clubId, manualConfirmations: manualConfirms })}
              disabled={!canGoLive || goLive.isLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50"
              style={{
                background: canGoLive ? '#10B981' : 'var(--subtle)',
                color: canGoLive ? 'white' : 'var(--t3)',
                cursor: canGoLive ? 'pointer' : 'not-allowed',
              }}
            >
              {goLive.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              Go Live
            </button>
            {!canGoLive && (
              <span className="text-xs" style={{ color: 'var(--t3)' }}>
                {errors > 0
                  ? `Fix ${errors} blocker${errors > 1 ? 's' : ''} above`
                  : `${Object.values(manualConfirms).filter((v) => !v).length} confirmations remaining`}
              </span>
            )}
          </div>
        </section>
      )}

      {/* ── Kill Switch ── */}
      {isLive && (
        <section
          className="rounded-xl p-5"
          style={{
            background: 'rgba(239,68,68,0.04)',
            border: '1px solid rgba(239,68,68,0.25)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
              Kill Switch
            </h2>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--t3)' }}>
            Immediately turn off all AI outreach for this club. Use if you see a spike in bounces,
            complaints, or anything unexpected. Takes effect on the next send attempt (seconds).
          </p>
          {!showKillConfirm ? (
            <button
              type="button"
              onClick={() => setShowKillConfirm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: '#EF4444', color: 'white' }}
            >
              <Power className="w-4 h-4" /> Stop all AI sending
            </button>
          ) : (
            <div className="space-y-2">
              <label className="text-xs block" style={{ color: 'var(--t3)' }}>
                Reason (required, for the audit log)
                <textarea
                  value={killReason}
                  onChange={(e) => setKillReason(e.target.value)}
                  placeholder="e.g. Bounce rate jumped above 5%, investigating"
                  rows={2}
                  className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
                />
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => kill.mutate({ clubId, reason: killReason.trim() })}
                  disabled={killReason.trim().length < 3 || kill.isLoading}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60"
                  style={{ background: '#EF4444', color: 'white' }}
                >
                  {kill.isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
                  Confirm kill
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowKillConfirm(false)
                    setKillReason('')
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: 'var(--subtle)', color: 'var(--t2)', border: '1px solid var(--card-border)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Audit Log ── */}
      <section
        className="rounded-xl p-5"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--heading)' }}>
          Recent launch events
        </h2>
        {(!audit.data || audit.data.length === 0) && (
          <p className="text-xs" style={{ color: 'var(--t3)' }}>
            No launch events yet.
          </p>
        )}
        <div className="space-y-2">
          {(audit.data || []).map((a) => {
            const colors =
              a.action === 'go_live'
                ? { bg: 'rgba(16,185,129,0.08)', color: '#10B981', label: 'Went live' }
                : a.action === 'kill_switch'
                  ? { bg: 'rgba(239,68,68,0.08)', color: '#EF4444', label: 'Kill switch' }
                  : { bg: 'rgba(245,158,11,0.08)', color: '#F59E0B', label: 'Preflight failed' }
            return (
              <div
                key={a.id}
                className="flex items-start gap-3 p-2.5 rounded-lg text-xs"
                style={{ background: colors.bg }}
              >
                <Send className="w-3 h-3 mt-0.5" style={{ color: colors.color }} />
                <div className="flex-1">
                  <div style={{ color: colors.color, fontWeight: 600 }}>{colors.label}</div>
                  <div style={{ color: 'var(--t2)' }}>
                    {a.actor} · {new Date(a.createdAt).toLocaleString()}
                  </div>
                  {a.reason && <div style={{ color: 'var(--t3)', marginTop: 2 }}>{a.reason}</div>}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
