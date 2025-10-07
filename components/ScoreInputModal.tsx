'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface ScoreInputModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (scoreA: number, scoreB: number) => void
  teamAName: string
  teamBName: string
  isLoading?: boolean
}

export default function ScoreInputModal({
  isOpen,
  onClose,
  onSubmit,
  teamAName,
  teamBName,
  isLoading = false,
}: ScoreInputModalProps) {
  const [scoreA, setScoreA] = useState('')
  const [scoreB, setScoreB] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const scoreAValue = parseInt(scoreA)
    const scoreBValue = parseInt(scoreB)
    
    if (isNaN(scoreAValue) || isNaN(scoreBValue) || scoreAValue < 0 || scoreBValue < 0) {
      alert('Пожалуйста, введите корректные счета (неотрицательные числа)')
      return
    }

    onSubmit(scoreAValue, scoreBValue)
  }

  const handleClose = () => {
    setScoreA('')
    setScoreB('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-bold mb-4">Ввод счета</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              {teamAName}
            </label>
            <input
              type="number"
              value={scoreA}
              onChange={(e) => setScoreA(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Счет команды A"
              min="0"
              required
            />
          </div>

          <div className="text-center text-gray-500 font-medium">VS</div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              {teamBName}
            </label>
            <input
              type="number"
              value={scoreB}
              onChange={(e) => setScoreB(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Счет команды B"
              min="0"
              required
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1"
              disabled={isLoading}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              disabled={isLoading}
            >
              {isLoading ? 'Сохранение...' : 'Сохранить счет'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
