'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { X, UserPlus } from 'lucide-react'

interface AddPlayerModalProps {
  tournamentId: string
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function AddPlayerModal({ tournamentId, isOpen, onClose, onSuccess }: AddPlayerModalProps) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [dupr, setDupr] = useState('')
  const [duprRating, setDuprRating] = useState('')
  // const [isPaid, setIsPaid] = useState(false) // Temporarily disabled until migration
  // const [isWaitlist, setIsWaitlist] = useState(false) // Temporarily disabled until migration
  const [isSubmitting, setIsSubmitting] = useState(false)

  const createPlayerMutation = trpc.player.create.useMutation({
    onSuccess: () => {
      setFirstName('')
      setLastName('')
      setEmail('')
      setDupr('')
      setDuprRating('')
      // setIsPaid(false) // Temporarily disabled until migration
      // setIsWaitlist(false) // Temporarily disabled until migration
      setIsSubmitting(false)
      onSuccess?.()
      onClose()
    },
    onError: (error) => {
      console.error('Failed to create player:', error)
      alert(`Ошибка при создании игрока: ${error.message}`)
      setIsSubmitting(false)
    }
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!firstName.trim() || !lastName.trim()) {
      alert('Введите имя и фамилию игрока')
      return
    }

    setIsSubmitting(true)
    
    try {
      await createPlayerMutation.mutateAsync({
        tournamentId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || undefined,
        dupr: dupr.trim() || undefined,
        duprRating: duprRating ? parseFloat(duprRating) : undefined,
        // isPaid, // Temporarily disabled until migration
        // isWaitlist, // Temporarily disabled until migration
      })
    } catch (error) {
      // Error handling is done in the mutation onError
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setFirstName('')
      setLastName('')
      setEmail('')
      setDupr('')
      setDuprRating('')
      setIsPaid(false)
      setIsWaitlist(false)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg font-semibold">Добавить игрока</CardTitle>
            <CardDescription>
              Создать нового участника турнира
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                  Имя *
                </label>
                <Input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Введите имя"
                  disabled={isSubmitting}
                  className="w-full"
                />
              </div>

              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                  Фамилия *
                </label>
                <Input
                  id="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Введите фамилию"
                  disabled={isSubmitting}
                  className="w-full"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email (необязательно)
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Введите email"
                disabled={isSubmitting}
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="dupr" className="block text-sm font-medium text-gray-700 mb-1">
                  DUPR ID (необязательно)
                </label>
                <Input
                  id="dupr"
                  type="text"
                  value={dupr}
                  onChange={(e) => setDupr(e.target.value)}
                  placeholder="Введите DUPR ID"
                  disabled={isSubmitting}
                  className="w-full"
                />
              </div>

              <div>
                <label htmlFor="duprRating" className="block text-sm font-medium text-gray-700 mb-1">
                  DUPR рейтинг (необязательно)
                </label>
                <Input
                  id="duprRating"
                  type="number"
                  step="0.1"
                  min="0"
                  max="5"
                  value={duprRating}
                  onChange={(e) => setDuprRating(e.target.value)}
                  placeholder="3.5"
                  disabled={isSubmitting}
                  className="w-full"
                />
              </div>
            </div>

            {/* Temporarily disabled until migration
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Статус оплаты
                </label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="payment"
                      checked={isPaid}
                      onChange={() => setIsPaid(true)}
                      disabled={isSubmitting}
                      className="mr-2"
                    />
                    <span className="text-sm">Оплачено</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="payment"
                      checked={!isPaid}
                      onChange={() => setIsPaid(false)}
                      disabled={isSubmitting}
                      className="mr-2"
                    />
                    <span className="text-sm">Ожидает оплату</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Статус списка
                </label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="status"
                      checked={!isWaitlist}
                      onChange={() => setIsWaitlist(false)}
                      disabled={isSubmitting}
                      className="mr-2"
                    />
                    <span className="text-sm">Active</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="status"
                      checked={isWaitlist}
                      onChange={() => setIsWaitlist(true)}
                      disabled={isSubmitting}
                      className="mr-2"
                    />
                    <span className="text-sm">Waitlist</span>
                  </label>
                </div>
              </div>
            </div>
            */}

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
                disabled={isSubmitting || !firstName.trim() || !lastName.trim()}
                className="flex items-center space-x-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Создание...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    <span>Добавить игрока</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
