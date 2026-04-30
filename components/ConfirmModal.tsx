'use client'

import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

type ConfirmModalProps = {
  open: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  destructive?: boolean
  isPending?: boolean
  confirmDisabled?: boolean
  size?: 'md' | 'lg'
  onClose: () => void
  onConfirm: () => void
  children?: React.ReactNode
}

export default function ConfirmModal({
  open,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  destructive = false,
  isPending = false,
  confirmDisabled = false,
  size = 'md',
  onClose,
  onConfirm,
  children,
}: ConfirmModalProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 pt-24 pb-8 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl border border-gray-200 w-full ${size === 'lg' ? 'max-w-lg' : 'max-w-md'} flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
            {description ? (
              <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{description}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={isPending}
            aria-label="Close"
            className="flex-shrink-0"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {children ? (
          <div className="px-6 pt-4">
            {children}
          </div>
        ) : null}

        <div className="px-6 py-5 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {cancelText}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={isPending || confirmDisabled}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  )
}
