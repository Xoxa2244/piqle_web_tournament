'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { trpc } from '@/lib/trpc'
import { X, GitBranch, AlertCircle } from 'lucide-react'
import type { Division } from '@prisma/client'

interface UnmergeDivisionModalProps {
  isOpen: boolean
  onClose: () => void
  mergedDivision: Division
  onSuccess: () => void
}

export default function UnmergeDivisionModal({
  isOpen,
  onClose,
  mergedDivision,
  onSuccess
}: UnmergeDivisionModalProps) {
  const unmergeMutation = trpc.division.unmergeDivision.useMutation({
    onSuccess: () => {
      onSuccess()
      onClose()
    },
    onError: (error) => {
      alert(`Error unmerging division: ${error.message}`)
    }
  })

  const handleUnmerge = () => {
    unmergeMutation.mutate({
      mergedDivisionId: mergedDivision.id,
    })
  }

  const handleClose = () => {
    if (unmergeMutation.isPending) return
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <Card className="w-full max-w-lg mx-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center mr-3">
              <GitBranch className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold">Unmerge divisions?</CardTitle>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={unmergeMutation.isPending}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="pt-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertCircle className="h-5 w-5 text-amber-500 mr-2 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-800">
                <p className="mb-2">
                  The merged division will be split back into the original divisions. Play-In and Play-Off will be generated separately for each division.
                </p>
                <p className="font-medium">
                  This action cannot be undone.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-700 mb-1">Merged Division:</p>
            <p className="text-sm text-gray-900">{mergedDivision.name}</p>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={unmergeMutation.isPending}
              className="px-6"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleUnmerge}
              disabled={unmergeMutation.isPending}
              className="px-6 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white"
            >
              {unmergeMutation.isPending ? 'Unmerging...' : 'Unmerge'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

