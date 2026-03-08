'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Sparkles, ArrowRight, Upload } from 'lucide-react'

type ImportDoneViewProps = {
  sessionsImported: number
  embeddingsCreated: number
  playersIndexed: number
  onStartChat: () => void
  onImportMore: () => void
}

export function ImportDoneView({
  sessionsImported,
  embeddingsCreated,
  playersIndexed,
  onStartChat,
  onImportMore,
}: ImportDoneViewProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-6">
      <Card className="border-green-200 bg-green-50 dark:bg-green-950/10 dark:border-green-800 max-w-lg w-full">
        <CardContent className="flex flex-col items-center py-12">
          <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-xl font-semibold text-green-900 dark:text-green-200 mb-2">
            Schedule Imported & AI Trained!
          </h2>
          <p className="text-sm text-green-700 dark:text-green-300 text-center max-w-md mb-6">
            {sessionsImported} sessions processed.
            {embeddingsCreated > 0 && ` ${embeddingsCreated} AI knowledge chunks created.`}
            {playersIndexed > 0 && ` ${playersIndexed} players indexed.`}
            {' '}Your AI Advisor is now ready to answer questions about your schedule.
          </p>
          <div className="flex gap-3">
            <Button onClick={onStartChat} className="gap-2">
              <Sparkles className="w-4 h-4" />
              Start Asking Questions
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" onClick={onImportMore}>
              <Upload className="w-4 h-4 mr-2" />
              Import More
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle className="text-sm">Import Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{sessionsImported}</p>
              <p className="text-xs text-muted-foreground">Sessions</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{embeddingsCreated}</p>
              <p className="text-xs text-muted-foreground">AI Chunks</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">{playersIndexed}</p>
              <p className="text-xs text-muted-foreground">Players</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
