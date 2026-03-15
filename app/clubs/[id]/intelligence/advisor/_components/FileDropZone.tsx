'use client'

import { useState, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Upload, FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'

type FileDropZoneProps = {
  onFile: (file: File) => void
  variant?: 'large' | 'compact'
  className?: string
}

export function FileDropZone({ onFile, variant = 'large', className }: FileDropZoneProps) {
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }, [onFile])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    // Reset input so same file can be selected again
    e.target.value = ''
  }, [onFile])

  if (variant === 'compact') {
    return (
      <div className={className}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="gap-2"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Upload Data
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.xlsx,.xls"
          className="hidden"
          onChange={handleFileInput}
        />
      </div>
    )
  }

  return (
    <Card
      className={cn(
        'border-2 border-dashed transition-colors cursor-pointer',
        dragActive ? 'border-lime-500 bg-lime-50/50 dark:bg-lime-950/10' : 'border-muted-foreground/25 hover:border-lime-500/50',
        className
      )}
      onClick={() => fileInputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
    >
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className={cn(
          'p-4 rounded-full mb-4 transition-colors',
          dragActive ? 'bg-lime-100 dark:bg-lime-900/30' : 'bg-muted'
        )}>
          <Upload className={cn('w-8 h-8', dragActive ? 'text-lime-600' : 'text-muted-foreground')} />
        </div>
        <h3 className="text-lg font-semibold mb-1">
          {dragActive ? 'Drop your file here' : 'Upload Court Schedule'}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Drag & drop a CSV or XLSX file, or click to browse
        </p>
        <Button variant="outline" size="sm">
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Choose File
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.xlsx,.xls"
          className="hidden"
          onChange={handleFileInput}
        />
      </CardContent>
    </Card>
  )
}
