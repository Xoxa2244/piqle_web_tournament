'use client'

import { Button } from '@/components/ui/button'

type CancelRegistrationModalProps = {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  isPending: boolean
  isPaidTournament: boolean
}

export default function CancelRegistrationModal({
  open,
  onClose,
  onConfirm,
  isPending,
  isPaidTournament,
}: CancelRegistrationModalProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Cancel registration?</h3>
        <p className="text-gray-600 text-sm mb-4">
          You will be removed from this tournament and your spot will become available to others.
        </p>
        {isPaidTournament && (
          <p className="text-gray-600 text-sm mb-6">
            If you paid an entry fee, a refund will be issued according to the tournament&apos;s refund policy.
            The refund may take 5–10 business days (or longer, depending on your bank or card issuer) to appear on your statement.
          </p>
        )}
        {!isPaidTournament && <div className="mb-6" />}
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>
            Keep registration
          </Button>
          <Button
            variant="destructive"
            onClick={() => void onConfirm()}
            disabled={isPending}
          >
            {isPending ? 'Cancelling…' : 'Yes, cancel registration'}
          </Button>
        </div>
      </div>
    </div>
  )
}
