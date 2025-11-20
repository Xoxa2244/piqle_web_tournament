'use client'

import { trpc } from '@/lib/trpc'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import Image from 'next/image'
import { User as UserIcon, Save } from 'lucide-react'

export default function ProfilePage() {
  const { data: profile, isLoading, refetch } = trpc.user.getProfile.useQuery()
  const updateProfile = trpc.user.updateProfile.useMutation({
    onSuccess: () => {
      refetch()
      setIsEditing(false)
    },
  })

  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    gender: '' as 'M' | 'F' | 'X' | '',
    city: '',
    duprLink: '',
  })

  // Initialize form data when profile loads
  useEffect(() => {
    if (profile && !isEditing) {
      setFormData({
        name: profile.name || '',
        gender: profile.gender || '',
        city: profile.city || '',
        duprLink: profile.duprLink || '',
      })
    }
  }, [profile, isEditing])

  const handleEdit = () => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        gender: profile.gender || '',
        city: profile.city || '',
        duprLink: profile.duprLink || '',
      })
      setIsEditing(true)
    }
  }

  const handleSave = () => {
    updateProfile.mutate({
      name: formData.name || undefined,
      gender: formData.gender || undefined,
      city: formData.city || undefined,
      duprLink: formData.duprLink || undefined,
    })
  }

  const handleCancel = () => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        gender: profile.gender || '',
        city: profile.city || '',
        duprLink: profile.duprLink || '',
      })
    }
    setIsEditing(false)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-lg">Loading profile...</div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-lg">Profile not found</div>
      </div>
    )
  }

  const genderLabels: Record<string, string> = {
    M: 'Мужской',
    F: 'Женский',
    X: 'Другой',
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Профиль</h1>
            {!isEditing && (
              <Button onClick={handleEdit} variant="outline">
                Редактировать
              </Button>
            )}
          </div>

          <div className="space-y-6">
            {/* Avatar */}
            <div className="flex items-center space-x-4">
              {profile.image ? (
                <Image
                  src={profile.image}
                  alt={profile.name || 'User'}
                  width={100}
                  height={100}
                  className="rounded-full"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center">
                  <UserIcon className="h-12 w-12 text-gray-400" />
                </div>
              )}
              <div>
                <p className="text-sm text-gray-500">Аватар</p>
                <p className="text-xs text-gray-400">Обновляется через провайдера входа</p>
              </div>
            </div>

            {/* Name */}
            <div>
              <Label htmlFor="name">Имя</Label>
              {isEditing ? (
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1"
                />
              ) : (
                <div className="mt-1 text-lg text-gray-900">
                  {profile.name || 'Не указано'}
                </div>
              )}
            </div>

            {/* Gender */}
            <div>
              <Label htmlFor="gender">Пол</Label>
              {isEditing ? (
                <select
                  id="gender"
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'M' | 'F' | 'X' | '' })}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Не указано</option>
                  <option value="M">Мужской</option>
                  <option value="F">Женский</option>
                  <option value="X">Другой</option>
                </select>
              ) : (
                <div className="mt-1 text-lg text-gray-900">
                  {profile.gender ? genderLabels[profile.gender] : 'Не указано'}
                </div>
              )}
            </div>

            {/* City */}
            <div>
              <Label htmlFor="city">Город</Label>
              {isEditing ? (
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="mt-1"
                  placeholder="Введите город"
                />
              ) : (
                <div className="mt-1 text-lg text-gray-900">
                  {profile.city || 'Не указано'}
                </div>
              )}
            </div>

            {/* DUPR Link */}
            <div>
              <Label htmlFor="duprLink">Ссылка на DUPR</Label>
              {isEditing ? (
                <Input
                  id="duprLink"
                  type="url"
                  value={formData.duprLink}
                  onChange={(e) => setFormData({ ...formData, duprLink: e.target.value })}
                  className="mt-1 opacity-50"
                  placeholder="https://..."
                  disabled
                />
              ) : (
                <div className="mt-1 text-lg text-gray-400">
                  {profile.duprLink ? (
                    <span className="opacity-50">{profile.duprLink}</span>
                  ) : (
                    'Не указано'
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            {isEditing && (
              <div className="flex space-x-3 pt-4">
                <Button
                  onClick={handleSave}
                  disabled={updateProfile.isPending}
                  className="flex items-center space-x-2"
                >
                  <Save className="h-4 w-4" />
                  <span>Сохранить</span>
                </Button>
                <Button
                  onClick={handleCancel}
                  variant="outline"
                  disabled={updateProfile.isPending}
                >
                  Отмена
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

