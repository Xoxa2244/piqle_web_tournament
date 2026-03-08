'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useToast } from '@/components/ui/use-toast'
import { Loader2 } from 'lucide-react'
import { useAdvisorState } from './_hooks/useAdvisorState'
import { useFileParser } from './_hooks/useFileParser'
import { OnboardingView } from './_components/OnboardingView'
import { ChatView } from './_components/ChatView'
import { FilePreviewView } from './_components/FilePreviewView'
import { ImportDoneView } from './_components/ImportDoneView'
import type { ParsedSession } from './_hooks/useFileParser'

export default function AIAdvisorPage() {
  const params = useParams()
  const clubId = params.id as string
  const { toast } = useToast()

  const { state, dataStatus, isLoadingStatus, setState, refetchStatus } = useAdvisorState(clubId)
  const fileParser = useFileParser()

  // Import state
  const [importError, setImportError] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importStats, setImportStats] = useState<{
    sessionsImported: number
    embeddingsCreated: number
    playersIndexed: number
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

  // Handle import sessions
  const handleImport = async (selectedSessions: ParsedSession[], fileName: string) => {
    setIsImporting(true)
    setImportError('')

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
        playerNames: s.playerNames,
      }))

      const res = await fetch('/api/ai/import-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clubId, sessions: sessionsToImport, fileName }),
      })

      const data = await res.json()

      if (!res.ok) {
        const details = data.details ? `: ${data.details}` : ''
        setImportError((data.error || 'Failed to import sessions') + details)
        setIsImporting(false)
        return
      }

      setImportStats({
        sessionsImported: data.sessionsProcessed,
        embeddingsCreated: data.embeddingsCreated,
        playersIndexed: data.playersIndexed,
      })
      setState('import_done')
      refetchStatus()
      toast({
        title: 'Schedule imported & AI trained!',
        description: `${data.sessionsProcessed} sessions processed. ${data.embeddingsCreated} AI embeddings created.`,
      })
    } catch {
      setImportError('Network error. Please try again.')
    } finally {
      setIsImporting(false)
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
      />
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
