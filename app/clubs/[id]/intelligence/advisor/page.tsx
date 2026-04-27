'use client'

import { useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useToast } from '@/components/ui/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react'
import { useAdvisorState } from './_hooks/useAdvisorState'
import { useFileParser } from './_hooks/useFileParser'
import { OnboardingView } from './_components/OnboardingView'
import { ChatView } from './_components/ChatView'
import { FilePreviewView } from './_components/FilePreviewView'
import { ImportDoneView } from './_components/ImportDoneView'
import { MemberImportView } from './_components/MemberImportView'
import type { ParsedSession } from './_hooks/useFileParser'
import { useBrand } from '@/components/BrandProvider'
import { AdvisorIQ } from '../_components/iq-pages/AdvisorIQ'
import { DemoAdvisorIQ } from '../_components/iq-pages/DemoAdvisorIQ'

export default function AIAdvisorPage() {
  const brand = useBrand()
  const params = useParams()
  const searchParams = useSearchParams()
  const clubId = params.id as string
  const isDemo = searchParams.get('demo') === 'true'

  if (brand.key === 'iqsport') {
    if (isDemo) return <DemoAdvisorIQ clubId={clubId} />
    return <AdvisorIQ clubId={clubId} />
  }

  return <PiqleAdvisorPage />
}

function PiqleAdvisorPage() {
  const params = useParams()
  const clubId = params.id as string
  const { toast } = useToast()

  const { state, dataStatus, isLoadingStatus, setState, refetchStatus } = useAdvisorState(clubId)
  const fileParser = useFileParser()

  // Import state
  const [importError, setImportError] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{
    phase: string
    current: number
    total: number
    message: string
  } | null>(null)
  const [importStats, setImportStats] = useState<{
    sessionsImported: number
    embeddingsCreated: number
    playersIndexed: number
  } | null>(null)
  const [memberImportResult, setMemberImportResult] = useState<{
    created: number
    alreadyExisted: number
    followersCreated: number
    bookingsMatched: number
    totalProcessed: number
  } | null>(null)

  // Handle file drop/select → go to preview
  const handleFile = (file: File) => {
    fileParser.processFile(file)
    setState('file_preview')
  }

  // Handle skip onboarding → go to chat without data
  const handleSkipOnboarding = () => {
    setState('chat_ready')
  }

  // Handle upload data from chat → go to file preview
  const handleUploadData = () => {
    fileParser.reset()
    setState('file_preview')
  }

  // Handle import sessions (SSE streaming with progress)
  const handleImport = async (selectedSessions: ParsedSession[], fileName: string) => {
    setIsImporting(true)
    setImportError('')
    setImportProgress(null)

    try {
      const sessionsToImport = selectedSessions.map(s => ({
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        court: s.court,
        format: s.format,
        skillLevel: s.skillLevel,
        registered: s.registered,
        capacity: s.capacity,
        pricePerPlayer: s.pricePerPlayer,
        playerNames: s.playerNames,
      }))

      const res = await fetch('/api/ai/import-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clubId, sessions: sessionsToImport, fileName }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const details = data.details ? `: ${data.details}` : ''
        setImportError((data.error || 'Failed to import sessions') + details)
        setIsImporting(false)
        return
      }

      // Read SSE stream
      const reader = res.body?.getReader()
      if (!reader) {
        setImportError('Stream not available')
        setIsImporting(false)
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events from buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))

              if (event.phase === 'error') {
                setImportError(event.message || 'Import failed')
                setIsImporting(false)
                return
              }

              if (event.phase === 'done') {
                setImportStats({
                  sessionsImported: event.sessionsProcessed,
                  embeddingsCreated: event.embeddingsCreated,
                  playersIndexed: event.playersIndexed,
                })
                setState('import_done')
                refetchStatus()
                toast({
                  title: 'Schedule imported & AI trained!',
                  description: `${event.sessionsProcessed} sessions processed. ${event.embeddingsCreated} AI embeddings created.`,
                })
              } else {
                setImportProgress({
                  phase: event.phase,
                  current: event.current || 0,
                  total: event.total || 0,
                  message: event.message || '',
                })
              }
            } catch {
              // skip malformed events
            }
          }
        }
      }
    } catch {
      setImportError('Network error. Please try again.')
    } finally {
      setIsImporting(false)
      setImportProgress(null)
    }
  }

  // Handle cancel file preview → go back
  const handleCancelPreview = () => {
    fileParser.reset()
    setState(dataStatus?.hasData ? 'chat_ready' : 'onboarding')
  }

  // Handle start chat after import
  const handleStartChat = () => {
    fileParser.reset()
    setState('chat_ready')
  }

  // Handle import more
  const handleImportMore = () => {
    fileParser.reset()
    setImportStats(null)
    setState('file_preview')
  }

  // Handle member import
  const handleStartMemberImport = () => {
    setState('member_import')
  }

  const handleMemberImportDone = (result: typeof memberImportResult) => {
    setMemberImportResult(result)
    setState('member_import_done')
  }

  const handleMemberImportCancel = () => {
    setState(dataStatus?.hasData ? 'chat_ready' : 'onboarding')
  }

  // ── Render ──

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (state === 'onboarding') {
    return (
      <OnboardingView
        onFile={handleFile}
        onSkip={handleSkipOnboarding}
        parseError={fileParser.parseError}
      />
    )
  }

  if (state === 'file_preview' || state === 'importing') {
    // Still parsing, or no sessions yet → show onboarding/drop zone
    if (fileParser.sessions.length === 0) {
      if (fileParser.isLoading) {
        return (
          <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-lime-600" />
            <p className="text-sm text-muted-foreground">Parsing your file...</p>
          </div>
        )
      }
      return (
        <OnboardingView
          onFile={handleFile}
          onSkip={handleCancelPreview}
          parseError={fileParser.parseError}
        />
      )
    }

    return (
      <FilePreviewView
        sessions={fileParser.sessions}
        fileName={fileParser.fileName}
        sheets={fileParser.sheets}
        selectedSheet={fileParser.selectedSheet}
        onSelectSheet={fileParser.selectSheet}
        onImport={handleImport}
        onCancel={handleCancelPreview}
        importError={importError}
        isImporting={isImporting}
        importProgress={importProgress}
        previousStatus={dataStatus}
      />
    )
  }

  if (state === 'import_done' && importStats) {
    return (
      <ImportDoneView
        sessionsImported={importStats.sessionsImported}
        embeddingsCreated={importStats.embeddingsCreated}
        playersIndexed={importStats.playersIndexed}
        onStartChat={handleStartChat}
        onImportMore={handleImportMore}
        onImportMembers={handleStartMemberImport}
      />
    )
  }

  if (state === 'member_import') {
    return (
      <MemberImportView
        clubId={clubId}
        onDone={handleMemberImportDone}
        onCancel={handleMemberImportCancel}
      />
    )
  }

  if (state === 'member_import_done' && memberImportResult) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-6">
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/10 dark:border-green-800 max-w-lg w-full">
          <CardContent className="flex flex-col items-center py-12">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-semibold text-green-900 dark:text-green-200 mb-2">
              Members Imported!
            </h2>
            <p className="text-sm text-green-700 dark:text-green-300 text-center max-w-md mb-6">
              {memberImportResult.created} new members created, {memberImportResult.alreadyExisted} already existed.
              {memberImportResult.followersCreated > 0 && ` ${memberImportResult.followersCreated} added to club.`}
              {memberImportResult.bookingsMatched > 0 && ` ${memberImportResult.bookingsMatched} session bookings matched.`}
            </p>
            <div className="flex gap-3">
              <Button onClick={handleStartChat} className="gap-2">
                <Sparkles className="w-4 h-4" />
                Start Asking Questions
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button variant="outline" onClick={() => setState('member_import')}>
                Import More
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="max-w-lg w-full">
          <CardHeader>
            <CardTitle className="text-sm">Import Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{memberImportResult.totalProcessed}</p>
                <p className="text-xs text-muted-foreground">Processed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-lime-600">{memberImportResult.created}</p>
                <p className="text-xs text-muted-foreground">New Members</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{memberImportResult.bookingsMatched}</p>
                <p className="text-xs text-muted-foreground">Bookings Matched</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // chat_ready (default)
  return (
    <ChatView
      clubId={clubId}
      dataStatus={dataStatus}
      onUploadData={handleUploadData}
    />
  )
}
