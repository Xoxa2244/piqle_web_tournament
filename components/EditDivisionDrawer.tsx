'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { X, AlertTriangle } from 'lucide-react'

interface Division {
  id: string
  name: string
  teamKind: string
  pairingMode: string
  poolCount: number
  maxTeams: number | null
  constraints: {
    minDupr: string | null  // Changed from number to string
    maxDupr: string | null  // Changed from number to string
    minAge: number | null
    maxAge: number | null
  } | null
}

interface EditDivisionDrawerProps {
  division: Division | null
  isOpen: boolean
  onClose: () => void
  onSave: (data: {
    name: string
    teamKind: string
    pairingMode: string
    poolCount: number
    maxTeams?: number
    minDupr?: number
    maxDupr?: number
    minAge?: number
    maxAge?: number
  }) => void
}

export default function EditDivisionDrawer({ 
  division, 
  isOpen, 
  onClose, 
  onSave 
}: EditDivisionDrawerProps) {
  const [formData, setFormData] = useState({
    name: division?.name || '',
    teamKind: division?.teamKind || 'DOUBLES_2v2',
    pairingMode: division?.pairingMode || 'FIXED',
    poolCount: division?.poolCount || 1,
    maxTeams: division?.maxTeams || undefined,
    minDupr: division?.constraints?.minDupr ? parseFloat(division.constraints.minDupr) : undefined,
    maxDupr: division?.constraints?.maxDupr ? parseFloat(division.constraints.maxDupr) : undefined,
    minAge: division?.constraints?.minAge || undefined,
    maxAge: division?.constraints?.maxAge || undefined,
  })

  const [showPoolWarning, setShowPoolWarning] = useState(false)

  // Update formData when division changes
  useEffect(() => {
    if (division) {
      setFormData({
        name: division.name || '',
        teamKind: division.teamKind || 'DOUBLES_2v2',
        pairingMode: division.pairingMode || 'FIXED',
        poolCount: division.poolCount || 1,
        maxTeams: division.maxTeams || undefined,
        minDupr: division.constraints?.minDupr ? parseFloat(division.constraints.minDupr) : undefined,
        maxDupr: division.constraints?.maxDupr ? parseFloat(division.constraints.maxDupr) : undefined,
        minAge: division.constraints?.minAge || undefined,
        maxAge: division.constraints?.maxAge || undefined,
      })
    }
  }, [division])

  const handlePoolCountChange = (value: number) => {
    const oldPoolCount = formData.poolCount
    setFormData({ ...formData, poolCount: value })
    
    // Show warning if pool count changes and division has matches
    if (oldPoolCount !== value && division) {
      setShowPoolWarning(true)
    }
  }

  const handleSave = () => {
    if (!formData.name.trim()) {
      alert('Please enter division name')
      return
    }

    onSave({
      name: formData.name,
      teamKind: formData.teamKind,
      pairingMode: formData.pairingMode,
      poolCount: formData.poolCount,
      maxTeams: formData.maxTeams,
      minDupr: formData.minDupr,
      maxDupr: formData.maxDupr,
      minAge: formData.minAge,
      maxAge: formData.maxAge,
    })
    
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end justify-center">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-lg">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Редактировать дивизион</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {/* Pool Count Warning */}
          {showPoolWarning && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3" />
                <div>
                  <h3 className="text-sm font-medium text-yellow-800">
                    Changing pool count
                  </h3>
                  <p className="text-sm text-yellow-700 mt-1">
                    Changing pool count потребует регенерации Round Robin и всех последующих стадий (Play-In/Play-Off).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Основная информация</CardTitle>
              <CardDescription>
                Настройки дивизиона и команд
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Название дивизиона *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Введите название дивизиона"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Тип команд
                  </label>
                  <select
                    value={formData.teamKind}
                    onChange={(e) => setFormData({ ...formData, teamKind: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="SINGLES_1v1">1v1 (Одиночки)</option>
                    <option value="DOUBLES_2v2">2v2 (Пары)</option>
                    <option value="SQUAD_4v4">4v4 (Команды)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Режим пар
                  </label>
                  <select
                    value={formData.pairingMode}
                    onChange={(e) => setFormData({ ...formData, pairingMode: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="FIXED">Фиксированные</option>
                    <option value="MIX_AND_MATCH">Смешанные</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Количество пулов
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.poolCount}
                    onChange={(e) => handlePoolCountChange(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.poolCount === 1 ? 'Будет создан 1 пул' : `Будет создано ${formData.poolCount} пулов`}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Лимит команд (опционально)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.maxTeams || ''}
                    onChange={(e) => setFormData({ ...formData, maxTeams: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Без лимита"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Constraints */}
          <Card>
            <CardHeader>
              <CardTitle>Ограничения</CardTitle>
              <CardDescription>
                Дополнительные требования к участникам
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Минимальный DUPR рейтинг
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="6"
                    value={formData.minDupr || ''}
                    onChange={(e) => setFormData({ ...formData, minDupr: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="No restrictions"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Максимальный DUPR рейтинг
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="6"
                    value={formData.maxDupr || ''}
                    onChange={(e) => setFormData({ ...formData, maxDupr: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="No restrictions"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Минимальный возраст
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.minAge || ''}
                    onChange={(e) => setFormData({ ...formData, minAge: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="No restrictions"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Максимальный возраст
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.maxAge || ''}
                    onChange={(e) => setFormData({ ...formData, maxAge: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="No restrictions"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex items-center justify-end space-x-3">
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSave}>
            Сохранить изменения
          </Button>
        </div>
      </div>
    </div>
  )
}
