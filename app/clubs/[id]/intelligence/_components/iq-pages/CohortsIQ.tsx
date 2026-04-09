'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import { Users, Plus, Trash2, X, Filter, ChevronRight, Eye, Send, UserCheck, Sparkles, Clock, Mail, MessageSquare, Wand2, Loader2 } from 'lucide-react'
import { DuprBadge } from './shared/SmsBadge'
import { trpc } from '@/lib/trpc'

// ── Filter field definitions ──
const FILTER_FIELDS = [
  { key: 'age', label: 'Age', type: 'number' as const, ops: ['gte', 'lte', 'gt', 'lt', 'eq'] },
  { key: 'gender', label: 'Gender', type: 'select' as const, ops: ['eq'], options: [{ label: 'Male', value: 'M' }, { label: 'Female', value: 'F' }] },
  { key: 'sessionFormat', label: 'Session Type', type: 'select' as const, ops: ['eq'], options: [
    { label: 'Open Play', value: 'OPEN_PLAY' }, { label: 'Clinic', value: 'CLINIC' },
    { label: 'League', value: 'LEAGUE_PLAY' }, { label: 'Drill', value: 'DRILL' }, { label: 'Social', value: 'SOCIAL' },
  ] },
  { key: 'dayOfWeek', label: 'Day of Week', type: 'select' as const, ops: ['eq'], options: [
    { label: 'Monday', value: 'Monday' }, { label: 'Tuesday', value: 'Tuesday' }, { label: 'Wednesday', value: 'Wednesday' },
    { label: 'Thursday', value: 'Thursday' }, { label: 'Friday', value: 'Friday' }, { label: 'Saturday', value: 'Saturday' }, { label: 'Sunday', value: 'Sunday' },
  ] },
  { key: 'frequency', label: 'Sessions/Month', type: 'number' as const, ops: ['gte', 'lte', 'eq'] },
  { key: 'recency', label: 'Days Since Last Visit', type: 'number' as const, ops: ['lte', 'gte'] },
  { key: 'membershipType', label: 'Membership Type', type: 'text' as const, ops: ['contains', 'eq'] },
  { key: 'membershipStatus', label: 'Membership Status', type: 'text' as const, ops: ['contains', 'eq'] },
  { key: 'skillLevel', label: 'Skill Level', type: 'text' as const, ops: ['contains', 'eq'] },
  { key: 'city', label: 'City', type: 'text' as const, ops: ['eq', 'contains'] },
  { key: 'zipCode', label: 'Zip Code', type: 'text' as const, ops: ['eq'] },
]

const OP_LABELS: Record<string, string> = {
  eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=', contains: 'contains', in: 'in',
}

function parseCohortFilters(raw: unknown): CohortFilter[] {
  if (!Array.isArray(raw)) return []
  return raw as CohortFilter[]
}

type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in'

interface CohortFilter {
  field: string
  op: FilterOp
  value: string | number | string[]
}

export default function CohortsIQ() {
  const params = useParams()
  const clubId = params.id as string

  const [showCreate, setShowCreate] = useState(false)
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(null)
  const [campaignCohort, setCampaignCohort] = useState<{ id: string; name: string; filters: any } | null>(null)

  const { data: cohorts, refetch } = trpc.intelligence.listCohorts.useQuery({ clubId })
  const { data: coverage, refetch: refetchCoverage } = trpc.intelligence.getCohortDataCoverage.useQuery({ clubId })
  const deleteMutation = trpc.intelligence.deleteCohort.useMutation({ onSuccess: () => refetch() })
  const enrichMutation = trpc.intelligence.enrichMemberData.useMutation({
    onSuccess: (data) => {
      refetchCoverage()
      refetch()
      const lines = [
        `Gender: ${data.gender.inferred} members enriched`,
        `  • ${data.gender.fromEvents} from event history (100% accurate)`,
        `  • ${data.gender.fromNames} from name analysis (AI)`,
        `  • ${data.gender.skipped} ambiguous names skipped`,
        ``,
        `Skill Level: ${data.skill.inferred} members enriched from event history`,
      ]
      alert(lines.join('\n'))
    },
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl" style={{ fontWeight: 800, color: 'var(--heading)' }}>
            <Users className="w-6 h-6 inline mr-2" />
            Cohorts
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--t3)' }}>
            Create custom member segments for targeted AI campaigns
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => { setShowCreate(true); setSelectedCohortId(null) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-white"
          style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 600 }}
        >
          <Plus className="w-4 h-4" /> Create Cohort
        </motion.button>
      </div>

      {/* Create / Edit modal */}
      <AnimatePresence>
        {showCreate && (
          <CohortBuilder
            clubId={clubId}
            onClose={() => setShowCreate(false)}
            onSaved={() => { setShowCreate(false); refetch() }}
          />
        )}
      </AnimatePresence>

      {/* Cohort detail view */}
      <AnimatePresence>
        {selectedCohortId && (
          <CohortDetail
            clubId={clubId}
            cohortId={selectedCohortId}
            onClose={() => setSelectedCohortId(null)}
          />
        )}
      </AnimatePresence>

      {/* Data Coverage Banner */}
      {coverage && !showCreate && !selectedCohortId && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" style={{ color: '#8B5CF6' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--heading)' }}>
                Data Coverage — {coverage.totalActive.toLocaleString()} active members
              </span>
            </div>
            {(coverage.fields.gender.percent < 50 || coverage.fields.skillLevel.percent < 50) && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                disabled={enrichMutation.isPending}
                onClick={() => enrichMutation.mutate({ clubId })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 600 }}
              >
                <Wand2 className="w-3.5 h-3.5" />
                {enrichMutation.isPending ? 'Enriching...' : 'Enrich Data with AI'}
              </motion.button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(coverage.fields).map(([key, val]: [string, any]) => {
              const label = FILTER_FIELDS.find(f => f.key === key)?.label || key
              const color = val.percent >= 80 ? '#10B981' : val.percent >= 30 ? '#F59E0B' : '#EF4444'
              return (
                <span key={key} className="text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1.5"
                  style={{ background: `${color}15`, color, fontWeight: 600 }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                  {label}: {val.percent}%
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Cohort list */}
      {!showCreate && !selectedCohortId && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cohorts?.map((c: any) => (
            <motion.div
              key={c.id}
              whileHover={{ scale: 1.02 }}
              className="group rounded-2xl p-5 cursor-pointer transition-all"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
              onClick={() => setSelectedCohortId(c.id)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}>
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={(e) => { e.stopPropagation(); setCampaignCohort({ id: c.id, name: c.name, filters: c.filters }) }}
                    className="p-1.5 rounded-lg transition-all hover:bg-violet-500/10"
                    style={{ color: '#8B5CF6' }}
                    title="Launch campaign"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm('Delete this cohort?')) deleteMutation.mutate({ clubId, cohortId: c.id }) }}
                    className="p-1.5 rounded-lg transition-all hover:bg-red-500/10"
                    style={{ color: 'var(--t4)' }}
                    title="Delete cohort"
                  >
                    <Trash2 className="w-4 h-4 hover:text-red-400" />
                  </button>
                </div>
              </div>
              <h3 className="text-base mb-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>{c.name}</h3>
              {c.description && <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--t3)' }}>{c.description}</p>}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4" style={{ color: '#8B5CF6' }} />
                  <span className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>{c.memberCount}</span>
                  <span className="text-xs" style={{ color: 'var(--t4)' }}>members</span>
                </div>
                <ChevronRight className="w-4 h-4" style={{ color: 'var(--t4)' }} />
              </div>
              {/* Filter tags */}
              <div className="flex flex-wrap gap-1 mt-3">
                {parseCohortFilters(c.filters).map((f, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.1)', color: '#A78BFA' }}>
                    {FILTER_FIELDS.find(ff => ff.key === f.field)?.label || f.field} {OP_LABELS[f.op]} {String(f.value)}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}

          {cohorts?.length === 0 && (
            <div className="col-span-full text-center py-16" style={{ color: 'var(--t4)' }}>
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No cohorts yet. Create your first one!</p>
            </div>
          )}
        </div>
      )}

      {/* Quick Campaign Modal */}
      {campaignCohort && (
        <QuickCampaignModal clubId={clubId} cohort={campaignCohort} onClose={() => setCampaignCohort(null)} />
      )}
    </motion.div>
  )
}

// ── Quick Campaign Modal (Launch Campaign from Cohort) ──
function QuickCampaignModal({ clubId, cohort, onClose }: { clubId: string; cohort: { id: string; name: string; filters: any }; onClose: () => void }) {
  const [subject, setSubject] = useState(`Message for ${cohort.name}`)
  const [body, setBody] = useState('')
  const [channel, setChannel] = useState<'email' | 'sms' | 'both'>('email')
  const [generating, setGenerating] = useState(false)
  const [sent, setSent] = useState<{ sent: number; skipped: number; errors: number } | null>(null)

  // Load cohort members
  const { data: membersData, isLoading } = trpc.intelligence.getCohortMembers.useQuery(
    { clubId, cohortId: cohort.id },
    { enabled: !!cohort.id },
  )
  const members = membersData?.members || []

  // AI generate message
  const generateMutation = trpc.intelligence.generateCohortCampaign.useMutation({
    onSuccess: (data: any) => {
      if (data.subject) setSubject(data.subject)
      if (data.body) setBody(data.body)
      setGenerating(false)
    },
    onError: () => setGenerating(false),
  })

  const handleGenerate = () => {
    setGenerating(true)
    generateMutation.mutate({ clubId, cohortId: cohort.id })
  }

  // Send campaign
  const sendMutation = trpc.intelligence.sendOutreachMessage.useMutation({
    onSuccess: () => {},
  })

  const handleSend = async () => {
    let sentCount = 0, skippedCount = 0, errCount = 0
    for (const m of members) {
      if (!m.email) { skippedCount++; continue }
      try {
        await sendMutation.mutateAsync({
          clubId,
          userId: m.id,
          type: 'CAMPAIGN',
          channel,
          subject,
          body,
        } as any)
        sentCount++
      } catch {
        errCount++
      }
    }
    setSent({ sent: sentCount, skipped: skippedCount, errors: errCount })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl p-6"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg" style={{ fontWeight: 700, color: 'var(--heading)' }}>
            <Send className="w-5 h-5 inline mr-2" style={{ color: '#8B5CF6' }} />
            Campaign: {cohort.name}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--t4)' }}><X className="w-5 h-5" /></button>
        </div>

        {sent ? (
          <div className="text-center py-8">
            <div className="text-3xl mb-3">✅</div>
            <p className="text-lg mb-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>Campaign Sent!</p>
            <p className="text-sm" style={{ color: 'var(--t3)' }}>
              {sent.sent} sent, {sent.skipped} skipped, {sent.errors} errors
            </p>
            <button onClick={onClose} className="mt-4 px-6 py-2 rounded-xl text-sm" style={{ background: 'var(--subtle)', color: 'var(--t2)', fontWeight: 600 }}>Close</button>
          </div>
        ) : (
          <>
            {/* Audience */}
            <div className="p-3 rounded-xl mb-4" style={{ background: 'var(--subtle)' }}>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" style={{ color: '#8B5CF6' }} />
                <span className="text-sm" style={{ fontWeight: 600, color: 'var(--heading)' }}>
                  {isLoading ? '...' : members.length} recipients
                </span>
              </div>
            </div>

            {/* Channel */}
            <div className="flex gap-2 mb-4">
              {(['email', 'sms', 'both'] as const).map(ch => (
                <button key={ch} onClick={() => setChannel(ch)}
                  className="flex-1 py-2 rounded-xl text-xs capitalize transition-all"
                  style={{
                    background: channel === ch ? 'rgba(139,92,246,0.15)' : 'var(--subtle)',
                    color: channel === ch ? '#8B5CF6' : 'var(--t3)',
                    fontWeight: channel === ch ? 700 : 500,
                    border: channel === ch ? '1px solid rgba(139,92,246,0.3)' : '1px solid transparent',
                  }}>
                  {ch === 'both' ? 'Email + SMS' : ch.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Subject */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs" style={{ fontWeight: 600, color: 'var(--t2)' }}>Subject</label>
                <button onClick={handleGenerate} disabled={generating}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg"
                  style={{ background: 'rgba(139,92,246,0.1)', color: '#8B5CF6', fontWeight: 600 }}>
                  {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  AI Generate
                </button>
              </div>
              <input value={subject} onChange={e => setSubject(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }} />
            </div>

            {/* Body */}
            <div className="mb-4">
              <label className="text-xs mb-1 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>Message</label>
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={4}
                placeholder="Write your message or click AI Generate..."
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }} />
            </div>

            {/* Send */}
            <button onClick={handleSend}
              disabled={!subject.trim() || !body.trim() || members.length === 0 || sendMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm text-white transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 700 }}>
              {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Send to {members.length} member{members.length > 1 ? 's' : ''}
            </button>
          </>
        )}
      </motion.div>
    </div>
  )
}

// ── Cohort Builder ──
function CohortBuilder({ clubId, onClose, onSaved }: { clubId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [filters, setFilters] = useState<CohortFilter[]>([])
  const [saving, setSaving] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiParsing, setAiParsing] = useState(false)

  const parseMutation = trpc.intelligence.parseCohortFromText.useMutation({
    onSuccess: (data) => {
      if (data.name) setName(data.name)
      if (data.description) setDescription(data.description)
      if (data.filters?.length) setFilters(data.filters as CohortFilter[])
      setAiPrompt('')
    },
    onSettled: () => setAiParsing(false),
  })

  const handleAiParse = () => {
    if (!aiPrompt.trim()) return
    setAiParsing(true)
    parseMutation.mutate({ clubId, text: aiPrompt.trim() })
  }

  const previewQuery = trpc.intelligence.previewCohort.useQuery(
    { clubId, filters },
    { enabled: filters.length > 0 }
  )

  const createMutation = trpc.intelligence.createCohort.useMutation({
    onSuccess: () => onSaved(),
  })

  const addFilter = () => {
    setFilters([...filters, { field: 'age', op: 'gte' as FilterOp, value: '' }])
  }

  const updateFilter = (i: number, update: Partial<CohortFilter>) => {
    const next = [...filters]
    next[i] = { ...next[i], ...update }
    // Reset value when field changes
    if (update.field) {
      const fieldDef = FILTER_FIELDS.find(f => f.key === update.field)
      next[i].op = (fieldDef?.ops[0] || 'eq') as FilterOp
      next[i].value = ''
    }
    setFilters(next)
  }

  const removeFilter = (i: number) => setFilters(filters.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    if (!name.trim() || filters.length === 0) return
    setSaving(true)
    try {
      await createMutation.mutateAsync({
        clubId,
        name: name.trim(),
        description: description.trim() || undefined,
        filters: filters.map(f => ({
          ...f,
          value: typeof f.value === 'string' && !isNaN(Number(f.value)) && ['age', 'duprRating'].includes(f.field)
            ? Number(f.value) : f.value,
        })),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="rounded-2xl p-6 space-y-5"
      style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg" style={{ fontWeight: 700, color: 'var(--heading)' }}>
          <Filter className="w-5 h-5 inline mr-2" />
          Create Cohort
        </h2>
        <button onClick={onClose} style={{ color: 'var(--t4)' }}><X className="w-5 h-5" /></button>
      </div>

      {/* AI Natural Language Input */}
      <div className="flex gap-2">
        <input
          type="text" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAiParse()}
          placeholder="Describe your cohort: e.g. &quot;DUPR 2-3, men 55+&quot; or &quot;active beginner women&quot;"
          className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
          style={{ background: 'rgba(139,92,246,0.06)', color: 'var(--t1)', border: '1px solid rgba(139,92,246,0.2)' }}
        />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleAiParse}
          disabled={!aiPrompt.trim() || aiParsing}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm text-white"
          style={{ background: 'linear-gradient(135deg, #8B5CF6, #6366F1)', fontWeight: 600, opacity: (!aiPrompt.trim() || aiParsing) ? 0.5 : 1 }}
        >
          {aiParsing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '✨'} AI
        </motion.button>
      </div>
      {parseMutation.error && (
        <p className="text-xs" style={{ color: '#EF4444' }}>{parseMutation.error.message}</p>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: 'var(--card-border)' }} />
        <span className="text-[10px] uppercase" style={{ color: 'var(--t4)' }}>or build manually</span>
        <div className="flex-1 h-px" style={{ background: 'var(--card-border)' }} />
      </div>

      {/* Name + description */}
      <div className="space-y-3">
        <input
          type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="Cohort name (e.g. Senior Men 55+)"
          className="w-full px-4 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
          style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
        />
        <input
          type="text" value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full px-4 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
          style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
        />
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>Conditions</span>
          <button onClick={addFilter} className="text-xs flex items-center gap-1" style={{ color: '#8B5CF6', fontWeight: 600 }}>
            <Plus className="w-3.5 h-3.5" /> Add filter
          </button>
        </div>

        {filters.map((f, i) => {
          const fieldDef = FILTER_FIELDS.find(ff => ff.key === f.field)
          return (
            <div key={i} className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'var(--subtle)' }}>
              {/* Field */}
              <select
                value={f.field}
                onChange={e => updateFilter(i, { field: e.target.value })}
                className="px-2 py-1.5 rounded-lg text-xs outline-none"
                style={{ background: 'var(--card-bg)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
              >
                {FILTER_FIELDS.map(ff => <option key={ff.key} value={ff.key}>{ff.label}</option>)}
              </select>

              {/* Operator */}
              <select
                value={f.op}
                onChange={e => updateFilter(i, { op: e.target.value as FilterOp })}
                className="px-2 py-1.5 rounded-lg text-xs outline-none"
                style={{ background: 'var(--card-bg)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
              >
                {(fieldDef?.ops || ['eq']).map(op => <option key={op} value={op}>{OP_LABELS[op]}</option>)}
              </select>

              {/* Value */}
              {fieldDef?.type === 'select' ? (
                <select
                  value={f.value as string}
                  onChange={e => updateFilter(i, { value: e.target.value })}
                  className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--card-bg)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
                >
                  <option value="">Select...</option>
                  {fieldDef.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input
                  type={fieldDef?.type === 'number' ? 'number' : 'text'}
                  value={f.value as string}
                  onChange={e => updateFilter(i, { value: e.target.value })}
                  placeholder={fieldDef?.type === 'number' ? '0' : 'Value...'}
                  className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--card-bg)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
                />
              )}

              <button onClick={() => removeFilter(i)} style={{ color: 'var(--t4)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
          )
        })}

        {filters.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: 'var(--t4)' }}>
            Add conditions to define who belongs to this cohort
          </p>
        )}
      </div>

      {/* Preview count */}
      {filters.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: 'rgba(139,92,246,0.08)' }}>
          <Eye className="w-4 h-4" style={{ color: '#8B5CF6' }} />
          <span className="text-sm" style={{ color: '#A78BFA', fontWeight: 600 }}>
            {previewQuery.isLoading ? 'Counting...' : `${previewQuery.data?.count ?? 0} members match`}
          </span>
        </div>
      )}

      {/* Save */}
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm" style={{ color: 'var(--t3)' }}>Cancel</button>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleSave}
          disabled={!name.trim() || filters.length === 0 || saving}
          className="px-5 py-2.5 rounded-xl text-sm text-white"
          style={{
            background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
            fontWeight: 600,
            opacity: (!name.trim() || filters.length === 0 || saving) ? 0.5 : 1,
          }}
        >
          {saving ? 'Creating...' : 'Create Cohort'}
        </motion.button>
      </div>
    </motion.div>
  )
}

// ── Cohort Detail View ──
function CohortDetail({ clubId, cohortId, onClose }: { clubId: string; cohortId: string; onClose: () => void }) {
  const { data, isLoading } = trpc.intelligence.getCohortMembers.useQuery({ clubId, cohortId })

  if (isLoading) {
    return (
      <div className="rounded-2xl p-6" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'var(--subtle)' }} />)}
        </div>
      </div>
    )
  }

  const cohort = data?.cohort as any
  const members = (data?.members || []) as any[]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="rounded-2xl p-6" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg" style={{ fontWeight: 700, color: 'var(--heading)' }}>{cohort?.name}</h2>
            {cohort?.description && <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>{cohort.description}</p>}
          </div>
          <button onClick={onClose} style={{ color: 'var(--t4)' }}><X className="w-5 h-5" /></button>
        </div>

        {/* Filter tags */}
        <div className="flex flex-wrap gap-1.5">
          {parseCohortFilters(cohort?.filters).map((f, i) => (
            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.1)', color: '#A78BFA' }}>
              {FILTER_FIELDS.find(ff => ff.key === f.field)?.label || f.field} {OP_LABELS[f.op]} {String(f.value)}
            </span>
          ))}
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(6,182,212,0.1)', color: '#06B6D4' }}>
            {members.length} members
          </span>
        </div>
      </div>

      {/* AI Campaign Strategies — primary action */}
      <CohortCampaignSuggestion clubId={clubId} cohortId={cohortId} memberCount={members.length} />

      {/* Members list */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <div className="space-y-1">
          {members.map((m: any) => (
            <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl transition-colors" style={{ background: 'var(--subtle)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 700 }}>
                {(m.name || m.email || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate" style={{ fontWeight: 600, color: 'var(--heading)' }}>{m.name || 'Unnamed'}</div>
                <div className="text-xs truncate" style={{ color: 'var(--t4)' }}>
                  {[
                    m.age ? `${m.age}y` : null,
                    m.gender === 'M' ? 'Male' : m.gender === 'F' ? 'Female' : null,
                    m.membershipType,
                    m.skillLevel,
                  ].filter(Boolean).join(' · ') || m.email}
                </div>
              </div>
              {m.duprRating > 0 && <DuprBadge rating={Number(m.duprRating)} />}
            </div>
          ))}

          {members.length === 0 && (
            <p className="text-center py-8 text-sm" style={{ color: 'var(--t4)' }}>No members match these filters</p>
          )}
        </div>
      </div>

    </motion.div>
  )
}

// ── Strategy colors/icons ──
const STRATEGY_STYLES: Record<string, { gradient: string; icon: string; label: string }> = {
  before_peak: { gradient: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', icon: '🎯', label: 'Peak Day Boost' },
  re_engage: { gradient: 'linear-gradient(135deg, #F59E0B, #EF4444)', icon: '💌', label: 'Re-engage' },
  slot_filler: { gradient: 'linear-gradient(135deg, #10B981, #059669)', icon: '⚡', label: 'Last-Minute Fill' },
}

// ── AI Campaign Suggestions ──
function CohortCampaignSuggestion({ clubId, cohortId, memberCount }: { clubId: string; cohortId: string; memberCount: number }) {
  const [campaigns, setCampaigns] = useState<any[] | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const generateMutation = trpc.intelligence.generateCohortCampaign.useMutation({
    onSuccess: (data) => {
      setCampaigns(data.campaigns || [])
      setExpanded(null)
    },
  })

  if (memberCount === 0) return null

  return (
    <div className="rounded-2xl p-6" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>
          <Sparkles className="w-4 h-4 inline mr-1.5" style={{ color: '#F59E0B' }} />
          AI Campaign Strategies
        </h3>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => generateMutation.mutate({ clubId, cohortId })}
          disabled={generateMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-white"
          style={{
            background: 'linear-gradient(135deg, #F59E0B, #EF4444)',
            fontWeight: 600,
            opacity: generateMutation.isPending ? 0.5 : 1,
          }}
        >
          {generateMutation.isPending ? (
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          {campaigns ? 'Regenerate' : 'Generate Strategies'}
        </motion.button>
      </div>

      {generateMutation.error && (
        <p className="text-xs mb-3" style={{ color: '#EF4444' }}>{generateMutation.error.message}</p>
      )}

      {!campaigns && !generateMutation.isPending && (
        <p className="text-xs text-center py-6" style={{ color: 'var(--t4)' }}>
          Click &quot;Generate Strategies&quot; to get 3 AI-powered campaign strategies for this cohort
        </p>
      )}

      {campaigns && campaigns.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          {campaigns.map((c, i) => {
            const style = STRATEGY_STYLES[c.strategy] || STRATEGY_STYLES.before_peak
            const isOpen = expanded === i

            return (
              <motion.div
                key={i}
                layout
                className="rounded-xl overflow-hidden"
                style={{ border: isOpen ? '1px solid rgba(139,92,246,0.3)' : '1px solid var(--card-border)' }}
              >
                {/* Header — always visible */}
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer"
                  style={{ background: isOpen ? 'rgba(139,92,246,0.05)' : 'var(--subtle)' }}
                  onClick={() => setExpanded(isOpen ? null : i)}
                >
                  <span className="text-lg">{style.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>
                      {c.strategyLabel || style.label}
                    </div>
                    <div className="text-xs truncate" style={{ color: 'var(--t3)' }}>{c.subjectLine}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-md" style={{ background: 'var(--card-bg)' }}>
                      {c.channel === 'sms' ? <MessageSquare className="w-3 h-3" style={{ color: '#8B5CF6' }} /> : <Mail className="w-3 h-3" style={{ color: '#8B5CF6' }} />}
                      <span className="text-[10px]" style={{ color: 'var(--t3)' }}>{c.channel === 'sms' ? 'SMS' : 'Email'}</span>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-md" style={{ background: 'var(--card-bg)' }}>
                      <Clock className="w-3 h-3" style={{ color: '#06B6D4' }} />
                      <span className="text-[10px]" style={{ color: 'var(--t3)' }}>{c.bestTimeToSend}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 transition-transform" style={{ color: 'var(--t4)', transform: isOpen ? 'rotate(90deg)' : 'none' }} />
                  </div>
                </div>

                {/* Expanded content */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-3">
                        <div className="p-3 rounded-xl text-xs whitespace-pre-wrap" style={{ background: 'var(--card-bg)', color: 'var(--t2)', lineHeight: 1.6 }}>
                          {c.body}
                        </div>
                        {c.tone && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.1)', color: '#A78BFA' }}>
                              Tone: {c.tone}
                            </span>
                          </div>
                        )}
                        {c.reasoning && (
                          <p className="text-[11px] italic" style={{ color: 'var(--t4)' }}>{c.reasoning}</p>
                        )}
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm text-white"
                          style={{ background: style.gradient, fontWeight: 600 }}
                        >
                          <Send className="w-3.5 h-3.5" /> Use This Strategy
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </motion.div>
      )}
    </div>
  )
}
