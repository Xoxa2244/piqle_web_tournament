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
import { ComingSoonIQ } from './_components/iq-pages/ComingSoonIQ'
import './iqsport-theme.css'

// ── sol2-lean section gate ────────────────────────────────────────────
// The lean build ships only the core sections; every other route under
// /intelligence/* renders ComingSoonIQ instead of its page. Pages and
// server code stay untouched — re-enabling a section is one line here.
// Action Center and Programming IQ are removed harder: their page files
// redirect to the Dashboard, so they never reach this gate.
const LIVE_SECTIONS = new Set([
  '',                  // Dashboard
  'sessions',          // Schedule
  'scorecard',         // Programming Health
  'membership-health', // Membership Health
  'advisor',           // AI Advisor
  'members',           // Members
  'cohorts',           // Audiences (un-gated 2026-06-10 — operator feedback 2.2; route stays /cohorts)
  'billing',           // Billing
  'settings',          // club settings (operational; /settings/automation is gated below)
  'onboarding',        // first-run setup wizard
  'import',            // CSV import (reachable from empty states / settings)
  'agent',             // legacy redirect → /advisor (old reminder URLs)
  'action-center',     // page self-redirects to Dashboard
  'programming',       // page self-redirects to Dashboard
])

const SECTION_LABELS: Record<string, string> = {
  'cohorts': 'Audiences',
  'campaigns': 'Campaigns',
  'launch': 'Launch',
  'integrations': 'Integrations',
  'email-domain': 'Email Domain',
  'analytics': 'Analytics',
  'events': 'Events',
  'revenue': 'Revenue',
  'slot-filler': 'Slot Filler',
  'reactivation': 'Reactivation',
  'leagues': 'Leagues',
  'marketplace': 'Marketplace',
  'packages': 'Packages',
  'team': 'Team Management',
  'tournament-ai': 'Tournament AI',
}

const navItems = [
  { label: 'Overview', href: '', icon: LayoutDashboard },
  { label: 'Sessions & Events', href: '/sessions', icon: Calendar },
  { label: 'AI Advisor', href: '/advisor', icon: MessageSquare },
  { label: 'Slot Filler', href: '/slot-filler', icon: TrendingUp },
  { label: 'Reactivation', href: '/reactivation', icon: UserMinus },
  { label: 'Revenue', href: '/revenue', icon: DollarSign },
  { label: 'Members', href: '/members', icon: Users },
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
    const isAdvisorPage = pathname.endsWith('/advisor')
    // sol2-lean gate: first path segment after /intelligence decides
    // whether the real page renders or the Coming Soon placeholder.
    const relPath = pathname.startsWith(basePath) ? pathname.slice(basePath.length) : ''
    const section = relPath.split('/')[1] ?? ''
    const isAutomationSettings = relPath.startsWith('/settings/automation')
    const isLive = LIVE_SECTIONS.has(section) && !isAutomationSettings
    const sectionLabel = isAutomationSettings
      ? 'Automation'
      : SECTION_LABELS[section] ?? 'This section'
    return (
      <PageContextCtx.Provider value={pageContextStore}>
        <IQThemeProvider>
          <IQSidebar clubId={clubId}>
            {isLive ? children : <ComingSoonIQ sectionLabel={sectionLabel} />}
            {!isAdvisorPage && <ChatWidget clubId={clubId} />}
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
