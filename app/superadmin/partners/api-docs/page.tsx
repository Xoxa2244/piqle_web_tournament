'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Copy, Check, Mail, Key, Users, Trophy, FileText, RefreshCw, Download } from 'lucide-react'

const SUPERADMIN_AUTH_KEY = 'superadmin_authenticated'

export default function ApiDocsPage() {
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedCode(id)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const CodeBlock = ({ code, language = 'json', id }: { code: string; language?: string; id: string }) => (
    <div className="relative">
      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
        <code>{code}</code>
      </pre>
      <button
        onClick={() => copyToClipboard(code, id)}
        className="absolute top-2 right-2 p-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
      >
        {copiedCode === id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <Link href="/superadmin/partners">
            <Button variant="outline" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Partners
            </Button>
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Piqle Partner API Documentation</h1>
          <p className="text-gray-600">Complete guide for IndyLeague partner integrations</p>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Общее описание
            </TabsTrigger>
            <TabsTrigger value="endpoints" className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              API Endpoints
            </TabsTrigger>
          </TabsList>

          {/* Общее описание */}
          <TabsContent value="overview" className="space-y-6">
            {/* Регистрация турнирного директора */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  <CardTitle>1. Регистрация турнирного директора</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  Перед началом работы с API необходимо зарегистрировать турнирного директора в системе Piqle.
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 mb-2">Шаги регистрации:</h4>
                  <ol className="list-decimal list-inside space-y-2 text-blue-800">
                    <li>Турнирный директор создает аккаунт на платформе Piqle</li>
                    <li>Выполняет вход в систему</li>
                    <li>Получает доступ к панели управления турнирами</li>
                  </ol>
                </div>
              </CardContent>
            </Card>

            {/* Запрос на получение партнерских ключей */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  <CardTitle>2. Запрос на получение партнерских ключей</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  После регистрации турнирного директора необходимо отправить запрос на получение партнерских ключей доступа к API.
                </p>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-semibold text-yellow-900 mb-2">Отправьте запрос на: <code className="bg-yellow-100 px-2 py-1 rounded">rg@piqle.io</code></h4>
                  <div className="text-yellow-800 space-y-2">
                    <p className="font-medium">В запросе укажите:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>Название организации/партнера</li>
                      <li>Email турнирного директора (который уже зарегистрирован в Piqle)</li>
                      <li>Краткое описание интеграции (для чего будет использоваться API)</li>
                      <li>Ожидаемый объем данных (количество турниров, команд, игроков)</li>
                      <li>Желаемая среда: <code className="bg-yellow-100 px-1 py-0.5 rounded">SANDBOX</code> или <code className="bg-yellow-100 px-1 py-0.5 rounded">PRODUCTION</code></li>
                    </ul>
                  </div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Пример запроса:</h4>
                  <div className="text-sm text-gray-700 space-y-1">
                    <p><strong>Тема:</strong> Запрос на получение партнерских ключей API</p>
                    <p><strong>Текст:</strong></p>
                    <pre className="bg-white p-3 rounded border text-xs overflow-x-auto">
{`Здравствуйте!

Просим предоставить доступ к Partner API для нашей организации.

Организация: [Название]
Email турнирного директора: director@example.com
Описание: Интеграция для автоматизации управления турнирами IndyLeague
Ожидаемый объем: ~10 турниров в месяц, до 50 команд на турнир
Среда: SANDBOX (для начала)

С уважением,
[Ваше имя]`}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Получение партнерских ключей */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5" />
                  <CardTitle>3. Получение партнерских ключей</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  После обработки запроса администратор Piqle создаст партнерский аккаунт и свяжет его с турнирным директором.
                </p>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-semibold text-green-900 mb-2">Что вы получите:</h4>
                  <ul className="list-disc list-inside space-y-2 text-green-800">
                    <li>
                      <strong>Partner Code</strong> — уникальный идентификатор партнера (например: <code className="bg-green-100 px-1 py-0.5 rounded">indyleague-partner-001</code>)
                    </li>
                    <li>
                      <strong>API Key ID</strong> — публичный идентификатор ключа (начинается с <code className="bg-green-100 px-1 py-0.5 rounded">pk_</code>)
                    </li>
                    <li>
                      <strong>API Secret</strong> — секретный ключ (начинается с <code className="bg-green-100 px-1 py-0.5 rounded">sk_</code>)
                      <span className="text-red-600 font-semibold"> ⚠️ Храните в секрете!</span>
                    </li>
                    <li>
                      <strong>Base URL</strong> — адрес API (например: <code className="bg-green-100 px-1 py-0.5 rounded">https://rtest.piqle.io/api/v1/partners/indyleague</code>)
                    </li>
                  </ul>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 mb-2">Логика связки турнирного директора и партнера:</h4>
                  <ul className="list-disc list-inside space-y-2 text-blue-800">
                    <li>Каждый партнер имеет назначенного <strong>турнирного директора</strong> (Tournament Director)</li>
                    <li>Все турниры, созданные через API от имени партнера, автоматически привязываются к этому директору</li>
                    <li>Турнирный директор получает полный доступ к управлению турнирами через веб-интерфейс Piqle</li>
                    <li>Директор может вручную редактировать данные, но такие изменения помечаются как &quot;overridden&quot; (переопределены вручную)</li>
                    <li>При следующем обновлении данных через API, вручную внесенные изменения могут быть перезаписаны</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Создание турнира */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5" />
                  <CardTitle>4. Создание турнира со стороны партнера</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  Партнер создает турнир через API, используя свои внешние идентификаторы. Система автоматически создает турнир и привязывает его к назначенному турнирному директору.
                </p>
                <div className="space-y-3">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">Процесс:</h4>
                    <ol className="list-decimal list-inside space-y-2 text-gray-700">
                      <li>Партнер отправляет POST запрос на <code className="bg-gray-100 px-2 py-1 rounded">/tournaments/upsert</code></li>
                      <li>Указывает свой <code className="bg-gray-100 px-2 py-1 rounded">externalTournamentId</code> (например: <code className="bg-gray-100 px-2 py-1 rounded">spring-2024-league</code>)</li>
                      <li>Система создает турнир и возвращает внутренний идентификатор</li>
                      <li>Создается маппинг между внешним и внутренним ID для последующих запросов</li>
                    </ol>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-blue-800">
                      <strong>Важно:</strong> Все последующие запросы должны использовать тот же <code className="bg-blue-100 px-1 py-0.5 rounded">externalTournamentId</code>, 
                      который был указан при создании турнира.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Наполнение турнира */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  <CardTitle>5. Наполнение турнира со стороны партнера</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  После создания турнира партнер наполняет его данными в определенном порядке.
                </p>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3">Рекомендуемый порядок создания данных:</h4>
                  <ol className="list-decimal list-inside space-y-3 text-gray-700">
                    <li>
                      <strong>Дивизионы</strong> — создание групп команд (например: &quot;Men&apos;s A&quot;, &quot;Women&apos;s B&quot;)
                      <div className="ml-6 mt-1 text-sm text-gray-600">
                        <code className="bg-gray-100 px-2 py-1 rounded">POST /divisions/upsert</code>
                      </div>
                    </li>
                    <li>
                      <strong>Команды</strong> — создание команд в дивизионах (до 8 игроков на команду для IndyLeague)
                      <div className="ml-6 mt-1 text-sm text-gray-600">
                        <code className="bg-gray-100 px-2 py-1 rounded">POST /teams/upsert</code>
                      </div>
                    </li>
                    <li>
                      <strong>Игроки</strong> — создание игроков с указанием команды (опционально)
                      <div className="ml-6 mt-1 text-sm text-gray-600">
                        <code className="bg-gray-100 px-2 py-1 rounded">POST /players/upsert</code>
                        <span className="ml-2 text-xs">Если указан <code className="bg-gray-100 px-1 py-0.5 rounded">externalTeamId</code>, игрок автоматически добавляется в команду</span>
                      </div>
                    </li>
                    <li>
                      <strong>Дни матчей</strong> — создание дней проведения игр
                      <div className="ml-6 mt-1 text-sm text-gray-600">
                        <code className="bg-gray-100 px-2 py-1 rounded">POST /days/upsert</code>
                      </div>
                    </li>
                    <li>
                      <strong>Матчи (Matchups)</strong> — создание пар команд для игры
                      <div className="ml-6 mt-1 text-sm text-gray-600">
                        <code className="bg-gray-100 px-2 py-1 rounded">POST /matchups/upsert</code>
                      </div>
                    </li>
                    <li>
                      <strong>Ростеры</strong> — назначение игроков на конкретный матч (4 активных игрока)
                      <div className="ml-6 mt-1 text-sm text-gray-600">
                        <code className="bg-gray-100 px-2 py-1 rounded">POST /rosters/upsert</code>
                        <span className="ml-2 text-xs">Все игроки должны быть частью команды (TeamPlayer)</span>
                      </div>
                    </li>
                  </ol>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-yellow-800">
                    <strong>Примечание:</strong> Все операции идемпотентны — можно безопасно повторять запросы с теми же данными.
                    Используйте заголовок <code className="bg-yellow-100 px-1 py-0.5 rounded">Idempotency-Key</code> для гарантии.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Работа турнирного директора */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  <CardTitle>6. Работа турнирного директора на своей стороне</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  После того как партнер создал турнир и наполнил его базовыми данными, турнирный директор получает доступ к управлению через веб-интерфейс Piqle.
                </p>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3">Что делает турнирный директор:</h4>
                  <ul className="list-disc list-inside space-y-2 text-gray-700">
                    <li>
                      <strong>Назначает буквы игрокам (A/B/C/D)</strong> — для каждого матча выбирает 4 активных игрока и присваивает им буквы
                    </li>
                    <li>
                      <strong>Вводит результаты игр</strong> — после завершения матчей вводит счета через веб-интерфейс
                    </li>
                    <li>
                      <strong>Управляет расписанием</strong> — может корректировать время и место проведения матчей
                    </li>
                    <li>
                      <strong>Проверяет и исправляет данные</strong> — может вручную редактировать информацию о командах и игроках
                    </li>
                    <li>
                      <strong>Экспортирует данные в DUPR</strong> — отправляет результаты в систему DUPR для обновления рейтингов
                    </li>
                  </ul>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-blue-800">
                    <strong>Важно:</strong> Все изменения, внесенные турнирным директором вручную, помечаются как &quot;overridden&quot;. 
                    При следующем обновлении данных через API эти изменения могут быть перезаписаны данными от партнера.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Изменение данных */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-5 h-5" />
                  <CardTitle>7. Изменение данных со стороны партнера</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  Партнер может обновлять данные в любое время, используя те же эндпоинты с теми же внешними идентификаторами.
                </p>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3">Как это работает:</h4>
                  <ul className="list-disc list-inside space-y-2 text-gray-700">
                    <li>
                      <strong>Upsert логика</strong> — все эндпоинты используют операцию &quot;upsert&quot; (update or insert)
                    </li>
                    <li>
                      <strong>Поиск по внешнему ID</strong> — система ищет существующую запись по <code className="bg-gray-100 px-1 py-0.5 rounded">externalId</code>
                    </li>
                    <li>
                      <strong>Обновление или создание</strong> — если запись найдена, она обновляется; если нет — создается новая
                    </li>
                    <li>
                      <strong>Идемпотентность</strong> — можно безопасно повторять запросы с теми же данными
                    </li>
                  </ul>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-semibold text-yellow-900 mb-2">Ограничения на обновление:</h4>
                  <ul className="list-disc list-inside space-y-1 text-yellow-800">
                    <li>Завершенные матчи (status = COMPLETED) не могут быть изменены через API</li>
                    <li>Ростеры можно обновлять до начала матча</li>
                    <li>Буквы (A/B/C/D) назначаются только через веб-интерфейс турнирным директором</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Получение результатов */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Download className="w-5 h-5" />
                  <CardTitle>8. Получение результатов</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  После того как турнирный директор ввел результаты игр, партнер может получать агрегированную статистику через API.
                </p>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3">Доступные эндпоинты:</h4>
                  <div className="space-y-3">
                    <div>
                      <code className="bg-gray-100 px-2 py-1 rounded text-sm">GET /days/{`{externalDayId}`}/results</code>
                      <p className="text-sm text-gray-600 mt-1 ml-4">
                        Получение агрегированных результатов дня: статистика команд (W/L, PF/PA/DIFF), детали матчей
                      </p>
                    </div>
                    <div>
                      <code className="bg-gray-100 px-2 py-1 rounded text-sm">GET /days/{`{externalDayId}`}</code>
                      <p className="text-sm text-gray-600 mt-1 ml-4">
                        Получение статуса дня: количество завершенных матчей, матчи требующие tie-break, матчи без результатов
                      </p>
                    </div>
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 mb-2">Формат результатов:</h4>
                  <ul className="list-disc list-inside space-y-1 text-blue-800">
                    <li><strong>Wins/Losses</strong> — количество побед и поражений команды за день</li>
                    <li><strong>Points For (PF)</strong> — сумма очков, набранных командой</li>
                    <li><strong>Points Against (PA)</strong> — сумма очков, пропущенных командой</li>
                    <li><strong>Point Differential (DIFF)</strong> — разница очков (PF - PA)</li>
                    <li><strong>Matchup Details</strong> — детальная информация по каждому матчу (опционально)</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Итоговая схема */}
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-blue-900">Итоговая схема работы</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-gray-700">
                  <div className="bg-white rounded-lg p-4 border border-blue-200">
                    <h4 className="font-semibold mb-3 text-blue-900">Полный цикл:</h4>
                    <ol className="list-decimal list-inside space-y-2">
                      <li>Партнер создает турнир и наполняет его данными через API</li>
                      <li>Турнирный директор назначает буквы игрокам и вводит результаты через веб-интерфейс</li>
                      <li>Партнер получает результаты через API</li>
                      <li>Партнер может обновлять данные (команды, игроки, расписание) в любое время</li>
                      <li>Цикл повторяется для каждого дня турнира</li>
                    </ol>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Endpoints */}
          <TabsContent value="endpoints" className="space-y-6">
            {/* Authentication */}
            <Card>
              <CardHeader>
                <CardTitle>Authentication</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  All API requests require authentication using Bearer token in the <code className="bg-gray-100 px-2 py-1 rounded">Authorization</code> header.
                </p>
                <div>
                  <h3 className="font-semibold mb-2">Header Format:</h3>
                  <CodeBlock
                    id="auth-header"
                    code={`Authorization: Bearer {keyId}:{secret}`}
                  />
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Example:</h3>
                  <CodeBlock
                    id="auth-example"
                    code={`Authorization: Bearer pk_baa72f0edf3776b57fb5f015dbf76ea9:sk_3633d7f17a962cdd17684dc71153d7f49bac4cb7bf34992477a830637585fec3`}
                  />
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Additional Headers:</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-700">
                    <li><code className="bg-gray-100 px-2 py-1 rounded">Content-Type: application/json</code></li>
                    <li><code className="bg-gray-100 px-2 py-1 rounded">Idempotency-Key: {`{uuid}`}</code> (required for write operations)</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Base URL */}
            <Card>
              <CardHeader>
                <CardTitle>Base URL</CardTitle>
              </CardHeader>
              <CardContent>
                <CodeBlock
                  id="base-url"
                  code={`https://rtest.piqle.io/api/v1/partners/indyleague`}
                />
              </CardContent>
            </Card>

            {/* Endpoints */}
            <div className="space-y-8">
              {/* Tournaments */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-green-600">POST</Badge>
                    <CardTitle className="mb-0">Create/Update Tournament</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-700">
                    Creates a new tournament or updates an existing one. Tournaments are the top-level container for all IndyLeague data.
                    Each tournament must have a unique external ID within your partner account.
                  </p>
                  <div>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">/tournaments/upsert</code>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Request Body:</h3>
                    <CodeBlock
                      id="tournament-request"
                      code={JSON.stringify({
                        externalTournamentId: "tournament-001",
                        name: "Test IndyLeague Tournament",
                        seasonLabel: "Spring 2024",
                        timezone: "America/New_York"
                      }, null, 2)}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Response (200):</h3>
                    <CodeBlock
                      id="tournament-response"
                      code={JSON.stringify({
                        internalTournamentId: "1e1153af-5388-41c9-807b-1909da0186a8",
                        status: "created"
                      }, null, 2)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Divisions */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-green-600">POST</Badge>
                    <CardTitle className="mb-0">Create/Update Divisions</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-700">
                    Creates or updates divisions within a tournament. Divisions group teams together (e.g., &quot;Men&apos;s A&quot;, &quot;Women&apos;s B&quot;).
                    Each division must have a unique external ID within the tournament.
                  </p>
                  <div>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">/divisions/upsert</code>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Request Body:</h3>
                    <CodeBlock
                      id="divisions-request"
                      code={JSON.stringify({
                        externalTournamentId: "tournament-001",
                        divisions: [
                          {
                            externalDivisionId: "div-001",
                            name: "Men's A",
                            orderIndex: 1
                          },
                          {
                            externalDivisionId: "div-002",
                            name: "Women's A",
                            orderIndex: 2
                          }
                        ]
                      }, null, 2)}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Response (200):</h3>
                    <CodeBlock
                      id="divisions-response"
                      code={JSON.stringify({
                        items: [
                          {
                            externalDivisionId: "div-001",
                            status: "created"
                          },
                          {
                            externalDivisionId: "div-002",
                            status: "created"
                          }
                        ]
                      }, null, 2)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Teams */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-green-600">POST</Badge>
                    <CardTitle className="mb-0">Create/Update Teams</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-700">
                    Creates or updates teams within a division. Teams can have up to 8 players for IndyLeague tournaments.
                    Each team must belong to a division and have a unique external ID within the tournament.
                  </p>
                  <div>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">/teams/upsert</code>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Request Body:</h3>
                    <CodeBlock
                      id="teams-request"
                      code={JSON.stringify({
                        externalTournamentId: "tournament-001",
                        teams: [
                          {
                            externalTeamId: "team-001",
                            divisionExternalId: "div-001",
                            name: "Team Alpha",
                            clubName: "Alpha Club",
                            eventType: "men"
                          },
                          {
                            externalTeamId: "team-002",
                            divisionExternalId: "div-001",
                            name: "Team Beta",
                            clubName: "Beta Club",
                            eventType: "men"
                          }
                        ]
                      }, null, 2)}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Response (200):</h3>
                    <CodeBlock
                      id="teams-response"
                      code={JSON.stringify({
                        items: [
                          {
                            externalTeamId: "team-001",
                            status: "created"
                          },
                          {
                            externalTeamId: "team-002",
                            status: "created"
                          }
                        ]
                      }, null, 2)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Players */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-green-600">POST</Badge>
                    <CardTitle className="mb-0">Create/Update Players</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-700">
                    Creates or updates players within a tournament. If <code className="bg-gray-100 px-2 py-1 rounded">externalTeamId</code> is provided,
                    the player will be automatically added to that team (up to 8 players per team for IndyLeague).
                    Players must be part of a team before they can be added to a roster.
                  </p>
                  <div>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">/players/upsert</code>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Request Body:</h3>
                    <CodeBlock
                      id="players-request"
                      code={JSON.stringify({
                        externalTournamentId: "tournament-001",
                        players: [
                          {
                            externalPlayerId: "player-001",
                            firstName: "John",
                            lastName: "Doe",
                            email: "john.doe@example.com",
                            gender: "M",
                            duprId: "12345",
                            phone: "+1234567890",
                            externalTeamId: "team-001"
                          },
                          {
                            externalPlayerId: "player-002",
                            firstName: "Jane",
                            lastName: "Smith",
                            email: "jane.smith@example.com",
                            gender: "F",
                            externalTeamId: "team-001"
                          }
                        ]
                      }, null, 2)}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Response (200):</h3>
                    <CodeBlock
                      id="players-response"
                      code={JSON.stringify({
                        items: [
                          {
                            externalPlayerId: "player-001",
                            status: "created"
                          },
                          {
                            externalPlayerId: "player-002",
                            status: "created"
                          }
                        ]
                      }, null, 2)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Match Days */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-green-600">POST</Badge>
                    <CardTitle className="mb-0">Create/Update Match Days</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-700">
                    Creates or updates match days within a tournament. Each match day represents a single day of play.
                    Dates must be unique within a tournament. Matchups are scheduled for specific match days.
                  </p>
                  <div>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">/days/upsert</code>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Request Body:</h3>
                    <CodeBlock
                      id="days-request"
                      code={JSON.stringify({
                        externalTournamentId: "tournament-001",
                        days: [
                          {
                            externalDayId: "day-001",
                            date: "2024-03-15",
                            statusHint: "scheduled"
                          },
                          {
                            externalDayId: "day-002",
                            date: "2024-03-22",
                            statusHint: "scheduled"
                          }
                        ]
                      }, null, 2)}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Response (200):</h3>
                    <CodeBlock
                      id="days-response"
                      code={JSON.stringify({
                        items: [
                          {
                            externalDayId: "day-001",
                            status: "created"
                          },
                          {
                            externalDayId: "day-002",
                            status: "created"
                          }
                        ]
                      }, null, 2)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Matchups */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-green-600">POST</Badge>
                    <CardTitle className="mb-0">Create/Update Matchups</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-700">
                    Creates or updates matchups (matches) for a specific match day. Each matchup represents a game between two teams.
                    Matchups cannot be updated once they are completed. Each matchup must belong to a division and a match day.
                  </p>
                  <div>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">/matchups/upsert</code>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Request Body:</h3>
                    <CodeBlock
                      id="matchups-request"
                      code={JSON.stringify({
                        externalTournamentId: "tournament-001",
                        externalDayId: "day-001",
                        matchups: [
                          {
                            externalMatchupId: "matchup-001",
                            divisionExternalId: "div-001",
                            homeTeamExternalId: "team-001",
                            awayTeamExternalId: "team-002",
                            site: "Court 1",
                            courtGroup: "A",
                            startTime: "2024-03-15T10:00:00Z"
                          }
                        ]
                      }, null, 2)}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Response (200):</h3>
                    <CodeBlock
                      id="matchups-response"
                      code={JSON.stringify({
                        items: [
                          {
                            externalMatchupId: "matchup-001",
                            status: "created"
                          }
                        ]
                      }, null, 2)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Rosters */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-green-600">POST</Badge>
                    <CardTitle className="mb-0">Create/Update Day Rosters</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-700">
                    Creates or updates day rosters for teams in matchups. Rosters define which players from a team are available for a specific matchup.
                    All players in the roster must be part of the team (TeamPlayer). Exactly 4 players must be marked as active for IndyLeague.
                    Letters (A/B/C/D) are assigned later in the UI. Rosters are matchup-specific.
                  </p>
                  <div>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">/rosters/upsert</code>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Request Body:</h3>
                    <CodeBlock
                      id="rosters-request"
                      code={JSON.stringify({
                        externalTournamentId: "tournament-001",
                        externalDayId: "day-001",
                        rosters: [
                          {
                            teamExternalId: "team-001",
                            players: [
                              {
                                externalPlayerId: "player-001"
                              },
                              {
                                externalPlayerId: "player-002"
                              },
                              {
                                externalPlayerId: "player-003"
                              },
                              {
                                externalPlayerId: "player-004"
                              }
                            ],
                            activePlayerExternalIds: ["player-001", "player-002", "player-003", "player-004"]
                          }
                        ]
                      }, null, 2)}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Response (200):</h3>
                    <CodeBlock
                      id="rosters-response"
                      code={JSON.stringify({
                        items: [
                          {
                            teamExternalId: "team-001",
                            status: "created"
                          }
                        ]
                      }, null, 2)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Get Day Results */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-blue-600">GET</Badge>
                    <CardTitle className="mb-0">Get Day Results</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-700">
                    Retrieves aggregated results for a match day, including team statistics (wins, losses, points for/against, point differential)
                    and optional matchup details. Results are aggregated at the team level. If <code className="bg-gray-100 px-2 py-1 rounded">divisionExternalId</code> is provided,
                    only results for that division are returned.
                  </p>
                  <div>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">/days/{`{externalDayId}`}/results?divisionExternalId={`{optional}`}</code>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Example Request:</h3>
                    <CodeBlock
                      id="results-request"
                      code={`GET /api/v1/partners/indyleague/days/day-001/results?divisionExternalId=div-001`}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Response (200):</h3>
                    <CodeBlock
                      id="results-response"
                      code={JSON.stringify({
                        externalDayId: "day-001",
                        externalTournamentId: "tournament-001",
                        date: "2024-03-15",
                        divisionResults: [
                          {
                            externalDivisionId: "div-001",
                            teams: [
                              {
                                externalTeamId: "team-001",
                                wins: 2,
                                losses: 1,
                                pointsFor: 45,
                                pointsAgainst: 38,
                                pointDiff: 7
                              }
                            ],
                            matchups: [
                              {
                                externalMatchupId: "matchup-001",
                                homeTeamExternalId: "team-001",
                                awayTeamExternalId: "team-002",
                                homeScore: 15,
                                awayScore: 12,
                                status: "COMPLETED"
                              }
                            ]
                          }
                        ]
                      }, null, 2)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Get Day Status */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-blue-600">GET</Badge>
                    <CardTitle className="mb-0">Get Day Status</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-700">
                    Retrieves the status and readiness of a match day, including total matchups, completed matchups,
                    matchups requiring tie-breaks, and matchups with missing scores. Use this to check if a day is ready
                    for results retrieval or if there are outstanding issues.
                  </p>
                  <div>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">/days/{`{externalDayId}`}</code>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Example Request:</h3>
                    <CodeBlock
                      id="day-status-request"
                      code={`GET /api/v1/partners/indyleague/days/day-001`}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Response (200):</h3>
                    <CodeBlock
                      id="day-status-response"
                      code={JSON.stringify({
                        externalDayId: "day-001",
                        date: "2024-03-15",
                        status: "IN_PROGRESS",
                        totalMatchups: 10,
                        completedMatchups: 7,
                        matchupsRequiringTieBreak: 1,
                        matchupsWithMissingScores: 2,
                        isReady: false
                      }, null, 2)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Подписка на вебхуки */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-green-600">POST</Badge>
                    <CardTitle className="mb-0">Подписка на вебхуки</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-700">
                    Регистрация URL для вебхуков расписания и результатов. При изменениях Piqle отправляет POST
                    на URL партнера с подписанным payload. Секрет возвращается только при первом создании.
                  </p>
                  <div>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">/partners/webhooks</code>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">События:</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li><code className="bg-gray-100 px-1 py-0.5 rounded">schedule.updated</code></li>
                      <li><code className="bg-gray-100 px-1 py-0.5 rounded">results.updated</code></li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Пример запроса:</h3>
                    <CodeBlock
                      id="webhooks-request"
                      code={JSON.stringify({
                        scheduleUpdatedUrl: "https://partner.example.com/webhooks/schedule",
                        resultsUpdatedUrl: "https://partner.example.com/webhooks/results"
                      }, null, 2)}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Ответ (200):</h3>
                    <CodeBlock
                      id="webhooks-response"
                      code={JSON.stringify({
                        webhooks: [
                          {
                            event: "schedule.updated",
                            url: "https://partner.example.com/webhooks/schedule",
                            isActive: true,
                            secret: "returned-only-on-create"
                          },
                          {
                            event: "results.updated",
                            url: "https://partner.example.com/webhooks/results",
                            isActive: true,
                            secret: "returned-only-on-create"
                          }
                        ]
                      }, null, 2)}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Заголовки доставки:</h3>
                    <CodeBlock
                      id="webhooks-headers"
                      code={`X-Piqle-Event: schedule.updated | results.updated
X-Piqle-Timestamp: 2026-02-17T10:25:00Z
X-Piqle-Signature: sha256=...`}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Payload доставки:</h3>
                    <CodeBlock
                      id="webhooks-payload"
                      code={JSON.stringify({
                        event: "schedule.updated",
                        partnerId: "partner_123",
                        tournamentExternalId: "tournament-001",
                        changedAt: "2026-02-17T10:25:00Z",
                        details: {
                          matchDayExternalId: "day-001",
                          matchupExternalId: "matchup-001"
                        }
                      }, null, 2)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Cleanup Tournament */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-red-600">DELETE</Badge>
                    <CardTitle className="mb-0">Cleanup Tournament (Testing Only)</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-700">
                    <strong className="text-red-600">⚠️ Testing Only:</strong> Deletes a tournament and all related data (divisions, teams, players, match days, matchups, rosters, games).
                    This endpoint is intended for testing purposes to clean up test data. Use with caution!
                  </p>
                  <div>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">/tournaments/{`{externalTournamentId}`}/cleanup</code>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Example Request:</h3>
                    <CodeBlock
                      id="cleanup-request"
                      code={`DELETE /api/v1/partners/indyleague/tournaments/tournament-001/cleanup`}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Response (200):</h3>
                    <CodeBlock
                      id="cleanup-response"
                      code={JSON.stringify({
                        success: true,
                        message: "Tournament tournament-001 and all related data have been deleted",
                        deleted: {
                          tournament: 1,
                          divisions: 2,
                          teams: 8,
                          players: 32,
                          matchDays: 1,
                          matchups: 4,
                          externalMappings: "all related"
                        }
                      }, null, 2)}
                    />
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-yellow-800 text-sm">
                      <strong>Note:</strong> This operation cannot be undone. All external ID mappings for the tournament and related entities will be deleted.
                      Idempotency key is not required for this endpoint.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Error Responses */}
            <Card className="mt-8">
              <CardHeader>
                <CardTitle>Error Responses</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Error Format:</h3>
                  <CodeBlock
                    id="error-format"
                    code={JSON.stringify({
                      errorCode: "VALIDATION_ERROR",
                      message: "Invalid request data",
                      details: [
                        "externalTournamentId is required",
                        "name must be a string"
                      ]
                    }, null, 2)}
                  />
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Common Error Codes:</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-700">
                    <li><code className="bg-gray-100 px-2 py-1 rounded">INVALID_API_KEY</code> - Invalid or missing API key</li>
                    <li><code className="bg-gray-100 px-2 py-1 rounded">VALIDATION_ERROR</code> - Request validation failed</li>
                    <li><code className="bg-gray-100 px-2 py-1 rounded">TOURNAMENT_NOT_FOUND</code> - Tournament with external ID not found</li>
                    <li><code className="bg-gray-100 px-2 py-1 rounded">MATCH_DAY_NOT_FOUND</code> - Match day with external ID not found</li>
                    <li><code className="bg-gray-100 px-2 py-1 rounded">RATE_LIMIT_EXCEEDED</code> - Too many requests</li>
                    <li><code className="bg-gray-100 px-2 py-1 rounded">INTERNAL_ERROR</code> - Server error</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Idempotency */}
            <Card className="mt-8">
              <CardHeader>
                <CardTitle>Idempotency</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  All write operations (POST) are idempotent. Include a unique <code className="bg-gray-100 px-2 py-1 rounded">Idempotency-Key</code> header in your request.
                  If the same request is sent multiple times with the same key, only the first request will be processed.
                </p>
                <div>
                  <h3 className="font-semibold mb-2">Example:</h3>
                  <CodeBlock
                    id="idempotency-example"
                    code={`Idempotency-Key: df96b38b-0696-46e8-82fc-026e039548ba`}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
