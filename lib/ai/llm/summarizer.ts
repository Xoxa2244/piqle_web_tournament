// ── Conversation summarizer for cross-session memory ──

import { prisma } from '@/lib/prisma';
import { generateWithFallback } from './provider';

const SUMMARY_SYSTEM_PROMPT = `Summarize this conversation between a club manager and an AI advisor about their pickleball club.
Focus on: key questions asked, insights provided, decisions discussed, and any action items.
Keep the summary under 150 words. Write in the same language as the conversation.
Return ONLY the summary text, no headers or labels.`;

/**
 * Generate a summary for a conversation and persist it.
 * Uses the "fast" tier (gpt-4o-mini) for cost efficiency.
 * Should be called fire-and-forget after message persistence.
 */
export async function generateConversationSummary(conversationId: string): Promise<void> {
  const messages = await prisma.aIMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true },
  });

  // Too short to summarize meaningfully
  if (messages.length < 4) return;

  const transcript = messages
    .filter(m => m.role !== 'system')
    .map(m => `${m.role === 'user' ? 'User' : 'Advisor'}: ${m.content}`)
    .join('\n\n');

  // Truncate very long transcripts to avoid expensive summarization
  const maxTranscriptLen = 8000;
  const trimmedTranscript = transcript.length > maxTranscriptLen
    ? transcript.slice(0, maxTranscriptLen) + '\n\n[...conversation truncated...]'
    : transcript;

  const result = await generateWithFallback({
    system: SUMMARY_SYSTEM_PROMPT,
    prompt: trimmedTranscript,
    tier: 'fast',
    maxTokens: 250,
  });

  await prisma.aIConversation.update({
    where: { id: conversationId },
    data: { summary: result.text },
  });
}
