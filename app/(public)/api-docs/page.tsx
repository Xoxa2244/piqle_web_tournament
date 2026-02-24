'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Copy, Check, Mail, Key, Users, Trophy, FileText, RefreshCw, Download } from 'lucide-react'

export default function PublicApiDocsPage() {
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
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Piqle Partner API Documentation</h1>
          <p className="text-gray-600">Complete guide for IndyLeague partner integrations</p>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="endpoints" className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              API Endpoints
            </TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="space-y-6">
            {/* Tournament Director Registration */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  <CardTitle>1. Tournament Director Registration</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  Before starting work with the API, a tournament director must be registered in the Piqle system.
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 mb-2">Registration Steps:</h4>
                  <ol className="list-decimal list-inside space-y-2 text-blue-800">
                    <li>Tournament director creates an account on the Piqle platform</li>
                    <li>Logs into the system</li>
                    <li>Gains access to the tournament management panel</li>
                  </ol>
                </div>
              </CardContent>
            </Card>

            {/* Request Partner Keys */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  <CardTitle>2. Request Partner API Keys</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  After registering the tournament director, send a request to obtain partner API access keys.
                </p>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-semibold text-yellow-900 mb-2">Send request to: <code className="bg-yellow-100 px-2 py-1 rounded">rg@piqle.io</code></h4>
                  <div className="text-yellow-800 space-y-2">
                    <p className="font-medium">Include in your request:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>Organization/partner name</li>
                      <li>Tournament director email (already registered in Piqle)</li>
                      <li>Brief description of integration (purpose of API usage)</li>
                      <li>Expected data volume (number of tournaments, teams, players)</li>
                      <li>Desired environment: <code className="bg-yellow-100 px-1 py-0.5 rounded">SANDBOX</code> or <code className="bg-yellow-100 px-1 py-0.5 rounded">PRODUCTION</code></li>
                    </ul>
                  </div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Example Request:</h4>
                  <div className="text-sm text-gray-700 space-y-1">
                    <p><strong>Subject:</strong> Request for Partner API Access Keys</p>
                    <p><strong>Body:</strong></p>
                    <pre className="bg-white p-3 rounded border text-xs overflow-x-auto">
{`Hello!

We request access to the Partner API for our organization.

Organization: [Name]
Tournament Director Email: director@example.com
Description: Integration for automating IndyLeague tournament management
Expected Volume: ~10 tournaments per month, up to 50 teams per tournament
Environment: SANDBOX (to start)

Best regards,
[Your name]`}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Receive Partner Keys */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5" />
                  <CardTitle>3. Receive Partner API Keys</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  After processing your request, a Piqle administrator will create a partner account and link it to the tournament director.
                </p>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-semibold text-green-900 mb-2">What you will receive:</h4>
                  <ul className="list-disc list-inside space-y-2 text-green-800">
                    <li>
                      <strong>Partner Code</strong> — unique partner identifier (e.g., <code className="bg-green-100 px-1 py-0.5 rounded">indyleague-partner-001</code>)
                    </li>
                    <li>
                      <strong>API Key ID</strong> — public key identifier (starts with <code className="bg-green-100 px-1 py-0.5 rounded">pk_</code>)
                    </li>
                    <li>
                      <strong>API Secret</strong> — secret key (starts with <code className="bg-green-100 px-1 py-0.5 rounded">sk_</code>)
                      <span className="text-red-600 font-semibold"> ⚠️ Keep secret!</span>
                    </li>
                    <li>
                      <strong>Base URL</strong> — API address (e.g., <code className="bg-green-100 px-1 py-0.5 rounded">https://dev.piqle.io/api/v1/partners/indyleague</code>)
                    </li>
                  </ul>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 mb-2">Tournament Director and Partner Linking Logic:</h4>
                  <ul className="list-disc list-inside space-y-2 text-blue-800">
                    <li>Each partner has an assigned <strong>Tournament Director</strong></li>
                    <li>All tournaments created via API on behalf of the partner are automatically linked to this director</li>
                    <li>The tournament director receives full access to manage tournaments through the Piqle web interface</li>
                    <li>The director can manually edit data, but such changes are marked as &quot;overridden&quot; (manually overridden)</li>
                    <li>On the next API data update, manually entered changes may be overwritten</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Create Tournament */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5" />
                  <CardTitle>4. Create Tournament from Partner Side</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  The partner creates a tournament via API using their external identifiers. The system automatically creates the tournament and links it to the assigned tournament director.
                </p>
                <div className="space-y-3">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">Process:</h4>
                    <ol className="list-decimal list-inside space-y-2 text-gray-700">
                      <li>Partner sends POST request to <code className="bg-gray-100 px-2 py-1 rounded">/tournaments/upsert</code></li>
                      <li>Specifies their <code className="bg-gray-100 px-2 py-1 rounded">externalTournamentId</code> (e.g., <code className="bg-gray-100 px-2 py-1 rounded">spring-2024-league</code>)</li>
                      <li>System creates tournament and returns internal identifier</li>
                      <li>Mapping is created between external and internal ID for subsequent requests</li>
                    </ol>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-blue-800">
                      <strong>Important:</strong> All subsequent requests must use the same <code className="bg-blue-100 px-1 py-0.5 rounded">externalTournamentId</code> 
                      that was specified when creating the tournament.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Populate Tournament */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  <CardTitle>5. Populate Tournament from Partner Side</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  After creating the tournament, the partner populates it with data in a specific order.
                </p>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3">Recommended data creation order:</h4>
                  <ol className="list-decimal list-inside space-y-3 text-gray-700">
                    <li>
                      <strong>Divisions</strong> — create team groups (e.g., &quot;Men&apos;s A&quot;, &quot;Women&apos;s B&quot;)
                      <div className="ml-6 mt-1 text-sm text-gray-600">
                        <code className="bg-gray-100 px-2 py-1 rounded">POST /divisions/upsert</code>
                      </div>
                    </li>
                    <li>
                      <strong>Teams</strong> — create teams in divisions (up to 32 players per team for IndyLeague (no fixed roster limit))
                      <div className="ml-6 mt-1 text-sm text-gray-600">
                        <code className="bg-gray-100 px-2 py-1 rounded">POST /teams/upsert</code>
                      </div>
                    </li>
                    <li>
                      <strong>Players</strong> — create players with team specification (optional)
                      <div className="ml-6 mt-1 text-sm text-gray-600">
                        <code className="bg-gray-100 px-2 py-1 rounded">POST /players/upsert</code>
                        <span className="ml-2 text-xs">If <code className="bg-gray-100 px-1 py-0.5 rounded">externalTeamId</code> is specified, player is automatically added to team</span>
                      </div>
                    </li>
                    <li>
                      <strong>Match Days</strong> — create game days
                      <div className="ml-6 mt-1 text-sm text-gray-600">
                        <code className="bg-gray-100 px-2 py-1 rounded">POST /days/upsert</code>
                      </div>
                    </li>
                    <li>
                      <strong>Matchups</strong> — create team pairs for games
                      <div className="ml-6 mt-1 text-sm text-gray-600">
                        <code className="bg-gray-100 px-2 py-1 rounded">POST /matchups/upsert</code>
                      </div>
                    </li>
                    <li>
                      <strong>Rosters</strong> — assign players to specific match (4 active players)
                      <div className="ml-6 mt-1 text-sm text-gray-600">
                        <code className="bg-gray-100 px-2 py-1 rounded">POST /rosters/upsert</code>
                        <span className="ml-2 text-xs">All players must be part of the team (TeamPlayer)</span>
                      </div>
                    </li>
                  </ol>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-yellow-800">
                    <strong>Note:</strong> All operations are idempotent — you can safely repeat requests with the same data.
                    Use the <code className="bg-yellow-100 px-1 py-0.5 rounded">Idempotency-Key</code> header for guarantee.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Tournament Director Work */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  <CardTitle>6. Tournament Director Work on Their Side</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  After the partner creates the tournament and populates it with basic data, the tournament director gains access to management through the Piqle web interface.
                </p>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3">What the tournament director does:</h4>
                  <ul className="list-disc list-inside space-y-2 text-gray-700">
                    <li>
                      <strong>Assigns letters to players (A/B/C/D)</strong> — for each match selects 4 active players and assigns them letters
                    </li>
                    <li>
                      <strong>Enters game results</strong> — after matches complete, enters scores through the web interface
                    </li>
                    <li>
                      <strong>Manages schedule</strong> — can adjust match times and locations
                    </li>
                    <li>
                      <strong>Reviews and corrects data</strong> — can manually edit team and player information
                    </li>
                    <li>
                      <strong>Exports data to DUPR</strong> — sends results to DUPR system for rating updates
                    </li>
                  </ul>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-blue-800">
                    <strong>Important:</strong> All changes made manually by the tournament director are marked as &quot;overridden&quot;. 
                    On the next API data update, these changes may be overwritten by partner data.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Update Data */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-5 h-5" />
                  <CardTitle>7. Update Data from Partner Side</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  The partner can update data at any time using the same endpoints with the same external identifiers.
                </p>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3">How it works:</h4>
                  <ul className="list-disc list-inside space-y-2 text-gray-700">
                    <li>
                      <strong>Upsert logic</strong> — all endpoints use &quot;upsert&quot; operation (update or insert)
                    </li>
                    <li>
                      <strong>Search by external ID</strong> — system searches for existing record by <code className="bg-gray-100 px-1 py-0.5 rounded">externalId</code>
                    </li>
                    <li>
                      <strong>Update or create</strong> — if record found, it&apos;s updated; if not — new one is created
                    </li>
                    <li>
                      <strong>Idempotency</strong> — you can safely repeat requests with the same data
                    </li>
                  </ul>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-semibold text-yellow-900 mb-2">Update restrictions:</h4>
                  <ul className="list-disc list-inside space-y-1 text-yellow-800">
                    <li>Completed matches (status = COMPLETED) cannot be changed via API</li>
                    <li>Rosters can be updated until match starts</li>
                    <li>Letters (A/B/C/D) are assigned only through web interface by tournament director</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Get Results */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Download className="w-5 h-5" />
                  <CardTitle>8. Get Results</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  After the tournament director enters game results, the partner can retrieve aggregated statistics via API.
                </p>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3">Available endpoints:</h4>
                  <div className="space-y-3">
                    <div>
                      <code className="bg-gray-100 px-2 py-1 rounded text-sm">GET /days/{`{externalDayId}`}/results</code>
                      <p className="text-sm text-gray-600 mt-1 ml-4">
                        Get aggregated day results: team statistics (W/L, PF/PA/DIFF), match details
                      </p>
                    </div>
                    <div>
                      <code className="bg-gray-100 px-2 py-1 rounded text-sm">GET /days/{`{externalDayId}`}</code>
                      <p className="text-sm text-gray-600 mt-1 ml-4">
                        Get day status: number of completed matches, matches requiring tie-break, matches without results
                      </p>
                    </div>
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 mb-2">Result format:</h4>
                  <ul className="list-disc list-inside space-y-1 text-blue-800">
                    <li><strong>Wins/Losses</strong> — number of wins and losses for team per day</li>
                    <li><strong>Points For (PF)</strong> — total points scored by team</li>
                    <li><strong>Points Against (PA)</strong> — total points conceded by team</li>
                    <li><strong>Point Differential (DIFF)</strong> — point difference (PF - PA)</li>
                    <li><strong>Matchup Details</strong> — detailed information for each match (optional)</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Final Workflow */}
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-blue-900">Complete Workflow</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-gray-700">
                  <div className="bg-white rounded-lg p-4 border border-blue-200">
                    <h4 className="font-semibold mb-3 text-blue-900">Full Cycle:</h4>
                    <ol className="list-decimal list-inside space-y-2">
                      <li>Partner creates tournament and populates it with data via API</li>
                      <li>Tournament director assigns letters to players and enters results via web interface</li>
                      <li>Partner retrieves results via API</li>
                      <li>Partner can update data (teams, players, schedule) at any time</li>
                      <li>Cycle repeats for each tournament day</li>
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
                  code={`https://dev.piqle.io/api/v1/partners/indyleague`}
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
                    Creates or updates teams within a division. Teams can have up to 32 players for IndyLeague tournaments (no fixed roster limit).
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
                    the player will be automatically added to that team (up to 32 players per team for IndyLeague (no fixed roster limit)).
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

              {/* Tournament Schedule */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-blue-600">GET</Badge>
                    <CardTitle className="mb-0">Get Tournament Schedule</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-700">
                    Returns the full tournament schedule for IndyLeague: match days, matchups, divisions, teams, and courts.
                    Court can be <code className="bg-gray-100 px-1 py-0.5 rounded">null</code> when not assigned.
                    If a day was created in the UI, <code className="bg-gray-100 px-1 py-0.5 rounded">externalDayId</code>
                    is auto-generated and persisted.
                  </p>
                  <div>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">/tournaments/{`{externalTournamentId}`}/schedule</code>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Example Request:</h3>
                    <CodeBlock
                      id="schedule-request"
                      code={`GET /api/v1/partners/indyleague/tournaments/tournament-001/schedule`}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Response (200):</h3>
                    <CodeBlock
                      id="schedule-response"
                      code={JSON.stringify({
                        externalTournamentId: "tournament-001",
                        tournamentName: "IndyLeague - Spring 2024",
                        generatedAt: "2024-03-15T12:34:56.000Z",
                        days: [
                          {
                            externalDayId: "day-001",
                            date: "2024-03-15",
                            status: "IN_PROGRESS",
                            matchups: [
                              {
                                externalMatchupId: "matchup-001",
                                division: {
                                  id: "division-uuid",
                                  externalId: "division-001",
                                  name: "Main Division"
                                },
                                homeTeam: {
                                  id: "team-home-uuid",
                                  externalId: "team-001",
                                  name: "Team Alpha"
                                },
                                awayTeam: {
                                  id: "team-away-uuid",
                                  externalId: "team-002",
                                  name: "Team Beta"
                                },
                                court: {
                                  id: "court-uuid",
                                  name: "Court #1"
                                },
                                status: "IN_PROGRESS"
                              }
                            ]
                          }
                        ]
                      }, null, 2)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Webhooks Subscription */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-green-600">POST</Badge>
                    <CardTitle className="mb-0">Webhooks Subscription</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-700">
                    Register webhook URLs for schedule and results updates. When a change happens, Piqle sends a POST
                    request to your webhook URL with a signed payload. The secret is returned only on first creation.
                  </p>
                  <div>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">/partners/webhooks</code>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Events:</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li><code className="bg-gray-100 px-1 py-0.5 rounded">schedule.updated</code></li>
                      <li><code className="bg-gray-100 px-1 py-0.5 rounded">results.updated</code></li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Example Request:</h3>
                    <CodeBlock
                      id="webhooks-request"
                      code={JSON.stringify({
                        scheduleUpdatedUrl: "https://partner.example.com/webhooks/schedule",
                        resultsUpdatedUrl: "https://partner.example.com/webhooks/results"
                      }, null, 2)}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Response (200):</h3>
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
                    <h3 className="font-semibold mb-2">Delivery Headers:</h3>
                    <CodeBlock
                      id="webhooks-headers"
                      code={`X-Piqle-Event: schedule.updated | results.updated
X-Piqle-Timestamp: 2026-02-17T10:25:00Z
X-Piqle-Signature: sha256=...`}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Delivery Payload:</h3>
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

