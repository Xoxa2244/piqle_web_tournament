'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Users, AlertCircle } from 'lucide-react'

export default function TeamsPage() {
  const params = useParams()
  const tournamentId = params.id as string

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Link href={`/admin/${tournamentId}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад к турниру
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Команды и участники</h1>
            <p className="text-gray-600 mt-1">Управление составом и распределением</p>
          </div>
        </div>
      </div>

      {/* Coming Soon Card */}
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <CardTitle className="text-xl">Раздел в разработке</CardTitle>
            <CardDescription className="text-base">
              Функция управления командами и участниками находится в разработке
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="flex items-center justify-center space-x-2 text-amber-600 bg-amber-50 p-3 rounded-lg">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm font-medium">
                Пока используйте раздел "Дивизионы" для управления командами
              </span>
            </div>
            
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                В этом разделе будут доступны:
              </p>
              <ul className="text-sm text-gray-600 space-y-1 text-left max-w-md mx-auto">
                <li>• Создание и редактирование команд</li>
                <li>• Управление составом команд</li>
                <li>• Drag & drop перемещение участников</li>
                <li>• Импорт участников из CSV</li>
                <li>• Поиск и фильтрация участников</li>
              </ul>
            </div>

            <div className="pt-4">
              <Link href={`/admin/${tournamentId}/divisions`}>
                <Button className="w-full">
                  Перейти к управлению дивизионами
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
