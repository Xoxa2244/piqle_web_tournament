import { streamText, convertToModelMessages } from 'ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getModel, getFallbackModel } from '@/lib/ai/llm/provider';
import { ADVISOR_SYSTEM_PROMPT, buildClubContextPrompt } from '@/lib/ai/llm/prompts';
import { retrieveContext, buildRAGContext } from '@/lib/ai/rag/retriever';
import { detectLanguage, getLanguageInstruction, type SupportedLanguage } from '@/lib/ai/llm/language';
import { generateConversationSummary } from '@/lib/ai/llm/summarizer';
import { parse as parseCookie } from 'cookie';
import { createChatTools } from '@/lib/ai/chat-tools';
import {
  buildAdvisorStatePrompt,
  clearAdvisorPendingClarification,
  deriveAdvisorConversationState,
} from '@/lib/ai/advisor-conversation-state';
import { resolveAdvisorAutonomyPolicy } from '@/lib/ai/advisor-autonomy-policy';
import { resolveAdvisorContactPolicy } from '@/lib/ai/advisor-contact-policy';
import { buildAdvisorOutcomeInsightsBlock } from '@/lib/ai/advisor-outcome-insights';

// Allow up to 60s for RAG + LLM streaming (default 10s is too tight)
export const maxDuration = 60;

// ── In-memory cache for advisor pre-fetch (5 min TTL per club) ──
const advisorDataCache = new Map<string, { ts: number; data: any }>()

function formatAdvisorSessionLine(session: {
  title: string
  eventUrl?: string | null
  date: string
  time: string
  format: string
  confirmed: number
  maxPlayers: number
  occupancy: string
  spotsRemaining: number
}) {
  const linkedTitle = session.eventUrl
    ? `[${session.title}](${session.eventUrl})`
    : session.title

  return `- ${linkedTitle}
  - Date: ${session.date}
  - Time: ${session.time}
  - Format: ${session.format}
  - Occupancy: ${session.occupancy} (${session.confirmed} of ${session.maxPlayers} spots filled) — ${session.spotsRemaining} spots left`
}

function resolveAppOrigin(req: Request) {
  const forwardedProto = req.headers.get('x-forwarded-proto')
  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host')
  if (forwardedHost) {
    return `${forwardedProto || 'https'}://${forwardedHost}`
  }
  return new URL(req.url).origin
}

// ── Auth helper (mirrors server/trpc.ts pattern exactly) ──
async function getSessionFromRequest(req: Request) {
  try {
    const nextAuthSession = await getServerSession(authOptions);
    if (nextAuthSession?.user?.id) {
      return { userId: nextAuthSession.user.id, user: nextAuthSession.user };
    }
  } catch (e) {
    console.warn('[AI Chat] getServerSession failed, falling back to cookie:', e);
  }

  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = parseCookie(cookieHeader);
  const sessionToken =
    cookies['__Secure-next-auth.session-token'] ||
    cookies['__Host-next-auth.session-token'] ||
    cookies['next-auth.session-token'] ||
    cookies['_Secure-next-auth.session-token'] ||
    null;

  if (!sessionToken) return null;

  const dbSession = await prisma.session.findUnique({
    where: { sessionToken },
    include: { user: true },
  });

  if (!dbSession || dbSession.expires < new Date()) return null;
  return { userId: dbSession.userId, user: dbSession.user };
}

// ── Verify club membership ──
async function verifyClubAccess(clubId: string, userId: string) {
  const [admin, follower] = await Promise.all([
    prisma.clubAdmin.findFirst({ where: { clubId, userId } }),
    prisma.clubFollower.findFirst({ where: { clubId, userId } }),
  ]);
  return !!(admin || follower);
}

// ── Extract text from a UIMessage (v6 uses parts[], not content) ──
function getMessageText(msg: { parts?: Array<{ type: string; text?: string }>; content?: string }): string {
  if (msg.parts && Array.isArray(msg.parts)) {
    const text = msg.parts
      .filter((p) => p.type === 'text')
      .map((p) => p.text || '')
      .join('');
    if (text) return text;
  }
  if (typeof msg.content === 'string') return msg.content;
  return '';
}

// ── Max messages to load from DB for conversation context ──
const MAX_HISTORY_MESSAGES = 100;

export async function POST(req: Request) {
  let step = 'init';
  try {
    const appOrigin = resolveAppOrigin(req)
    // 1. Authenticate
    step = 'auth';
    const session = await getSessionFromRequest(req);
    if (!session) {
      return new Response('Unauthorized', { status: 401 });
    }

    // 2. Parse request
    step = 'parse';
    const body = await req.json();
    const { messages, clubId, conversationId, pageContext } = body;

    if (!clubId || !messages || !Array.isArray(messages)) {
      return new Response('Bad request: clubId and messages are required', { status: 400 });
    }

    // 3. Verify club access
    step = 'access';
    const hasAccess = await verifyClubAccess(clubId, session.userId);
    if (!hasAccess) {
      return new Response('Forbidden: not a member of this club', { status: 403 });
    }

    // 3.5 Check AI Advisor daily usage limit
    step = 'usage_limit';
    try {
      const { checkUsageLimit } = await import('@/lib/subscription');
      const advisorCheck = await checkUsageLimit(clubId, 'ai_advisor');
      if (!advisorCheck.allowed) {
        // Plain-text body so the front-end's `error.message` shows a
        // human-readable line instead of a raw JSON payload — see Bug #2
        // from the 2026-04-25 audit.
        const friendly = `You have reached your daily AI Advisor message limit (${advisorCheck.used}/${advisorCheck.limit} on the ${advisorCheck.plan} plan). Upgrade to Pro or Enterprise for more conversations, or try again tomorrow.`;
        return new Response(friendly, {
          status: 429,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Error-Type': 'USAGE_LIMIT_REACHED',
            'X-Plan': advisorCheck.plan,
            'X-Used': String(advisorCheck.used),
            'X-Limit': String(advisorCheck.limit),
          },
        });
      }
    } catch (e) {
      // Non-critical — allow chat if usage check fails
      console.warn('[AI Chat] Usage limit check failed:', (e as Error).message?.slice(0, 80));
    }

    // 4. Get or create conversation + detect language per message
    step = 'conversation';
    let convId = conversationId;
    const lastUserText = getMessageText(messages[messages.length - 1]);
    // Always detect from the latest message so language can switch mid-conversation
    const conversationLanguage: SupportedLanguage = detectLanguage(lastUserText);

    try {
      if (!convId) {
        // New conversation
        const newConv = await prisma.aIConversation.create({
          data: {
            clubId,
            userId: session.userId,
            title: lastUserText.slice(0, 100) || 'New conversation',
            language: conversationLanguage,
          },
        });
        convId = newConv.id;
        console.log(`[AI Chat] New conversation ${convId}, lang=${conversationLanguage}`);
      } else {
        // Existing conversation — update language to match latest message
        await prisma.aIConversation.update({
          where: { id: convId },
          data: { language: conversationLanguage },
        }).catch(() => {}); // non-critical
        console.log(`[AI Chat] Existing conversation ${convId}, lang=${conversationLanguage}`);
      }
    } catch (convError) {
      console.warn('[AI Chat] Failed to create/load conversation (continuing without persistence):', convError instanceof Error ? convError.message : convError);
      convId = null;
    }

    // 4.5 Load prior conversation messages for multi-turn context
    step = 'history';
    let fullMessages = messages;
    let storedConversationMessages: Array<{ role: string; content: string; metadata?: unknown }> = [];
    if (convId && conversationId) {
      try {
        const priorMessages = await prisma.aIMessage.findMany({
          where: { conversationId: convId },
          orderBy: { createdAt: 'asc' },
        });

        storedConversationMessages = priorMessages.map((message) => ({
          role: message.role,
          content: message.content,
          metadata: message.metadata,
        }))

        if (priorMessages.length > 0) {
          const dbMessages = priorMessages
            .filter(m => m.role !== 'system')
            .map(m => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              parts: [{ type: 'text' as const, text: m.content }],
            }));

          // Cap very long conversations: keep first 2 + most recent messages
          const capped = dbMessages.length > MAX_HISTORY_MESSAGES
            ? [...dbMessages.slice(0, 2), ...dbMessages.slice(-(MAX_HISTORY_MESSAGES - 2))]
            : dbMessages;

          // Append only the NEW user message from client
          const newUserMsg = messages[messages.length - 1];
          fullMessages = [...capped, newUserMsg];

          console.log(`[AI Chat] Loaded ${priorMessages.length} prior messages (capped to ${capped.length}), total context: ${fullMessages.length} messages`);
        }
      } catch (err) {
        console.warn('[AI Chat] Failed to load conversation history, using client messages only:', err instanceof Error ? err.message : err);
      }
    }

    // 4.6 Load cross-session summaries for new conversations
    step = 'cross-session';
    let crossSessionContext = '';
    if (!conversationId) {
      try {
        const recentConvs = await prisma.aIConversation.findMany({
          where: {
            clubId,
            userId: session.userId,
            summary: { not: null },
          },
          orderBy: { updatedAt: 'desc' },
          take: 5,
          select: { title: true, summary: true, updatedAt: true },
        });

        if (recentConvs.length > 0) {
          crossSessionContext = '\n\n--- Previous Conversations (for context) ---\n' +
            recentConvs.map(c =>
              `[${c.updatedAt.toLocaleDateString()}] ${c.title || 'Untitled'}: ${c.summary}`
            ).join('\n') +
            '\n--- End of Previous Conversations ---\n' +
            'Use these summaries for context if the user references past discussions. Do not proactively mention them.';
        }
        console.log(`[AI Chat] Cross-session: ${recentConvs.length} prior summaries loaded`);
      } catch (err) {
        console.warn('[AI Chat] Failed to load cross-session context:', err instanceof Error ? err.message : err);
      }
    }

    // 5. RAG: retrieve relevant context (gracefully handle failures)
    step = 'rag';
    let ragChunks: Awaited<ReturnType<typeof retrieveContext>> = [];
    let ragStatus = 'skipped';
    let ragQueryText = '';
    try {
      const lastUserMessage = messages.filter((m: { role: string }) => m.role === 'user').pop();
      ragQueryText = lastUserMessage ? getMessageText(lastUserMessage) : '';
      console.log(`[AI Chat] RAG query: "${ragQueryText?.slice(0, 80)}", clubId: ${clubId}`);
      if (ragQueryText) {
        ragChunks = await retrieveContext(ragQueryText, clubId, { limit: 10, threshold: 0.3 });
        ragStatus = ragChunks.length > 0 ? 'ok' : 'empty';
        console.log(`[AI Chat] RAG retrieved ${ragChunks.length} chunks`);
      } else {
        ragStatus = 'no_query_text';
        console.warn(`[AI Chat] RAG skipped: no query text extracted from message`);
      }
    } catch (ragError) {
      ragStatus = 'error';
      console.error('[AI Chat] RAG retrieval failed (continuing without context):', ragError instanceof Error ? ragError.message : ragError);
    }

    // 6. Pre-fetch real-time club data (cached 5 min per club)
    step = 'prefetch';
    let liveDataBlock = ''
    let outcomeInsightsBlock = ''
    try {
      const cacheKey = `advisor_prefetch_${clubId}`
      const cached = advisorDataCache.get(cacheKey)
      let metrics: any, memberHealth: any, courtOcc: any, reactivation: any, membershipData: any, upcomingSessions: any, todayOpenSessions: any, tonightOpenSessions: any, outcomeInsights: string, ratedPlayers: any

      if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
        // Use cached data (< 5 min old)
        ;({ metrics, memberHealth, courtOcc, reactivation, membershipData, upcomingSessions, todayOpenSessions, tonightOpenSessions, outcomeInsights, ratedPlayers } = cached.data)
        outcomeInsightsBlock = outcomeInsights || ''
        console.log(`[AI Chat] Using cached prefetch data (${Math.round((Date.now() - cached.ts) / 1000)}s old)`)
      } else {
        // Fresh fetch
        const tools = createChatTools(clubId)
        const exec = (t: any, args: any) => t.execute(args, { toolCallId: 'prefetch', messages: [] }).catch(() => null)
        ;[metrics, memberHealth, courtOcc, reactivation, membershipData, upcomingSessions, todayOpenSessions, tonightOpenSessions, outcomeInsights, ratedPlayers] = await Promise.all([
          exec(tools.getClubMetrics, {}),
          exec(tools.getMemberHealth, { filter: 'all', limit: 50 }),
          exec(tools.getCourtOccupancy, { days: 30 }),
          exec(tools.getReactivationCandidates, { limit: 10 }),
          exec(tools.getMembershipBreakdown, {}),
          exec(tools.getUpcomingSessions, { limit: 30, onlyOpenSpots: true }),
          exec(tools.getUpcomingSessions, { limit: 50, onlyOpenSpots: true, dayScope: 'today' }),
          exec(tools.getUpcomingSessions, { limit: 50, onlyOpenSpots: true, dayScope: 'tonight' }),
          buildAdvisorOutcomeInsightsBlock({ prisma, clubId, days: 30 }).catch(() => ''),
          exec(tools.getRatedPlayers, { limit: 30 }),
        ])
        outcomeInsightsBlock = outcomeInsights || ''
        advisorDataCache.set(cacheKey, { ts: Date.now(), data: { metrics, memberHealth, courtOcc, reactivation, membershipData, upcomingSessions, todayOpenSessions, tonightOpenSessions, outcomeInsights: outcomeInsightsBlock, ratedPlayers } })
        console.log(`[AI Chat] Fresh prefetch completed, cached for 5 min`)
      }

      const parts: string[] = []

      if (metrics && !('error' in metrics)) {
        // Field names match the renamed getClubMetrics tool. The labels
        // here are what the LLM sees verbatim — keep them explicit so a
        // chat answer about "active members" doesn't conflate
        // booking-activity with subscription status (see Bug "metric
        // drift" from the 2026-04-25 audit).
        const metricPeriod = metrics.dashboardPeriod
          ? `${new Date(metrics.dashboardPeriod.from).toLocaleDateString('en-US')}–${new Date(metrics.dashboardPeriod.to).toLocaleDateString('en-US')}`
          : 'last 30 days'
        parts.push(`## Club Metrics (real-time, Dashboard period: ${metricPeriod})
Total followers (anyone subscribed to this club): ${metrics.totalFollowers}
Active players (confirmed booking in a session dated within the Dashboard period): ${metrics.activePlayers30d}
Inactive followers (subscribed but no confirmed booking in that Dashboard period): ${metrics.inactiveFollowers30d}
Bookings last 7 days: ${metrics.bookingsLast7Days}
Bookings last 30 days: ${metrics.bookingsLast30Days}
Sessions last 30 days: ${metrics.sessionsLast30Days}
Average per-session occupancy: ${metrics.averageOccupancy} (mean of registered/maxPlayers across sessions — same formula the Dashboard uses)`)
      }

      if (courtOcc && !('error' in courtOcc)) {
        parts.push(`## Court-Hour Utilization (${courtOcc.period})
Overall court-hour utilization: ${courtOcc.overallCourtHourUtilization} — % of operating court-hours that have ANY session scheduled (different from per-session player occupancy above; both are useful)
Total courts: ${courtOcc.totalCourts}
Total sessions: ${courtOcc.totalSessions}

Busiest time slots:
${(courtOcc.busiestSlots as any[]).slice(0, 8).map((s: any) => `- ${s.slot}: ${s.occupancy} (${s.totalPlayers} players, formats: ${s.formats})`).join('\n')}

Quietest time slots:
${(courtOcc.quietestSlots as any[]).slice(0, 5).map((s: any) => `- ${s.slot}: ${s.occupancy}`).join('\n')}`)
      }

      if (memberHealth && !('error' in memberHealth)) {
        const s = memberHealth.summary
        const allMembers = memberHealth.members as any[]
        // Most active = highest bookings
        const mostActive = [...allMembers].sort((a, b) => (b.totalBookings || 0) - (a.totalBookings || 0)).slice(0, 10)
        // Most at risk = lowest health score
        const mostAtRisk = [...allMembers].filter((m: any) => m.riskLevel === 'at_risk' || m.riskLevel === 'critical').slice(0, 10)

        parts.push(`## Member Health Summary
Healthy: ${s.healthy} | Watch: ${s.watch} | At-Risk: ${s.atRisk} | Critical: ${s.critical} | Churned: ${s.churned}
Average health score: ${s.avgHealthScore}

Most active members (by total bookings):
${mostActive.map((m: any) => `- ${m.name}: ${m.totalBookings} bookings, score ${m.healthScore}, ${m.riskLevel}, trend: ${m.trend}`).join('\n')}

Most at-risk members (lowest health scores):
${mostAtRisk.map((m: any) => `- ${m.name}: score ${m.healthScore}, ${m.totalBookings} bookings, last visit ${m.daysSinceLastVisit ?? 'never'} days ago, trend: ${m.trend}`).join('\n')}`)
      }

      if (reactivation && !('error' in reactivation)) {
        parts.push(`## Reactivation Candidates (inactive 14+ days)
Total inactive: ${reactivation.totalInactive}
${(reactivation.candidates as any[]).map((c: any) => `- ${c.name}: ${c.daysSinceLastVisit} days since last visit (${c.lastVisitDate})`).join('\n')}`)
      }

      if (upcomingSessions && !('error' in upcomingSessions)) {
        const sessions = (upcomingSessions.sessions as any[]).map((session: any) => ({
          ...session,
          eventUrl: session.eventUrl ? new URL(session.eventUrl, appOrigin).toString() : session.eventUrl,
        }))
        parts.push(`## Upcoming Sessions
${sessions.map((s: any) => formatAdvisorSessionLine(s)).join('\n')}`)
      }

      if (todayOpenSessions && !('error' in todayOpenSessions)) {
        const sessions = ((todayOpenSessions.sessions as any[]) ?? []).map((session: any) => ({
          ...session,
          eventUrl: session.eventUrl ? new URL(session.eventUrl, appOrigin).toString() : session.eventUrl,
        }))
        parts.push(`## Today's Sessions With Open Spots (${todayOpenSessions.timeZone || 'club local time'})
${sessions.length > 0
  ? sessions.map((s: any) => formatAdvisorSessionLine(s)).join('\n')
  : '- None today with open spots'}`)
      }

      if (tonightOpenSessions && !('error' in tonightOpenSessions)) {
        const sessions = ((tonightOpenSessions.sessions as any[]) ?? []).map((session: any) => ({
          ...session,
          eventUrl: session.eventUrl ? new URL(session.eventUrl, appOrigin).toString() : session.eventUrl,
        }))
        parts.push(`## Tonight's Sessions With Open Spots (${tonightOpenSessions.timeZone || 'club local time'})
${sessions.length > 0
  ? sessions.map((s: any) => formatAdvisorSessionLine(s)).join('\n')
  : '- None tonight with open spots'}`)
      }

      if (membershipData && !('error' in membershipData)) {
        const norm = membershipData.byNormalizedStatus as Record<string, number> | undefined
        const raw = membershipData.byRawStatus as Record<string, number> | undefined
        const types = membershipData.membershipTypesAmongActive as Array<{ type: string; count: number }> | undefined
        parts.push(`## Membership Subscription Breakdown (subscription status, NOT booking activity)
Total followers scanned: ${membershipData.totalFollowersScanned ?? 0}
Active subscriptions (users.membership_status normalized to 'active'): ${membershipData.activeSubscriptions ?? 0}

By normalized status:
${norm ? Object.entries(norm).filter(([, c]) => c > 0).map(([status, count]) => `- ${status}: ${count}`).join('\n') : '(none)'}

NOTE: Membership subscription status is a different metric from recent play activity. For "people who actually played in the Dashboard period" use Active Players from the Club Metrics block.
${raw ? `\nRaw status values (pre-normalization, for context):\n${Object.entries(raw).slice(0, 10).map(([status, count]) => `- ${status}: ${count}`).join('\n')}` : ''}
${types?.length ? `\nMembership types among active subscriptions (top 10):\n${types.map((t) => `- ${t.type}: ${t.count}`).join('\n')}` : ''}`)
      }

      if (ratedPlayers && !('error' in ratedPlayers)) {
        if (ratedPlayers.integrated === false) {
          parts.push(`## Player Skill Ratings
Primary sport: ${ratedPlayers.primarySport}
Rating system for this sport: ${ratedPlayers.ratingSystem} — NOT YET INTEGRATED
${ratedPlayers.message}`)
        } else {
          const sample = (ratedPlayers.samplePlayers as Array<{ name: string; dupr: number | null }>) || []
          // Bucket the sample for at-a-glance distribution; full
          // bracket counts would need a separate query but the top-30
          // sample is enough for the LLM to answer typical "above 4.0"
          // / "intermediate bracket" questions.
          const buckets: Record<string, number> = { 'beginner (<3.0)': 0, 'intermediate (3.0-3.49)': 0, 'competitive (3.5-3.99)': 0, 'advanced (4.0-4.49)': 0, 'elite (4.5+)': 0 }
          for (const p of sample) {
            const r = p.dupr || 0
            if (r >= 4.5) buckets['elite (4.5+)']++
            else if (r >= 4.0) buckets['advanced (4.0-4.49)']++
            else if (r >= 3.5) buckets['competitive (3.5-3.99)']++
            else if (r >= 3.0) buckets['intermediate (3.0-3.49)']++
            else if (r > 0) buckets['beginner (<3.0)']++
          }
          parts.push(`## Player Skill Ratings
Primary sport: ${ratedPlayers.primarySport}
Rating system: ${ratedPlayers.ratingSystem}
Total followers: ${ratedPlayers.totalFollowers ?? 'unknown'}
Followers with a DUPR rating on file: ${ratedPlayers.totalWithAnyRating ?? 0}

${ratedPlayers.note}

${sample.length > 0 ? `Top ${sample.length} by rating (descending):
${sample.slice(0, 10).map((p) => `- ${p.name}: ${p.dupr ?? 'unrated'}`).join('\n')}

Bracket distribution within this sample:
${Object.entries(buckets).filter(([, c]) => c > 0).map(([b, c]) => `- ${b}: ${c}`).join('\n')}` : ''}

NOTE: CourtReserve sync does NOT pull DUPR ratings (that's why the count is often 0). UTR (tennis), Playtomic (padel), and other sport-specific systems are also not yet integrated — say so plainly when asked instead of guessing.`)
        }
      }

      liveDataBlock = parts.join('\n\n')
      console.log(`[AI Chat] Pre-fetched ${parts.length} live data blocks (${liveDataBlock.length} chars)`)
    } catch (err) {
      console.error('[AI Chat] Pre-fetch failed (continuing with RAG only):', (err as Error).message)
    }

    // 7. Build system prompt with RAG context + live data + language + cross-session memory
    step = 'prompt';
    let ragContext: string;
    try {
      ragContext = buildRAGContext(ragChunks || []);
    } catch (ragBuildError) {
      console.error('[AI Chat] buildRAGContext failed:', ragBuildError instanceof Error ? ragBuildError.message : ragBuildError);
      ragContext = 'No relevant data found in the knowledge base.';
    }
    console.log(`[AI Chat] RAG status=${ragStatus}, chunks=${ragChunks.length}, contextLen=${ragContext.length}, lang=${conversationLanguage}`);

    const languageInstruction = getLanguageInstruction(conversationLanguage);

    // Resolve deep link placeholders in system prompt
    const clubBaseUrl = `/clubs/${clubId}`
    const resolvedAdvisorPrompt = ADVISOR_SYSTEM_PROMPT.replace(/\{\{clubBaseUrl\}\}/g, clubBaseUrl)

    // Load club intelligence settings for context
    let clubContextBlock = ''
    try {
      const club: any = await prisma.club.findUnique({ where: { id: clubId } })
      const intelligenceSettings = club?.automationSettings?.intelligence || null
      const autonomyPolicy = resolveAdvisorAutonomyPolicy(club?.automationSettings)
      const contactPolicy = resolveAdvisorContactPolicy({
        timeZone: intelligenceSettings?.timezone,
        automationSettings: club?.automationSettings,
      })
      const autonomyPolicyBlock = `\nCurrent agent autonomy policy:
- Welcome: ${autonomyPolicy.welcome.mode} (confidence ${autonomyPolicy.welcome.minConfidenceAuto}+, max ${autonomyPolicy.welcome.maxRecipientsAuto}, membership required ${autonomyPolicy.welcome.requireMembershipSignal ? 'yes' : 'no'})
- Slot filler: ${autonomyPolicy.slotFiller.mode} (confidence ${autonomyPolicy.slotFiller.minConfidenceAuto}+, max ${autonomyPolicy.slotFiller.maxRecipientsAuto}, membership required ${autonomyPolicy.slotFiller.requireMembershipSignal ? 'yes' : 'no'})
- Check-in: ${autonomyPolicy.checkIn.mode} (confidence ${autonomyPolicy.checkIn.minConfidenceAuto}+, max ${autonomyPolicy.checkIn.maxRecipientsAuto}, membership required ${autonomyPolicy.checkIn.requireMembershipSignal ? 'yes' : 'no'})
- Retention boost: ${autonomyPolicy.retentionBoost.mode} (confidence ${autonomyPolicy.retentionBoost.minConfidenceAuto}+, max ${autonomyPolicy.retentionBoost.maxRecipientsAuto}, membership required ${autonomyPolicy.retentionBoost.requireMembershipSignal ? 'yes' : 'no'})
- Reactivation: ${autonomyPolicy.reactivation.mode} (confidence ${autonomyPolicy.reactivation.minConfidenceAuto}+, max ${autonomyPolicy.reactivation.maxRecipientsAuto}, membership required ${autonomyPolicy.reactivation.requireMembershipSignal ? 'yes' : 'no'})
- Trial follow-up: ${autonomyPolicy.trialFollowUp.mode} (confidence ${autonomyPolicy.trialFollowUp.minConfidenceAuto}+, max ${autonomyPolicy.trialFollowUp.maxRecipientsAuto}, membership required ${autonomyPolicy.trialFollowUp.requireMembershipSignal ? 'yes' : 'no'})
- Renewal outreach: ${autonomyPolicy.renewalReactivation.mode} (confidence ${autonomyPolicy.renewalReactivation.minConfidenceAuto}+, max ${autonomyPolicy.renewalReactivation.maxRecipientsAuto}, membership required ${autonomyPolicy.renewalReactivation.requireMembershipSignal ? 'yes' : 'no'})
- Membership lifecycle auto execution: ${intelligenceSettings?.lifecycleAutoExecutionEnabled === true ? 'enabled' : 'safety-locked off for testing' }`
      const contactPolicyBlock = `\nCurrent contact policy:
- Quiet hours: ${contactPolicy.quietHours.startHour}:00-${contactPolicy.quietHours.endHour}:00 (${contactPolicy.timeZone})
- Cross-campaign cooldown: ${contactPolicy.cooldownHours} hours
- Daily contact cap: ${contactPolicy.max24h}
- Weekly contact cap: ${contactPolicy.max7d}
- Recent booking suppression window: ${contactPolicy.recentBookingLookbackDays} days`
      clubContextBlock = `${buildClubContextPrompt(intelligenceSettings)}${autonomyPolicyBlock}${contactPolicyBlock}`
    } catch { /* non-critical */ }

    const advisorStateBlock = buildAdvisorStatePrompt(
      deriveAdvisorConversationState(storedConversationMessages)
    )
    const pageContextBlock = pageContext ? `\n\nCurrent page context: ${pageContext}` : ''

    const systemPrompt = `${resolvedAdvisorPrompt}${languageInstruction}${clubContextBlock}${advisorStateBlock}${outcomeInsightsBlock}${pageContextBlock}

--- Real-Time Club Data (live from database) ---
${liveDataBlock || 'No live data available.'}
--- End of Real-Time Data ---

--- Historical Context (from knowledge base) ---
${ragContext}
--- End of Historical Context ---
${crossSessionContext}

IMPORTANT: Use the Real-Time Club Data above to answer questions about current metrics, members, occupancy, and bookings. Use Historical Context for trends and patterns. Always cite specific numbers from the data. Never say "I don't have access to data" — the data is provided above.

When answering about sessions with open spots today or tonight:
- use the dedicated "Today's Sessions With Open Spots" / "Tonight's Sessions With Open Spots" blocks first, not just the generic upcoming list;
- mention every relevant session from those blocks unless the user asked for a shorter shortlist;
- keep the event link embedded naturally inside the same session line, preferably in the event title; if needed, use short anchor text like [click here](...) in that same line;
- use the full markdown link exactly as provided, including the full URL and query string;
- copy the provided linked title exactly as given and never invent placeholder links like [Join here](#).`;

    // 7. Verify API key is available
    step = 'apikey';
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      console.error('[AI Chat] No API keys configured');
      return Response.json({
        error: 'AI service not configured',
        hint: 'Set OPENAI_API_KEY or ANTHROPIC_API_KEY in Vercel env vars.',
      }, { status: 503 });
    }

    // 8. Convert UIMessages to model messages (required in AI SDK v6)
    step = 'convert';
    let modelMessages;
    try {
      modelMessages = await convertToModelMessages(fullMessages);
      console.log(`[AI Chat] Converted ${fullMessages.length} UIMessages to ${modelMessages.length} model messages`);
    } catch (convertError) {
      console.error('[AI Chat] convertToModelMessages failed:', convertError instanceof Error ? convertError.message : convertError, 'fullMessages sample:', JSON.stringify(fullMessages.slice(0, 2)).slice(0, 500));
      return Response.json({ error: 'Failed to process messages' }, { status: 400 });
    }

    // 9. Persistence callback
    const persistMessages = async (event: { text: string; usage: { inputTokens: number | undefined; outputTokens: number | undefined } }, modelName: string, isFallback = false) => {
      if (!convId) return;
      try {
        const advisorState = clearAdvisorPendingClarification(
          deriveAdvisorConversationState(storedConversationMessages)
        )
        await prisma.aIMessage.createMany({
          data: [
            { conversationId: convId, role: 'user', content: lastUserText, metadata: {} },
            {
              conversationId: convId, role: 'assistant', content: event.text,
              metadata: {
                model: modelName,
                inputTokens: event.usage.inputTokens,
                outputTokens: event.usage.outputTokens,
                ragChunksUsed: ragChunks.length,
                language: conversationLanguage,
                ...(advisorState ? { advisorState } : {}),
                ...(isFallback ? { fallback: true } : {}),
              },
            },
          ],
        });

        const msgCount = await prisma.aIMessage.count({ where: { conversationId: convId } });
        if (msgCount <= 2) {
          await prisma.aIConversation.update({
            where: { id: convId },
            data: { title: lastUserText.slice(0, 100), updatedAt: new Date() },
          });
        } else {
          await prisma.aIConversation.update({
            where: { id: convId },
            data: { updatedAt: new Date() },
          });
        }

        // Generate/update conversation summary after enough messages (fire-and-forget)
        if (msgCount >= 6 && msgCount % 4 === 0) {
          generateConversationSummary(convId).catch(err =>
            console.error('[AI Chat] Summary generation failed:', err)
          );
        }
      } catch (err) {
        console.error('[AI Chat] Failed to persist messages:', err instanceof Error ? err.message : err);
      }
    };

    // 10. Stream with primary model, fallback on error
    step = 'stream';
    const primaryModel = process.env.AI_PRIMARY_MODEL || 'gpt-4o';
    const fallbackModelName = process.env.AI_FALLBACK_MODEL || 'claude-3-5-haiku-20241022';

    // Tools disabled for now — AI SDK v6 streamText doesn't support maxSteps,
    // so tool results can't be fed back to LLM for text generation.
    // RAG context provides all club data the LLM needs to answer questions.
    // TODO: Re-enable when AI SDK adds maxSteps support to streamText.

    let result;
    try {
      result = streamText({
        model: getModel('standard'),
        system: systemPrompt,
        messages: modelMessages,
        maxOutputTokens: 2500,
        onFinish: async (event) => persistMessages(event, primaryModel),
      });
      console.log(`[AI Chat] Stream started with model=${primaryModel}`);
    } catch (error) {
      console.warn('[AI Chat] Primary model failed, trying fallback:', error instanceof Error ? error.message : error);
      result = streamText({
        model: getFallbackModel('standard'),
        system: systemPrompt,
        messages: modelMessages,
        maxOutputTokens: 2500,
        onFinish: async (event) => persistMessages(event, fallbackModelName, true),
      });
      console.log(`[AI Chat] Stream started with fallback model=${fallbackModelName}`);
    }

    // 11. Return streaming response
    step = 'response';
    const responseHeaders: Record<string, string> = {
      'X-RAG-Status': ragStatus,
      'X-RAG-Chunks': String(ragChunks.length),
      'X-RAG-Context-Length': String(ragContext.length),
      'X-RAG-Query': encodeURIComponent(ragQueryText.slice(0, 100)),
      'X-Conversation-Language': conversationLanguage,
    };
    if (convId) {
      responseHeaders['X-Conversation-Id'] = convId;
    }

    return result.toUIMessageStreamResponse({
      headers: responseHeaders,
      onError: (error: unknown) => {
        // Map known provider failures to user-friendly text. Without this
        // the AI SDK forwards the raw error JSON into the chat stream, so
        // admins saw payloads like `{"type":"error","error":{"type":
        // "insufficient_quota",...}}` directly in the conversation — see
        // Bug #2 from the 2026-04-25 audit.
        const raw = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error || {}));
        const lower = raw.toLowerCase();
        console.error('[AI Chat] Stream error:', raw.slice(0, 500));
        if (lower.includes('insufficient_quota') || lower.includes('insufficient funds') || lower.includes('billing')) {
          return 'AI service is temporarily unavailable due to a billing issue. Please contact support — we\'re on it.';
        }
        if (lower.includes('usage_limit_reached') || lower.includes('daily limit')) {
          return 'You have reached your daily AI Advisor message limit. Upgrade your plan or try again tomorrow.';
        }
        if (lower.includes('rate_limit') || lower.includes('429') || lower.includes('rate limit')) {
          return 'The AI is overloaded right now. Please wait a few seconds and try again.';
        }
        if (lower.includes('context_length_exceeded') || lower.includes('maximum context length')) {
          return 'This conversation has gotten too long for me to follow. Start a new chat and I\'ll have a fresh memory.';
        }
        if (lower.includes('content_policy') || lower.includes('safety')) {
          return 'I can\'t help with that request. Try rephrasing it as a question about your club\'s data.';
        }
        if (lower.includes('timeout') || lower.includes('timed out')) {
          return 'The AI took too long to respond. Please try again.';
        }
        return 'Sorry, I ran into a problem answering that. Please try again, or rephrase your question.';
      },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
    console.error(`[AI Chat] FATAL at step="${step}":`, errMsg);
    return Response.json({
      error: 'Internal server error',
      step,
      detail: process.env.NODE_ENV === 'development' ? errMsg : undefined,
    }, { status: 500 });
  }
}
