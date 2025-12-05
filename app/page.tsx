'use client'

import Link from 'next/link'
import PublicHeader from '@/components/PublicHeader'

type FilterType = 'upcoming' | 'in_progress' | 'past' | 'all'

export default function HomePage() {

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Piqle Tournament Management
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Tournament management and scoreboard system
          </p>
        </div>

        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold mb-4">Quick Links</h2>
              <div className="space-y-3">
                <Link
                  href="/admin"
                  className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-center"
                >
                  Tournament Director Console
                </Link>
                <Link
                  href="/auth/signin"
                  className="block w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-center"
                >
                  Sign In / Register
                </Link>
                <Link
                  href="/scoreboard"
                  className="block w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-center"
                >
                  Public Scoreboard
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Tournaments List */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {filteredTournaments.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 md:items-stretch">
              {filteredTournaments.map((tournament) => {
                const status = getTournamentStatus(new Date(tournament.startDate), new Date(tournament.endDate))
                return (
                <Card key={tournament.id} className="group hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border-0 shadow-lg bg-white overflow-hidden flex flex-col">
                  {/* Status Banner */}
                  <div className={`h-2 ${
                    status === 'upcoming' ? 'bg-gradient-to-r from-green-500 to-green-600' :
                    status === 'in_progress' ? 'bg-gradient-to-r from-blue-500 to-blue-600' :
                    'bg-gradient-to-r from-gray-400 to-gray-500'
                  }`} />
                  
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <CardTitle className="text-2xl font-bold flex-1 text-gray-900 leading-tight">{tournament.title}</CardTitle>
                      <Badge 
                        className={`px-3 py-1 text-xs font-bold ${
                          status === 'upcoming' ? 'bg-green-100 text-green-700 border-green-200' :
                          status === 'in_progress' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                          'bg-gray-100 text-gray-700 border-gray-200'
                        } border`}
                      >
                        {status === 'upcoming' ? '🟢 OPEN' : status === 'in_progress' ? '🔵 LIVE' : '⚫ ENDED'}
                      </Badge>
                    </div>
                    {tournament.description && (
                      <div className="mt-2">
                        <div
                          className="text-gray-600 text-sm break-words line-clamp-3"
                          dangerouslySetInnerHTML={{ __html: formatDescription(truncateText(tournament.description)) }}
                        />
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
                  <CardContent className="space-y-5 flex-grow flex flex-col">
                    <div className="space-y-5 flex-grow">
                      {/* Entry Fee - Prominent */}
                      {tournament.entryFee && parseFloat(tournament.entryFee) > 0 && (
                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center text-green-700">
                              <DollarSign className="h-5 w-5 mr-2" />
                              <span className="text-sm font-medium">Entry Fee</span>
                            </div>
                            <span className="text-2xl font-bold text-green-700">${tournament.entryFee}</span>
                          </div>
                        </div>
                      )}

                      {/* Tournament Info */}
                      <div className="space-y-3">
                      <div className="flex items-center text-sm text-gray-700">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mr-3">
                          <Calendar className="h-4 w-4 text-blue-600" />
                        </div>
                        <span className="font-medium">
                          {new Date(tournament.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(tournament.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      
                      {tournament.venueName && (
                        <div className="flex items-center text-sm text-gray-700">
                          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center mr-3">
                            <MapPin className="h-4 w-4 text-purple-600" />
                          </div>
                          <span className="font-medium truncate">{tournament.venueName}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center text-sm text-gray-700">
                        <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center mr-3">
                          <Users className="h-4 w-4 text-orange-600" />
                        </div>
                        <span className="font-medium">{tournament.divisions.length} division{tournament.divisions.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>

                      {/* Divisions */}
                      {tournament.divisions.length > 0 && (
                        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Divisions</h4>
                          <div className="flex flex-wrap gap-2">
                            {(tournament.divisions as any[]).map((division: any) => (
                              <span 
                                key={division.id} 
                                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 shadow-sm"
                              >
                                {division.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-4 border-t-2 border-gray-100 mt-auto">
                      {status === 'upcoming' ? (
                        // Upcoming tournaments - show registration button
                        !session ? (
                          <Button 
                            className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-6 text-base shadow-lg hover:shadow-xl transition-all duration-200"
                            onClick={() => {
                              window.location.href = `/auth/signin?callbackUrl=/register/${tournament.id}`
                            }}
                          >
                            Sign In to Register
                          </Button>
                        ) : (
                          <Link href={`/register/${tournament.id}`}>
                            <Button className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-6 text-base shadow-lg hover:shadow-xl transition-all duration-200">
                              Register & Join
                            </Button>
                          </Link>
                        )
                      ) : (
                        // In progress or past - show results only
                        <Link href={`/scoreboard/${tournament.id}`}>
                          <Button className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-6 text-base shadow-lg hover:shadow-xl transition-all duration-200">
                            View Results
                          </Button>
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )})}
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="bg-white rounded-2xl shadow-lg p-12 max-w-md mx-auto">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mx-auto mb-6">
                  <Trophy className="h-10 w-10 text-gray-400" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-3">No Tournaments Available</h3>
                <p className="text-gray-600 text-base leading-relaxed">
                  {filter === 'upcoming' 
                    ? 'No upcoming tournaments available for registration. Check back soon!'
                    : filter === 'in_progress'
                    ? 'No tournaments currently in progress.'
                    : filter === 'past'
                    ? 'No past tournaments found.'
                    : 'No tournaments available at this time.'}
                </p>
              </div>
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
                  dangerouslySetInnerHTML={{ __html: formatDescription(selectedDescription.description) }}
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
    </>
  )
}
