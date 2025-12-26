'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Copy, Check } from 'lucide-react'

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
          <p className="text-gray-600">Complete API reference for IndyLeague partner integrations</p>
        </div>

        {/* Authentication */}
        <Card className="mb-8">
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
        <Card className="mb-8">
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
                Creates or updates divisions within a tournament. Divisions group teams together (e.g., "Men's A", "Women's B").
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
      </div>
    </div>
  )
}

