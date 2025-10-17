'use client'

import { trpc } from '@/lib/trpc'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, MapPin, Users, Trophy } from 'lucide-react'

export default function PublicTournamentsPage() {
  const { data: tournaments, isLoading } = trpc.tournament.list.useQuery()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading tournaments...</p>
        </div>
      </div>
    )
  }

  // Filter tournaments that have public board enabled
  const publicTournaments = tournaments?.filter(tournament => tournament.isPublicBoardEnabled) || []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-gray-900">Tournaments</h1>
            <p className="text-gray-600 mt-2">Select a tournament to view results</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {publicTournaments.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {publicTournaments.map((tournament) => (
              <Card key={tournament.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="text-xl">{tournament.title}</CardTitle>
                  {tournament.description && (
                    <div className="mt-2 h-16 overflow-y-auto">
                      <p className="text-gray-600 text-sm whitespace-pre-wrap break-words">{tournament.description}</p>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Tournament Info */}
                  <div className="space-y-2">
                    <div className="flex items-center text-sm text-gray-600">
                      <Calendar className="h-4 w-4 mr-2" />
                      <span>
                        {new Date(tournament.startDate).toLocaleDateString()} - {new Date(tournament.endDate).toLocaleDateString()}
                      </span>
                    </div>
                    
                    {tournament.venueName && (
                      <div className="flex items-center text-sm text-gray-600">
                        <MapPin className="h-4 w-4 mr-2" />
                        <span>{tournament.venueName}</span>
                      </div>
                    )}
                    
                    <div className="flex items-center text-sm text-gray-600">
                      <Users className="h-4 w-4 mr-2" />
                      <span>{tournament.divisions.length} division{tournament.divisions.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  {/* Divisions */}
                  {tournament.divisions.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Divisions:</h4>
                      <div className="flex flex-wrap gap-1">
                        {tournament.divisions.map((division) => (
                          <Badge key={division.id} variant="secondary" className="text-xs">
                            {division.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Entry Fee */}
                  {tournament.entryFee && parseFloat(tournament.entryFee) > 0 && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Trophy className="h-4 w-4 mr-2" />
                      <span>Entry Fee: ${tournament.entryFee}</span>
                    </div>
                  )}

                  {/* View Results Button */}
                  <div className="pt-4 border-t border-gray-200">
                    <Link href={`/course/${tournament.id}`}>
                      <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                        View Results
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Trophy className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Public Tournaments Available</h3>
            <p className="text-gray-600">
              There are currently no tournaments with public results enabled.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
