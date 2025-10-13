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
  pairingMode: string
  poolCount: number
  maxTeams: number | null
}

interface AddTeamModalProps {
  division: Division | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function AddTeamModal({ division, isOpen, onClose, onSuccess }: AddTeamModalProps) {
  const [teamName, setTeamName] = useState('')
  const [teamNote, setTeamNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const createTeamMutation = trpc.team.create.useMutation({
    onSuccess: () => {
      setTeamName('')
      setTeamNote('')
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!division) {
      alert('Дивизион не выбран')
      return
    }
    
    if (!teamName.trim()) {
      alert('Введите название команды')
      return
    }

    setIsSubmitting(true)
    
    try {
      await createTeamMutation.mutateAsync({
        divisionId: division.id,
        name: teamName.trim(),
        note: teamNote.trim() || undefined,
      })
    } catch (error) {
      // Error handling is done in the mutation onError
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setTeamName('')
      setTeamNote('')
      onClose()
    }
  }

  if (!isOpen || !division) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg font-semibold">Добавить команду</CardTitle>
            <CardDescription>
              Создать новую команду в дивизионе "{division.name}"
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
              <label htmlFor="teamNote" className="block text-sm font-medium text-gray-700 mb-1">
                Заметка (необязательно)
              </label>
              <Input
                id="teamNote"
                type="text"
                value={teamNote}
                onChange={(e) => setTeamNote(e.target.value)}
                placeholder="Дополнительная информация о команде"
                disabled={isSubmitting}
                className="w-full"
              />
            </div>

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
                disabled={isSubmitting || !teamName.trim()}
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
              <strong>Информация:</strong> Команда будет добавлена в WaitList дивизиона и может быть перемещена в пулы позже.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
