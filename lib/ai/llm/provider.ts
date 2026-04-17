import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, generateText, type LanguageModel } from 'ai';
import { trackUsage } from './usage-tracker';

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

// ── Timeout wrapper ──
const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds per call

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}

// ── Retry with exponential backoff ──
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  const { maxRetries = 2, baseDelayMs = 500, label = 'llm call' } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt); // 500ms, 1000ms, 2000ms
        console.warn(`[AI] ${label} attempt ${attempt + 1} failed, retrying in ${delay}ms:`, (error as Error).message?.slice(0, 160));
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ── Generate with fallback ──
export async function generateWithFallback(params: {
  system: string;
  prompt: string;
  tier?: ModelTier;
  maxTokens?: number;
  /** Per-call timeout in ms. Defaults to 30s. */
  timeoutMs?: number;
  /** Club ID + operation name — when provided, usage is tracked for cost visibility. */
  clubId?: string;
  operation?: string;
}): Promise<{ text: string; model: string; usage: { inputTokens: number | undefined; outputTokens: number | undefined } }> {
  const { system, prompt, tier = 'standard', maxTokens = 1000, timeoutMs = DEFAULT_TIMEOUT_MS, clubId, operation } = params;

  const recordUsage = (modelName: string, inputTokens: number | undefined, outputTokens: number | undefined) => {
    if (!clubId || !operation) return; // tracking is opt-in
    // Fire-and-forget — trackUsage handles its own errors
    void trackUsage({
      clubId,
      model: modelName,
      operation,
      promptTokens: inputTokens ?? 0,
      completionTokens: outputTokens ?? 0,
    });
  };

  // Try primary with timeout + retry. On persistent failure, fall back to secondary (no retry).
  try {
    const result = await retryWithBackoff(
      () =>
        withTimeout(
          generateText({
            model: getModel(tier),
            system,
            prompt,
            maxOutputTokens: maxTokens,
          }),
          timeoutMs,
          `generateText(${MODEL_MAP[tier].primary})`,
        ),
      { maxRetries: 2, label: MODEL_MAP[tier].primary },
    );
    recordUsage(MODEL_MAP[tier].primary, result.usage.inputTokens, result.usage.outputTokens);
    return {
      text: result.text,
      model: MODEL_MAP[tier].primary,
      usage: result.usage,
    };
  } catch (error) {
    console.warn(`[AI] Primary model failed after retries (${MODEL_MAP[tier].primary}), falling back to ${MODEL_MAP[tier].fallback}:`, (error as Error).message?.slice(0, 200));

    const result = await withTimeout(
      generateText({
        model: getFallbackModel(tier),
        system,
        prompt,
        maxOutputTokens: maxTokens,
      }),
      timeoutMs,
      `generateText(${MODEL_MAP[tier].fallback})`,
    );
    recordUsage(MODEL_MAP[tier].fallback, result.usage.inputTokens, result.usage.outputTokens);
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
  /** Club ID + operation name — when provided, usage is tracked for cost visibility. */
  clubId?: string;
  operation?: string;
}) {
  const { system, messages, tier = 'standard', maxTokens = 1500, onFinish, clubId, operation } = params;

  // Build a wrapped onFinish that records usage before delegating to the caller's handler
  const buildOnFinish = (modelName: string) => async (event: { text: string; usage: { inputTokens: number | undefined; outputTokens: number | undefined } }) => {
    if (clubId && operation) {
      void trackUsage({
        clubId,
        model: modelName,
        operation,
        promptTokens: event.usage.inputTokens ?? 0,
        completionTokens: event.usage.outputTokens ?? 0,
      });
    }
    if (onFinish) {
      await onFinish({ text: event.text, usage: event.usage });
    }
  };

  try {
    return streamText({
      model: getModel(tier),
      system,
      messages,
      maxOutputTokens: maxTokens,
      onFinish: buildOnFinish(MODEL_MAP[tier].primary),
    });
  } catch (error) {
    console.warn(`[AI] Primary stream failed, falling back:`, error);

    return streamText({
      model: getFallbackModel(tier),
      system,
      messages,
      maxOutputTokens: maxTokens,
      onFinish: buildOnFinish(MODEL_MAP[tier].fallback),
    });
  }
}

// Note: generateEmbedding/generateEmbeddings live in rag/embeddings.ts to avoid duplication
