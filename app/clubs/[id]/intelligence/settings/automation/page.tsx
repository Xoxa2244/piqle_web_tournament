'use client'

import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ShieldAlert, Bot } from 'lucide-react'
import { useIntelligenceSettings } from '../../_hooks/use-intelligence'

/**
 * Settings → Automation page
 *
 * Skeleton landed in P0-T2. Real content (Agent Campaign Layer, automation
 * triggers, outreach mode toggle, allowlist) moves here from the Campaigns
 * page in P1-T3. See `docs/ENGAGE_REDESIGN_SPEC.md` §2 (P0-T2) and §3 (P1-T3).
 *
 * Access: ADMIN only. MODERATOR / null roles see access-denied panel.
 */
export default function SettingsAutomationPage() {
  const params = useParams()
  const clubId = String(params?.id ?? '')

  const { data: intelligenceData, isLoading } = useIntelligenceSettings(clubId)
  const clubRole = intelligenceData?.clubRole
  const isAdmin = clubRole === 'ADMIN'

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="p-8">
        <Card className="max-w-2xl">
          <CardHeader>
            <ShieldAlert className="h-10 w-10 text-amber-500 mb-2" />
            <CardTitle>Admin access required</CardTitle>
            <CardDescription>
              The Automation page manages agent execution layer (draft queue, live
              rollout, outreach mode). It is restricted to club administrators.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start gap-3">
        <Bot className="h-7 w-7 text-violet-500 mt-1" />
        <div>
          <h1 className="text-2xl font-bold">Automation</h1>
          <p className="text-muted-foreground">
            Agent Campaign Layer · Draft Queue · Live Rollout · Live Pilot Health · Triggers
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Skeleton — content arrives in P1-T3</CardTitle>
          <CardDescription>
            Per <code className="text-xs">docs/ENGAGE_REDESIGN_SPEC.md</code> §3 (P1-T3),
            the Agent Campaign Layer block (Draft Queue / Live Rollout / Live Pilot
            Health) currently rendered at the top of the Campaigns page will move
            here, alongside automation triggers, outreach mode toggle, and the
            allowlist. The Campaigns page will then surface only AI-Recommended
            and Active Campaigns to club directors.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
            <li>Draft Queue (review-ready, sandboxed, scheduled, blocked)</li>
            <li>Live Rollout status (env allowlist, live types armed)</li>
            <li>Live Pilot Health (sends, delivered, opened, failed)</li>
            <li>Outreach Mode toggle (Disabled / Shadow / Live)</li>
            <li>Allowlist management</li>
            <li>Shadow-back recommendations</li>
            <li>Automation triggers (4 trigger types)</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
