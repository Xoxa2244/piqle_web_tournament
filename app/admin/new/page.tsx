'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// Force dynamic rendering to prevent static generation issues
export const dynamic = 'force-dynamic'

export default function NewTournamentPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    venueName: '',
    startDate: '',
    endDate: '',
    entryFee: '',
    isPublicBoardEnabled: false,
  })

  const createTournament = trpc.tournament.create.useMutation({
    onSuccess: (tournament) => {
      router.push(`/admin/${tournament.id}`)
    },
    onError: (error) => {
      console.error('Error creating tournament:', error)
      alert('Error creating tournament: ' + error.message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.title || !formData.startDate || !formData.endDate) {
      alert('Please fill in required fields')
      return
    }

    createTournament.mutate({
      title: formData.title,
      description: formData.description || undefined,
      venueName: formData.venueName || undefined,
      startDate: formData.startDate,
      endDate: formData.endDate,
      entryFee: formData.entryFee ? parseFloat(formData.entryFee) : undefined,
      isPublicBoardEnabled: formData.isPublicBoardEnabled,
    })
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const handleCancel = useCallback(() => {
    router.back()
  }, [router])

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Create Tournament</h1>
        <p className="text-gray-600 mt-2">Fill in tournament information</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tournament Information</CardTitle>
          <CardDescription>
            Basic information about the pickleball tournament
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Tournament Name *
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Pickleball Championship 2024"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Tournament description, rules, features..."
              />
            </div>

            <div>
              <label htmlFor="venueName" className="block text-sm font-medium text-gray-700 mb-2">
                Venue
              </label>
              <input
                type="text"
                id="venueName"
                name="venueName"
                value={formData.venueName}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Sports complex name"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-2">
                  Start Date *
                </label>
                <input
                  type="date"
                  id="startDate"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-2">
                  End Date *
                </label>
                <input
                  type="date"
                  id="endDate"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="entryFee" className="block text-sm font-medium text-gray-700 mb-2">
                Entry Fee ($)
              </label>
              <input
                type="number"
                id="entryFee"
                name="entryFee"
                value={formData.entryFee}
                onChange={handleChange}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isPublicBoardEnabled"
                name="isPublicBoardEnabled"
                checked={formData.isPublicBoardEnabled}
                onChange={handleChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="isPublicBoardEnabled" className="ml-2 block text-sm text-gray-700">
                Enable public results board
              </label>
            </div>

            <div className="flex justify-end space-x-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createTournament.isPending}
              >
                {createTournament.isPending ? 'Creating...' : 'Create Tournament'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
