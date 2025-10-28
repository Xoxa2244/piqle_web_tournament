'use client'

import { useState, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { X, Edit } from 'lucide-react'

interface Player {
  id: string
  firstName: string
  lastName: string
  email: string | null
  dupr: string | null
  duprRating: string | null  // Decimal from Prisma serializes as string
  isPaid: boolean | null
  isWaitlist: boolean | null
}

interface EditPlayerModalProps {
  player: Player
  tournamentId: string
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function EditPlayerModal({ player, tournamentId, isOpen, onClose, onSuccess }: EditPlayerModalProps) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [dupr, setDupr] = useState('')
  const [duprRating, setDuprRating] = useState('')
  const [isPaid, setIsPaid] = useState<boolean | null>(false)
  const [isWaitlist, setIsWaitlist] = useState<boolean | null>(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Initialize form data when player changes
  useEffect(() => {
    if (player) {
      setFirstName(player.firstName)
      setLastName(player.lastName)
      setEmail(player.email || '')
      setDupr(player.dupr || '')
      setDuprRating(player.duprRating || '')
      setIsPaid(player.isPaid)
      setIsWaitlist(player.isWaitlist)
    }
  }, [player])

  const updatePlayerMutation = trpc.player.update.useMutation({
    onSuccess: () => {
      setIsSubmitting(false)
      onSuccess?.()
      onClose()
    },
    onError: (error) => {
      console.error('Failed to update player:', error)
      alert(`Error updating player: ${error.message}`)
      setIsSubmitting(false)
    }
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!firstName.trim() || !lastName.trim()) {
      alert('Please enter player name and surname')
      return
    }

    setIsSubmitting(true)
    
    try {
      await updatePlayerMutation.mutateAsync({
        id: player.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || undefined,
        dupr: dupr.trim() || undefined,
        duprRating: duprRating ? parseFloat(duprRating) : undefined,
        isPaid: isPaid ?? false,
        isWaitlist: isWaitlist ?? false,
      })
    } catch (error) {
      // Error handling is done in the mutation onError
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg font-semibold">Edit Player</CardTitle>
            <CardDescription>
              Change tournament participant data
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
                  First Name *
                </label>
                <Input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Enter first name"
                  disabled={isSubmitting}
                  className="w-full"
                />
              </div>

              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name *
                </label>
                <Input
                  id="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Enter last name"
                  disabled={isSubmitting}
                  className="w-full"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email (optional)
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email"
                disabled={isSubmitting}
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="dupr" className="block text-sm font-medium text-gray-700 mb-1">
                  DUPR ID (optional)
                </label>
                <Input
                  id="dupr"
                  type="text"
                  value={dupr}
                  onChange={(e) => setDupr(e.target.value)}
                  placeholder="Enter DUPR ID"
                  disabled={isSubmitting}
                  className="w-full"
                />
              </div>

              <div>
                <label htmlFor="duprRating" className="block text-sm font-medium text-gray-700 mb-1">
                  DUPR Rating (optional)
                </label>
                <Input
                  id="duprRating"
                  type="number"
                  step="0.01"
                  min="0"
                  max="5"
                  value={duprRating}
                  onChange={(e) => setDuprRating(e.target.value)}
                  placeholder="3.54"
                  disabled={isSubmitting}
                  className="w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Status
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
                    <span className="text-sm">Paid</span>
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
                    <span className="text-sm">Pending payment</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  List Status
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

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !firstName.trim() || !lastName.trim()}
                className="flex items-center space-x-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Edit className="h-4 w-4" />
                    <span>Save Changes</span>
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
