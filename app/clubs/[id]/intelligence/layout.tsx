'use client'

import { useParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard, TrendingUp, UserMinus, DollarSign,
  ChevronLeft, Zap
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Overview', href: '', icon: LayoutDashboard },
  { label: 'Slot Filler', href: '/slot-filler', icon: TrendingUp },
  { label: 'Reactivation', href: '/reactivation', icon: UserMinus },
  { label: 'Revenue', href: '/revenue', icon: DollarSign },
]

export default function IntelligenceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const params = useParams()
  const pathname = usePathname()
  const clubId = params.id as string
  const basePath = `/clubs/${clubId}/intelligence`

  return (
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
      </div>

      {/* Tab navigation */}
      <nav className="flex gap-1 mb-6 p-1 bg-muted/50 rounded-lg w-fit">
        {navItems.map((item) => {
          const fullPath = basePath + item.href
          const isActive = pathname === fullPath
          const Icon = item.icon

          return (
            <Link key={item.href} href={fullPath}>
              <button
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
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

      {/* Page content */}
      {children}
    </div>
  )
}
