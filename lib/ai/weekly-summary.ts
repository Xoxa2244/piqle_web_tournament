import { generateWithFallback } from '@/lib/ai/llm/provider'
import { getVariantAnalytics } from '@/lib/ai/variant-optimizer'

// ══════════════════════════════════════════════
//  Weekly AI Summary — Data Collection + LLM
// ══════════════════════════════════════════════

// ── Types ──

export interface WeeklySummaryContent {
  executiveSummary: string
  wins: string[]
  risks: string[]
  actionsTaken: string[]
  keyNumbers: {
    label: string
    thisWeek: number | string
    lastWeek: number | string
    changePercent: number
    direction: 'up' | 'down' | 'neutral'
  }[]
  generatedAt: string
  weekLabel: string
}

interface WeeklySummaryInput {
  clubName: string
  weekLabel: string
  weekStart: Date
  weekEnd: Date
  health: {
    total: number
    healthy: number
    watch: number
    atRisk: number
    critical: number
    avgScore: number
  }
  prevHealth: {
    total: number
    healthy: number
    watch: number
    atRisk: number
    critical: number
    avgScore: number
  } | null
  campaigns: {
    totalSent: number
    totalOpened: number
    totalClicked: number
    totalBounced: number
    byType: { type: string; count: number }[]
  }
  prevCampaigns: {
    totalSent: number
    totalOpened: number
    totalClicked: number
  } | null
  bestVariant: { id: string; score: number } | null
  worstVariant: { id: string; score: number } | null
  sequences: {
    active: number
    completed: number
    exited: number
  }
}

// ── Date helpers ──

export function getWeekBounds(now: Date = new Date()): { weekStart: Date; weekEnd: Date } {
  // Previous complete week: Monday 00:00 to Sunday 23:59
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)

  // Find this Monday
  const dayOfWeek = d.getDay() // 0=Sun, 1=Mon...
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const thisMonday = new Date(d)
  thisMonday.setDate(d.getDate() - daysFromMonday)

  // Previous week
  const weekStart = new Date(thisMonday)
  weekStart.setDate(thisMonday.getDate() - 7)
  const weekEnd = new Date(thisMonday)
  weekEnd.setDate(thisMonday.getDate() - 1)
  weekEnd.setHours(23, 59, 59, 999)

  return { weekStart, weekEnd }
}

function formatWeekLabel(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`
}

// ── Data Collection ──

export async function collectWeeklySummaryData(
  prisma: any,
  clubId: string,
  weekEndDate?: Date,
): Promise<WeeklySummaryInput> {
  const { weekStart, weekEnd } = weekEndDate
    ? { weekStart: new Date(weekEndDate.getTime() - 6 * 86400000), weekEnd: weekEndDate }
    : getWeekBounds()

  const prevWeekStart = new Date(weekStart.getTime() - 7 * 86400000)
  const prevWeekEnd = new Date(weekStart.getTime() - 1)

  // Club name
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { name: true },
  })
  const clubName = club?.name || 'Unknown Club'

  // ── Health snapshots (this week) ──
  const healthSnapshots = await prisma.memberHealthSnapshot.findMany({
    where: {
      clubId,
      date: { gte: weekStart, lte: weekEnd },
    },
    orderBy: { date: 'desc' },
    select: { userId: true, healthScore: true, riskLevel: true, date: true },
  })

  // Get latest snapshot per user for this week
  const latestByUser = new Map<string, { healthScore: number; riskLevel: string }>()
  for (const s of healthSnapshots) {
    if (!latestByUser.has(s.userId)) {
      latestByUser.set(s.userId, { healthScore: s.healthScore, riskLevel: s.riskLevel })
    }
  }

  const health = {
    total: latestByUser.size,
    healthy: 0,
    watch: 0,
    atRisk: 0,
    critical: 0,
    avgScore: 0,
  }
  let scoreSum = 0
  latestByUser.forEach((v) => {
    scoreSum += v.healthScore
    if (v.riskLevel === 'healthy') health.healthy++
    else if (v.riskLevel === 'watch') health.watch++
    else if (v.riskLevel === 'at_risk') health.atRisk++
    else if (v.riskLevel === 'critical') health.critical++
  })
  health.avgScore = health.total > 0 ? Math.round(scoreSum / health.total) : 0

  // ── Health snapshots (prev week) ──
  const prevHealthSnapshots = await prisma.memberHealthSnapshot.findMany({
    where: {
      clubId,
      date: { gte: prevWeekStart, lte: prevWeekEnd },
    },
    orderBy: { date: 'desc' },
    select: { userId: true, healthScore: true, riskLevel: true },
  })

  let prevHealth: WeeklySummaryInput['prevHealth'] = null
  if (prevHealthSnapshots.length > 0) {
    const prevByUser = new Map<string, { healthScore: number; riskLevel: string }>()
    for (const s of prevHealthSnapshots) {
      if (!prevByUser.has(s.userId)) {
        prevByUser.set(s.userId, { healthScore: s.healthScore, riskLevel: s.riskLevel })
      }
    }
    const ph = { total: prevByUser.size, healthy: 0, watch: 0, atRisk: 0, critical: 0, avgScore: 0 }
    let prevSum = 0
    prevByUser.forEach((v) => {
      prevSum += v.healthScore
      if (v.riskLevel === 'healthy') ph.healthy++
      else if (v.riskLevel === 'watch') ph.watch++
      else if (v.riskLevel === 'at_risk') ph.atRisk++
      else if (v.riskLevel === 'critical') ph.critical++
    })
    ph.avgScore = ph.total > 0 ? Math.round(prevSum / ph.total) : 0
    prevHealth = ph
  }

  // ── Campaign logs (this week) ──
  const campaignLogs = await prisma.aIRecommendationLog.findMany({
    where: {
      clubId,
      status: { in: ['sent', 'delivered'] },
      createdAt: { gte: weekStart, lte: weekEnd },
    },
    select: {
      type: true,
      openedAt: true,
      clickedAt: true,
      bouncedAt: true,
    },
  })

  const byType = new Map<string, number>()
  let totalOpened = 0, totalClicked = 0, totalBounced = 0
  for (const log of campaignLogs) {
    byType.set(log.type, (byType.get(log.type) || 0) + 1)
    if (log.openedAt) totalOpened++
    if (log.clickedAt) totalClicked++
    if (log.bouncedAt) totalBounced++
  }

  const campaigns = {
    totalSent: campaignLogs.length,
    totalOpened,
    totalClicked,
    totalBounced,
    byType: Array.from(byType.entries()).map(([type, count]) => ({ type, count })),
  }

  // ── Campaign logs (prev week) ──
  const prevCampaignLogs = await prisma.aIRecommendationLog.findMany({
    where: {
      clubId,
      status: { in: ['sent', 'delivered'] },
      createdAt: { gte: prevWeekStart, lte: prevWeekEnd },
    },
    select: { openedAt: true, clickedAt: true },
  })

  let prevCampaigns: WeeklySummaryInput['prevCampaigns'] = null
  if (prevCampaignLogs.length > 0) {
    prevCampaigns = {
      totalSent: prevCampaignLogs.length,
      totalOpened: prevCampaignLogs.filter((l: any) => l.openedAt).length,
      totalClicked: prevCampaignLogs.filter((l: any) => l.clickedAt).length,
    }
  }

  // ── Variant performance (7 days) ──
  const variantData = await getVariantAnalytics(prisma, clubId, undefined, 7)
  const sorted = variantData.variants.sort((a, b) => b.engagementScore - a.engagementScore)
  const bestVariant = sorted.length > 0
    ? { id: sorted[0].variantId, score: sorted[0].engagementScore }
    : null
  const worstVariant = sorted.length > 1
    ? { id: sorted[sorted.length - 1].variantId, score: sorted[sorted.length - 1].engagementScore }
    : null

  // ── Sequence stats ──
  const sequenceLogs = await prisma.aIRecommendationLog.findMany({
    where: {
      clubId,
      sequenceStep: { not: null },
      createdAt: { gte: weekStart, lte: weekEnd },
    },
    select: { sequenceStep: true, reasoning: true },
  })

  let seqActive = 0, seqCompleted = 0, seqExited = 0
  for (const log of sequenceLogs) {
    const reasoning = (log.reasoning as any) || {}
    if (reasoning.sequenceExit) {
      if (reasoning.sequenceExit === 'max_steps') seqCompleted++
      else seqExited++
    } else if (log.sequenceStep === 0) {
      seqActive++
    }
  }

  return {
    clubName,
    weekLabel: formatWeekLabel(weekStart, weekEnd),
    weekStart,
    weekEnd,
    health,
    prevHealth,
    campaigns,
    prevCampaigns,
    bestVariant,
    worstVariant,
    sequences: { active: seqActive, completed: seqCompleted, exited: seqExited },
  }
}

// ── LLM System Prompt ──

const WEEKLY_SUMMARY_SYSTEM = `You are an AI analyst for a racquet sports club management platform.
Generate a concise weekly intelligence report for a club owner.

Respond in valid JSON with this exact structure:
{
  "executiveSummary": "2-3 sentence overview of the week's performance",
  "wins": ["positive observation 1", "positive observation 2"],
  "risks": ["concern or risk 1", "concern or risk 2"],
  "actionsTaken": ["action the AI system took 1", "action 2"],
  "keyNumbers": [
    { "label": "Label", "thisWeek": 72, "lastWeek": 68, "changePercent": 5.9, "direction": "up" }
  ]
}

Guidelines:
- Be concise and actionable. Club managers are busy.
- Focus on what CHANGED this week vs last week.
- "wins" = things that improved or went well (2-4 items)
- "risks" = things needing attention — declining metrics, at-risk members (1-3 items)
- "actionsTaken" = what the AI campaign system did — messages sent, variants selected, sequences started (2-4 items)
- "keyNumbers" = 4-6 key metrics with week-over-week comparison
- Use specific numbers from the data provided. Never fabricate statistics.
- Keep each bullet point to 1 sentence.
- If there's not enough previous data for comparison, note that it's the first week.
- Return ONLY valid JSON, no markdown fences.`

// ── LLM Generation ──

export async function generateWeeklySummaryContent(
  input: WeeklySummaryInput,
): Promise<{ content: WeeklySummaryContent; model: string }> {
  const openRate = input.campaigns.totalSent > 0
    ? Math.round((input.campaigns.totalOpened / input.campaigns.totalSent) * 100)
    : 0
  const clickRate = input.campaigns.totalSent > 0
    ? Math.round((input.campaigns.totalClicked / input.campaigns.totalSent) * 100)
    : 0

  const prevOpenRate = input.prevCampaigns && input.prevCampaigns.totalSent > 0
    ? Math.round((input.prevCampaigns.totalOpened / input.prevCampaigns.totalSent) * 100)
    : null
  const prevClickRate = input.prevCampaigns && input.prevCampaigns.totalSent > 0
    ? Math.round((input.prevCampaigns.totalClicked / input.prevCampaigns.totalSent) * 100)
    : null

  const prompt = `
Club: ${input.clubName}
Week: ${input.weekLabel}

MEMBER HEALTH:
- Total members tracked: ${input.health.total}
- Distribution: ${input.health.healthy} healthy, ${input.health.watch} watch, ${input.health.atRisk} at-risk, ${input.health.critical} critical
- Average health score: ${input.health.avgScore}
${input.prevHealth ? `- Previous week: avg score ${input.prevHealth.avgScore}, ${input.prevHealth.atRisk} at-risk, ${input.prevHealth.critical} critical` : '- No previous week data available (first report)'}

CAMPAIGN PERFORMANCE:
- Messages sent: ${input.campaigns.totalSent}
- Opened: ${input.campaigns.totalOpened} (${openRate}%)
- Clicked: ${input.campaigns.totalClicked} (${clickRate}%)
- Bounced: ${input.campaigns.totalBounced}
- By type: ${input.campaigns.byType.map(t => `${t.type}: ${t.count}`).join(', ') || 'none'}
${input.prevCampaigns ? `- Previous week: ${input.prevCampaigns.totalSent} sent, ${prevOpenRate}% open, ${prevClickRate}% click` : '- No previous week campaign data'}

BEST PERFORMING VARIANT: ${input.bestVariant ? `${input.bestVariant.id} (score: ${(input.bestVariant.score * 100).toFixed(0)})` : 'N/A'}
WORST PERFORMING VARIANT: ${input.worstVariant ? `${input.worstVariant.id} (score: ${(input.worstVariant.score * 100).toFixed(0)})` : 'N/A'}

SEQUENCE CHAINS:
- New sequences started: ${input.sequences.active}
- Completed: ${input.sequences.completed}
- Exited early: ${input.sequences.exited}
`.trim()

  try {
    const result = await generateWithFallback({
      system: WEEKLY_SUMMARY_SYSTEM,
      prompt,
      tier: 'fast',
      maxTokens: 800,
    })

    // Parse JSON — handle markdown fences
    let jsonText = result.text.trim()
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) jsonText = fenceMatch[1].trim()

    const parsed = JSON.parse(jsonText)

    // Validate & fill defaults
    const content: WeeklySummaryContent = {
      executiveSummary: parsed.executiveSummary || 'Weekly summary generated.',
      wins: Array.isArray(parsed.wins) ? parsed.wins.slice(0, 5) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 4) : [],
      actionsTaken: Array.isArray(parsed.actionsTaken) ? parsed.actionsTaken.slice(0, 5) : [],
      keyNumbers: Array.isArray(parsed.keyNumbers) ? parsed.keyNumbers.slice(0, 6) : [],
      generatedAt: new Date().toISOString(),
      weekLabel: input.weekLabel,
    }

    return { content, model: result.model }
  } catch (error: any) {
    console.error('[WeeklySummary] LLM generation failed:', error.message)

    // Fallback: build a basic summary from raw data
    return {
      content: buildFallbackSummary(input),
      model: 'fallback',
    }
  }
}

// ── Fallback summary (no LLM) ──

function buildFallbackSummary(input: WeeklySummaryInput): WeeklySummaryContent {
  const openRate = input.campaigns.totalSent > 0
    ? Math.round((input.campaigns.totalOpened / input.campaigns.totalSent) * 100)
    : 0

  const wins: string[] = []
  const risks: string[] = []

  if (input.prevHealth && input.health.avgScore > input.prevHealth.avgScore) {
    wins.push(`Average health score improved from ${input.prevHealth.avgScore} to ${input.health.avgScore}`)
  }
  if (input.campaigns.totalSent > 0) {
    wins.push(`Sent ${input.campaigns.totalSent} campaign messages with ${openRate}% open rate`)
  }

  if (input.health.critical > 0) {
    risks.push(`${input.health.critical} members in critical health status`)
  }
  if (input.health.atRisk > 0) {
    risks.push(`${input.health.atRisk} members at risk of churn`)
  }

  const keyNumbers: WeeklySummaryContent['keyNumbers'] = []
  keyNumbers.push({
    label: 'Health Score',
    thisWeek: input.health.avgScore,
    lastWeek: input.prevHealth?.avgScore ?? '—',
    changePercent: input.prevHealth
      ? Math.round(((input.health.avgScore - input.prevHealth.avgScore) / Math.max(input.prevHealth.avgScore, 1)) * 100)
      : 0,
    direction: input.prevHealth
      ? (input.health.avgScore > input.prevHealth.avgScore ? 'up' : input.health.avgScore < input.prevHealth.avgScore ? 'down' : 'neutral')
      : 'neutral',
  })
  keyNumbers.push({
    label: 'Messages Sent',
    thisWeek: input.campaigns.totalSent,
    lastWeek: input.prevCampaigns?.totalSent ?? '—',
    changePercent: input.prevCampaigns
      ? Math.round(((input.campaigns.totalSent - input.prevCampaigns.totalSent) / Math.max(input.prevCampaigns.totalSent, 1)) * 100)
      : 0,
    direction: input.prevCampaigns
      ? (input.campaigns.totalSent > input.prevCampaigns.totalSent ? 'up' : 'down')
      : 'neutral',
  })
  keyNumbers.push({
    label: 'Open Rate',
    thisWeek: `${openRate}%`,
    lastWeek: input.prevCampaigns ? `${Math.round((input.prevCampaigns.totalOpened / Math.max(input.prevCampaigns.totalSent, 1)) * 100)}%` : '—',
    changePercent: 0,
    direction: 'neutral',
  })
  keyNumbers.push({
    label: 'At-Risk Members',
    thisWeek: input.health.atRisk,
    lastWeek: input.prevHealth?.atRisk ?? '—',
    changePercent: input.prevHealth
      ? Math.round(((input.health.atRisk - input.prevHealth.atRisk) / Math.max(input.prevHealth.atRisk, 1)) * 100)
      : 0,
    direction: input.prevHealth
      ? (input.health.atRisk > input.prevHealth.atRisk ? 'up' : input.health.atRisk < input.prevHealth.atRisk ? 'down' : 'neutral')
      : 'neutral',
  })

  return {
    executiveSummary: `This week: ${input.health.total} members tracked, ${input.campaigns.totalSent} messages sent, ${input.health.healthy} healthy members.`,
    wins: wins.length > 0 ? wins : ['Campaign engine is running and collecting data'],
    risks: risks.length > 0 ? risks : ['No major risks detected this week'],
    actionsTaken: [
      `Sent ${input.campaigns.totalSent} outreach messages`,
      `Started ${input.sequences.active} new sequence chains`,
    ].filter(a => !a.includes(' 0 ')),
    keyNumbers,
    generatedAt: new Date().toISOString(),
    weekLabel: input.weekLabel,
  }
}

// ── Orchestrator ──

export async function generateAndStoreWeeklySummary(
  prisma: any,
  clubId: string,
  force: boolean = false,
): Promise<WeeklySummaryContent> {
  const { weekStart, weekEnd } = getWeekBounds()

  // Check if already generated for this week (unless force)
  if (!force) {
    const existing = await prisma.weeklySummary.findFirst({
      where: { clubId, weekStart },
    })
    if (existing) {
      return existing.summary as WeeklySummaryContent
    }
  }

  // Collect data
  const input = await collectWeeklySummaryData(prisma, clubId)

  // Generate with LLM
  const { content, model } = await generateWeeklySummaryContent(input)

  // Upsert
  await prisma.weeklySummary.upsert({
    where: {
      clubId_weekStart: { clubId, weekStart },
    },
    create: {
      clubId,
      weekStart,
      weekEnd,
      summary: content as any,
      rawData: input as any,
      modelUsed: model,
    },
    update: {
      summary: content as any,
      rawData: input as any,
      modelUsed: model,
      generatedAt: new Date(),
    },
  })

  return content
}

// ── Cron: Generate for all clubs ──

export async function generateWeeklySummariesForAllClubs(
  prisma: any,
): Promise<{ processed: number; generated: number; skipped: number; errors: number }> {
  // Get all clubs that have automation enabled
  const clubs = await prisma.club.findMany({
    where: {
      // Only clubs that have at least 1 health snapshot (active clubs)
      memberHealthSnapshots: { some: {} },
    },
    select: { id: true, name: true },
  })

  let generated = 0, skipped = 0, errors = 0

  for (const club of clubs) {
    try {
      const { weekStart } = getWeekBounds()

      // Skip if already generated
      const existing = await prisma.weeklySummary.findFirst({
        where: { clubId: club.id, weekStart },
      })
      if (existing) {
        skipped++
        continue
      }

      await generateAndStoreWeeklySummary(prisma, club.id, false)
      generated++
      console.log(`[WeeklySummary] Generated for club: ${club.name}`)
    } catch (error: any) {
      errors++
      console.error(`[WeeklySummary] Failed for club ${club.name}:`, error.message)
    }
  }

  return { processed: clubs.length, generated, skipped, errors }
}
