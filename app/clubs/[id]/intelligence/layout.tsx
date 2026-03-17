'use client'

import { useMemo } from 'react'
import { useParams, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard, TrendingUp, UserMinus, DollarSign,
  ChevronLeft, Zap, MessageSquare, CalendarPlus, Calendar, Users, Settings,
  Sparkles, Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIntelligenceSettings } from './_hooks/use-intelligence'
import { ChatWidget } from './_components/ChatWidget'
import { PageContextCtx, createPageContext } from './_hooks/usePageContext'
import { useBrand } from '@/components/BrandProvider'
import { IQSidebar } from './_components/iq-layout/IQSidebar'
import { IQThemeProvider } from './_components/IQThemeProvider'
import './iqsport-theme.css'

const navItems = [
  { label: 'Overview', href: '', icon: LayoutDashboard },
  { label: 'Sessions', href: '/sessions', icon: Calendar },
  { label: 'AI Advisor', href: '/advisor', icon: MessageSquare },
  { label: 'Slot Filler', href: '/slot-filler', icon: TrendingUp },
  { label: 'Reactivation', href: '/reactivation', icon: UserMinus },
  { label: 'Revenue', href: '/revenue', icon: DollarSign },
  { label: 'Members', href: '/members', icon: Users },
  { label: 'Events', href: '/events', icon: CalendarPlus },
  { label: 'Campaigns', href: '/campaigns', icon: Send },
]

export default function IntelligenceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const params = useParams()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const clubId = params.id as string
  const basePath = `/clubs/${clubId}/intelligence`
  const isDemo = searchParams.get('demo') === 'true'
  const demoSuffix = isDemo ? '?demo=true' : ''
  const brand = useBrand()

  const settingsQuery = useIntelligenceSettings(clubId)
  const onboardingCompleted = isDemo
    ? true
    : !!settingsQuery.data?.settings?.onboardingCompletedAt

  const pageContextStore = useMemo(() => createPageContext(), [])

  // IQSport brand → dark sidebar layout with IQ theme
  if (brand.key === 'iqsport') {
    return (
      <PageContextCtx.Provider value={pageContextStore}>
        <IQThemeProvider>
          <IQSidebar clubId={clubId}>
            {children}
          </IQSidebar>
        </IQThemeProvider>
      </PageContextCtx.Provider>
    )
  }

  // Piqle brand → existing tab layout
  return (
    <PageContextCtx.Provider value={pageContextStore}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href={`/clubs/${clubId}`}>
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                <ChevronLeft className="h-4 w-4" />
                Club
              </Button>
            </Link>
            <div className="h-5 w-px bg-border" />
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-semibold leading-tight">Intelligence</h1>
                <p className="text-xs text-muted-foreground leading-tight">AI-powered insights</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!onboardingCompleted && (
              <Link href={`${basePath}/onboarding${demoSuffix}`}>
                <Button variant="outline" size="sm" className="gap-1.5 text-primary border-primary/30 hover:bg-primary/5">
                  <Sparkles className="h-4 w-4" />
                  Complete Setup
                </Button>
              </Link>
            )}
            <Link href={`${basePath}/settings${demoSuffix}`}>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                <Settings className="h-4 w-4" />
                Settings
              </Button>
            </Link>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="overflow-x-auto scrollbar-hide mb-6">
          <nav className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
            {navItems.map((item) => {
              const fullPath = basePath + item.href
              const isActive = pathname === fullPath
              const Icon = item.icon

              return (
                <Link key={item.href} href={fullPath + demoSuffix}>
                  <button
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap',
                      isActive
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Page content */}
        {children}

        {/* Floating AI Chat Widget — hidden on the full Advisor page */}
        {!pathname.endsWith('/advisor') && (
          <ChatWidget clubId={clubId} />
        )}
      </div>
    </PageContextCtx.Provider>
  )
}
