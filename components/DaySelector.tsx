'use client'

import { useState, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { formatMatchDayDate } from '@/lib/dateFormat'
import { Button } from '@/components/ui/button'
import { Calendar } from 'lucide-react'

interface DaySelectorProps {
  tournamentId: string
  selectedDayId: string | null
  onDayChange: (dayId: string | null) => void
  mode?: 'DAY_ONLY' | 'SEASON_TO_DATE'
  onModeChange?: (mode: 'DAY_ONLY' | 'SEASON_TO_DATE') => void
}

export default function DaySelector({
  tournamentId,
  selectedDayId,
  onDayChange,
  mode = 'SEASON_TO_DATE',
  onModeChange,
}: DaySelectorProps) {
  const { data: matchDays } = trpc.matchDay.list.useQuery({ tournamentId })

  // Load selected day from localStorage on mount
  useEffect(() => {
    const savedDayId = localStorage.getItem(`selectedDayId_${tournamentId}`)
    const savedMode = localStorage.getItem(`dayMode_${tournamentId}`) as 'DAY_ONLY' | 'SEASON_TO_DATE' | null

    if (savedDayId && matchDays?.some((d) => d.id === savedDayId)) {
      onDayChange(savedDayId)
    }

    if (savedMode && onModeChange) {
      onModeChange(savedMode)
    }
  }, [tournamentId, matchDays, onDayChange, onModeChange])

  // Save to localStorage when selection changes
  useEffect(() => {
    if (selectedDayId) {
      localStorage.setItem(`selectedDayId_${tournamentId}`, selectedDayId)
    }
  }, [selectedDayId, tournamentId])

  useEffect(() => {
    if (onModeChange) {
      localStorage.setItem(`dayMode_${tournamentId}`, mode)
    }
  }, [mode, tournamentId, onModeChange])

  const formatDate = (date: Date | string) => formatMatchDayDate(date)

  if (!matchDays || matchDays.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Calendar className="h-4 w-4" />
        <span>No match days available</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4">
      {onModeChange && (
        <div className="flex items-center gap-2">
          <Button
            variant={mode === 'DAY_ONLY' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onModeChange('DAY_ONLY')}
          >
            This Day Only
          </Button>
          <Button
            variant={mode === 'SEASON_TO_DATE' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onModeChange('SEASON_TO_DATE')}
          >
            Season to Date
          </Button>
        </div>
      )}

      {mode === 'DAY_ONLY' && (
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-500" />
          {!selectedDayId && (
            <span className="text-sm text-gray-500">Select a date</span>
          )}
          <select
            value={selectedDayId || ''}
            onChange={(e) => onDayChange(e.target.value || null)}
            className="pl-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
          >
            {matchDays.map((day) => (
              <option key={day.id} value={day.id}>
                {formatDate(day.date)}
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === 'SEASON_TO_DATE' && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Calendar className="h-4 w-4" />
          <span>Showing all days up to today</span>
        </div>
      )}
    </div>
  )
}

