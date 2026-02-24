'use client'

import { useMemo, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { X } from 'lucide-react'

type TeamKind = 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4'

const getSlotCount = (teamKind: TeamKind, tournamentFormat?: string | null) => {
  if (tournamentFormat === 'INDY_LEAGUE' && teamKind === 'SQUAD_4v4') {
    return 32
  }

  switch (teamKind) {
    case 'SINGLES_1v1':
      return 1
    case 'DOUBLES_2v2':
      return 2
    case 'SQUAD_4v4':
      return 4
    default:
      return 2
  }
}

export default function WaitlistAssignModal({
  isOpen,
  onClose,
  onAssign,
  division,
  tournamentFormat,
  waitlistEntry,
}: {
  isOpen: boolean
  onClose: () => void
  onAssign: (teamId: string, slotIndex: number) => void
  division: any
  tournamentFormat?: string
  waitlistEntry: any | null
}) {
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | ''>('')

  const slotCount = getSlotCount(division.teamKind, tournamentFormat)

  const availableSlotsByTeam = useMemo(() => {
    return division.teams.reduce((acc: Record<string, number[]>, team: any) => {
      const slots = new Array(slotCount).fill(null)
      const sortedPlayers = [...team.teamPlayers].sort((a: any, b: any) => {
        if (a.slotIndex !== null && a.slotIndex !== undefined && b.slotIndex !== null && b.slotIndex !== undefined) {
          return a.slotIndex - b.slotIndex
        }
        if (a.slotIndex !== null && a.slotIndex !== undefined) return -1
        if (b.slotIndex !== null && b.slotIndex !== undefined) return 1
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })

      sortedPlayers.forEach((teamPlayer: any, index: number) => {
        const targetIndex = teamPlayer.slotIndex ?? index
        if (targetIndex < slotCount) {
          slots[targetIndex] = teamPlayer
        }
      })

      acc[team.id] = slots
        .map((slot, index) => (slot ? null : index))
        .filter((index) => index !== null) as number[]
      return acc
    }, {})
  }, [division.teams, slotCount])

  useEffect(() => {
    if (!isOpen) {
      setSelectedTeamId('')
      setSelectedSlotIndex('')
      return
    }

    if (!selectedTeamId && division.teams.length > 0) {
      setSelectedTeamId(division.teams[0].id)
    }
  }, [division.teams, isOpen, selectedTeamId])

  useEffect(() => {
    if (!selectedTeamId) return
    const availableSlots = availableSlotsByTeam[selectedTeamId] || []
    if (availableSlots.length > 0) {
      setSelectedSlotIndex(availableSlots[0])
    } else {
      setSelectedSlotIndex('')
    }
  }, [availableSlotsByTeam, selectedTeamId])

  if (!isOpen || !waitlistEntry) return null

  const availableSlots = selectedTeamId ? availableSlotsByTeam[selectedTeamId] || [] : []

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg font-semibold">Assign Waitlisted Player</CardTitle>
            <CardDescription>
              {waitlistEntry.player.firstName} {waitlistEntry.player.lastName}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="team" className="block text-sm font-medium text-gray-700 mb-1">
              Team
            </label>
            <select
              id="team"
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              {division.teams.map((team: any) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="slot" className="block text-sm font-medium text-gray-700 mb-1">
              Slot
            </label>
            <select
              id="slot"
              value={selectedSlotIndex === '' ? '' : String(selectedSlotIndex)}
              onChange={(e) => setSelectedSlotIndex(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              {availableSlots.length === 0 && <option value="">No available slots</option>}
              {availableSlots.map((slotIndex: number) => (
                <option key={slotIndex} value={slotIndex}>
                  Slot {slotIndex + 1}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedTeamId && selectedSlotIndex !== '') {
                  onAssign(selectedTeamId, selectedSlotIndex)
                }
              }}
              disabled={!selectedTeamId || selectedSlotIndex === ''}
            >
              Assign
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
