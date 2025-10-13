'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus, Users, Calendar, BarChart3 } from 'lucide-react'

export default function TournamentDetailPage() {
  const params = useParams()
  const tournamentId = params.id as string
  const [showCreateDivision, setShowCreateDivision] = useState(false)
  const [divisionForm, setDivisionForm] = useState({
    name: '',
    teamKind: 'DOUBLES_2v2' as 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4',
    pairingMode: 'FIXED' as 'FIXED' | 'MIX_AND_MATCH',
    poolCount: 1,  // Количество пулов (1 = без пулов)
    maxTeams: undefined as number | undefined,
    // Constraints
    minDupr: undefined as number | undefined,
    maxDupr: undefined as number | undefined,
    minAge: undefined as number | undefined,
    maxAge: undefined as number | undefined,
  })

  const { data: tournament, isLoading, error } = trpc.tournament.get.useQuery({ id: tournamentId })
  const createDivision = trpc.division.create.useMutation({
    onSuccess: () => {
      setShowCreateDivision(false)
      setDivisionForm({
        name: '',
        teamKind: 'DOUBLES_2v2',
        pairingMode: 'FIXED',
        poolCount: 1,
        maxTeams: undefined,
        minDupr: undefined,
        maxDupr: undefined,
        minAge: undefined,
        maxAge: undefined,
      })
      // Refetch tournament data to show new division
      window.location.reload()
    },
  })

  const handleCreateDivision = () => {
    if (!divisionForm.name.trim()) {
      alert('Пожалуйста, введите название дивизиона')
      return
    }

    createDivision.mutate({
      tournamentId,
      name: divisionForm.name,
      teamKind: divisionForm.teamKind,
      pairingMode: divisionForm.pairingMode,
      poolCount: divisionForm.poolCount,
      maxTeams: divisionForm.maxTeams,
      minDupr: divisionForm.minDupr,
      maxDupr: divisionForm.maxDupr,
      minAge: divisionForm.minAge,
      maxAge: divisionForm.maxAge,
    })
  }


  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Загрузка турнира...</div>
      </div>
    )
  }

  if (error || !tournament) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Турнир не найден</h1>
        <p className="text-gray-600 mb-4">Возможно, турнир был удален или у вас нет доступа</p>
        <Link href="/admin" className="text-blue-600 hover:text-blue-800">
          ← Вернуться к списку турниров
        </Link>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{tournament.title}</h1>
          {tournament.description && (
            <p className="text-gray-600 mt-2">{tournament.description}</p>
          )}
        </div>
        
        <div className="flex space-x-2">
          <Link
            href={`/admin/${tournamentId}/import`}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            Импорт CSV
          </Link>
          {tournament.isPublicBoardEnabled && (
            <Link
              href={`/t/${tournament.publicSlug}`}
              className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Публичная доска
            </Link>
          )}
          <Link
            href="/admin"
            className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            ← Назад
          </Link>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Информация о турнире</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="font-medium">Дата начала:</span>
              <span className="ml-2">{new Date(tournament.startDate).toLocaleDateString()}</span>
            </div>
            <div>
              <span className="font-medium">Дата окончания:</span>
              <span className="ml-2">{new Date(tournament.endDate).toLocaleDateString()}</span>
            </div>
            {tournament.venueName && (
              <div>
                <span className="font-medium">Место:</span>
                <span className="ml-2">{tournament.venueName}</span>
              </div>
            )}
            {tournament.entryFee && (
              <div>
                <span className="font-medium">Взнос:</span>
                <span className="ml-2">${tournament.entryFee}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Дивизионы</CardTitle>
            <CardDescription>
              {tournament.divisions.length} дивизионов
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tournament.divisions.length > 0 ? (
              <div className="space-y-2">
                {tournament.divisions.map((division) => (
                  <div key={division.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <span className="font-medium">{division.name}</span>
                    <span className="text-sm text-gray-500">
                      {division.teams.length} команд
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">Дивизионы не созданы</p>
            )}
            <Button 
              className="w-full mt-4 relative z-10" 
              variant="outline"
              onClick={() => {
                console.log('Кнопка "Создать дивизион" нажата!')
                setShowCreateDivision(true)
              }}
              style={{ pointerEvents: 'auto' }}
            >
              Создать дивизион
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Призы</CardTitle>
            <CardDescription>
              {tournament.prizes.length} призов
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tournament.prizes.length > 0 ? (
              <div className="space-y-2">
                {tournament.prizes.map((prize) => (
                  <div key={prize.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <span className="font-medium">{prize.label}</span>
                    {prize.amount && (
                      <span className="text-sm text-gray-500">${prize.amount}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">Призы не установлены</p>
            )}
            <Button className="w-full mt-4" variant="outline">
              Добавить приз
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Быстрые действия</CardTitle>
            <CardDescription>
              Управление турниром
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Link href={`/admin/${tournamentId}/divisions`}>
                <Button variant="outline" className="h-20 w-full">
                  <div className="text-center">
                    <div className="font-medium">Дивизионы</div>
                    <div className="text-sm text-gray-500">Управление дивизионами</div>
                  </div>
                </Button>
              </Link>
              <Link href={`/admin/${tournamentId}/teams`}>
                <Button variant="outline" className="h-20 w-full">
                  <div className="text-center">
                    <div className="font-medium">Команды и участники</div>
                    <div className="text-sm text-gray-500">Управление составом и распределением</div>
                  </div>
                </Button>
              </Link>
              <Link href={`/admin/${tournamentId}/stages`}>
                <Button variant="outline" className="h-20 w-full">
                  <div className="text-center">
                    <div className="font-medium">Расписание</div>
                    <div className="text-sm text-gray-500">RR и плей-офф</div>
                  </div>
                </Button>
              </Link>
              <Link href={`/admin/${tournamentId}/dashboard`}>
                <Button variant="outline" className="h-20 w-full">
                  <div className="text-center">
                    <BarChart3 className="h-6 w-6 mx-auto mb-1" />
                    <div className="font-medium">Dashboard</div>
                    <div className="text-sm text-gray-500">Обзор дивизионов</div>
                  </div>
                </Button>
              </Link>
              <Button variant="outline" className="h-20">
                <div className="text-center">
                  <div className="font-medium">Результаты</div>
                  <div className="text-sm text-gray-500">Ввод счета</div>
                </div>
              </Button>
              <Button variant="outline" className="h-20">
                <div className="text-center">
                  <div className="font-medium">Настройки</div>
                  <div className="text-sm text-gray-500">Редактировать</div>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Division Modal */}
      {showCreateDivision && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">Создать дивизион</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Название дивизиона *
                </label>
                <input
                  type="text"
                  value={divisionForm.name}
                  onChange={(e) => setDivisionForm({ ...divisionForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Например: Мужской 2v2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Тип команд
                </label>
                <select
                  value={divisionForm.teamKind}
                  onChange={(e) => setDivisionForm({ ...divisionForm, teamKind: e.target.value as any })}
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
                  value={divisionForm.pairingMode}
                  onChange={(e) => setDivisionForm({ ...divisionForm, pairingMode: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="FIXED">Фиксированные пары</option>
                  <option value="MIX_AND_MATCH">Смешанные пары</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Количество пулов
                </label>
                <input
                  type="number"
                  min="1"
                  value={divisionForm.poolCount}
                  onChange={(e) => setDivisionForm({ ...divisionForm, poolCount: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {divisionForm.poolCount === 1 ? 'Будет создан 1 пул' : `Будет создано ${divisionForm.poolCount} пулов`}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Максимум команд (необязательно)
                </label>
                <input
                  type="number"
                  value={divisionForm.maxTeams || ''}
                  onChange={(e) => setDivisionForm({ ...divisionForm, maxTeams: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Например: 16"
                />
              </div>

              {/* Constraints Section */}
              <div className="border-t pt-4">
                <h3 className="text-lg font-medium text-gray-900 mb-3">Ограничения участия</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      DUPR рейтинг от
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="6"
                      value={divisionForm.minDupr || ''}
                      onChange={(e) => setDivisionForm({ ...divisionForm, minDupr: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Например: 3.0"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      DUPR рейтинг до
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="6"
                      value={divisionForm.maxDupr || ''}
                      onChange={(e) => setDivisionForm({ ...divisionForm, maxDupr: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Например: 4.5"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Возраст от
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={divisionForm.minAge || ''}
                      onChange={(e) => setDivisionForm({ ...divisionForm, minAge: e.target.value ? parseInt(e.target.value) : undefined })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Например: 18"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Возраст до
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={divisionForm.maxAge || ''}
                      onChange={(e) => setDivisionForm({ ...divisionForm, maxAge: e.target.value ? parseInt(e.target.value) : undefined })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Например: 65"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <Button
                variant="outline"
                onClick={() => setShowCreateDivision(false)}
                disabled={createDivision.isPending}
              >
                Отмена
              </Button>
              <Button
                onClick={handleCreateDivision}
                disabled={createDivision.isPending}
              >
                {createDivision.isPending ? 'Создание...' : 'Создать'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
