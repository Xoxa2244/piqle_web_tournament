'use client'

import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { 
  Settings,
  Users,
  FileText,
  BarChart3,
  Shield,
  Upload,
  Globe,
  Edit,
  ArrowLeft
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import ShareButton from '@/components/ShareButton'

interface TournamentNavBarProps {
  tournamentTitle?: string
  isAdmin?: boolean
  isOwner?: boolean
  pendingRequestsCount?: number
  onPublicScoreboardClick?: () => void
  onEditTournamentClick?: () => void
  publicScoreboardUrl?: string
}

export default function TournamentNavBar({
  tournamentTitle,
  isAdmin = false,
  isOwner = false,
  pendingRequestsCount = 0,
  onPublicScoreboardClick,
  onEditTournamentClick,
  publicScoreboardUrl
}: TournamentNavBarProps) {
  const params = useParams()
  const searchParams = useSearchParams()
  const tournamentId = params.id as string
  const divisionParam = searchParams.get('division')
  const divisionQuery = divisionParam ? `?division=${divisionParam}` : ''

  return (
    <div className="bg-white/95 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top row: Tournament title and main actions */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center space-x-3">
            <Link href={`/admin/${tournamentId}`} className="flex items-center space-x-2 text-slate-700 hover:text-slate-900 transition-colors">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">P</span>
              </div>
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
                className="flex items-center px-3 py-1.5 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all duration-200 text-sm font-medium"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                CSV Import
              </Link>
            )}
            
            {onPublicScoreboardClick && (
              <button
                onClick={onPublicScoreboardClick}
                className="flex items-center px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg hover:from-emerald-700 hover:to-emerald-800 transition-all duration-200 text-sm font-medium"
              >
                <Globe className="w-3.5 h-3.5 mr-1.5" />
                Public Scoreboard
              </button>
            )}
            
            {isAdmin && onEditTournamentClick && (
              <button
                onClick={onEditTournamentClick}
                className="flex items-center px-3 py-1.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 text-sm font-medium"
              >
                <Edit className="w-3.5 h-3.5 mr-1.5" />
                Edit
              </button>
            )}
            
            {publicScoreboardUrl && (
              <ShareButton
                url={publicScoreboardUrl}
                title={tournamentTitle}
                size="sm"
                variant="outline"
                className="px-3 py-1.5"
              />
            )}
            
            <Link
              href="/admin"
              className="flex items-center px-3 py-1.5 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-all duration-200 text-sm font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Back
            </Link>
          </div>
        </div>

        {/* Bottom row: Quick Actions */}
        <div className="border-t border-slate-200 py-2">
          <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide">
            {isAdmin && (
              <Link href={`/admin/${tournamentId}/divisions`}>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex items-center space-x-2 whitespace-nowrap hover:bg-blue-50 hover:border-blue-200 transition-all"
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
                className="flex items-center space-x-2 whitespace-nowrap hover:bg-emerald-50 hover:border-emerald-200 transition-all"
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
                className="flex items-center space-x-2 whitespace-nowrap hover:bg-orange-50 hover:border-orange-200 transition-all"
              >
                <FileText className="w-4 h-4" />
                <span>Score Input</span>
              </Button>
            </Link>
            
            <Link href={`/admin/${tournamentId}/dashboard${divisionQuery}`}>
              <Button 
                variant="outline" 
                size="sm"
                className="flex items-center space-x-2 whitespace-nowrap hover:bg-purple-50 hover:border-purple-200 transition-all"
              >
                <BarChart3 className="w-4 h-4" />
                <span>Dashboard</span>
              </Button>
            </Link>
            
            {isOwner && (
              <Link href={`/admin/${tournamentId}/access`} className="relative">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex items-center space-x-2 whitespace-nowrap hover:bg-gray-50 hover:border-gray-200 transition-all"
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
    </div>
  )
}

