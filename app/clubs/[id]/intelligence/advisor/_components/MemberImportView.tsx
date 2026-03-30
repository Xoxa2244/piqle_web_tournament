'use client'

import { useState, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Upload, FileSpreadsheet, Users, CheckCircle2, AlertCircle, Loader2, ArrowLeft, ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc'
import Papa from 'papaparse'

type MemberRow = {
  name: string
  email?: string
  phone?: string
}

type ImportResult = {
  created: number
  alreadyExisted: number
  followersCreated: number
  bookingsMatched: number
  totalProcessed: number
}

type MemberImportViewProps = {
  clubId: string
  onDone: (result: ImportResult) => void
  onCancel: () => void
}

export function MemberImportView({ clubId, onDone, onCancel }: MemberImportViewProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing'>('upload')
  const [members, setMembers] = useState<MemberRow[]>([])
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const importMutation = trpc.intelligence.importMembers.useMutation({
    onSuccess: (result) => {
      onDone(result)
    },
    onError: (error) => {
      setStep('preview')
      setParseError(error.message)
    },
  })

  const handleFile = useCallback((file: File) => {
    setParseError('')
    setFileName(file.name)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rows: MemberRow[] = []
        const headers = result.meta.fields?.map(f => f.toLowerCase().trim()) || []

        // Find column indices
        const nameCol = headers.findIndex(h => h === 'name' || h === 'full name' || h === 'fullname' || h === 'player name' || h === 'player')
        const firstNameCol = headers.findIndex(h => h === 'first name' || h === 'firstname' || h === 'first')
        const lastNameCol = headers.findIndex(h => h === 'last name' || h === 'lastname' || h === 'last')
        const emailCol = headers.findIndex(h => h === 'email' || h === 'e-mail' || h === 'email address')
        const phoneCol = headers.findIndex(h => h === 'phone' || h === 'phone number' || h === 'mobile' || h === 'cell')

        const originalHeaders = result.meta.fields || []

        for (const row of result.data as Record<string, string>[]) {
          let name = ''
          if (nameCol >= 0) {
            name = (row[originalHeaders[nameCol]] || '').trim()
          } else if (firstNameCol >= 0) {
            const first = (row[originalHeaders[firstNameCol]] || '').trim()
            const last = lastNameCol >= 0 ? (row[originalHeaders[lastNameCol]] || '').trim() : ''
            name = [first, last].filter(Boolean).join(' ')
          }

          if (!name) continue

          const email = emailCol >= 0 ? (row[originalHeaders[emailCol]] || '').trim() : undefined
          const phone = phoneCol >= 0 ? (row[originalHeaders[phoneCol]] || '').trim() : undefined

          rows.push({
            name,
            email: email && email.includes('@') ? email : undefined,
            phone: phone || undefined,
          })
        }

        if (rows.length === 0) {
          setParseError('No valid rows found. Make sure your CSV has a "Name" or "First Name" column.')
          return
        }

        setMembers(rows)
        setStep('preview')
      },
      error: (error) => {
        setParseError(`Failed to parse file: ${error.message}`)
      },
    })
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }, [handleFile])

  const handleImport = () => {
    setStep('importing')
    setParseError('')
    importMutation.mutate({
      clubId,
      members: members.map(m => ({
        name: m.name,
        email: m.email,
        phone: m.phone,
      })),
    })
  }

  const withEmail = members.filter(m => m.email)
  const withPhone = members.filter(m => m.phone)

  // ── Upload step ──
  if (step === 'upload') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-6">
        <div className="text-center mb-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Import Members</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Upload a CSV with your member list (name, email, phone) to enable
            personalized recommendations, outreach, and campaigns.
          </p>
        </div>

        <Card
          className={cn(
            'border-2 border-dashed transition-colors cursor-pointer max-w-lg w-full',
            dragActive ? 'border-lime-500 bg-lime-50/50 dark:bg-lime-950/10' : 'border-muted-foreground/25 hover:border-lime-500/50'
          )}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className={cn(
              'p-3 rounded-full mb-3 transition-colors',
              dragActive ? 'bg-lime-100 dark:bg-lime-900/30' : 'bg-muted'
            )}>
              <Upload className={cn('w-6 h-6', dragActive ? 'text-lime-600' : 'text-muted-foreground')} />
            </div>
            <h3 className="text-base font-semibold mb-1">
              {dragActive ? 'Drop your file here' : 'Upload Member List'}
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              CSV with columns: Name, Email (optional), Phone (optional)
            </p>
            <Button variant="outline" size="sm">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Choose File
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv"
              className="hidden"
              onChange={handleFileInput}
            />
          </CardContent>
        </Card>

        {parseError && (
          <div className="flex items-center gap-2 text-sm text-destructive max-w-lg">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {parseError}
          </div>
        )}

        <Button variant="ghost" size="sm" onClick={onCancel} className="text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
      </div>
    )
  }

  // ── Preview step ──
  if (step === 'preview') {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Preview: {fileName}</h2>
            <p className="text-sm text-muted-foreground">
              {members.length} members found — {withEmail.length} with email, {withPhone.length} with phone
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setStep('upload'); setMembers([]) }}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <Button size="sm" onClick={handleImport} className="gap-1">
              Import {members.length} Members
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* SMS consent notice */}
        {withPhone.length > 0 && (
          <div className="flex items-start gap-2.5 text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg px-3 py-2.5">
            <span className="shrink-0 mt-0.5">📱</span>
            <span>
              <strong className="text-foreground">{withPhone.length} members have phone numbers.</strong>{' '}
              SMS notifications will only be sent to members who have opted in.
              Share this link with members so they can opt in:{' '}
              <a href="/sms-opt-in" target="_blank" className="text-blue-600 underline">app.iqsport.ai/sms-opt-in</a>
            </span>
          </div>
        )}

        {parseError && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {parseError}
          </div>
        )}

        {/* Stats summary */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold">{members.length}</p>
              <p className="text-xs text-muted-foreground">Total Members</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-lime-600">{withEmail.length}</p>
              <p className="text-xs text-muted-foreground">With Email</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{withPhone.length}</p>
              <p className="text-xs text-muted-foreground">With Phone</p>
            </CardContent>
          </Card>
        </div>

        {/* Preview table */}
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">#</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {members.slice(0, 100).map((m, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-2 font-medium">{m.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{m.email || '—'}</td>
                      <td className="px-4 py-2 text-muted-foreground">{m.phone || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {members.length > 100 && (
                <div className="text-center py-3 text-xs text-muted-foreground border-t">
                  Showing first 100 of {members.length} members
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Importing step ──
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <Loader2 className="w-8 h-8 animate-spin text-lime-600" />
      <p className="text-sm text-muted-foreground">
        Importing {members.length} members...
      </p>
    </div>
  )
}
