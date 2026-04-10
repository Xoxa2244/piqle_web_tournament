import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, generateText, type LanguageModel } from 'ai';

// ── Provider singletons ──
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── Model tiers ──
export type ModelTier = 'fast' | 'standard' | 'premium';

const MODEL_MAP: Record<ModelTier, { primary: string; fallback: string }> = {
  fast: {
    primary: process.env.AI_PRIMARY_MODEL || 'gpt-4o-mini',
    fallback: process.env.AI_FALLBACK_MODEL || 'claude-3-5-haiku-20241022',
  },
  standard: {
    primary: process.env.AI_PRIMARY_MODEL || 'gpt-4o',
    fallback: process.env.AI_FALLBACK_MODEL || 'claude-3-5-haiku-20241022',
  },
  premium: {
    primary: process.env.AI_PREMIUM_MODEL || 'gpt-4o',
    fallback: 'claude-sonnet-4-20250514',
  },
};

export function getModel(tier: ModelTier = 'standard'): LanguageModel {
  return openai(MODEL_MAP[tier].primary);
}

export function getFallbackModel(tier: ModelTier = 'standard'): LanguageModel {
  return anthropic(MODEL_MAP[tier].fallback);
}

// ── Embedding model ──
export function getEmbeddingModel() {
  return openai.embedding(process.env.EMBEDDING_MODEL || 'text-embedding-3-small');
}

// ── Generate with fallback ──
export async function generateWithFallback(params: {
  system: string;
  prompt: string;
  tier?: ModelTier;
  maxTokens?: number;
}): Promise<{ text: string; model: string; usage: { inputTokens: number | undefined; outputTokens: number | undefined } }> {
  const { system, prompt, tier = 'standard', maxTokens = 1000 } = params;

  try {
    const result = await generateText({
      model: getModel(tier),
      system,
      prompt,
      maxOutputTokens: maxTokens,
    });
    return {
      text: result.text,
      model: MODEL_MAP[tier].primary,
      usage: result.usage,
    };
  } catch (error) {
    console.warn(`[AI] Primary model failed (${MODEL_MAP[tier].primary}), falling back to ${MODEL_MAP[tier].fallback}:`, error);

    const result = await generateText({
      model: getFallbackModel(tier),
      system,
      prompt,
      maxOutputTokens: maxTokens,
    });
    return {
      text: result.text,
      model: MODEL_MAP[tier].fallback,
      usage: result.usage,
    };
  }
}

// ── Stream with fallback (for chat) ──
export async function streamWithFallback(params: {
  system: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  tier?: ModelTier;
  maxTokens?: number;
  onFinish?: (result: { text: string; usage: { inputTokens: number | undefined; outputTokens: number | undefined } }) => void | Promise<void>;
}) {
  const { system, messages, tier = 'standard', maxTokens = 1500, onFinish } = params;

  try {
    return streamText({
      model: getModel(tier),
      system,
      messages,
      maxOutputTokens: maxTokens,
      onFinish: onFinish ? async (event) => {
        await onFinish({ text: event.text, usage: event.usage });
      } : undefined,
    });
  } catch (error) {
    console.warn(`[AI] Primary stream failed, falling back:`, error);

    return streamText({
      model: getFallbackModel(tier),
      system,
      messages,
      maxOutputTokens: maxTokens,
      onFinish: onFinish ? async (event) => {
        await onFinish({ text: event.text, usage: event.usage });
      } : undefined,
    });
  }
}

// Note: generateEmbedding/generateEmbeddings live in rag/embeddings.ts to avoid duplication
