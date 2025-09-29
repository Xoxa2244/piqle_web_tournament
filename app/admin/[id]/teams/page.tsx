'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function TeamsPage() {
  const params = useParams()
  const tournamentId = params.id as string
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [teamForm, setTeamForm] = useState({
    name: '',
    divisionId: '',
    seed: undefined as number | undefined,
    note: '',
  })

  const { data: tournament, isLoading } = trpc.tournament.get.useQuery({ id: tournamentId })
  const createTeam = trpc.team.create.useMutation({
    onSuccess: () => {
      setShowCreateTeam(false)
      setTeamForm({
        name: '',
        divisionId: '',
        seed: undefined,
        note: '',
      })
      window.location.reload()
    },
  })

  const handleCreateTeam = () => {
    if (!teamForm.name.trim()) {
      alert('Пожалуйста, введите название команды')
      return
    }
    if (!teamForm.divisionId) {
      alert('Пожалуйста, выберите дивизион')
      return
    }

    createTeam.mutate({
      divisionId: teamForm.divisionId,
      name: teamForm.name,
      seed: teamForm.seed,
      note: teamForm.note || undefined,
    })
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Загрузка турнира...</div>
      </div>
    )
  }

  if (!tournament) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Турнир не найден</h1>
        <Link href="/admin" className="text-blue-600 hover:text-blue-800">
          ← Вернуться к списку турниров
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Команды</h1>
          <p className="text-gray-600 mt-2">{tournament.title}</p>
        </div>
        <div className="flex space-x-2">
          <Button
            onClick={() => setShowCreateTeam(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Добавить команду
          </Button>
          <Link
            href={`/admin/${tournamentId}`}
            className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            ← Назад
          </Link>
        </div>
      </div>

      {tournament.divisions.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Нет дивизионов</h3>
            <p className="text-gray-600 mb-4">Сначала создайте дивизион для добавления команд</p>
            <Link
              href={`/admin/${tournamentId}`}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Создать дивизион
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {tournament.divisions.map((division) => (
            <Card key={division.id}>
              <CardHeader>
                <CardTitle>{division.name}</CardTitle>
                <CardDescription>
                  {division.teams.length} команд • {division.teamKind} • {division.pairingMode}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {division.teams.length > 0 ? (
                  <div className="space-y-2">
                    {division.teams.map((team) => (
                      <div key={team.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                        <div>
                          <span className="font-medium">{team.name}</span>
                          {team.seed && (
                            <span className="ml-2 text-sm text-gray-500">(#{team.seed})</span>
                          )}
                          {team.note && (
                            <span className="ml-2 text-sm text-gray-500">- {team.note}</span>
                          )}
                        </div>
                        <div className="flex space-x-2">
                          <Button size="sm" variant="outline">
                            Редактировать
                          </Button>
                          <Button size="sm" variant="outline">
                            Удалить
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">Команды не добавлены</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Team Modal */}
      {showCreateTeam && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">Добавить команду</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Название команды *
                </label>
                <input
                  type="text"
                  value={teamForm.name}
                  onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Например: Команда А"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Дивизион *
                </label>
                <select
                  value={teamForm.divisionId}
                  onChange={(e) => setTeamForm({ ...teamForm, divisionId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Выберите дивизион</option>
                  {tournament.divisions.map((division) => (
                    <option key={division.id} value={division.id}>
                      {division.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Посев (необязательно)
                </label>
                <input
                  type="number"
                  value={teamForm.seed || ''}
                  onChange={(e) => setTeamForm({ ...teamForm, seed: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Например: 1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Примечание (необязательно)
                </label>
                <input
                  type="text"
                  value={teamForm.note}
                  onChange={(e) => setTeamForm({ ...teamForm, note: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Например: Капитан - Иван Иванов"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <Button
                variant="outline"
                onClick={() => setShowCreateTeam(false)}
                disabled={createTeam.isPending}
              >
                Отмена
              </Button>
              <Button
                onClick={handleCreateTeam}
                disabled={createTeam.isPending}
              >
                {createTeam.isPending ? 'Создание...' : 'Создать'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
