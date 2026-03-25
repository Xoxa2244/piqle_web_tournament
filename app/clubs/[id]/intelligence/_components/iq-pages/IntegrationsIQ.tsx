'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import {
  Plug, CheckCircle2, AlertCircle, Loader2, RefreshCw,
  Unplug, ArrowRight, Clock, Database, Users, LayoutGrid,
} from 'lucide-react'

export function IntegrationsIQ({ clubId }: { clubId: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your existing club management software to unlock AI insights.
        </p>
      </div>

      <CourtReserveCard clubId={clubId} />
    </div>
  )
}

function CourtReserveCard({ clubId }: { clubId: string }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; courtCount?: number; error?: string } | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  const utils = trpc.useUtils()

  const { data: status, isLoading: statusLoading } = trpc.connectors.getStatus.useQuery(
    { clubId },
    { staleTime: 10_000 }
  )

  const connectMutation = trpc.connectors.connect.useMutation({
    onSuccess: () => {
      utils.connectors.getStatus.invalidate({ clubId })
      setUsername('')
      setPassword('')
      setTestResult(null)
    },
  })

  const disconnectMutation = trpc.connectors.disconnect.useMutation({
    onSuccess: () => {
      utils.connectors.getStatus.invalidate({ clubId })
    },
  })

  const syncMutation = trpc.connectors.syncNow.useMutation({
    onSuccess: () => {
      utils.connectors.getStatus.invalidate({ clubId })
    },
  })

  const testMutation = trpc.connectors.testConnection.useMutation()

  const handleTest = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const result = await testMutation.mutateAsync({ clubId, username, password })
      setTestResult({ ok: true, courtCount: result.courtCount })
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message || 'Connection failed' })
    } finally {
      setIsTesting(false)
    }
  }

  const handleConnect = () => {
    connectMutation.mutate({ clubId, username, password })
  }

  const handleSync = (isInitial: boolean) => {
    syncMutation.mutate({ clubId, isInitial })
  }

  if (statusLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    )
  }

  const isConnected = status?.connected

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <span className="text-xl font-bold text-blue-500">CR</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">CourtReserve</h3>
            <p className="text-sm text-muted-foreground">
              Sync members, courts, and bookings automatically
            </p>
          </div>
        </div>

        {isConnected && 'status' in status && (
          <StatusBadge status={status.status || 'connected'} />
        )}
      </div>

      {/* Body */}
      <div className="p-6">
        {!isConnected ? (
          <ConnectForm
            username={username}
            password={password}
            onUsernameChange={setUsername}
            onPasswordChange={setPassword}
            onTest={handleTest}
            onConnect={handleConnect}
            isTesting={isTesting}
            isConnecting={connectMutation.isPending}
            testResult={testResult}
          />
        ) : (
          <ConnectedView
            status={status}
            onSync={() => handleSync(false)}
            onInitialSync={() => handleSync(true)}
            onDisconnect={() => disconnectMutation.mutate({ clubId })}
            isSyncing={syncMutation.isPending || ('status' in status && status.status === 'syncing')}
            isDisconnecting={disconnectMutation.isPending}
            syncError={syncMutation.error?.message}
          />
        )}
      </div>
    </div>
  )
}

// ── Sub-components ──

function StatusBadge({ status }: { status: string }) {
  const config = {
    connected: { color: 'bg-green-500/10 text-green-500', icon: CheckCircle2, label: 'Connected' },
    syncing: { color: 'bg-blue-500/10 text-blue-500', icon: Loader2, label: 'Syncing...' },
    error: { color: 'bg-red-500/10 text-red-500', icon: AlertCircle, label: 'Error' },
  }[status] || { color: 'bg-gray-500/10 text-gray-500', icon: Plug, label: status }

  const Icon = config.icon

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${config.color}`}>
      <Icon className={`h-3.5 w-3.5 ${status === 'syncing' ? 'animate-spin' : ''}`} />
      {config.label}
    </span>
  )
}

function ConnectForm({
  username, password, onUsernameChange, onPasswordChange,
  onTest, onConnect, isTesting, isConnecting, testResult,
}: {
  username: string
  password: string
  onUsernameChange: (v: string) => void
  onPasswordChange: (v: string) => void
  onTest: () => void
  onConnect: () => void
  isTesting: boolean
  isConnecting: boolean
  testResult: { ok: boolean; courtCount?: number; error?: string } | null
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter your CourtReserve API credentials. Available on Scale and Enterprise plans
        under Settings → Integrations.
      </p>

      <div className="grid gap-3 max-w-md">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">API Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            placeholder="Your API username"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">API Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="Your API password"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
          testResult.ok
            ? 'bg-green-500/10 text-green-500'
            : 'bg-red-500/10 text-red-500'
        }`}>
          {testResult.ok ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Connected successfully. {testResult.courtCount} courts found.
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4" />
              {testResult.error}
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={onTest}
          disabled={!username || !password || isTesting}
          className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
          Test Connection
        </button>

        {testResult?.ok && (
          <button
            onClick={onConnect}
            disabled={isConnecting}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Connect & Start Sync
          </button>
        )}
      </div>
    </div>
  )
}

function ConnectedView({
  status, onSync, onInitialSync, onDisconnect, isSyncing, isDisconnecting, syncError,
}: {
  status: any
  onSync: () => void
  onInitialSync: () => void
  onDisconnect: () => void
  isSyncing: boolean
  isDisconnecting: boolean
  syncError?: string
}) {
  const lastSync = status.lastSyncAt
    ? new Date(status.lastSyncAt)
    : null

  const result = status.lastSyncResult as any

  return (
    <div className="space-y-4">
      {/* Last sync info */}
      {lastSync && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          Last synced: {lastSync.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
      )}

      {/* Sync stats */}
      {result && result.members && (
        <div className="grid grid-cols-3 gap-3">
          <SyncStatCard
            icon={Users}
            label="Members"
            created={result.members.created}
            updated={result.members.updated}
            matched={result.members.matched}
          />
          <SyncStatCard
            icon={LayoutGrid}
            label="Sessions"
            created={result.sessions?.created}
            updated={result.sessions?.updated}
          />
          <SyncStatCard
            icon={Database}
            label="Bookings"
            created={result.bookings?.created}
            updated={result.bookings?.updated}
          />
        </div>
      )}

      {/* Error */}
      {(status.lastError || syncError) && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {syncError || status.lastError}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={onSync}
          disabled={isSyncing}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
        >
          {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Sync Now
        </button>

        {!lastSync && (
          <button
            onClick={onInitialSync}
            disabled={isSyncing}
            className="px-4 py-2 rounded-lg border border-blue-600 text-blue-600 text-sm font-medium hover:bg-blue-600/10 disabled:opacity-50 inline-flex items-center gap-2"
          >
            <Database className="h-4 w-4" />
            Initial Sync (90 days)
          </button>
        )}

        <button
          onClick={onDisconnect}
          disabled={isDisconnecting || isSyncing}
          className="px-4 py-2 rounded-lg border border-red-500/30 text-red-500 text-sm font-medium hover:bg-red-500/10 disabled:opacity-50 inline-flex items-center gap-2 ml-auto"
        >
          {isDisconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
          Disconnect
        </button>
      </div>
    </div>
  )
}

function SyncStatCard({ icon: Icon, label, created, updated, matched }: {
  icon: any
  label: string
  created?: number
  updated?: number
  matched?: number
}) {
  const total = (created || 0) + (updated || 0) + (matched || 0)
  if (total === 0) return null

  return (
    <div className="rounded-lg border border-border bg-accent/30 p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        {created ? <div>+{created} new</div> : null}
        {updated ? <div>{updated} updated</div> : null}
        {matched ? <div>{matched} matched</div> : null}
      </div>
    </div>
  )
}
