'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function ImportPage() {
  const params = useParams()
  const tournamentId = params.id as string
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  const { data: tournament, isLoading } = trpc.tournament.get.useQuery({ id: tournamentId })
  const resetTournament = trpc.import.resetTournament.useMutation({
    onSuccess: () => {
      alert('Турнир сброшен! Все данные удалены.')
      window.location.reload()
    },
    onError: (error) => {
      alert(`Ошибка при сбросе турнира: ${error.message}`)
    }
  })
  const importCSV = trpc.import.importCSV.useMutation({
    onSuccess: (data) => {
      alert(`Импорт завершен! Создано ${data.divisions} дивизионов и ${data.teams} команд.`)
      window.location.reload()
    },
    onError: (error) => {
      alert(`Ошибка при импорте: ${error.message}`)
    }
  })

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type === 'text/csv') {
      setCsvFile(file)
    } else {
      alert('Пожалуйста, выберите CSV файл')
    }
  }

  const handleImport = async () => {
    if (!csvFile) {
      alert('Пожалуйста, выберите CSV файл')
      return
    }

    setIsImporting(true)
    try {
      const csvText = await csvFile.text()
      const base64Data = Buffer.from(csvText, 'utf-8').toString('base64')
      
      importCSV.mutate({
        tournamentId,
        csvData: base64Data
      })
    } catch (error) {
      alert(`Ошибка при чтении файла: ${error}`)
    } finally {
      setIsImporting(false)
    }
  }

  const handleReset = () => {
    const confirmed = window.confirm(
      'ВНИМАНИЕ! Это действие удалит ВСЕ данные турнира:\n\n' +
      '• Все дивизионы\n' +
      '• Все команды\n' +
      '• Всех игроков\n' +
      '• Все матчи\n' +
      '• Все результаты\n\n' +
      'Это действие НЕЛЬЗЯ отменить!\n\n' +
      'Вы уверены, что хотите сбросить турнир?'
    )
    
    if (confirmed) {
      const doubleConfirm = window.confirm(
        'Последний шанс! Вы действительно хотите удалить ВСЕ данные турнира?\n\n' +
        'Нажмите OK только если вы абсолютно уверены!'
      )
      
      if (doubleConfirm) {
        resetTournament.mutate({ tournamentId })
      }
    }
  }

  const downloadTemplate = () => {
    const link = document.createElement('a')
    link.href = '/test-participants.csv'
    link.download = 'participants-template.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
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
          <h1 className="text-3xl font-bold text-gray-900">Импорт данных</h1>
          <p className="text-gray-600 mt-2">{tournament.title}</p>
        </div>
        <Link
          href={`/admin/${tournamentId}`}
          className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          ← Назад
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Import CSV */}
        <Card>
          <CardHeader>
            <CardTitle>Импорт участников из CSV</CardTitle>
            <CardDescription>
              Загрузите CSV файл с данными участников для автоматического создания дивизионов и команд
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Выберите CSV файл
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {csvFile && (
                <p className="text-sm text-green-600 mt-1">
                  Выбран файл: {csvFile.name}
                </p>
              )}
            </div>

            <div className="flex space-x-2">
              <Button
                onClick={handleImport}
                disabled={!csvFile || isImporting || importCSV.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isImporting || importCSV.isPending ? 'Импорт...' : 'Импортировать'}
              </Button>
              <Button
                onClick={downloadTemplate}
                variant="outline"
              >
                Скачать шаблон
              </Button>
            </div>

            <div className="text-sm text-gray-600">
              <p className="font-medium mb-2">Требуемые колонки в CSV:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Имя, Фамилия, Пол (M/F), Возраст</li>
                <li>DUPR rating, Дивизион, Тип (1v1/2v2/4v4)</li>
                <li>Ограничение по возрасту, Ограничение по DUPR</li>
                <li>Pool (опционально), Команда</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Reset Tournament */}
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Сброс турнира</CardTitle>
            <CardDescription>
              ОПАСНО! Удаляет все данные турнира для возможности загрузки новых данных
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="font-medium text-red-800 mb-2">Что будет удалено:</h4>
              <ul className="text-sm text-red-700 space-y-1">
                <li>• Все дивизионы и их настройки</li>
                <li>• Все команды и игроки</li>
                <li>• Все матчи и результаты</li>
                <li>• Все призы и награды</li>
                <li>• Вся история изменений</li>
              </ul>
            </div>

            <div className="flex space-x-2">
              <Button
                onClick={handleReset}
                disabled={resetTournament.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {resetTournament.isPending ? 'Сброс...' : 'Сбросить турнир'}
              </Button>
            </div>

            <div className="text-sm text-gray-600">
              <p className="font-medium text-red-600 mb-1">⚠️ Внимание!</p>
              <p>Это действие нельзя отменить. Используйте только для полной очистки турнира перед загрузкой новых данных.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Current Tournament Status */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Текущее состояние турнира</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{tournament.divisions.length}</div>
              <div className="text-sm text-gray-600">Дивизионов</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {tournament.divisions.reduce((sum, div) => sum + div.teams.length, 0)}
              </div>
              <div className="text-sm text-gray-600">Команд</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {tournament.divisions.reduce((sum, div) => 
                  sum + div.teams.reduce((teamSum, team) => teamSum + (team.teamPlayers?.length || 0), 0), 0
                )}
              </div>
              <div className="text-sm text-gray-600">Игроков</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {tournament.divisions.reduce((sum, div) => sum + (div.matches?.length || 0), 0)}
              </div>
              <div className="text-sm text-gray-600">Матчей</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
