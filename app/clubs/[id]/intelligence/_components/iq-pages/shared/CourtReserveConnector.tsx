'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { trpc } from '@/lib/trpc'
import { AILoadingAnimation } from '../AILoadingAnimation'
import { useTheme } from '../../IQThemeProvider'
import {
  Plug, CheckCircle2, AlertCircle, Loader2, RefreshCw,
  WifiOff, Zap, Database, Users, LayoutGrid, Clock,
} from 'lucide-react'

// ── Shared Card ──
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 ${className}`} style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', backdropFilter: 'var(--glass-blur)', boxShadow: 'var(--card-shadow)' }}>
      {children}
    </div>
  )
}

// ── Design System Components ──

function StatusPill({ status }: { status: string }) {
  const config: Record<string, { bg: string; color: string; label: string; pulse?: boolean }> = {
    connected: { bg: 'rgba(16,185,129,0.12)', color: '#10B981', label: 'Connected' },
    syncing: { bg: 'rgba(59,130,246,0.12)', color: '#3B82F6', label: 'Syncing...', pulse: true },
    error: { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', label: 'Error' },
  }
  const c = config[status] || { bg: 'rgba(107,114,128,0.12)', color: '#6B7280', label: status }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: c.bg, color: c.color,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: c.color,
        ...(c.pulse ? { animation: 'pulse 1.5s infinite' } : {}),
      }} />
      {c.label}
    </span>
  )
}

function InputField({ label, value, onChange, placeholder, type = 'text', hint }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string; hint?: string
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
        {label}
        {hint && <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400, marginLeft: 6 }}>({hint})</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="iq-input"
        autoComplete="off"
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'var(--text-primary)',
          outline: 'none',
          transition: 'border-color 0.2s',
        }}
        onFocus={(e) => e.target.style.borderColor = '#6366F1'}
        onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
      />
    </div>
  )
}

function IQButton({ children, onClick, disabled, variant, loading, icon }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean
  variant: 'primary' | 'secondary' | 'danger'; loading?: boolean; icon?: React.ReactNode
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: {
      background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
      color: '#fff',
      border: 'none',
      boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
    },
    secondary: {
      background: 'transparent',
      color: 'var(--text-primary)',
      border: '1px solid var(--card-border)',
    },
    danger: {
      background: 'transparent',
      color: '#EF4444',
      border: '1px solid rgba(239,68,68,0.25)',
    },
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles[variant],
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s',
      }}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}

export function StatCard({ icon: Icon, label, data, color, isDark }: {
  icon: any; label: string; data?: any; color: string; isDark: boolean
}) {
  if (!data) return null
  const total = (data.created || 0) + (data.updated || 0) + (data.matched || 0)

  return (
    <div style={{
      padding: 14, borderRadius: 12,
      background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      border: '1px solid var(--card-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={14} style={{ color }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginBottom: 4 }}>{total}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {data.created ? `+${data.created} new` : ''}
        {data.created && data.updated ? ' · ' : ''}
        {data.updated ? `${data.updated} updated` : ''}
        {data.matched ? ` · ${data.matched} matched` : ''}
      </div>
    </div>
  )
}

// ── Main Component ──

export function CourtReserveConnector({ clubId, compact }: { clubId: string; compact?: boolean }) {
  const { isDark } = useTheme()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; courtCount?: number; error?: string } | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const isDev = typeof window !== 'undefined' && (window.location.hostname.includes('dev.') || window.location.hostname === 'localhost')

  const utils = trpc.useUtils()

  const [isSyncing, setIsSyncing] = useState(false)
  const { data: status, isLoading } = trpc.connectors.getStatus.useQuery(
    { clubId },
    { staleTime: isSyncing ? 2_000 : 10_000, refetchInterval: isSyncing ? 3_000 : false }
  )

  // Track syncing state from status
  useEffect(() => {
    const s = status && 'status' in status ? status.status : null
    setIsSyncing(s === 'syncing')
  }, [status])

  const syncRetryRef = useRef(0)
  const MAX_SYNC_RETRIES = 30

  const syncMutation = trpc.connectors.syncNow.useMutation({
    onSuccess: (data) => {
      utils.connectors.getStatus.invalidate({ clubId })
      if (data && (data as any).incomplete) {
        syncRetryRef.current++
        if (syncRetryRef.current < MAX_SYNC_RETRIES) {
          console.log(`[Sync] Chunk done (${syncRetryRef.current}/${MAX_SYNC_RETRIES}), continuing in 2s...`)
          setTimeout(() => syncMutation.mutate({ clubId, isInitial: true }), 2000)
        } else {
          console.log('[Sync] Max retries reached, deferring to pg_cron')
          setIsSyncing(false)
          syncRetryRef.current = 0
        }
      } else {
        setIsSyncing(false)
        syncRetryRef.current = 0
      }
    },
    onError: () => {
      syncRetryRef.current++
      if (syncRetryRef.current < MAX_SYNC_RETRIES) {
        console.log(`[Sync] Timeout (${syncRetryRef.current}/${MAX_SYNC_RETRIES}), retrying in 3s...`)
        setTimeout(() => syncMutation.mutate({ clubId, isInitial: true }), 3000)
      } else {
        console.log('[Sync] Max retries reached, deferring to pg_cron')
        setIsSyncing(false)
        syncRetryRef.current = 0
      }
    },
  })

  const connectMutation = trpc.connectors.connect.useMutation({
    onSuccess: () => {
      utils.connectors.getStatus.invalidate({ clubId })
      setUsername('')
      setPassword('')
      setBaseUrl('')
      setTestResult(null)
      // Auto-start sync after connection
      syncRetryRef.current = 0
      setIsSyncing(true)
      syncMutation.mutate({ clubId, isInitial: true })
    },
  })

  const disconnectMutation = trpc.connectors.disconnect.useMutation({
    onSuccess: () => utils.connectors.getStatus.invalidate({ clubId }),
  })

  const testMutation = trpc.connectors.testConnection.useMutation()

  const handleTest = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const result = await testMutation.mutateAsync({ clubId, username, password, baseUrl: baseUrl || undefined })
      setTestResult({ ok: true, courtCount: result.courtCount })
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message || 'Connection failed' })
    } finally {
      setIsTesting(false)
    }
  }

  const handleConnect = () => {
    connectMutation.mutate({ clubId, username, password, baseUrl: baseUrl || undefined, agreedToTerms })
  }

  if (isLoading) {
    return (
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 20 }}>
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Loading...</span>
        </div>
      </Card>
    )
  }

  const isConnected = status?.connected
  const connStatus = isConnected && 'status' in status ? status.status : null

  return (
    <>
      {/* Fix autofill white background */}
      <style>{`
        .iq-input { background: rgba(255,255,255,0.04) !important; color: var(--text-primary) !important; }
        .iq-input:-webkit-autofill,
        .iq-input:-webkit-autofill:hover,
        .iq-input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 30px #1a1a2e inset !important;
          -webkit-text-fill-color: #e5e7eb !important;
          border-color: rgba(255,255,255,0.08) !important;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          {/* Card Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isConnected ? 20 : 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(59,130,246,0.3)',
              }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>CR</span>
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>CourtReserve</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                  Sync members, courts & bookings
                </p>
              </div>
            </div>

            {connStatus && (
              <StatusPill status={connStatus} />
            )}
          </div>

          {!isConnected ? (
            /* ── Connect Form ── */
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                Enter your CourtReserve API credentials to sync data automatically.
                <br />
                <span style={{ opacity: 0.7 }}>Available on Scale & Enterprise plans → Settings → Integrations</span>
              </p>

              <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
                <InputField label="API Username" value={username} onChange={setUsername} placeholder="Your API username" />
                <InputField label="API Password" value={password} onChange={setPassword} placeholder="Your API password" type="password" />
                {isDev && (
                  <InputField label="Base URL" value={baseUrl} onChange={setBaseUrl} placeholder="https://api.courtreserve.com" hint="dev only" />
                )}
              </div>

              {/* Consent checkbox */}
              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16,
                cursor: 'pointer', fontSize: 13, lineHeight: 1.5,
                color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
              }}>
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  style={{ marginTop: 3, accentColor: '#6366F1', width: 16, height: 16, flexShrink: 0 }}
                />
                <span>
                  I confirm that I have the authority to share my club&apos;s member data with IQSport for analytics and communication purposes, and that I agree to the{' '}
                  <a href="/dpa" target="_blank" style={{ color: '#6366F1', textDecoration: 'underline' }}>Data Processing Agreement</a>,{' '}
                  <a href="/privacy" target="_blank" style={{ color: '#6366F1', textDecoration: 'underline' }}>Privacy Policy</a>,{' '}
                  <a href="/terms" target="_blank" style={{ color: '#6366F1', textDecoration: 'underline' }}>Terms of Service</a>, and{' '}
                  <a href="/sms-terms" target="_blank" style={{ color: '#6366F1', textDecoration: 'underline' }}>SMS Terms</a>.
                  I will obtain SMS consent from members before enabling SMS notifications, or share the{' '}
                  <a href="/sms-opt-in" target="_blank" style={{ color: '#6366F1', textDecoration: 'underline' }}>SMS opt-in link</a> with them.
                </span>
              </label>

              {/* Test result */}
              {testResult && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', borderRadius: 10, marginTop: 16, fontSize: 13, fontWeight: 500,
                  background: testResult.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                  color: testResult.ok ? '#10B981' : '#EF4444',
                }}>
                  {testResult.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  {testResult.ok
                    ? `Connected — ${testResult.courtCount} courts found`
                    : testResult.error
                  }
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20 }}>
                <IQButton
                  onClick={handleTest}
                  disabled={!username || !password || isTesting || !agreedToTerms}
                  variant="secondary"
                  loading={isTesting}
                  icon={<Plug size={15} />}
                >
                  Test Connection
                </IQButton>

                {testResult?.ok && (
                  <IQButton
                    onClick={handleConnect}
                    disabled={connectMutation.isPending || !agreedToTerms}
                    variant="primary"
                    loading={connectMutation.isPending}
                    icon={<Zap size={15} />}
                  >
                    Connect & Sync
                  </IQButton>
                )}
              </div>
            </div>
          ) : (
            /* ── Connected View ── */
            <div>
              {/* Syncing — Brain Animation + Phase Info */}
              {(connStatus === 'syncing' || isSyncing) && (() => {
                const progress = ('lastSyncResult' in status ? status.lastSyncResult : null) as any
                const percent = progress?.percent || 0
                const statusText = progress?.status || 'Syncing...'
                const nextRetry = progress?.nextRetryAt ? new Date(progress.nextRetryAt) : null
                const isPaused = nextRetry && nextRetry > new Date()
                const pauseMinutes = isPaused ? Math.ceil((nextRetry.getTime() - Date.now()) / 60000) : 0

                return (
                  <div className="mb-4">
                    {isPaused ? (
                      <div className="text-center py-6">
                        <div className="text-2xl mb-2">⏸</div>
                        <p className="text-sm mb-1" style={{ color: 'var(--t2)', fontWeight: 600 }}>
                          Paused — API rate limit
                        </p>
                        <p className="text-xs" style={{ color: 'var(--t3)' }}>
                          Resuming automatically in ~{pauseMinutes} min
                        </p>
                      </div>
                    ) : (
                      <AILoadingAnimation
                        progress={percent}
                        statusMessage={statusText}
                        waitForCompletion={false}
                      />
                    )}
                    {progress?.membersSynced != null && progress?.membersTotal != null && (
                      <div className="mt-3 text-center">
                        <div className="text-xs" style={{ color: 'var(--t3)' }}>
                          Members: <strong>{Number(progress.membersSynced).toLocaleString()}</strong> / {Number(progress.membersTotal).toLocaleString()}
                        </div>
                      </div>
                    )}
                    {progress?.syncPhaseIdx != null && (
                      <div className="mt-2 text-center">
                        <div className="text-[11px]" style={{ color: 'var(--t4)' }}>
                          Phase {progress.syncPhaseIdx + 1}/4 — {['Recent + upcoming', '2-5 months ago', '5-8 months ago', '8-12 months ago'][progress.syncPhaseIdx] || 'Syncing'}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Sync Stats (show when not syncing) */}
              {!isSyncing && connStatus !== 'syncing' && 'lastSyncResult' in status && status.lastSyncResult && !(status.lastSyncResult as any)?.phase && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                  <StatCard icon={Users} label="Members" data={status.lastSyncResult?.members} color="#6366F1" isDark={isDark} />
                  <StatCard icon={LayoutGrid} label="Sessions" data={status.lastSyncResult?.sessions} color="#3B82F6" isDark={isDark} />
                  <StatCard icon={Database} label="Bookings" data={status.lastSyncResult?.bookings} color="#10B981" isDark={isDark} />
                </div>
              )}

              {/* Last sync */}
              {'lastSyncAt' in status && status.lastSyncAt && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  <Clock size={13} />
                  Last synced {new Date(status.lastSyncAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              )}

              {/* Error */}
              {('lastError' in status && status.lastError || syncMutation.error) && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13,
                  background: 'rgba(239,68,68,0.1)', color: '#EF4444',
                }}>
                  <AlertCircle size={16} />
                  {syncMutation.error?.message || ('lastError' in status ? status.lastError : '')}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <IQButton
                  onClick={() => {
                    const progress = 'lastSyncResult' in status ? status.lastSyncResult as any : null
                    const isIncomplete = progress?.incomplete || progress?.phase === 'members'
                    const hasEverFullySynced = 'lastSyncAt' in status && status.lastSyncAt && !isIncomplete
                    syncRetryRef.current = 0
                    setIsSyncing(true)
                    syncMutation.mutate({ clubId, isInitial: !hasEverFullySynced })
                  }}
                  disabled={syncMutation.isPending || connStatus === 'syncing' || isSyncing}
                  variant="primary"
                  loading={syncMutation.isPending || connStatus === 'syncing'}
                  icon={<RefreshCw size={15} />}
                >
                  Sync Now
                </IQButton>

                {!compact && (
                  <>
                    <div style={{ flex: 1 }} />
                    <IQButton
                      onClick={() => disconnectMutation.mutate({ clubId })}
                      disabled={disconnectMutation.isPending || syncMutation.isPending}
                      variant="danger"
                      loading={disconnectMutation.isPending}
                      icon={<WifiOff size={15} />}
                    >
                      Disconnect
                    </IQButton>
                  </>
                )}
              </div>
            </div>
          )}
        </Card>
      </motion.div>
    </>
  )
}
