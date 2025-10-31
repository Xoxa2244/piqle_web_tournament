'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { trpc } from '@/lib/trpc'
import { X, GitMerge, AlertCircle } from 'lucide-react'
import type { Division } from '@prisma/client'

interface MergeDivisionModalProps {
  isOpen: boolean
  onClose: () => void
  tournamentId: string
  sourceDivision: Division
  availableDivisions: Division[]
  onSuccess: () => void
}

export default function MergeDivisionModal({
  isOpen,
  onClose,
  tournamentId,
  sourceDivision,
  availableDivisions,
  onSuccess
}: MergeDivisionModalProps) {
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('')

  // Filter out the source division and already merged divisions
  const mergeableDivisions = availableDivisions.filter(
    div => div.id !== sourceDivision.id && !div.isMerged
  )

  const mergeMutation = trpc.division.mergeDivisions.useMutation({
    onSuccess: () => {
      onSuccess()
      onClose()
      setSelectedDivisionId('')
    },
    onError: (error) => {
      alert(`Error merging divisions: ${error.message}`)
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedDivisionId) {
      alert('Please select a division to merge with')
      return
    }

    const targetDivision = mergeableDivisions.find(d => d.id === selectedDivisionId)
    if (!targetDivision) {
      alert('Selected division not found')
      return
    }

    // Validate compatibility
    if (sourceDivision.teamKind !== targetDivision.teamKind) {
      alert(`Cannot merge: ${sourceDivision.name} has team kind ${sourceDivision.teamKind} but ${targetDivision.name} has ${targetDivision.teamKind}`)
      return
    }

    if (sourceDivision.pairingMode !== targetDivision.pairingMode) {
      alert(`Cannot merge: ${sourceDivision.name} has pairing mode ${sourceDivision.pairingMode} but ${targetDivision.name} has ${targetDivision.pairingMode}`)
      return
    }

    if (window.confirm(
      `Are you sure you want to merge "${sourceDivision.name}" with "${targetDivision.name}"?\n\n` +
      `Both divisions will be combined into one merged division. After the Round Robin stage completes, ` +
      `the merged division will automatically split back into the original two divisions.`
    )) {
      mergeMutation.mutate({
        divisionId1: sourceDivision.id,
        divisionId2: selectedDivisionId,
      })
    }
  }

  const handleClose = () => {
    if (mergeMutation.isPending) return
    setSelectedDivisionId('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center mr-3">
              <GitMerge className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold">Merge Divisions</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Select a division to merge with &quot;{sourceDivision.name}&quot;
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={mergeMutation.isPending}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto pt-6">
          {mergeableDivisions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-600 font-medium">No mergeable divisions available</p>
              <p className="text-sm text-gray-500 mt-2">
                All other divisions are either already merged or incompatible.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Select Division to Merge With *
                </label>
                <div className="space-y-2">
                  {mergeableDivisions.map((division) => {
                    const isCompatible = 
                      division.teamKind === sourceDivision.teamKind &&
                      division.pairingMode === sourceDivision.pairingMode
                    
                    return (
                      <label
                        key={division.id}
                        className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                          selectedDivisionId === division.id
                            ? 'border-purple-500 bg-purple-50'
                            : isCompatible
                            ? 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            : 'border-gray-200 opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <input
                          type="radio"
                          name="division"
                          value={division.id}
                          checked={selectedDivisionId === division.id}
                          onChange={(e) => {
                            if (isCompatible) {
                              setSelectedDivisionId(e.target.value)
                            }
                          }}
                          disabled={!isCompatible}
                          className="mr-3"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{division.name}</div>
                          <div className="text-sm text-gray-500 mt-1">
                            {division.teamKind} • {division.pairingMode} • {(division as any).teams?.length || 0} teams
                          </div>
                          {!isCompatible && (
                            <div className="text-xs text-red-500 mt-1 flex items-center">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Incompatible: different team kind or pairing mode
                            </div>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              {selectedDivisionId && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <AlertCircle className="h-5 w-5 text-blue-500 mr-2 mt-0.5" />
                    <div className="text-sm text-blue-800">
                      <p className="font-medium mb-1">What happens when you merge:</p>
                      <ul className="list-disc list-inside space-y-1 text-blue-700">
                        <li>Both divisions will be combined into one merged division</li>
                        <li>All teams from both divisions will be moved to the merged division</li>
                        <li>Round Robin stage will be played among all merged teams</li>
                        <li>After Round Robin completes, the division will automatically split back</li>
                        <li>Teams and scores will be distributed back to the original divisions</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={mergeMutation.isPending}
                  className="px-6"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!selectedDivisionId || mergeMutation.isPending}
                  className="px-6 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white"
                >
                  {mergeMutation.isPending ? 'Merging...' : 'Merge Divisions'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

