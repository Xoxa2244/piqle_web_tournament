'use client'

import { useParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useState } from 'react'

export default function SchedulePage() {
  const params = useParams()
  const tournamentId = params.id as string
  const [generatingRR, setGeneratingRR] = useState<string | null>(null)

  const { data: tournament, isLoading, refetch } = trpc.tournament.get.useQuery({ id: tournamentId })
  const generateRRMutation = trpc.match.generateRR.useMutation({
    onSuccess: () => {
      refetch()
      setGeneratingRR(null)
    },
    onError: (error) => {
      alert(`Ошибка: ${error.message}`)
      setGeneratingRR(null)
    },
  })

  const handleGenerateRR = (divisionId: string) => {
    setGeneratingRR(divisionId)
    generateRRMutation.mutate({ divisionId })
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
          <h1 className="text-3xl font-bold text-gray-900">Расписание</h1>
          <p className="text-gray-600 mt-2">{tournament.title}</p>
        </div>
        <div className="flex space-x-2">
          <Button className="bg-green-600 hover:bg-green-700 text-white">
            Сгенерировать расписание
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
            <p className="text-gray-600 mb-4">Сначала создайте дивизион для генерации расписания</p>
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
                {division.teams.length < 2 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500 mb-4">
                      Для генерации расписания нужно минимум 2 команды
                    </p>
                    <Link
                      href={`/admin/${tournamentId}/teams`}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                    >
                      Добавить команды
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Round Robin Section */}
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-3">Круговая система (Round Robin)</h3>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="text-gray-600 mb-2">
                          Всего матчей: {division.teams.length * (division.teams.length - 1) / 2}
                        </p>
                        <p className="text-gray-600 mb-4">
                          Матчей на команду: {division.teams.length - 1}
                        </p>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleGenerateRR(division.id)}
                          disabled={generatingRR === division.id}
                        >
                          {generatingRR === division.id ? 'Генерация...' : 'Сгенерировать RR'}
                        </Button>
                      </div>
                    </div>

                    {/* Playoff Section */}
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-3">Плей-офф</h3>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="text-gray-600 mb-2">
                          Формат: {division.teams.length <= 4 ? 'Single Elimination' : 
                                   division.teams.length <= 8 ? 'Double Elimination' : 'Custom Bracket'}
                        </p>
                        <p className="text-gray-600 mb-4">
                          Матчей в плей-офф: {division.teams.length - 1}
                        </p>
                        <Button variant="outline" size="sm">
                          Сгенерировать плей-офф
                        </Button>
                      </div>
                    </div>

                    {/* Matches List */}
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-3">Матчи</h3>
                      <div className="space-y-4">
                        {division.matches && division.matches.length > 0 ? (
                          // Group matches by round
                          Array.from({ length: Math.max(...division.matches.map(m => m.roundIndex)) + 1 }, (_, roundIndex) => {
                            const roundMatches = division.matches.filter(m => m.roundIndex === roundIndex)
                            return roundMatches.length > 0 ? (
                              <div key={roundIndex} className="space-y-2">
                                <h4 className="font-medium text-gray-700">Раунд {roundIndex + 1}</h4>
                                <div className="space-y-2">
                                  {roundMatches.map((match) => (
                                    <div key={match.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                                      <div className="flex items-center space-x-4">
                                        <span className="font-medium">{match.teamA?.name || 'TBD'}</span>
                                        <span className="text-gray-500">vs</span>
                                        <span className="font-medium">{match.teamB?.name || 'TBD'}</span>
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        <span className="text-sm text-gray-500">
                                          {match.stage} • Round {match.roundIndex + 1}
                                        </span>
                                        <Button size="sm" variant="outline">
                                          Ввести счет
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null
                          })
                        ) : (
                          <p className="text-gray-500 text-center py-4">
                            Расписание не сгенерировано
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
