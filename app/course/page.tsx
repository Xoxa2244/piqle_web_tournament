'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, MapPin, Users, Trophy, Eye } from 'lucide-react'

export default function PublicTournamentsPage() {
  const [selectedDescription, setSelectedDescription] = useState<{title: string, description: string} | null>(null)
  const { data: tournaments, isLoading } = trpc.tournament.list.useQuery()

  const truncateText = (text: string | null, maxLines: number = 3) => {
    if (!text) return ''
    const lines = text.split('\n')
    if (lines.length <= maxLines) return text
    return lines.slice(0, maxLines).join('\n')
  }

  const formatText = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
      .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
      .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm">$1</code>') // Code
      .replace(/\n/g, '<br>') // Line breaks
  }

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
                    <div className="mt-2">
                      <div className="text-gray-600 text-sm whitespace-pre-wrap break-words">
                        {truncateText(tournament.description)}
                      </div>
                      {tournament.description && tournament.description.split('\n').length > 3 && (
                        <button
                          onClick={() => setSelectedDescription({title: tournament.title, description: tournament.description!})}
                          className="mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Show full description
                        </button>
                      )}
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

      {/* Description Modal */}
      {selectedDescription && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">{selectedDescription.title}</h2>
              <p className="text-gray-600 mt-1">Tournament Description</p>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div 
                className="text-gray-700 whitespace-pre-wrap break-words prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: formatText(selectedDescription.description) }}
              />
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end">
              <Button
                onClick={() => setSelectedDescription(null)}
                variant="outline"
                className="px-6"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
