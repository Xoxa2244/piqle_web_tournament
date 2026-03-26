'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { trpc } from '@/lib/trpc'
import { useTheme } from '../IQThemeProvider'
import {
  Plug, CheckCircle2, AlertCircle, Loader2, RefreshCw,
  Unplug, ArrowRight, Clock, Database, Users, LayoutGrid,
  Wifi, WifiOff, Zap, Settings,
} from 'lucide-react'

// ── Shared Card (same as BillingIQ) ──
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 ${className}`} style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', backdropFilter: 'var(--glass-blur)', boxShadow: 'var(--card-shadow)' }}>
      {children}
    </div>
  )
}

export function IntegrationsIQ({ clubId }: { clubId: string }) {
  const { isDark } = useTheme()

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
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
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plug size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Integrations</h1>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
              Connect your club management software to unlock AI insights
            </p>
          </div>
        </div>
      </motion.div>

      <CourtReserveConnector clubId={clubId} />

      {/* Coming soon cards */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} style={{ marginTop: 24 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: 0.5 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-secondary)' }}>OC</span>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>OpenCourt</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Coming soon</p>
            </div>
            <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', color: 'var(--text-secondary)' }}>
              Planned
            </span>
          </div>
        </Card>
      </motion.div>
    </div>
  )
}

function CourtReserveConnector({ clubId }: { clubId: string }) {
  const { isDark } = useTheme()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; courtCount?: number; error?: string } | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const isDev = typeof window !== 'undefined' && (window.location.hostname.includes('dev.') || window.location.hostname === 'localhost')

  const utils = trpc.useUtils()

  const { data: status, isLoading } = trpc.connectors.getStatus.useQuery(
    { clubId },
    { staleTime: 10_000 }
  )

  const connectMutation = trpc.connectors.connect.useMutation({
    onSuccess: () => {
      utils.connectors.getStatus.invalidate({ clubId })
      setUsername('')
      setPassword('')
      setBaseUrl('')
      setTestResult(null)
    },
  })

  const disconnectMutation = trpc.connectors.disconnect.useMutation({
    onSuccess: () => utils.connectors.getStatus.invalidate({ clubId }),
  })

  const syncMutation = trpc.connectors.syncNow.useMutation({
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
            <StatusPill status={connStatus} isDark={isDark} />
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
                I confirm that I have the authority to share my club&apos;s member data with IQSport for analytics purposes, and that I agree to the{' '}
                <a href="/dpa" target="_blank" style={{ color: '#6366F1', textDecoration: 'underline' }}>Data Processing Agreement</a>,{' '}
                <a href="/privacy" target="_blank" style={{ color: '#6366F1', textDecoration: 'underline' }}>Privacy Policy</a>, and{' '}
                <a href="/terms" target="_blank" style={{ color: '#6366F1', textDecoration: 'underline' }}>Terms of Service</a>.
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
            {/* Sync Stats */}
            {'lastSyncResult' in status && status.lastSyncResult && (
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
                onClick={() => syncMutation.mutate({ clubId, isInitial: false })}
                disabled={syncMutation.isPending || connStatus === 'syncing'}
                variant="primary"
                loading={syncMutation.isPending || connStatus === 'syncing'}
                icon={<RefreshCw size={15} />}
              >
                Sync Now
              </IQButton>

              {!('lastSyncAt' in status && status.lastSyncAt) && (
                <IQButton
                  onClick={() => syncMutation.mutate({ clubId, isInitial: true })}
                  disabled={syncMutation.isPending}
                  variant="secondary"
                  loading={false}
                  icon={<Database size={15} />}
                >
                  Full Sync (90 days)
                </IQButton>
              )}

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
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  )
}

// ── Design System Components ──

function StatusPill({ status, isDark }: { status: string; isDark: boolean }) {
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

function StatCard({ icon: Icon, label, data, color, isDark }: {
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
