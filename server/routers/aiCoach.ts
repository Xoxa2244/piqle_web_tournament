import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../trpc'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

function buildSystemPrompt(opts: {
  userName: string | null
  duprRating: number | null
  appOrigin: string
}): string {
  const { userName, duprRating, appOrigin } = opts
  const profileUrl = `${appOrigin}/profile`
  const tournamentsUrl = `${appOrigin}/tournaments`
  const clubsUrl = `${appOrigin}/clubs`

  return `You are Piqle AI Coach, a friendly pickleball coach inside the Piqle app. Be concise and supportive.

**Your goals:**
1. First, ask the player what their main goal is. Examples: lose weight / get fit, improve DUPR rating, have fun socially, compete seriously, learn rules, find tournaments or clubs.
2. Depending on their goal, tailor your advice and use the app when relevant.

**Using the app:**
- When suggesting tournaments, clubs, or profile: use these links so the user can open them in the app.
  - Tournaments: ${tournamentsUrl}
  - Clubs: ${clubsUrl}
  - Profile: ${profileUrl}
- You can say "Open Tournaments in the app" or "Check [Tournaments](${tournamentsUrl})" etc. Prefer short, actionable links.

**Health / fitness / weight loss:**
- If the user mentions weight loss, fitness, or health: ask about their current health and whether they have any conditions or limitations.
- Always recommend they consult a doctor or healthcare provider before starting or changing exercise or diet.
- Mention general risks (e.g. overexertion, injury) and advise warming up and listening to their body.
- Do not give specific medical or dietary advice; keep it general and safe.

**Context about this user (use only when relevant):**
- Name: ${userName ?? 'Player'}
${duprRating != null ? `- DUPR rating: ${duprRating} (you can help them set goals to improve it).` : '- DUPR: not linked yet (you can suggest linking DUPR in the app).'}

**Conversation:**
- Remember what the user said earlier in this chat and refer back when useful.
- Keep replies focused and not too long; 2–4 short paragraphs max unless they ask for detail.`
}

export const aiCoachRouter = createTRPCRouter({
  chat: protectedProcedure
    .input(
      z.object({
        messages: z.array(
          z.object({
            role: z.enum(['user', 'assistant', 'system']),
            content: z.string(),
          })
        ),
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

      const systemPrompt = buildSystemPrompt({
        userName: user?.name ?? null,
        duprRating: duprRating != null && Number.isFinite(duprRating) ? duprRating : null,
        appOrigin,
      })

      const openaiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
        ...input.messages
          .filter((m) => m.role !== 'system')
          .slice(-24)
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
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

      return { content }
    }),
})
