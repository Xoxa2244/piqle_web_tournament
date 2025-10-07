'use client'

import { useParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useState } from 'react'
import ScoreInputModal from '@/components/ScoreInputModal'

export default function SchedulePage() {
  const params = useParams()
  const tournamentId = params.id as string
  const [generatingRR, setGeneratingRR] = useState<string | null>(null)
  const [generatingPlayoffs, setGeneratingPlayoffs] = useState<string | null>(null)
  const [bracketSize, setBracketSize] = useState<'4' | '8' | '16'>('8')
  const [scoreModal, setScoreModal] = useState<{
    isOpen: boolean
    matchId: string | null
    teamAName: string
    teamBName: string
  }>({
    isOpen: false,
    matchId: null,
    teamAName: '',
    teamBName: '',
  })

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

  const updateScoreMutation = trpc.match.updateGameScore.useMutation({
    onSuccess: () => {
      refetch()
      setScoreModal({ isOpen: false, matchId: null, teamAName: '', teamBName: '' })
    },
    onError: (error) => {
      alert(`Ошибка: ${error.message}`)
    },
  })

  const generatePlayoffsMutation = trpc.standings.generatePlayoffs.useMutation({
    onSuccess: () => {
      refetch()
      setGeneratingPlayoffs(null)
    },
    onError: (error) => {
      alert(`Ошибка: ${error.message}`)
      setGeneratingPlayoffs(null)
    },
  })


  const handleGenerateRR = (divisionId: string) => {
    setGeneratingRR(divisionId)
    generateRRMutation.mutate({ divisionId })
  }

  const handleGeneratePlayoffs = (divisionId: string) => {
    setGeneratingPlayoffs(divisionId)
    generatePlayoffsMutation.mutate({ 
      divisionId, 
      bracketSize: bracketSize 
    })
  }

  const handleScoreInput = (matchId: string, teamAName: string, teamBName: string) => {
    setScoreModal({
      isOpen: true,
      matchId,
      teamAName,
      teamBName,
    })
  }

  const handleScoreSubmit = (scoreA: number, scoreB: number) => {
    if (scoreModal.matchId) {
      updateScoreMutation.mutate({
        matchId: scoreModal.matchId,
        gameIndex: 0, // First game
        scoreA,
        scoreB,
      })
    }
  }

  const handleScoreModalClose = () => {
    setScoreModal({ isOpen: false, matchId: null, teamAName: '', teamBName: '' })
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
          {tournament.divisions.map((division) => {
            const playInStatusQuery = trpc.standings.checkPlayInStatus.useQuery(
              { divisionId: division.id },
              { enabled: !!division }
            )
            
            return (
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
                      <div className="bg-gray-50 p-4 rounded-lg space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Размер сетки плей-офф
                          </label>
                          <select
                            value={bracketSize}
                            onChange={(e) => setBracketSize(e.target.value as '4' | '8' | '16')}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="4">4 команды</option>
                            <option value="8">8 команд</option>
                            <option value="16">16 команд</option>
                          </select>
                        </div>
                        
                        <div className="text-sm text-gray-600">
                          <p>Команд в дивизионе: {division.teams.length}</p>
                          <p>Целевой размер: {bracketSize}</p>
                          {division.teams.length > parseInt(bracketSize) && division.teams.length < 2 * parseInt(bracketSize) && (
                            <p className="text-orange-600 font-medium">
                              Будет проведен плей-ин для {division.teams.length - parseInt(bracketSize)} команд
                            </p>
                          )}
                          
                          {/* Play-in Status */}
                          {playInStatusQuery.data?.hasPlayIn && (
                            <div className="mt-2 p-2 bg-blue-50 rounded">
                              <p className="font-medium text-blue-800">Статус плей-ина:</p>
                              <p className="text-blue-700">
                                {playInStatusQuery.data.completedMatches} / {playInStatusQuery.data.totalMatches} матчей завершено
                              </p>
                              {!playInStatusQuery.data.isComplete && (
                                <p className="text-red-600 font-medium mt-1">
                                  ⚠️ Завершите все матчи плей-ина для генерации плей-офф
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleGeneratePlayoffs(division.id)}
                          disabled={
                            generatingPlayoffs === division.id || 
                            division.teams.length < 2 ||
                            (playInStatusQuery.data?.hasPlayIn && !playInStatusQuery.data?.isComplete)
                          }
                        >
                          {generatingPlayoffs === division.id ? 'Генерация...' : 'Сгенерировать плей-офф'}
                        </Button>
                        
                        {/* Disabled reason */}
                        {playInStatusQuery.data?.hasPlayIn && !playInStatusQuery.data?.isComplete && (
                          <p className="text-xs text-red-600 mt-1">
                            Завершите все матчи плей-ина для продолжения
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Matches List */}
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-3">Матчи</h3>
                      <div className="space-y-4">
                        {division.matches && division.matches.length > 0 ? (
                          // Group matches by stage and round
                          (() => {
                            const stages = ['ROUND_ROBIN', 'PLAY_IN', 'ELIMINATION']
                            return stages.map(stage => {
                              const stageMatches = division.matches.filter(m => m.stage === stage)
                              if (stageMatches.length === 0) return null
                              
                              const maxRound = Math.max(...stageMatches.map(m => m.roundIndex))
                              return (
                                <div key={stage} className="space-y-2">
                                  <h4 className="font-medium text-gray-700">
                                    {stage === 'ROUND_ROBIN' ? 'Round Robin' : 
                                     stage === 'PLAY_IN' ? 'Плей-ин' : 'Плей-офф'}
                                  </h4>
                                  {Array.from({ length: maxRound + 1 }, (_, roundIndex) => {
                                    const roundMatches = stageMatches.filter(m => m.roundIndex === roundIndex)
                                    return roundMatches.length > 0 ? (
                                      <div key={roundIndex} className="space-y-2">
                                        <h5 className="text-sm font-medium text-gray-600">
                                          {stage === 'ROUND_ROBIN' ? `Раунд ${roundIndex + 1}` : 
                                           stage === 'PLAY_IN' ? `Плей-ин раунд ${roundIndex + 1}` : 
                                           `Плей-офф раунд ${roundIndex + 1}`}
                                        </h5>
                                        <div className="space-y-2">
                                          {roundMatches.map((match) => (
                                            <div key={match.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                                              <div className="flex items-center space-x-4">
                                                <div className="flex items-center space-x-2">
                                                  <span className="font-medium">{match.teamA?.name || 'TBD'}</span>
                                                  {match.games && match.games.length > 0 && (
                                                    <span className="text-lg font-bold text-blue-600">
                                                      {match.games[0]?.scoreA || 0}
                                                    </span>
                                                  )}
                                                </div>
                                                <span className="text-gray-500">vs</span>
                                                <div className="flex items-center space-x-2">
                                                  {match.games && match.games.length > 0 && (
                                                    <span className="text-lg font-bold text-blue-600">
                                                      {match.games[0]?.scoreB || 0}
                                                    </span>
                                                  )}
                                                  <span className="font-medium">{match.teamB?.name || 'TBD'}</span>
                                                </div>
                                              </div>
                                              <div className="flex items-center space-x-2">
                                                <span className="text-sm text-gray-500">
                                                  {match.stage} • Round {match.roundIndex + 1}
                                                </span>
                                                <Button 
                                                  size="sm" 
                                                  variant="outline"
                                                  onClick={() => handleScoreInput(
                                                    match.id, 
                                                    match.teamA?.name || 'TBD', 
                                                    match.teamB?.name || 'TBD'
                                                  )}
                                                >
                                                  Ввести счет
                                                </Button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null
                                  })}
                                </div>
                              )
                            }).filter(Boolean)
                          })()
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
            )
          })}
        </div>
      )}

      {/* Score Input Modal */}
      <ScoreInputModal
        isOpen={scoreModal.isOpen}
        onClose={handleScoreModalClose}
        onSubmit={handleScoreSubmit}
        teamAName={scoreModal.teamAName}
        teamBName={scoreModal.teamBName}
        isLoading={updateScoreMutation.isPending}
      />
    </div>
  )
}
