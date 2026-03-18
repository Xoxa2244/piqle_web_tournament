import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../trpc'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

const ROLE_SCHEMA = z.enum(['user', 'assistant', 'system'])
type ChatRole = z.infer<typeof ROLE_SCHEMA>

type CoachMemory = {
  goal?: string | null
  health?: string | null
  schedule?: string | null
  experience?: string | null
  constraints?: string | null
  duprGoal?: string | null
}

const safeString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

function buildSystemPrompt(opts: {
  userName: string | null
  duprRating: number | null
  appOrigin: string
  memory?: CoachMemory | null
}): string {
  const { userName, duprRating, appOrigin } = opts
  const profileUrl = `${appOrigin}/profile`
  const tournamentsUrl = `${appOrigin}/tournaments`
  const clubsUrl = `${appOrigin}/clubs`
  const memory = opts.memory ?? null

  const known = [
    memory?.goal ? `- Goal: ${memory.goal}` : null,
    memory?.experience ? `- Experience/level: ${memory.experience}` : null,
    memory?.schedule ? `- Schedule: ${memory.schedule}` : null,
    memory?.constraints ? `- Constraints: ${memory.constraints}` : null,
    memory?.health ? `- Health/injuries: ${memory.health}` : null,
    memory?.duprGoal ? `- DUPR goal: ${memory.duprGoal}` : null,
  ].filter(Boolean)

  return `You are **Piqle AI Coach**, a friendly and practical pickleball coach inside the Piqle app.

**Primary objective**
- Start by asking the player what their main goal is (examples: lose weight/get fit, improve DUPR rating, prepare for a tournament, learn rules/strategy, find clubs/tournaments, have more fun socially).
- Then tailor your guidance to that goal and follow up with 1–3 short questions to clarify skill level, schedule, and constraints.

**Required onboarding questions (must be answered or re-asked):**
If you do not already know the answers from the "Known player context" below or recent messages, ask these before giving a detailed plan:
1) What is your main goal right now?
2) What is your current level / experience (beginner/intermediate/advanced) and what shots feel hardest?
3) How often can you play/practice each week (time available)?
4) Any injuries/health limitations or anything I should be careful about?

**Your goals:**
1. Help with skill development: drills, tactics, shot selection, partner communication, match preparation.
2. Help with planning: simple weekly practice plan, warm-up routines, tournament prep checklists.
3. Help them use the Piqle app when relevant (links below).

**Using the app:**
- When suggesting tournaments, clubs, or their profile, use these links so the user can open them in the app:
  - Tournaments: ${tournamentsUrl}
  - Clubs: ${clubsUrl}
  - Profile: ${profileUrl}
- Prefer short, actionable links like: "Open [Tournaments](${tournamentsUrl})".

**Health / fitness / weight loss:**
- If the user mentions weight loss, fitness, injury, pain, or health: ask about their current health status and limitations.
- Include general safety guidance: warm-up, gradual progression, rest, hydration, stop if sharp pain/dizziness.
- Recommend consulting a qualified clinician before major exercise/diet changes, especially with conditions or injuries.
- Do **not** provide medical diagnosis or specific diet/medication instructions.

**Context about this user (use only when relevant):**
- Name: ${userName ?? 'Player'}
${duprRating != null ? `- DUPR rating: ${duprRating} (you can help them set goals to improve it).` : '- DUPR: not linked yet (you can suggest linking DUPR in the app).'}

**Known player context (sticky memory):**
${known.length ? known.join('\n') : '- (no saved context yet)'}

**Conversation:**
- Treat prior messages as memory/context and refer back to them when useful (goals, constraints, injuries, schedule).
- Keep replies focused and not too long: 2–4 short paragraphs max unless they ask for detail.
- When you give a plan, keep it simple and specific (e.g., 2 drills + 1 match goal).`
}

const normalizeRole = (role: string): ChatRole => {
  const parsed = ROLE_SCHEMA.safeParse(role)
  return parsed.success ? parsed.data : 'user'
}

const mergeMemory = (prev: CoachMemory | null, next: CoachMemory | null): CoachMemory => {
  const base = prev ?? {}
  const incoming = next ?? {}
  const merged: CoachMemory = { ...base }
  for (const key of Object.keys(incoming) as Array<keyof CoachMemory>) {
    const value = safeString(incoming[key])
    if (value) merged[key] = value
  }
  return merged
}

const extractMemoryFromUserMessage = async (args: {
  apiKey: string
  userMessage: string
  currentMemory: CoachMemory | null
}): Promise<CoachMemory | null> => {
  const { apiKey, userMessage, currentMemory } = args
  const res = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 220,
      messages: [
        {
          role: 'system',
          content:
            'You extract structured onboarding context for a pickleball AI coach. ' +
            'Return ONLY valid JSON with keys: goal, experience, schedule, health, constraints, duprGoal. ' +
            'Use strings or null. If nothing new, return {}. Do not include explanations.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            currentMemory: currentMemory ?? {},
            userMessage,
          }),
        },
      ],
    }),
  })

  if (!res.ok) return null
  const data = (await res.json()) as any
  const text = String(data?.choices?.[0]?.message?.content ?? '').trim()
  if (!text) return null

  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object') {
      return {
        goal: safeString(parsed.goal) || null,
        experience: safeString(parsed.experience) || null,
        schedule: safeString(parsed.schedule) || null,
        health: safeString(parsed.health) || null,
        constraints: safeString(parsed.constraints) || null,
        duprGoal: safeString(parsed.duprGoal) || null,
      }
    }
  } catch {}

  return null
}

export const aiCoachRouter = createTRPCRouter({
  history: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50
      const rows = await ctx.prisma.aiCoachMessage.findMany({
        where: { userId: ctx.session.user.id },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: { id: true, role: true, content: true, createdAt: true },
      })
      return rows.map((row: any) => ({
        id: row.id,
        role: normalizeRole(row.role),
        content: row.content,
        createdAt: row.createdAt,
      }))
    }),

  chat: protectedProcedure
    .input(
      z.object({
        // Backwards compatible: older clients send the full message array.
        messages: z
          .array(
            z.object({
              role: ROLE_SCHEMA,
              content: z.string(),
            })
          )
          .optional(),
        // Newer clients can send only the latest user message.
        message: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const apiKey = process.env.OPENAI_API_KEY?.trim()
      if (!apiKey) {
        throw new Error('AI Coach is not configured. Set OPENAI_API_KEY on the server.')
      }

      const userId = ctx.session.user.id
      const appOrigin = ctx.requestOrigin ?? 'https://piqle.io'

      const [user, player] = await Promise.all([
        ctx.prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        }),
        ctx.prisma.player.findFirst({
          where: { userId },
          select: { duprRating: true },
        }),
      ])

      const duprRaw = player?.duprRating
      const duprRating =
        duprRaw != null && typeof duprRaw === 'object' && 'toNumber' in duprRaw
          ? (duprRaw as { toNumber: () => number }).toNumber()
          : typeof duprRaw === 'number'
            ? duprRaw
            : null

      const latestUserMessage =
        typeof input.message === 'string' && input.message.trim().length > 0
          ? input.message.trim()
          : (input.messages ?? []).slice().reverse().find((m) => m.role === 'user')?.content?.trim() || ''

      if (!latestUserMessage) {
        throw new Error('Message cannot be empty.')
      }

      // Persist the new user message (memory/context).
      await ctx.prisma.aiCoachMessage.create({
        data: {
          userId,
          role: 'user',
          content: latestUserMessage,
        },
      })

      const existingState = await ctx.prisma.aiCoachState.findUnique({
        where: { userId },
        select: { id: true, memory: true },
      })
      const currentMemory = (existingState?.memory ?? {}) as CoachMemory

      const extracted = await extractMemoryFromUserMessage({
        apiKey,
        userMessage: latestUserMessage,
        currentMemory,
      })
      const mergedMemory = mergeMemory(currentMemory, extracted)
      await ctx.prisma.aiCoachState.upsert({
        where: { userId },
        create: { userId, memory: mergedMemory as any },
        update: { memory: mergedMemory as any },
      })

      const systemPrompt = buildSystemPrompt({
        userName: user?.name ?? null,
        duprRating: duprRating != null && Number.isFinite(duprRating) ? duprRating : null,
        appOrigin,
        memory: mergedMemory,
      })

      // Load recent history for context (excluding any system prompt).
      const historyRows = await ctx.prisma.aiCoachMessage.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        take: 24,
        select: { role: true, content: true },
      })

      const openaiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
        ...historyRows
          .filter((m: any) => m.role === 'user' || m.role === 'assistant')
          .slice(-24)
          .map((m: any) => ({
            role: normalizeRole(m.role) as 'user' | 'assistant',
            content: String(m.content ?? ''),
          })),
      ]

      const res = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: openaiMessages,
          max_tokens: 600,
          temperature: 0.7,
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error('[aiCoach] OpenAI API error', res.status, errText)
        throw new Error(
          res.status === 429
            ? 'Too many requests. Please try again in a moment.'
            : 'AI Coach is temporarily unavailable. Please try again.'
        )
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
        error?: { message?: string }
      }

      if (data.error?.message) {
        throw new Error(data.error.message)
      }

      const content = data.choices?.[0]?.message?.content?.trim()
      if (content == null) {
        throw new Error('No response from AI Coach.')
      }

      // Persist assistant reply.
      await ctx.prisma.aiCoachMessage.create({
        data: {
          userId,
          role: 'assistant',
          content,
        },
      })

      return { content }
    }),
})
