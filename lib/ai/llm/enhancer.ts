import { generateWithFallback } from './provider';
import {
  SLOT_FILLER_ANALYSIS_PROMPT,
  REACTIVATION_OUTREACH_PROMPT,
  WEEKLY_PLAN_NARRATIVE_PROMPT,
  PERSONA_INVITE_PROMPT,
} from './prompts';
import { composeSystem, type VoiceSettings } from '../voice-profile';
import type {
  SlotFillerRecommendation, PlaySessionData,
  ReactivationCandidate, WeeklyPlanResult,
} from '../../../types/intelligence';

/**
 * Options shared by all enhancer functions. Non-breaking: everything is
 * optional. When `voice` is provided the club's tone is baked into the
 * LLM system prompt; when `clubId` is provided the token spend is
 * attributed per-club via the provider's cost tracker.
 */
export interface EnhanceOpts {
  clubId?: string
  voice?: VoiceSettings | null
}

// ── Types for enhanced outputs ──
export interface SlotFillerEnhancement {
  userId: string;
  aiInsight: string;
  suggestedMessage: string;
}

export interface ReactivationEnhancement {
  userId: string;
  strategy: string;
  outreachDraft: string;
  timing: string;
}

export interface WeeklyPlanEnhancement {
  narrative: string;
  tip: string;
}

// ── Slot Filler LLM Enhancement ──
export async function enhanceSlotFillerWithLLM(
  recommendations: SlotFillerRecommendation[],
  session: PlaySessionData,
  opts: EnhanceOpts = {},
): Promise<SlotFillerEnhancement[]> {
  if (recommendations.length === 0) return [];

  const prompt = `Session: "${session.title}" on ${new Date(session.date).toLocaleDateString()} at ${session.startTime}.
Format: ${session.format}. Skill: ${session.skillLevel}.
${session.confirmedCount ?? 0}/${session.maxPlayers} confirmed.

Recommended players:
${recommendations.map((r, i) => `${i + 1}. ${r.member.name || r.member.email} (Score: ${r.score}/100, Likelihood: ${r.estimatedLikelihood})
   - Schedule fit: ${r.reasoning.components.schedule_fit?.explanation || 'N/A'}
   - Skill fit: ${r.reasoning.components.skill_fit?.explanation || 'N/A'}
   - DUPR: ${r.member.duprRatingDoubles || 'Unknown'}
   - userId: ${r.member.id}`).join('\n')}`;

  try {
    const result = await generateWithFallback({
      // suggestedMessage goes straight to members — voice matters.
      system: composeSystem(SLOT_FILLER_ANALYSIS_PROMPT, opts.voice),
      prompt,
      tier: 'fast',
      maxTokens: 800,
      ...(opts.clubId ? { clubId: opts.clubId, operation: 'enhanceSlotFiller' } : {}),
    });

    return parseJSON<SlotFillerEnhancement[]>(result.text, []);
  } catch (error) {
    console.error('[AI Enhance] Slot filler enhancement failed:', error);
    return [];
  }
}

// ── Reactivation LLM Enhancement ──
export async function enhanceReactivationWithLLM(
  candidates: ReactivationCandidate[],
  opts: EnhanceOpts = {},
): Promise<ReactivationEnhancement[]> {
  if (candidates.length === 0) return [];

  const prompt = `Inactive members to re-engage:
${candidates.map((c, i) => `${i + 1}. ${c.member.name || c.member.email} (Score: ${c.score}/100)
   - Inactive for ${c.daysSinceLastActivity} days
   - ${c.totalHistoricalBookings} total past bookings
   - ${c.reasoning.summary}
   - ${c.suggestedSessions.length} matching sessions available
   - userId: ${c.member.id}`).join('\n')}`;

  try {
    const result = await generateWithFallback({
      // outreachDraft is the actual win-back message — voice critical.
      system: composeSystem(REACTIVATION_OUTREACH_PROMPT, opts.voice),
      prompt,
      tier: 'fast',
      maxTokens: 800,
      ...(opts.clubId ? { clubId: opts.clubId, operation: 'enhanceReactivation' } : {}),
    });

    return parseJSON<ReactivationEnhancement[]>(result.text, []);
  } catch (error) {
    console.error('[AI Enhance] Reactivation enhancement failed:', error);
    return [];
  }
}

// ── Weekly Plan LLM Enhancement ──
export async function enhanceWeeklyPlanWithLLM(
  plan: WeeklyPlanResult,
  opts: EnhanceOpts = {},
): Promise<WeeklyPlanEnhancement | null> {
  if (plan.recommendedSessions.length === 0) return null;

  const prompt = `Player wants ${plan.targetSessions} sessions/week. Found ${plan.recommendedSessions.length}.

Recommended sessions:
${plan.recommendedSessions.map((s, i) => `${i + 1}. "${s.session.title}" — ${new Date(s.session.date).toLocaleDateString('en-US', { weekday: 'long' })} at ${s.session.startTime}
   Score: ${s.score}/100. ${s.spotsRemaining} spots left.
   Top reason: ${s.reasoning.summary}`).join('\n')}`;

  try {
    const result = await generateWithFallback({
      // Narrative is read by the player — voice matters here too.
      system: composeSystem(WEEKLY_PLAN_NARRATIVE_PROMPT, opts.voice),
      prompt,
      tier: 'fast',
      maxTokens: 300,
      ...(opts.clubId ? { clubId: opts.clubId, operation: 'enhanceWeeklyPlan' } : {}),
    });

    return parseJSON<WeeklyPlanEnhancement | null>(result.text, null);
  } catch (error) {
    console.error('[AI Enhance] Weekly plan enhancement failed:', error);
    return null;
  }
}

// ── Persona-based Invite Generation ──
export async function generateLLMInvite(params: {
  memberName: string;
  persona: string;
  sessionTitle: string;
  sessionDate: string;
  sessionTime: string;
  sessionFormat: string;
  skillLevel: string;
  clubId?: string;
  voice?: VoiceSettings | null;
}): Promise<string> {
  const prompt = `Generate an invite for ${params.memberName} (persona: ${params.persona}).
Session: "${params.sessionTitle}" on ${params.sessionDate} at ${params.sessionTime}.
Format: ${params.sessionFormat}. Skill: ${params.skillLevel}.`;

  try {
    const result = await generateWithFallback({
      // Direct invite to a member — voice drives whether it feels warm or robotic.
      system: composeSystem(PERSONA_INVITE_PROMPT, params.voice),
      prompt,
      tier: 'fast',
      maxTokens: 150,
      ...(params.clubId ? { clubId: params.clubId, operation: 'generateLLMInvite' } : {}),
    });

    return result.text.trim();
  } catch (error) {
    console.error('[AI Enhance] Invite generation failed:', error);
    return `Hey ${params.memberName}! Join us for "${params.sessionTitle}" on ${params.sessionDate} at ${params.sessionTime}. Would love to see you there!`;
  }
}

// ── JSON Parser Helper ──
function parseJSON<T>(text: string, fallback: T): T {
  try {
    // Try to extract JSON from potential markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }
    return JSON.parse(text);
  } catch {
    console.warn('[AI Enhance] Failed to parse LLM response as JSON:', text.slice(0, 200));
    return fallback;
  }
}
