'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { X, Plus } from 'lucide-react'

interface Division {
  id: string
  name: string
  teamKind: string
  poolCount: number
  pools: Array<{
    id: string
    name: string
    order: number
  }>
}

interface AddTeamModalProps {
  divisions: Division[]
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function AddTeamModal({ divisions, isOpen, onClose, onSuccess }: AddTeamModalProps) {
  const [teamName, setTeamName] = useState('')
  const [selectedDivisionId, setSelectedDivisionId] = useState('')
  const [selectedPoolId, setSelectedPoolId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const createTeamMutation = trpc.team.create.useMutation({
    onSuccess: () => {
      setTeamName('')
      setSelectedDivisionId('')
      setSelectedPoolId('')
      setIsSubmitting(false)
      onSuccess?.()
      onClose()
    },
    onError: (error) => {
      console.error('Failed to create team:', error)
      alert(`Ошибка при создании команды: ${error.message}`)
      setIsSubmitting(false)
    }
  })

  const selectedDivision = divisions.find(d => d.id === selectedDivisionId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!teamName.trim()) {
      alert('Введите название команды')
      return
    }

    if (!selectedDivisionId) {
      alert('Выберите дивизион')
      return
    }

    setIsSubmitting(true)
    
    try {
      await createTeamMutation.mutateAsync({
        divisionId: selectedDivisionId,
        name: teamName.trim(),
        note: undefined,
        poolId: selectedPoolId || undefined,
      })
    } catch (error) {
      // Error handling is done in the mutation onError
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setTeamName('')
      setSelectedDivisionId('')
      setSelectedPoolId('')
      onClose()
    }
  }

  const handleDivisionChange = (divisionId: string) => {
    setSelectedDivisionId(divisionId)
    setSelectedPoolId('') // Reset pool when division changes
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg font-semibold">Создать команду</CardTitle>
            <CardDescription>
              Создать новую команду в турнире
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={isSubmitting}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="teamName" className="block text-sm font-medium text-gray-700 mb-1">
                Название команды *
              </label>
              <Input
                id="teamName"
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Введите название команды"
                disabled={isSubmitting}
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="division" className="block text-sm font-medium text-gray-700 mb-1">
                Дивизион *
              </label>
              <select
                id="division"
                value={selectedDivisionId}
                onChange={(e) => handleDivisionChange(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Выберите дивизион</option>
                {divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name} ({division.teamKind})
                  </option>
                ))}
              </select>
            </div>

            {selectedDivision && selectedDivision.pools.length > 0 && (
              <div>
                <label htmlFor="pool" className="block text-sm font-medium text-gray-700 mb-1">
                  Пул (необязательно)
                </label>
                <select
                  id="pool"
                  value={selectedPoolId}
                  onChange={(e) => setSelectedPoolId(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">WaitList (без пула)</option>
                  {selectedDivision.pools.map((pool) => (
                    <option key={pool.id} value={pool.id}>
                      {pool.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !teamName.trim() || !selectedDivisionId}
                className="flex items-center space-x-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Создание...</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    <span>Создать команду</span>
                  </>
                )}
              </Button>
            </div>
          </form>

          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              <strong>Информация:</strong> Если пул не указан, команда автоматически попадет в WaitList выбранного дивизиона.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}