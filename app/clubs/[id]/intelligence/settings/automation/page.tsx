'use client'

import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ShieldAlert, Bot } from 'lucide-react'
import { useIntelligenceSettings } from '../../_hooks/use-intelligence'
import { AgentCampaignLayer } from '../../_components/iq-pages/AgentCampaignLayer'

/**
 * Settings → Automation page
 *
 * Skeleton landed in P0-T2. Agent Campaign Layer block moved here from
 * Campaigns page in P1-T3 — see docs/ENGAGE_REDESIGN_SPEC.md §3 P1-T3.
 *
 * Future content (per PLAN §7): outreach mode toggle UI, allowlist
 * management, automation triggers — additional sections will land here.
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
            Agent execution layer · draft queue · live rollout · pilot health
          </p>
        </div>
      </div>

      <AgentCampaignLayer clubId={clubId} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">More automation controls — coming soon</CardTitle>
          <CardDescription>
            Per <code className="text-xs">docs/ENGAGE_REDESIGN_SPEC.md</code>, additional sections will land here:
            outreach mode toggle UI, allowlist management, automation triggers (4 trigger
            types), shadow-back recommendations.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
