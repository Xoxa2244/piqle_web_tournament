'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { trpc } from '@/lib/trpc'
import { useTheme } from '../IQThemeProvider'
import { CourtReserveConnector, StatCard } from './shared/CourtReserveConnector'
import {
  Plug, AlertCircle, Loader2, CheckCircle2, Unplug, Zap,
  Upload, FileSpreadsheet,
  CalendarDays, X, FileText, Users, LayoutGrid, Database,
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

      {/* Data Coverage Checklist */}
      <DataCoverageChecklist clubId={clubId} />

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

/* CourtReserveConnector + helpers moved to ./shared/CourtReserveConnector.tsx */

// ── Data Coverage Checklist ──

function DataCoverageChecklist({ clubId }: { clubId: string }) {
  const { data, isLoading } = trpc.intelligence.getDataCoverageChecklist.useQuery(
    { clubId },
    { enabled: !!clubId },
  )

  if (isLoading || !data) return null
  if (data.members.total === 0 && data.sessions.total === 0) return null

  const badgeColor = (pct: number) => pct >= 80 ? '#10B981' : pct >= 30 ? '#F59E0B' : '#EF4444'

  type FieldData = { filled: number; percent: number; label: string }

  function FieldBadges({ fields }: { fields: Record<string, FieldData> }) {
    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {Object.entries(fields).map(([key, val]) => {
          const color = badgeColor(val.percent)
          return (
            <span key={key} className="text-[10px] px-2 py-0.5 rounded-lg flex items-center gap-1"
              style={{ background: `${color}12`, color, fontWeight: 600 }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
              {val.label}: {val.percent}%
            </span>
          )
        })}
      </div>
    )
  }

  function Section({ icon, title, total, children }: { icon: string; title: string; total: number; children: React.ReactNode }) {
    const hasData = total > 0
    return (
      <div className="p-3 rounded-xl" style={{ background: 'var(--subtle)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <span className="text-xs" style={{ fontWeight: 700, color: 'var(--heading)' }}>{title}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full ml-auto" style={{
            background: hasData ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            color: hasData ? '#10B981' : '#EF4444',
            fontWeight: 700,
          }}>
            {hasData ? total.toLocaleString() : 'No data'}
          </span>
        </div>
        {hasData && children}
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} style={{ marginTop: 24 }}>
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-4 h-4" style={{ color: '#8B5CF6' }} />
          <span className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>Data Coverage</span>
          {data.connector?.lastSyncAt && (
            <span className="text-[10px] ml-auto" style={{ color: 'var(--text-secondary)' }}>
              Last sync: {new Date(data.connector.lastSyncAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        <div className="space-y-3">
          <Section icon="👥" title="Members" total={data.members.total}>
            <FieldBadges fields={data.members.fields} />
          </Section>

          <Section icon="🎾" title="Sessions" total={data.sessions.total}>
            <FieldBadges fields={data.sessions.fields} />
          </Section>

          <Section icon="📋" title="Bookings" total={data.bookings.total}>
            <FieldBadges fields={data.bookings.fields} />
          </Section>

          <Section icon="🏟️" title="Courts" total={data.courts.total}>
            {data.courts.total > 0 && (
              <div className="mt-2">
                <span className="text-[10px] px-2 py-0.5 rounded-lg" style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981', fontWeight: 600 }}>
                  {data.courts.total} active court{data.courts.total > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </Section>
        </div>
      </Card>
    </motion.div>
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
