'use client'

import { Button } from '@/components/ui/button'

type ConfirmModalProps = {
  open: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  destructive?: boolean
  isPending?: boolean
  confirmDisabled?: boolean
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
  onClose,
  onConfirm,
  children,
}: ConfirmModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        {description ? <p className="text-sm text-gray-600 mb-4 whitespace-pre-wrap">{description}</p> : null}
        {children ? <div className="mb-4">{children}</div> : null}
        <div className="flex justify-end gap-3">
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
