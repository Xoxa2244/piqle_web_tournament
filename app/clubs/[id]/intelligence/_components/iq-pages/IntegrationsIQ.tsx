'use client'

import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { trpc } from '@/lib/trpc'
import { AILoadingAnimation } from './AILoadingAnimation'
import { useTheme } from '../IQThemeProvider'
import {
  Plug, CheckCircle2, AlertCircle, Loader2, RefreshCw,
  Unplug, ArrowRight, Clock, Database, Users, LayoutGrid,
  Wifi, WifiOff, Zap, Settings, Upload, FileSpreadsheet,
  CalendarDays, X, FileText,
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

      {/* Data Import Providers */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} style={{ marginTop: 32 }}>
        <h2 className="text-lg mb-4" style={{ fontWeight: 700, color: 'var(--heading)' }}>Import Data</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* CourtReserve */}
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
            <div className="flex items-center gap-3 px-5 py-3" style={{ background: 'linear-gradient(135deg, #1e40af, #3b82f6)' }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
                <span className="text-white text-xs" style={{ fontWeight: 800 }}>CR</span>
              </div>
              <div>
                <span className="text-sm text-white" style={{ fontWeight: 700 }}>CourtReserve</span>
                <p className="text-[10px] text-white/60">Excel exports (.xlsx)</p>
              </div>
            </div>
            <ExcelImportSection clubId={clubId} />
          </div>

          {/* PodPlay */}
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
            <div className="flex items-center gap-3 px-5 py-3" style={{ background: 'linear-gradient(135deg, #059669, #10B981)' }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
                <span className="text-white text-xs" style={{ fontWeight: 800 }}>PP</span>
              </div>
              <div>
                <span className="text-sm text-white" style={{ fontWeight: 700 }}>PodPlay</span>
                <p className="text-[10px] text-white/60">CSV exports (.csv)</p>
              </div>
            </div>
            <PodPlayImportSection clubId={clubId} />
          </div>
        </div>
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
            {/* Syncing — Brain Animation */}
            {connStatus === 'syncing' && (() => {
              const progress = ('lastSyncResult' in status ? status.lastSyncResult : null) as any
              const percent = progress?.percent || 0
              const statusText = progress?.status || 'Syncing...'
              return (
                <div className="mb-4">
                  <AILoadingAnimation
                    progress={percent}
                    statusMessage={statusText}
                    waitForCompletion={false}
                  />
                  {progress?.membersSynced != null && progress?.membersTotal != null && (
                    <div className="mt-3 text-center">
                      <div className="text-xs" style={{ color: 'var(--t3)' }}>
                        Members: <strong>{Number(progress.membersSynced).toLocaleString()}</strong> / {Number(progress.membersTotal).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Sync Stats (show when not syncing) */}
            {connStatus !== 'syncing' && 'lastSyncResult' in status && status.lastSyncResult && !(status.lastSyncResult as any)?.phase && (
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
                  const hasEverSynced = 'lastSyncAt' in status && status.lastSyncAt
                  syncMutation.mutate({ clubId, isInitial: !hasEverSynced })
                }}
                disabled={syncMutation.isPending || connStatus === 'syncing'}
                variant="primary"
                loading={syncMutation.isPending || connStatus === 'syncing'}
                icon={<RefreshCw size={15} />}
              >
                Sync Now
              </IQButton>

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

// ── Excel Import Section ──

interface ExcelFile {
  type: 'members' | 'reservations' | 'events'
  name: string
  data: string
}

function ExcelImportSection({ clubId }: { clubId: string }) {
  const { isDark } = useTheme()
  const [files, setFiles] = useState<ExcelFile[]>([])
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [progress, setProgress] = useState<{ current: string; done: string[]; errors: string[] }>({ current: '', done: [], errors: [] })
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const deleteMutation = trpc.intelligence.deleteAllClubData.useMutation()

  const fileSlots: { type: ExcelFile['type']; label: string; icon: any; description: string }[] = [
    { type: 'members', label: 'Members', icon: Users, description: 'MembersReport.xlsx' },
    { type: 'reservations', label: 'Reservations', icon: CalendarDays, description: 'ReservationReport.xlsx' },
    { type: 'events', label: 'Events', icon: LayoutGrid, description: 'EventRegistrantsReport.xlsx' },
  ]

  const removeFile = (type: ExcelFile['type']) => setFiles(prev => prev.filter(f => f.type !== type))

  const handleDeleteAll = async () => {
    setDeleting(true)
    setError(null)
    try {
      const res = await deleteMutation.mutateAsync({ clubId })
      setConfirmDelete(false)
      setResult(null)
      setFiles([])
      setProgress({ current: '', done: [], errors: [] })
      alert(`All data deleted. Removed: ${Object.entries(res.deleted).filter(([,v]) => (v as number) > 0).map(([k,v]) => `${v} ${k}`).join(', ')}`)
    } catch (err: any) {
      setError(err.message || 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  // Import files ONE BY ONE — parse XLSX client-side, send JSON rows to avoid timeout
  const handleImport = async () => {
    if (files.length === 0) return
    setImporting(true)
    setError(null)
    setResult(null)
    setProgress({ current: '', done: [], errors: [] })

    const XLSX = (await import('xlsx')).default
    const combined: any = { members: { created: 0, updated: 0, errors: 0 }, sessions: { created: 0, updated: 0, errors: 0 }, bookings: { created: 0, updated: 0, errors: 0 } }

    // Import order: members first, then reservations, then events
    const ordered = ['members', 'reservations', 'events'] as const
    for (const fileType of ordered) {
      const file = files.find(f => f.type === fileType)
      if (!file) continue

      setProgress(prev => ({ ...prev, current: file.name }))

      try {
        // Parse XLSX client-side
        const binary = atob(file.data)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const wb = XLSX.read(bytes, { type: 'array' })
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])

        // Send rows as JSON (no base64 bloat)
        const res = await fetch('/api/connectors/courtreserve/import-rows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clubId, fileType, rows }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }))
          throw new Error(err.error || `HTTP ${res.status}`)
        }

        const data = await res.json()
        // Merge results
        for (const key of ['members', 'sessions', 'bookings'] as const) {
          if (data[key]) {
            combined[key].created += data[key].created || 0
            combined[key].updated += data[key].updated || 0
            combined[key].errors += data[key].errors || 0
          }
        }

        setProgress(prev => ({ ...prev, done: [...prev.done, file.name] }))
      } catch (err: any) {
        setProgress(prev => ({ ...prev, errors: [...prev.errors, `${file.name}: ${err.message}`] }))
      }
    }

    setResult(combined)
    setProgress(prev => ({ ...prev, current: '' }))
    setImporting(false)
  }

  const [dragOver, setDragOver] = useState(false)

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files)
    for (const file of dropped) {
      // Auto-detect type from filename
      const name = file.name.toLowerCase()
      const type: ExcelFile['type'] = name.includes('member') ? 'members'
        : name.includes('reservation') ? 'reservations'
        : 'events'
      handleFileSelect(type, file)
    }
  }

  const handleFileSelectWithPicker = (type: ExcelFile['type']) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx,.xls,.csv'
    input.multiple = true
    input.onchange = async (e) => {
      const selected = Array.from((e.target as HTMLInputElement).files || [])
      for (const file of selected) {
        handleFileSelect(type, file)
      }
    }
    input.click()
  }

  const handleFileSelect = (type: ExcelFile['type'], file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      setFiles(prev => [...prev.filter(f => f.type !== type), { type, name: file.name, data: base64 }])
      setResult(null)
      setError(null)
    }
    reader.readAsDataURL(file)
  }

  return (
    <Card>
      {/* Delete button */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs" style={{ color: 'var(--t4)' }}>Upload .xlsx exports from CourtReserve Reports</p>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px]" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            <Unplug className="w-3 h-3" /> Delete All
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={handleDeleteAll} disabled={deleting} className="px-3 py-1.5 rounded-lg text-[10px] text-white" style={{ background: '#ef4444', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
              {deleting ? 'Deleting...' : 'Yes, Delete'}
            </button>
            <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg text-[10px]" style={{ border: '1px solid var(--card-border)', background: 'transparent', color: 'var(--t4)', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl mb-4 transition-all"
        style={{
          border: `2px dashed ${dragOver ? '#3b82f6' : 'var(--card-border)'}`,
          background: dragOver ? 'rgba(59,130,246,0.06)' : 'var(--subtle)',
        }}
      >
        <Upload className="w-5 h-5" style={{ color: dragOver ? '#3b82f6' : 'var(--t4)' }} />
        <p className="text-xs" style={{ color: 'var(--t2)', fontWeight: 600 }}>Drop CourtReserve .xlsx files here</p>
        <p className="text-[10px]" style={{ color: 'var(--t4)' }}>Members, Reservations, Events — auto-detected by filename</p>
      </div>

      {/* File slots — click to select individually */}
      <div className="space-y-2 mb-4">
        {fileSlots.map(slot => {
          const file = files.find(f => f.type === slot.type)
          return (
            <div key={slot.type} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--subtle)' }}>
              <button
                onClick={() => handleFileSelectWithPicker(slot.type)}
                disabled={importing}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all"
                style={{ background: file ? 'rgba(59,130,246,0.1)' : 'var(--card-bg)', border: '1px solid var(--card-border)', color: file ? '#3b82f6' : 'var(--t2)', fontWeight: 600 }}
              >
                {file ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
                {slot.label}
              </button>
              <span className="text-xs flex-1 truncate" style={{ color: 'var(--t4)' }}>
                {file ? file.name : slot.description}
              </span>
              {file && !importing && (
                <button onClick={() => removeFile(slot.type)} className="p-1" style={{ color: 'var(--t4)' }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Import button */}
      <button onClick={handleImport} disabled={files.length === 0 || importing}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm transition-all"
        style={{
          background: files.length > 0 && !importing ? 'linear-gradient(135deg, #1e40af, #3b82f6)' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
          color: files.length > 0 && !importing ? '#fff' : 'var(--t4)',
          fontWeight: 600, border: 'none', cursor: files.length > 0 && !importing ? 'pointer' : 'not-allowed',
        }}
      >
        {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {importing ? `Importing (${progress.done.length}/${files.length})...` : `Import ${files.length} file${files.length !== 1 ? 's' : ''}`}
      </button>

      {progress.errors.length > 0 && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 13, color: '#ef4444' }}>
          {progress.errors.map((e, i) => <div key={i}><AlertCircle size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />{e}</div>)}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 13, color: '#ef4444' }}>
          <AlertCircle size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />{error}
        </div>
      )}

      {result && !importing && (
        <div style={{ marginTop: 12 }}>
          <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', fontSize: 13, color: '#10b981' }}>
            <CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />Import complete!
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <StatCard icon={Users} label="Members" color="#6366f1" data={result.members} isDark={isDark} />
            <StatCard icon={LayoutGrid} label="Sessions" color="#f59e0b" data={result.sessions} isDark={isDark} />
            <StatCard icon={Database} label="Bookings" color="#10b981" data={result.bookings} isDark={isDark} />
          </div>
        </div>
      )}
    </Card>
  )
}

// ── PodPlay CSV Import ──

type PodPlayFileType = 'customers' | 'settlements'

function PodPlayImportSection({ clubId }: { clubId: string }) {
  const { isDark } = useTheme()
  const [files, setFiles] = useState<Record<PodPlayFileType, { name: string; rows: any[] } | null>>({
    customers: null,
    settlements: null,
  })
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<{ current: string; done: string[]; errors: string[] }>({ current: '', done: [], errors: [] })
  const [result, setResult] = useState<any>(null)

  const fileSlots: { key: PodPlayFileType; label: string; hint: string; multiple?: boolean }[] = [
    { key: 'customers', label: 'Customers CSV', hint: 'Customers_YYYY-MM-DD.csv' },
    { key: 'settlements', label: 'Settlements', hint: 'Drop multiple ZIPs or CSVs — all will be merged', multiple: true },
  ]

  const extractRowsFromZip = async (file: File): Promise<{ name: string; rows: any[] }[]> => {
    const XLSX = await import('xlsx')
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const results: { name: string; rows: any[] }[] = []

    // Find Settlements CSV (not Line Items, not Summary)
    const settlementFile = Object.keys(zip.files).find(
      n => n.startsWith('Settlements ') && !n.includes('Line Items') && !n.includes('Summary') && n.endsWith('.csv')
    )
    const target = settlementFile || Object.keys(zip.files).find(n => n.includes('Line Items') && n.endsWith('.csv'))
    if (target) {
      const csv = await zip.files[target].async('uint8array')
      const wb = XLSX.read(csv)
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
      results.push({ name: target, rows })
    }
    return results
  }

  const parseFiles = async (fileList: File[], type: PodPlayFileType) => {
    const XLSX = await import('xlsx')
    let allRows: any[] = []
    const names: string[] = []

    for (const file of fileList) {
      if (file.name.endsWith('.zip')) {
        const extracted = await extractRowsFromZip(file)
        for (const e of extracted) {
          allRows = allRows.concat(e.rows)
          names.push(e.name)
        }
      } else {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const wb = XLSX.read(bytes)
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws)
        allRows = allRows.concat(rows)
        names.push(file.name)
      }
    }

    if (allRows.length > 0) {
      const label = names.length > 1 ? `${names.length} files (${allRows.length} rows)` : names[0]
      setFiles(prev => ({ ...prev, [type]: { name: label, rows: allRows } }))
    }
  }

  const handleFileSelect = (type: PodPlayFileType, multiple?: boolean) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv,.xlsx,.zip'
    if (multiple) input.multiple = true
    input.onchange = async (e) => {
      const selected = Array.from((e.target as HTMLInputElement).files || [])
      if (selected.length === 0) return
      await parseFiles(selected, type)
    }
    input.click()
  }

  const handleImport = async () => {
    setImporting(true)
    setResult(null)
    setProgress({ current: '', done: [], errors: [] })

    const merged: any = {
      courts: { created: 0, updated: 0, errors: 0 },
      members: { created: 0, updated: 0, matched: 0, errors: 0 },
      sessions: { created: 0, updated: 0, errors: 0 },
      bookings: { created: 0, updated: 0, errors: 0 },
    }

    // Import customers first, then settlements
    const order: PodPlayFileType[] = ['customers', 'settlements']
    for (const type of order) {
      const f = files[type]
      if (!f) continue
      setProgress(p => ({ ...p, current: type }))
      try {
        const res = await fetch('/api/connectors/podplay/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clubId, fileType: type, rows: f.rows }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Import failed')
        // Merge results
        for (const key of Object.keys(merged)) {
          for (const stat of Object.keys(merged[key])) {
            merged[key][stat] += data[key]?.[stat] || 0
          }
        }
        setProgress(p => ({ ...p, done: [...p.done, type] }))
      } catch (err: any) {
        setProgress(p => ({ ...p, errors: [...p.errors, `${type}: ${err.message}`] }))
      }
    }

    setResult(merged)
    setImporting(false)
  }

  const hasFiles = Object.values(files).some(Boolean)

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>PodPlay Import</h3>
          <p className="text-xs" style={{ color: 'var(--t4)' }}>Import customers and session data from PodPlay CSV exports</p>
        </div>
      </div>

      {/* Customers slot */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--subtle)' }}>
          <button
            onClick={() => handleFileSelect('customers')}
            disabled={importing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all"
            style={{ background: files.customers ? 'rgba(16,185,129,0.1)' : 'var(--card-bg)', border: '1px solid var(--card-border)', color: files.customers ? '#10B981' : 'var(--t2)', fontWeight: 600 }}
          >
            {files.customers ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
            Customers CSV
          </button>
          <span className="text-xs flex-1 truncate" style={{ color: 'var(--t4)' }}>
            {files.customers ? files.customers.name : 'Customers_YYYY-MM-DD.csv'}
          </span>
          {files.customers && (
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981' }}>
              {files.customers.rows.length} rows
            </span>
          )}
        </div>

        {/* Settlements drop zone — accepts multiple ZIPs/CSVs */}
        <PodPlayDropZone
          file={files.settlements}
          onFiles={(fileList) => parseFiles(Array.from(fileList), 'settlements')}
          onClickSelect={() => handleFileSelect('settlements', true)}
          importing={importing}
        />
      </div>

      {/* Import button */}
      {hasFiles && !result && (
        <button
          onClick={handleImport}
          disabled={importing}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm text-white transition-all"
          style={{ background: importing ? '#6b7280' : 'linear-gradient(135deg, #10B981, #059669)', fontWeight: 600 }}
        >
          {importing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Importing {progress.current}...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" /> Import PodPlay Data
            </>
          )}
        </button>
      )}

      {/* Progress */}
      {progress.errors.length > 0 && (
        <div className="mt-3 space-y-1">
          {progress.errors.map((err, i) => (
            <div key={i} className="flex items-center gap-2 text-xs" style={{ color: '#EF4444' }}>
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {err}
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 text-xs" style={{ color: '#10B981', fontWeight: 600 }}>
            <CheckCircle2 className="w-4 h-4" /> Import complete!
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatCard icon={Users} label="Members" color="#8b5cf6" data={result.members} isDark={isDark} />
            <StatCard icon={CalendarDays} label="Sessions" color="#06b6d4" data={result.sessions} isDark={isDark} />
            <StatCard icon={Database} label="Bookings" color="#10b981" data={result.bookings} isDark={isDark} />
            <StatCard icon={LayoutGrid} label="Courts" color="#f59e0b" data={result.courts} isDark={isDark} />
          </div>
        </div>
      )}
    </Card>
  )
}

// ── PodPlay Drop Zone for multiple ZIPs ──
function PodPlayDropZone({ file, onFiles, onClickSelect, importing }: {
  file: { name: string; rows: any[] } | null
  onFiles: (files: FileList) => void
  onClickSelect: () => void
  importing: boolean
}) {
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      onFiles(e.dataTransfer.files)
    }
  }

  if (file) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#10B981' }} />
        <div className="flex-1 min-w-0">
          <div className="text-xs truncate" style={{ color: '#10B981', fontWeight: 600 }}>Settlements loaded</div>
          <div className="text-[10px] truncate" style={{ color: 'var(--t4)' }}>{file.name}</div>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981' }}>
          {file.rows.length} rows
        </span>
        <button onClick={onClickSelect} className="text-[10px] underline" style={{ color: 'var(--t4)' }}>Replace</button>
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={onClickSelect}
      className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl cursor-pointer transition-all"
      style={{
        border: `2px dashed ${dragOver ? '#10B981' : 'var(--card-border)'}`,
        background: dragOver ? 'rgba(16,185,129,0.06)' : 'var(--subtle)',
      }}
    >
      <Upload className="w-5 h-5" style={{ color: dragOver ? '#10B981' : 'var(--t4)' }} />
      <div className="text-center">
        <p className="text-xs" style={{ color: 'var(--t2)', fontWeight: 600 }}>
          Drop Settlement ZIPs here
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--t4)' }}>
          or click to select — multiple files supported
        </p>
      </div>
    </div>
  )
}
