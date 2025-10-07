'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { 
  ChevronLeft, 
  ChevronRight, 
  BarChart3, 
  Play, 
  RotateCcw, 
  Calculator,
  AlertTriangle,
  CheckCircle,
  Clock,
  Trophy,
  Users,
  Target
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import ScoreInputModal from '@/components/ScoreInputModal'

export default function DivisionStageManagement() {
  const router = useRouter()
  const params = useParams()
  const tournamentId = params.id as string
  const [selectedDivisionId, setSelectedDivisionId] = useState('')
  const [showScoreModal, setShowScoreModal] = useState(false)
  const [selectedMatch, setSelectedMatch] = useState<any>(null)
  const [showRegenerateModal, setShowRegenerateModal] = useState(false)
  const [regenerateType, setRegenerateType] = useState<'playin' | 'playoff' | null>(null)

  // Загружаем данные турнира
  const { data: tournament, refetch: refetchTournament } = trpc.tournament.get.useQuery(
    { id: tournamentId },
    { enabled: !!tournamentId }
  )

  // Автоматически выбираем первый дивизион, если не выбран
  useEffect(() => {
    if (tournament && tournament.divisions.length > 0 && !selectedDivisionId) {
      setSelectedDivisionId(tournament.divisions[0].id)
    }
  }, [tournament, selectedDivisionId])

  // Загружаем данные дивизиона
  const { data: divisionData, refetch: refetchDivision } = trpc.divisionStage.getDivisionStage.useQuery(
    { divisionId: selectedDivisionId },
    { enabled: !!selectedDivisionId }
  )

  // Мутации для генерации
  const generateRRMutation = trpc.match.generateRR.useMutation({
    onSuccess: () => {
      refetchDivision()
      refetchTournament()
    }
  })

  const generatePlayoffsMutation = trpc.standings.generatePlayoffs.useMutation({
    onSuccess: () => {
      refetchDivision()
      refetchTournament()
    }
  })

  const updateMatchResultMutation = trpc.divisionStage.updateMatchResult.useMutation({
    onSuccess: () => {
      refetchDivision()
      refetchTournament()
    }
  })

  // Вычисляем статистику
  const division = divisionData
  const teams = division?.teams || []
  const matches = division?.matches || []
  
  const rrMatches = matches.filter(m => m.stage === 'ROUND_ROBIN')
  const playInMatches = matches.filter(m => m.stage === 'PLAY_IN')
  const eliminationMatches = matches.filter(m => m.stage === 'ELIMINATION')
  
  const completedRRMatches = rrMatches.filter(m => 
    m.games && m.games.length > 0 && m.games.some(g => g.scoreA > 0 || g.scoreB > 0)
  )
  
  const completedPlayInMatches = playInMatches.filter(m => 
    m.games && m.games.length > 0 && m.games.some(g => g.scoreA > 0 || g.scoreB > 0)
  )

  const teamCount = teams.length
  const targetBracketSize = 4 // Пока фиксированный, потом можно сделать настраиваемым
  const needsPlayIn = teamCount > targetBracketSize && teamCount < targetBracketSize * 2
  const playInExcess = teamCount - targetBracketSize

  // Определяем текущую стадию
  const currentStage = division?.stage || 'RR_IN_PROGRESS'
  
  // Функции для обработки действий
  const handleGenerateRR = () => {
    if (selectedDivisionId) {
      generateRRMutation.mutate({ divisionId: selectedDivisionId })
    }
  }

  const handleGeneratePlayoffs = () => {
    if (selectedDivisionId) {
      generatePlayoffsMutation.mutate({ 
        divisionId: selectedDivisionId, 
        bracketSize: targetBracketSize 
      })
    }
  }

  const handleScoreInput = (match: any) => {
    setSelectedMatch(match)
    setShowScoreModal(true)
  }

  const handleScoreSubmit = (matchId: string, games: Array<{ scoreA: number; scoreB: number }>) => {
    updateMatchResultMutation.mutate({
      matchId,
      games
    })
    setShowScoreModal(false)
    setSelectedMatch(null)
  }

  const handleScoreModalClose = () => {
    setShowScoreModal(false)
    setSelectedMatch(null)
  }

  const handleRegenerate = (type: 'playin' | 'playoff') => {
    setRegenerateType(type)
    setShowRegenerateModal(true)
  }

  const confirmRegenerate = () => {
    // Здесь будет логика перегенерации с полным сбросом
    setShowRegenerateModal(false)
    setRegenerateType(null)
  }

  // Определяем доступность кнопок
  const canGenerateRR = !rrMatches.length
  const canInputRRResults = rrMatches.length > 0 && currentStage === 'RR_IN_PROGRESS'
  const canRecalculateSeeding = completedRRMatches.length === rrMatches.length && currentStage === 'RR_COMPLETE'
  const canGeneratePlayIn = currentStage === 'RR_COMPLETE' && needsPlayIn && !playInMatches.length
  const canRegeneratePlayIn = playInMatches.length > 0
  const canGeneratePlayoff = (currentStage === 'PLAY_IN_COMPLETE' || (currentStage === 'RR_COMPLETE' && !needsPlayIn)) && !eliminationMatches.length

  if (!tournament || !division) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Загрузка данных дивизиона...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Верхняя панель */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Левая часть - информация о дивизионе */}
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="flex items-center space-x-2"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Назад</span>
            </Button>
            
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{division.name}</h1>
              <div className="flex items-center space-x-4 mt-1">
                <span className="text-sm text-gray-600">
                  {teamCount} команд • {division.teamKind === 'SINGLES_1v1' ? 'Singles' : 'Doubles'} • {division.pairingMode}
                </span>
                <Badge variant="outline" className="text-xs">
                  {currentStage.replace(/_/g, ' ')}
                </Badge>
                <span className="text-sm text-gray-500">
                  Целевой размер: {targetBracketSize}
                </span>
              </div>
            </div>
          </div>

          {/* Правая часть - быстрые действия */}
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/admin/${tournamentId}/dashboard?division=${selectedDivisionId}`)}
              className="flex items-center space-x-2"
            >
              <BarChart3 className="h-4 w-4" />
              <span>Дашборд</span>
            </Button>
            
            {/* Переключатель дивизионов */}
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const currentIndex = tournament.divisions.findIndex(d => d.id === selectedDivisionId)
                  const prevIndex = currentIndex > 0 ? currentIndex - 1 : tournament.divisions.length - 1
                  setSelectedDivisionId(tournament.divisions[prevIndex].id)
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <select
                value={selectedDivisionId}
                onChange={(e) => setSelectedDivisionId(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm"
              >
                {tournament.divisions.map((div) => (
                  <option key={div.id} value={div.id}>
                    {div.name} ({div.teams?.length || 0} команд)
                  </option>
                ))}
              </select>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const currentIndex = tournament.divisions.findIndex(d => d.id === selectedDivisionId)
                  const nextIndex = currentIndex < tournament.divisions.length - 1 ? currentIndex + 1 : 0
                  setSelectedDivisionId(tournament.divisions[nextIndex].id)
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Блок Round Robin */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Round Robin</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Сводка RR */}
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  Всего матчей: {rrMatches.length} • Матчей на команду: {Math.max(0, teamCount - 1)}
                </p>
                {rrMatches.length > 0 && (
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Progress 
                        value={(completedRRMatches.length / rrMatches.length) * 100} 
                        className="w-32"
                      />
                      <span className="text-sm text-gray-600">
                        {completedRRMatches.length}/{rrMatches.length} завершено
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex items-center space-x-2">
                {canGenerateRR && (
                  <Button
                    onClick={handleGenerateRR}
                    disabled={generateRRMutation.isPending}
                    className="flex items-center space-x-2"
                  >
                    <Play className="h-4 w-4" />
                    <span>Сгенерировать RR</span>
                  </Button>
                )}
                
                {canInputRRResults && (
                  <Button
                    variant="outline"
                    onClick={() => {/* Показать список матчей RR */}}
                    className="flex items-center space-x-2"
                  >
                    <Clock className="h-4 w-4" />
                    <span>Ввести результаты</span>
                  </Button>
                )}
                
                {canRecalculateSeeding && (
                  <Button
                    variant="outline"
                    onClick={() => {/* Пересчитать посев */}}
                    className="flex items-center space-x-2"
                  >
                    <Calculator className="h-4 w-4" />
                    <span>Пересчитать посев</span>
                  </Button>
                )}
                
                <Button
                  variant="ghost"
                  onClick={() => router.push(`/admin/${tournamentId}/dashboard?division=${selectedDivisionId}`)}
                  className="flex items-center space-x-2"
                >
                  <BarChart3 className="h-4 w-4" />
                  <span>Дашборд</span>
                </Button>
              </div>
            </div>

            {/* Блокировка если RR не завершен */}
            {currentStage === 'RR_IN_PROGRESS' && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Завершите все матчи Round Robin, чтобы продолжить к Play-In/Play-Off.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Блок Play-In */}
        {needsPlayIn && (
          <Card className={currentStage === 'RR_IN_PROGRESS' ? 'opacity-50 pointer-events-none' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Target className="h-5 w-5" />
                <span>Play-In</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Сводка Play-In */}
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  Команд в дивизионе: {teamCount}. Целевой размер: {targetBracketSize}. Превышение: {playInExcess}.
                </p>
                <p className="text-sm text-gray-600">
                  В Play-In попали нижние {playInExcess * 2} по посеву. Победители займут {playInExcess} последних слотов R1.
                </p>
              </div>

              {/* Кнопки Play-In */}
              <div className="flex items-center space-x-2">
                {canGeneratePlayIn && (
                  <Button
                    onClick={() => {/* Генерировать Play-In */}}
                    className="flex items-center space-x-2"
                  >
                    <Play className="h-4 w-4" />
                    <span>Сгенерировать Play-In</span>
                  </Button>
                )}
                
                {canRegeneratePlayIn && (
                  <Button
                    variant="outline"
                    onClick={() => handleRegenerate('playin')}
                    className="flex items-center space-x-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Перегенерировать Play-In</span>
                  </Button>
                )}
              </div>

              {/* Прогресс Play-In */}
              {playInMatches.length > 0 && (
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Progress 
                      value={(completedPlayInMatches.length / playInMatches.length) * 100} 
                      className="w-32"
                    />
                    <span className="text-sm text-gray-600">
                      {completedPlayInMatches.length}/{playInMatches.length} матчей завершено
                    </span>
                  </div>
                  
                  {completedPlayInMatches.length === playInMatches.length && (
                    <div className="flex items-center space-x-2 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">Play-In завершен</span>
                    </div>
                  )}
                </div>
              )}

              {/* Список пар Play-In */}
              {playInMatches.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {playInMatches.map((match) => (
                    <div key={match.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium">
                          [{match.teamA.seed || '?'}] {match.teamA.name}
                        </div>
                        <div className="text-sm text-gray-500">vs</div>
                        <div className="text-sm font-medium">
                          [{match.teamB.seed || '?'}] {match.teamB.name}
                        </div>
                      </div>
                      
                      {match.games && match.games.length > 0 && match.games[0].scoreA > 0 ? (
                        <div className="text-center">
                          <div className="text-lg font-bold">
                            {match.games[0].scoreA} - {match.games[0].scoreB}
                          </div>
                          <div className="text-sm text-green-600 font-medium">
                            Победитель: {match.games[0].winner === 'A' ? match.teamA.name : match.teamB.name}
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleScoreInput(match)}
                          className="w-full"
                        >
                          Ввести счет
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Блок Play-Off */}
        <Card className={currentStage === 'RR_IN_PROGRESS' ? 'opacity-50 pointer-events-none' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Trophy className="h-5 w-5" />
              <span>Play-Off</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Сводка Play-Off */}
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  Текущий раунд: {eliminationMatches.length > 0 ? 'R1' : 'Не начат'}
                </p>
                <p className="text-sm text-gray-600">
                  Команд в раунде: {eliminationMatches.length > 0 ? eliminationMatches.length * 2 : 0}
                </p>
              </div>
              
              <div className="flex items-center space-x-2">
                {canGeneratePlayoff && (
                  <Button
                    onClick={handleGeneratePlayoffs}
                    disabled={generatePlayoffsMutation.isPending}
                    className="flex items-center space-x-2"
                  >
                    <Play className="h-4 w-4" />
                    <span>Сгенерировать Play-Off</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Сетка Play-Off */}
            {eliminationMatches.length > 0 && (
              <div className="space-y-4">
                <h4 className="font-medium">Сетка плей-офф</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {eliminationMatches.map((match) => (
                    <div key={match.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium">
                          [{match.teamA.seed || '?'}] {match.teamA.name}
                        </div>
                        <div className="text-sm text-gray-500">vs</div>
                        <div className="text-sm font-medium">
                          [{match.teamB.seed || '?'}] {match.teamB.name}
                        </div>
                      </div>
                      
                      {match.games && match.games.length > 0 && match.games[0].scoreA > 0 ? (
                        <div className="text-center">
                          <div className="text-lg font-bold">
                            {match.games[0].scoreA} - {match.games[0].scoreB}
                          </div>
                          <div className="text-sm text-green-600 font-medium">
                            Победитель: {match.games[0].winner === 'A' ? match.teamA.name : match.teamB.name}
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleScoreInput(match)}
                          className="w-full"
                        >
                          Ввести счет
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Модалка ввода счета */}
      {showScoreModal && selectedMatch && (
        <ScoreInputModal
          isOpen={showScoreModal}
          onClose={handleScoreModalClose}
          onSubmit={(scoreA, scoreB) => {
            handleScoreSubmit(selectedMatch.id, [{ scoreA, scoreB }])
          }}
          teamAName={selectedMatch.teamA.name}
          teamBName={selectedMatch.teamB.name}
          isLoading={updateMatchResultMutation.isPending}
        />
      )}

      {/* Модалка подтверждения перегенерации */}
      {showRegenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              Перегенерация {regenerateType === 'playin' ? 'Play-In' : 'Play-Off'}
            </h3>
            <p className="text-gray-600 mb-6">
              Будут сброшены все результаты {regenerateType === 'playin' ? 'Play-In и всех последующих стадий Play-Off' : 'Play-Off'}. 
              Продолжить?
            </p>
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowRegenerateModal(false)}
              >
                Отменить
              </Button>
              <Button
                variant="destructive"
                onClick={confirmRegenerate}
              >
                Перегенерировать
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
