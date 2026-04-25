'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import {
  Mail, Shield, CheckCircle2, AlertTriangle, Clock, Copy, ExternalLink,
  Trash2, Power, Loader2, Info,
} from 'lucide-react'

interface Props {
  clubId: string
}

interface DnsRecord {
  kind: 'SPF' | 'DKIM' | 'RETURN_PATH'
  type: 'TXT' | 'CNAME'
  host: string
  value: string
  note?: string
}

const RECORD_LABELS: Record<DnsRecord['kind'], { title: string; subtitle: string }> = {
  SPF: {
    title: 'SPF — authorizes Mandrill to send from your domain',
    subtitle: 'Without this, receiving servers may reject or spam-folder our emails.',
  },
  DKIM: {
    title: 'DKIM — cryptographic signature for each message',
    subtitle: 'Proves the email was authorized by you. Essential for Gmail deliverability.',
  },
  RETURN_PATH: {
    title: 'Return-Path — where bounces and replies are handled',
    subtitle: 'Optional but recommended. If your DNS provider blocks CNAMEs at the record root, skip this one.',
  },
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition"
      style={{
        background: copied ? 'rgba(16,185,129,0.12)' : 'var(--card-bg)',
        borderColor: copied ? 'rgba(16,185,129,0.4)' : 'var(--card-border)',
        color: copied ? '#10B981' : 'var(--t2)',
      }}
      aria-label={`Copy ${label}`}
    >
      {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export function EmailDomainIQ({ clubId }: Props) {
  const utils = trpc.useContext()
  const statusQuery = trpc.club.getSendingDomainStatus.useQuery({ clubId })

  const [domainInput, setDomainInput] = useState('')
  const [fromNameInput, setFromNameInput] = useState('')
  const [setupError, setSetupError] = useState<string | null>(null)
  const [verifyResult, setVerifyResult] = useState<
    | { ok: boolean; spf: boolean; dkim: boolean; spfError: string | null; dkimError: string | null }
    | null
  >(null)

  const setup = trpc.club.setupSendingDomain.useMutation({
    onSuccess: () => {
      utils.club.getSendingDomainStatus.invalidate({ clubId })
      setSetupError(null)
    },
    onError: (err) => setSetupError(err.message),
  })

  const verify = trpc.club.verifySendingDomain.useMutation({
    onSuccess: (data) => {
      setVerifyResult({
        ok: data.ready,
        spf: data.spfValid,
        dkim: data.dkimValid,
        spfError: data.spfError,
        dkimError: data.dkimError,
      })
      utils.club.getSendingDomainStatus.invalidate({ clubId })
    },
  })
  const enable = trpc.club.enableSendingDomain.useMutation({
    onSuccess: () => utils.club.getSendingDomainStatus.invalidate({ clubId }),
  })
  const disable = trpc.club.disableSendingDomain.useMutation({
    onSuccess: () => utils.club.getSendingDomainStatus.invalidate({ clubId }),
  })
  const remove = trpc.club.removeSendingDomain.useMutation({
    onSuccess: () => utils.club.getSendingDomainStatus.invalidate({ clubId }),
  })

  // tRPC infers `dnsRecords` as Prisma.JsonValue, which is recursively
  // defined (JsonArray contains JsonValue). TypeScript's union-narrowing
  // across the whole response bogs down on that — cast to `any` here and
  // destructure fields with our local DnsRecord type.
  const data = statusQuery.data as any
  const domain: string | null = data?.domain ?? null
  const dnsRecords: DnsRecord[] | null = data?.dnsRecords ?? null
  const verifiedAt: string | Date | null = data?.verifiedAt ?? null
  const enabled: boolean = !!data?.enabled
  const previewFromAddress: string | null = data?.previewFromAddress ?? null

  const handleSetup = () => {
    if (!domainInput.trim()) return
    setup.mutate({
      clubId,
      domain: domainInput.trim(),
      ...(fromNameInput.trim() ? { fromName: fromNameInput.trim() } : {}),
    })
  }

  return (
    <div className="px-6 py-6 space-y-6" style={{ maxWidth: 900 }}>
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
            <Mail className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--heading)' }}>Email Domain</h1>
            <p style={{ fontSize: 13, color: 'var(--t3)' }}>
              Send AI outreach from <em>your</em> club&apos;s domain instead of noreply@iqsport.ai
            </p>
          </div>
        </div>
      </div>

      {/* Why */}
      <div
        className="rounded-xl p-4 flex gap-3"
        style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}
      >
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
        <div className="text-sm" style={{ color: 'var(--t2)' }}>
          <p className="font-medium mb-1" style={{ color: 'var(--heading)' }}>
            Why connect your domain?
          </p>
          <p className="mb-1">
            Members trust emails from your club&apos;s own domain more than a third-party address.
            Expect <strong>+10–20% open rate</strong>, lower spam-folder rate, and your branding in the inbox.
          </p>
          <p className="text-xs" style={{ color: 'var(--t3)' }}>
            Recommended: use a <strong>subdomain</strong> like <code>mail.yourclub.com</code> —
            it won&apos;t conflict with your regular email (Google Workspace, Office 365).
          </p>
        </div>
      </div>

      {statusQuery.isLoading ? (
        <div className="text-sm flex items-center gap-2" style={{ color: 'var(--t3)' }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Loading...
        </div>
      ) : !domain ? (
        // ── SETUP STATE ──────────────────────────────────────────────
        <div
          className="rounded-xl p-5"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--heading)', marginBottom: 12 }}>
            Step 1 — Add your domain
          </h2>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs block mb-1" style={{ color: 'var(--t3)' }}>Domain</span>
              <input
                type="text"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="mail.yourclub.com"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: 'var(--subtle)',
                  color: 'var(--t1)',
                  border: '1px solid var(--card-border)',
                }}
              />
            </label>
            <label className="block">
              <span className="text-xs block mb-1" style={{ color: 'var(--t3)' }}>
                Display name (optional — defaults to club name)
              </span>
              <input
                type="text"
                value={fromNameInput}
                onChange={(e) => setFromNameInput(e.target.value)}
                placeholder="Austin Pickleball Club"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: 'var(--subtle)',
                  color: 'var(--t1)',
                  border: '1px solid var(--card-border)',
                }}
              />
            </label>
            {setupError && (
              <div
                className="flex items-start gap-2 text-sm rounded-lg p-3"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#EF4444' }}
              >
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{setupError}</span>
              </div>
            )}
            <button
              type="button"
              onClick={handleSetup}
              disabled={setup.isLoading || !domainInput.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-60"
              style={{ background: '#3B82F6', color: 'white' }}
            >
              {setup.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Generate DNS records
            </button>
          </div>
        </div>
      ) : (
        // ── CONFIGURED STATE ────────────────────────────────────────
        <>
          {/* Current status + controls */}
          <div
            className="rounded-xl p-5"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--t3)' }}>Domain</div>
                <div className="text-lg font-semibold" style={{ color: 'var(--heading)' }}>{domain}</div>
                <div className="text-xs mt-1 font-mono" style={{ color: 'var(--t3)' }}>
                  From: {previewFromAddress}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {verifiedAt ? (
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981' }}
                  >
                    <Shield className="w-3 h-3" /> Verified
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}
                  >
                    <Clock className="w-3 h-3" /> Awaiting DNS
                  </span>
                )}
                {enabled ? (
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981' }}
                  >
                    <Power className="w-3 h-3" /> Live
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{ background: 'rgba(107,114,128,0.12)', color: 'var(--t3)' }}
                  >
                    <Power className="w-3 h-3" /> Off
                  </span>
                )}
              </div>
            </div>

            {/* Action row */}
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t" style={{ borderColor: 'var(--card-border)' }}>
              {!verifiedAt && (
                <button
                  type="button"
                  onClick={() => verify.mutate({ clubId })}
                  disabled={verify.isLoading}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-60"
                  style={{ background: '#3B82F6', color: 'white' }}
                >
                  {verify.isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
                  Verify DNS
                </button>
              )}
              {verifiedAt && !enabled && (
                <button
                  type="button"
                  onClick={() => enable.mutate({ clubId })}
                  disabled={enable.isLoading}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-60"
                  style={{ background: '#10B981', color: 'white' }}
                >
                  <Power className="w-3 h-3" />
                  Enable sending from this domain
                </button>
              )}
              {enabled && (
                <button
                  type="button"
                  onClick={() => disable.mutate({ clubId })}
                  disabled={disable.isLoading}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-60"
                  style={{ background: 'var(--subtle)', color: 'var(--t2)', border: '1px solid var(--card-border)' }}
                >
                  <Power className="w-3 h-3" />
                  Disable (revert to default)
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (confirm('Remove this domain? You can always add it back later.')) {
                    remove.mutate({ clubId })
                  }
                }}
                disabled={remove.isLoading}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-60"
                style={{
                  background: 'transparent',
                  color: '#EF4444',
                  border: '1px solid rgba(239,68,68,0.3)',
                }}
              >
                <Trash2 className="w-3 h-3" />
                Remove domain
              </button>
            </div>
          </div>

          {/* Verify result feedback */}
          {verifyResult && (
            <div
              className="rounded-xl p-4"
              style={{
                background: verifyResult.ok ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)',
                border: `1px solid ${verifyResult.ok ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.3)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                {verifyResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Clock className="w-4 h-4 text-amber-500" />
                )}
                <span className="text-sm font-medium" style={{ color: 'var(--heading)' }}>
                  {verifyResult.ok ? 'All checks passed — ready to enable' : 'Not verified yet'}
                </span>
              </div>
              <div className="text-xs space-y-1" style={{ color: 'var(--t2)' }}>
                <div className="flex items-center gap-2">
                  {verifyResult.spf ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <AlertTriangle className="w-3 h-3 text-amber-500" />}
                  <span>SPF: {verifyResult.spf ? 'valid' : verifyResult.spfError || 'not yet detected'}</span>
                </div>
                <div className="flex items-center gap-2">
                  {verifyResult.dkim ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <AlertTriangle className="w-3 h-3 text-amber-500" />}
                  <span>DKIM: {verifyResult.dkim ? 'valid' : verifyResult.dkimError || 'not yet detected'}</span>
                </div>
                {!verifyResult.ok && (
                  <p className="pt-2" style={{ color: 'var(--t3)' }}>
                    DNS changes usually propagate in 5–60 minutes (occasionally up to 4h). Click Verify again after waiting.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* DNS records to add */}
          {dnsRecords && dnsRecords.length > 0 && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--heading)', marginBottom: 8 }}>
                Step 2 — Add these records to your DNS provider
              </h2>
              <p className="text-xs mb-4" style={{ color: 'var(--t3)' }}>
                Go to your domain registrar (GoDaddy, Namecheap, Cloudflare, etc) and add each record below.
                After you&apos;ve added them, click <strong>Verify DNS</strong> above.
              </p>

              <div className="space-y-4">
                {dnsRecords.map((rec) => (
                  <div
                    key={rec.kind}
                    className="rounded-xl p-4"
                    style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                  >
                    <div className="mb-3">
                      <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
                        {RECORD_LABELS[rec.kind].title}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--t3)' }}>
                        {RECORD_LABELS[rec.kind].subtitle}
                      </div>
                    </div>

                    <div className="grid grid-cols-[80px_1fr] gap-y-2 gap-x-3 text-xs">
                      <div style={{ color: 'var(--t3)' }}>Type</div>
                      <div className="font-mono font-medium" style={{ color: 'var(--t1)' }}>{rec.type}</div>

                      <div style={{ color: 'var(--t3)' }}>Host / Name</div>
                      <div className="flex items-center gap-2">
                        <code
                          className="font-mono text-xs px-2 py-1 rounded flex-1 truncate"
                          style={{ background: 'var(--subtle)', color: 'var(--t1)' }}
                        >
                          {rec.host}
                        </code>
                        <CopyButton text={rec.host} label={`${rec.kind} host`} />
                      </div>

                      <div style={{ color: 'var(--t3)' }}>Value</div>
                      <div className="flex items-start gap-2">
                        <code
                          className="font-mono text-xs px-2 py-1 rounded flex-1 break-all"
                          style={{ background: 'var(--subtle)', color: 'var(--t1)' }}
                        >
                          {rec.value}
                        </code>
                        <CopyButton text={rec.value} label={`${rec.kind} value`} />
                      </div>
                    </div>

                    {rec.note && (
                      <p className="text-xs mt-3 pt-3 border-t" style={{ borderColor: 'var(--card-border)', color: 'var(--t3)' }}>
                        ℹ️ {rec.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <p className="text-xs mt-4 flex items-center gap-1" style={{ color: 'var(--t3)' }}>
                <ExternalLink className="w-3 h-3" />
                Need help? The DNS interface varies by provider — if you&apos;re stuck, email support@iqsport.ai
                and we&apos;ll do it together on a 10-min call.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
