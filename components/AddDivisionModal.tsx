'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { trpc } from '@/lib/trpc'
import { X, Users } from 'lucide-react'

interface AddDivisionModalProps {
  isOpen: boolean
  onClose: () => void
  tournamentId: string
  onSuccess: () => void
}

export default function AddDivisionModal({
  isOpen,
  onClose,
  tournamentId,
  onSuccess
}: AddDivisionModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    teamKind: 'DOUBLES_2v2' as 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4',
    pairingMode: 'FIXED' as 'FIXED' | 'MIX_AND_MATCH',
    poolCount: 1
  })

  const createDivisionMutation = trpc.division.create.useMutation({
    onSuccess: () => {
      onSuccess()
      onClose()
      setFormData({
        name: '',
        teamKind: 'DOUBLES_2v2',
        pairingMode: 'FIXED',
        poolCount: 1
      })
    },
    onError: (error) => {
      alert(`Error creating division: ${error.message}`)
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name.trim()) {
      alert('Please enter a division name')
      return
    }

    createDivisionMutation.mutate({
      tournamentId,
      name: formData.name.trim(),
      teamKind: formData.teamKind,
      pairingMode: formData.pairingMode,
      poolCount: formData.poolCount
    })
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-2xl mx-4 border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mr-3">
            <Users className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Create Division</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Division Name *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              placeholder="e.g., Men's Doubles, Women's Singles"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Number of Pools *
            </label>
            <input
              type="number"
              name="poolCount"
              value={formData.poolCount}
              onChange={handleChange}
              min="0"
              max="10"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              required
            />
            <p className="text-sm text-gray-500 mt-1">
              0 = Waitlist only, 1+ = Number of pools
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={createDivisionMutation.isPending}
              className="px-6 py-2.5 rounded-xl border-slate-300 hover:bg-slate-50 transition-all duration-200"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createDivisionMutation.isPending}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              {createDivisionMutation.isPending ? 'Creating...' : 'Create Division'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
