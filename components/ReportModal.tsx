'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { X, AlertTriangle } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

interface ReportModalProps {
  isOpen: boolean
  onClose: () => void
  tournamentId: string
  tournamentTitle?: string
}

export default function ReportModal({
  isOpen,
  onClose,
  tournamentId,
  tournamentTitle,
}: ReportModalProps) {
  const [reportText, setReportText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  if (!isOpen) return null

  const handleSubmit = async () => {
    if (!reportText.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter your report',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tournamentId,
          tournamentTitle,
          reportText: reportText.trim(),
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to submit report')
      }

      toast({
        title: 'Report submitted',
        description: 'Your report has been sent successfully.',
      })

      setReportText('')
      onClose()
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to submit report. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <h2 className="text-xl font-bold">Submit Report</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isSubmitting}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Report Details
            </label>
            <Textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              placeholder="Please describe the issue or concern..."
              rows={6}
              className="w-full"
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end space-x-2">
          <Button
            onClick={onClose}
            variant="outline"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !reportText.trim()}
            className="bg-yellow-600 hover:bg-yellow-700"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Report'}
          </Button>
        </div>
      </div>
    </div>
  )
}
