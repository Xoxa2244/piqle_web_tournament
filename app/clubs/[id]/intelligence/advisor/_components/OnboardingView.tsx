'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Sparkles, Download, BarChart3, Users, Brain, Info } from 'lucide-react'
import { FileDropZone } from './FileDropZone'
import { downloadSampleCSV } from '../_hooks/useFileParser'

type OnboardingViewProps = {
  onFile: (file: File) => void
  onSkip: () => void
  parseError: string
}

export function OnboardingView({ onFile, onSkip, parseError }: OnboardingViewProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-8">
      {/* Hero */}
      <div className="text-center mb-8 max-w-lg">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-lime-500 to-green-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-lime-500/20">
          <Brain className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-2xl font-bold mb-3">Welcome to AI Club Advisor</h1>
        <p className="text-muted-foreground">
          Upload your court schedule to unlock AI-powered insights about occupancy, member engagement, revenue optimization, and more.
        </p>
      </div>

      {/* Capabilities */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 max-w-2xl w-full">
        {[
          { icon: BarChart3, label: 'Occupancy Analysis', desc: 'Find underfilled sessions & peak hours' },
          { icon: Users, label: 'Member Insights', desc: 'Engagement patterns & churn risk' },
          { icon: Sparkles, label: 'Smart Suggestions', desc: 'Revenue tips & slot-filling strategies' },
        ].map(({ icon: Icon, label, desc }) => (
          <Card key={label} className="text-center">
            <CardContent className="pt-5 pb-4">
              <div className="w-10 h-10 rounded-lg bg-lime-100 dark:bg-lime-900/30 flex items-center justify-center mx-auto mb-3">
                <Icon className="w-5 h-5 text-lime-700 dark:text-lime-400" />
              </div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground mt-1">{desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Drop zone */}
      <div className="w-full max-w-xl">
        <FileDropZone onFile={onFile} variant="large" />

        {parseError && (
          <Card className="border-red-200 bg-red-50 mt-4">
            <CardContent className="flex items-center gap-3 py-3">
              <Info className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{parseError}</p>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-center gap-4 mt-6">
          <Button variant="outline" size="sm" onClick={downloadSampleCSV}>
            <Download className="w-4 h-4 mr-2" />
            Download Sample CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
            Try without data
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Supports CSV, TSV, and XLSX files from CourtReserve, Playbypoint, or any court scheduler
        </p>
      </div>
    </div>
  )
}
