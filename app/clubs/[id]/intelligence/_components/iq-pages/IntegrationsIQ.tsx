'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { trpc } from '@/lib/trpc'
import { useTheme } from '../IQThemeProvider'
import {
  Plug, CheckCircle2, AlertCircle, Loader2, RefreshCw,
  Unplug, ArrowRight, Clock, Database, Users, LayoutGrid,
  Wifi, WifiOff, Zap, Settings, Upload, FileSpreadsheet,
  CalendarDays, X,
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

      {/* Excel Import */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} style={{ marginTop: 24 }}>
        <ExcelImportSection clubId={clubId} />
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

  const handleFileSelect = (type: ExcelFile['type']) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx,.xls,.csv'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        setFiles(prev => [...prev.filter(f => f.type !== type), { type, name: file.name, data: base64 }])
        setResult(null)
        setError(null)
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

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

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'linear-gradient(135deg, #10b981, #059669)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <FileSpreadsheet size={24} color="white" />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Data Import</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Upload CourtReserve Excel exports</p>
        </div>
        {/* Delete All Button */}
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none',
            background: isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.08)',
            color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            <Unplug size={14} />
            Delete All Data
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleDeleteAll} disabled={deleting} style={{
              padding: '8px 14px', borderRadius: 8, border: 'none',
              background: '#ef4444', color: 'white', fontSize: 12, fontWeight: 600,
              cursor: deleting ? 'not-allowed' : 'pointer',
            }}>
              {deleting ? <Loader2 size={14} className="animate-spin" /> : 'Yes, Delete Everything'}
            </button>
            <button onClick={() => setConfirmDelete(false)} style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid var(--card-border)',
              background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
            }}>
              Cancel
            </button>
          </div>
        )}
      </div>

      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Export your data from CourtReserve (Reports → Members, Reservations, Event Registrants) and upload the .xlsx files below.
        Files are processed one at a time to handle large datasets.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {fileSlots.map(slot => {
          const file = files.find(f => f.type === slot.type)
          const isDone = progress.done.some(d => d === file?.name)
          const isActive = progress.current === file?.name
          const hasError = progress.errors.some(e => e.startsWith(file?.name || '---'))
          const Icon = slot.icon
          return (
            <div key={slot.type} onClick={() => !file && !importing && handleFileSelect(slot.type)} style={{
              padding: 14, borderRadius: 10, textAlign: 'center', position: 'relative',
              border: isDone ? '1px solid rgba(16,185,129,0.4)' : isActive ? '1px solid rgba(139,92,246,0.4)' : hasError ? '1px solid rgba(239,68,68,0.4)' : file ? '1px solid rgba(16,185,129,0.4)' : '1px dashed var(--card-border)',
              background: isDone ? 'rgba(16,185,129,0.08)' : isActive ? 'rgba(139,92,246,0.08)' : file ? (isDark ? 'rgba(16,185,129,0.05)' : 'rgba(16,185,129,0.03)') : (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'),
              cursor: file || importing ? 'default' : 'pointer', transition: 'all 0.2s',
            }}>
              {file && !importing && (
                <button onClick={(e) => { e.stopPropagation(); removeFile(slot.type) }} style={{
                  position: 'absolute', top: 6, right: 6, background: 'rgba(239,68,68,0.2)', border: 'none',
                  borderRadius: 6, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#ef4444',
                }}>
                  <X size={12} />
                </button>
              )}
              {isActive ? (
                <Loader2 size={20} className="animate-spin" style={{ color: '#8B5CF6', marginBottom: 6, display: 'inline-block' }} />
              ) : (
                <Icon size={20} style={{ color: isDone ? '#10b981' : file ? '#10b981' : 'var(--text-secondary)', marginBottom: 6 }} />
              )}
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{slot.label}</div>
              <div style={{ fontSize: 11, color: isActive ? '#8B5CF6' : 'var(--text-secondary)', marginTop: 2 }}>
                {isActive ? 'Importing...' : file ? file.name.substring(0, 20) + (file.name.length > 20 ? '...' : '') : slot.description}
              </div>
              {isDone && <CheckCircle2 size={14} style={{ color: '#10b981', marginTop: 6 }} />}
              {hasError && <AlertCircle size={14} style={{ color: '#ef4444', marginTop: 6 }} />}
            </div>
          )
        })}
      </div>

      <button onClick={handleImport} disabled={files.length === 0 || importing} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: 'none',
        background: files.length > 0 && !importing ? 'linear-gradient(135deg, #10b981, #059669)' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
        color: files.length > 0 && !importing ? 'white' : 'var(--text-secondary)',
        fontSize: 14, fontWeight: 600, cursor: files.length > 0 && !importing ? 'pointer' : 'not-allowed',
      }}>
        {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
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
