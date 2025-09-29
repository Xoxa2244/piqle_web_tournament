'use client'

import { useParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function TournamentDetailPage() {
  const params = useParams()
  const tournamentId = params.id as string

  const { data: tournament, isLoading, error } = trpc.tournament.get.useQuery({ id: tournamentId })

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
    <div>
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{tournament.title}</h1>
          {tournament.description && (
            <p className="text-gray-600 mt-2">{tournament.description}</p>
          )}
        </div>
        <div className="flex space-x-2">
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
            <Button className="w-full mt-4" variant="outline">
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
              <Button variant="outline" className="h-20">
                <div className="text-center">
                  <div className="font-medium">Команды</div>
                  <div className="text-sm text-gray-500">Управление участниками</div>
                </div>
              </Button>
              <Button variant="outline" className="h-20">
                <div className="text-center">
                  <div className="font-medium">Расписание</div>
                  <div className="text-sm text-gray-500">RR и плей-офф</div>
                </div>
              </Button>
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
    </div>
  )
}
