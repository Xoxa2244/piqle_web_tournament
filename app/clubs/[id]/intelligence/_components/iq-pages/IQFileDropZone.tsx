'use client'

import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Upload, FileSpreadsheet, CheckCircle2, Loader2 } from 'lucide-react'
import { useTheme } from '../IQThemeProvider'

type IQFileDropZoneProps = {
  onFile: (file: File) => void
  isLoading?: boolean
  loadedFileName?: string | null
  className?: string
}

export function IQFileDropZone({ onFile, isLoading, loadedFileName, className = '' }: IQFileDropZoneProps) {
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isDark } = useTheme()

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }, [onFile])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    e.target.value = ''
  }, [onFile])

  // Already loaded state
  if (loadedFileName) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`rounded-2xl p-6 flex items-center gap-4 ${className}`}
        style={{
          background: isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.06)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
        }}
      >
        <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--heading)' }}>{loadedFileName}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--t4)' }}>File uploaded and parsed</p>
        </div>
      </motion.div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`rounded-2xl p-8 flex flex-col items-center gap-3 ${className}`}
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
        }}
      >
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#8B5CF6' }} />
        <p className="text-sm" style={{ color: 'var(--t3)' }}>Parsing your file...</p>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`relative cursor-pointer rounded-2xl transition-all ${className}`}
      onClick={() => fileInputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      style={{
        background: 'var(--card-bg)',
        border: dragActive
          ? '2px solid transparent'
          : '2px dashed var(--card-border)',
        backdropFilter: 'var(--glass-blur)',
        padding: '2rem',
      }}
    >
      {/* Gradient border on drag */}
      <AnimatePresence>
        {dragActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute -inset-[2px] rounded-2xl -z-10"
            style={{
              background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
              filter: 'blur(1px)',
            }}
          />
        )}
      </AnimatePresence>

      <div className="flex flex-col items-center gap-3">
        <motion.div
          animate={dragActive ? { scale: 1.1, y: -4 } : { scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="p-4 rounded-2xl"
          style={{
            background: dragActive
              ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.15))'
              : isDark ? 'rgba(139, 92, 246, 0.08)' : 'rgba(139, 92, 246, 0.05)',
          }}
        >
          {dragActive ? (
            <Upload className="w-8 h-8" style={{ color: '#C4B5FD' }} />
          ) : (
            <FileSpreadsheet className="w-8 h-8" style={{ color: '#A78BFA' }} />
          )}
        </motion.div>

        <div className="text-center">
          <p className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
            {dragActive ? 'Drop your file here' : 'Upload Court Schedule'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--t4)' }}>
            CSV, TSV, XLSX, or XLS — we map the fields automatically
          </p>
        </div>

        <button
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
          style={{
            background: isDark ? 'rgba(139, 92, 246, 0.12)' : 'rgba(139, 92, 246, 0.08)',
            color: '#A78BFA',
            border: '1px solid rgba(139, 92, 246, 0.2)',
          }}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Choose File
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv,.xlsx,.xls"
        className="hidden"
        onChange={handleFileInput}
      />
    </motion.div>
  )
}
