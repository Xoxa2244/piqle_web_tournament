'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useParams, usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { 
  Settings,
  Users,
  FileText,
  BarChart3,
  Shield,
  Upload,
  Globe,
  Edit,
  ArrowLeft,
  Calendar,
  Target,
  AlertTriangle,
  Info
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import ShareButton from '@/components/ShareButton'
import ComplaintModal from '@/components/ComplaintModal'

interface TournamentNavBarProps {
  tournamentTitle?: string
  tournamentImage?: string | null
  isAdmin?: boolean
  isOwner?: boolean
  pendingRequestsCount?: number
  onPublicScoreboardClick?: () => void
  onEditTournamentClick?: () => void
  publicScoreboardUrl?: string
  tournamentFormat?: 'SINGLE_ELIMINATION' | 'ROUND_ROBIN' | 'MLP' | 'INDY_LEAGUE' | 'LEAGUE_ROUND_ROBIN'
}

function TournamentNavBarContent({
  tournamentTitle,
  tournamentImage,
  isAdmin = false,
  isOwner = false,
  pendingRequestsCount = 0,
  onPublicScoreboardClick,
  onEditTournamentClick,
  publicScoreboardUrl,
  tournamentFormat
}: TournamentNavBarProps) {
  const params = useParams()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tournamentId = params.id as string
  const divisionParam = searchParams.get('division')
  const divisionQuery = divisionParam ? `?division=${divisionParam}` : ''
  const [isComplaintModalOpen, setIsComplaintModalOpen] = useState(false)

  const base = `/admin/${tournamentId}`
  const isInformation = pathname === base
  const isDivisions = pathname === `${base}/divisions`
  const isPlayers = pathname === `${base}/players`
  const isStages = pathname === `${base}/stages`
  const isDashboard = pathname === `${base}/dashboard`
  const isMatchDays = pathname.startsWith(`${base}/match-days`)
  const isCourts = pathname.startsWith(`${base}/courts`)
  const isAccess = pathname === `${base}/access`

  return (
    <div className="bg-white/95 backdrop-blur-sm border-b border-slate-200 fixed top-16 left-0 right-0 z-[60] shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top row: Tournament title and main actions */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center space-x-3">
            <Link href={`/admin/${tournamentId}`} className="flex items-center space-x-2 text-slate-700 hover:text-slate-900 transition-colors">
              {tournamentImage ? (
                <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border-2 border-slate-200">
                  <Image
                    src={tournamentImage}
                    alt={tournamentTitle || 'Tournament'}
                    width={40}
                    height={40}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-sm">P</span>
                </div>
              )}
              <div>
                <h1 className="text-lg font-bold text-slate-900">
                  {tournamentTitle || 'Tournament'}
                </h1>
              </div>
            </Link>
          </div>
          
          <div className="flex items-center space-x-2">
            {isOwner && (
              <Link
                href={`/admin/${tournamentId}/import`}
                className="flex items-center px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                CSV Import
              </Link>
            )}
            
            {onPublicScoreboardClick && (
              <button
                onClick={onPublicScoreboardClick}
                className="flex items-center px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                <Globe className="w-3.5 h-3.5 mr-1.5" />
                Public Scoreboard
              </button>
            )}
            
            {isAdmin && onEditTournamentClick && (
              <button
                onClick={onEditTournamentClick}
                className="flex items-center justify-center w-10 h-10 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors p-2"
                title="Edit tournament"
              >
                <Edit className="w-5 h-5" />
              </button>
            )}
            
            {publicScoreboardUrl && (
              <ShareButton
                url={publicScoreboardUrl}
                title={tournamentTitle}
                size="sm"
                variant="ghost"
                iconOnly
                className="w-10 h-10 p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              />
            )}
            
            <Link
              href="/admin"
              className="flex items-center justify-center w-10 h-10 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors p-2"
              title="Back to tournaments"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>

            <button
              onClick={() => setIsComplaintModalOpen(true)}
              className="flex items-center justify-center w-10 h-10 text-slate-600 hover:bg-slate-100 rounded-lg transition-all duration-200"
              title="Submit Complaint"
            >
              <AlertTriangle className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Bottom row: Quick Actions */}
        <div className="border-t border-slate-200 py-2">
          <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide">
            <Link href={`/admin/${tournamentId}`}>
              <Button
                variant="outline"
                size="sm"
                className={`flex items-center space-x-2 whitespace-nowrap transition-all ${isInformation ? 'bg-slate-100 border-slate-400 font-medium text-slate-900' : 'hover:bg-slate-50 hover:border-slate-200'}`}
              >
                <Info className="w-4 h-4" />
                <span>Information</span>
              </Button>
            </Link>
            {isAdmin && (
              <Link href={`/admin/${tournamentId}/divisions`}>
                <Button 
                  variant="outline" 
                  size="sm"
                  className={`flex items-center space-x-2 whitespace-nowrap transition-all ${isDivisions ? 'bg-blue-100 border-blue-400 font-medium text-blue-900' : 'hover:bg-blue-50 hover:border-blue-200'}`}
                >
                  <Settings className="w-4 h-4" />
                  <span>Divisions</span>
                </Button>
              </Link>
            )}
            
            <Link href={`/admin/${tournamentId}/players`}>
              <Button 
                variant="outline" 
                size="sm"
                className={`flex items-center space-x-2 whitespace-nowrap transition-all ${isPlayers ? 'bg-emerald-100 border-emerald-400 font-medium text-emerald-900' : 'hover:bg-emerald-50 hover:border-emerald-200'}`}
              >
                <Users className="w-4 h-4" />
                <span>Players</span>
              </Button>
            </Link>
            
            {/* Teams button hidden - functionality not ready */}
            {/* <Link href={`/admin/${tournamentId}/teams`}>
              <Button 
                variant="outline" 
                size="sm"
                className="flex items-center space-x-2 whitespace-nowrap hover:bg-amber-50 hover:border-amber-200 transition-all"
              >
                <Users className="w-4 h-4" />
                <span>Teams</span>
              </Button>
            </Link> */}
            
            <Link href={`/admin/${tournamentId}/stages${divisionQuery}`}>
              <Button 
                variant="outline" 
                size="sm"
                className={`flex items-center space-x-2 whitespace-nowrap transition-all ${isStages ? 'bg-orange-100 border-orange-400 font-medium text-orange-900' : 'hover:bg-orange-50 hover:border-orange-200'}`}
              >
                <FileText className="w-4 h-4" />
                <span>Score Input</span>
              </Button>
            </Link>
            
            <Link href={`/admin/${tournamentId}/dashboard${divisionQuery}`}>
              <Button 
                variant="outline" 
                size="sm"
                className={`flex items-center space-x-2 whitespace-nowrap transition-all ${isDashboard ? 'bg-purple-100 border-purple-400 font-medium text-purple-900' : 'hover:bg-purple-50 hover:border-purple-200'}`}
              >
                <BarChart3 className="w-4 h-4" />
                <span>Dashboard</span>
              </Button>
            </Link>
            
            {(tournamentFormat === 'INDY_LEAGUE' || tournamentFormat === 'LEAGUE_ROUND_ROBIN') && isAdmin && (
              <Link href={`/admin/${tournamentId}/match-days`}>
                <Button 
                  variant="outline" 
                  size="sm"
                  className={`flex items-center space-x-2 whitespace-nowrap transition-all ${isMatchDays ? 'bg-indigo-100 border-indigo-400 font-medium text-indigo-900' : 'hover:bg-indigo-50 hover:border-indigo-200'}`}
                >
                  <Calendar className="w-4 h-4" />
                  <span>Match Days</span>
                </Button>
              </Link>
            )}

            {(tournamentFormat === 'INDY_LEAGUE' || tournamentFormat === 'LEAGUE_ROUND_ROBIN') && isAdmin && (
              <Link href={`/admin/${tournamentId}/courts`}>
                <Button
                  variant="outline"
                  size="sm"
                  className={`flex items-center space-x-2 whitespace-nowrap transition-all ${isCourts ? 'bg-slate-200 border-slate-400 font-medium text-slate-900' : 'hover:bg-slate-50 hover:border-slate-200'}`}
                >
                  <Target className="w-4 h-4" />
                  <span>Courts</span>
                </Button>
              </Link>
            )}
            
            {isOwner && (
              <Link href={`/admin/${tournamentId}/access`} className="relative">
                <Button 
                  variant="outline" 
                  size="sm"
                  className={`flex items-center space-x-2 whitespace-nowrap transition-all ${isAccess ? 'bg-gray-200 border-gray-400 font-medium text-gray-900' : 'hover:bg-gray-50 hover:border-gray-200'}`}
                >
                  <Shield className="w-4 h-4" />
                  <span>Access Control</span>
                </Button>
                {pendingRequestsCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
                    {pendingRequestsCount}
                  </span>
                )}
              </Link>
            )}
          </div>
        </div>
      </div>

      <ComplaintModal
        isOpen={isComplaintModalOpen}
        onClose={() => setIsComplaintModalOpen(false)}
        tournamentId={tournamentId}
        tournamentTitle={tournamentTitle}
      />
    </div>
  )
}

// Wrapper with Suspense to prevent hydration errors
export default function TournamentNavBar(props: TournamentNavBarProps) {
  return (
    <Suspense fallback={
      <div className="bg-white/95 backdrop-blur-sm border-b border-slate-200 fixed top-16 left-0 right-0 z-[60] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="animate-pulse h-10 bg-gray-200 rounded"></div>
        </div>
      </div>
    }>
      <TournamentNavBarContent {...props} />
    </Suspense>
  )
}

