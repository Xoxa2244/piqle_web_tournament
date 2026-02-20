/** @vitest-environment node */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'

type RoleKey = 'owner' | 'admin' | 'score' | 'none'

type RoleSession = {
  sessionToken: string
  email: string
}

const liveConfig = {
  baseUrl: process.env.SMOKE_API_BASE_URL?.trim() || 'http://localhost:3000',
  divisionId: process.env.SMOKE_DIVISION_ID?.trim() || '',
  matchId: process.env.SMOKE_MATCH_ID?.trim() || '',
  users: {
    owner: {
      email: process.env.SMOKE_OWNER_EMAIL?.trim() || '',
      password: process.env.SMOKE_OWNER_PASSWORD?.trim() || '',
    },
    admin: {
      email: process.env.SMOKE_ADMIN_EMAIL?.trim() || '',
      password: process.env.SMOKE_ADMIN_PASSWORD?.trim() || '',
    },
    score: {
      email: process.env.SMOKE_SCORE_EMAIL?.trim() || '',
      password: process.env.SMOKE_SCORE_PASSWORD?.trim() || '',
    },
    none: {
      email: process.env.SMOKE_NONE_EMAIL?.trim() || '',
      password: process.env.SMOKE_NONE_PASSWORD?.trim() || '',
    },
  },
}

const requiredEnv = [
  ['SMOKE_DIVISION_ID', liveConfig.divisionId],
  ['SMOKE_MATCH_ID', liveConfig.matchId],
  ['SMOKE_OWNER_EMAIL', liveConfig.users.owner.email],
  ['SMOKE_OWNER_PASSWORD', liveConfig.users.owner.password],
  ['SMOKE_ADMIN_EMAIL', liveConfig.users.admin.email],
  ['SMOKE_ADMIN_PASSWORD', liveConfig.users.admin.password],
  ['SMOKE_SCORE_EMAIL', liveConfig.users.score.email],
  ['SMOKE_SCORE_PASSWORD', liveConfig.users.score.password],
  ['SMOKE_NONE_EMAIL', liveConfig.users.none.email],
  ['SMOKE_NONE_PASSWORD', liveConfig.users.none.password],
] as const

const missingEnv = requiredEnv.filter(([, value]) => !value).map(([key]) => key)
const hasLiveEnv = missingEnv.length === 0

if (!hasLiveEnv) {
  console.warn(
    `[mobile-api-smoke] Skipped live smoke test, missing env: ${missingEnv.join(', ')}`
  )
}

const describeLive = hasLiveEnv ? describe : describe.skip

const getJson = async (response: Response) => response.json().catch(() => ({}))

const signIn = async (email: string, password: string): Promise<RoleSession> => {
  const response = await fetch(`${liveConfig.baseUrl}/api/mobile/auth/signin/password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })
  const payload = await getJson(response)

  if (!response.ok || !payload?.sessionToken) {
    throw new Error(
      `[mobile-api-smoke] Sign-in failed for ${email}: ${payload?.message || response.statusText}`
    )
  }

  return {
    sessionToken: String(payload.sessionToken),
    email: String(payload?.user?.email || email),
  }
}

const signOut = async (sessionToken: string) => {
  await fetch(`${liveConfig.baseUrl}/api/mobile/auth/signout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionToken }),
  }).catch(() => {
    // no-op: cleanup best effort
  })
}

const createMobileTrpcClient = (sessionToken: string) =>
  createTRPCProxyClient<any>({
    links: [
      httpBatchLink({
        url: `${liveConfig.baseUrl}/api/mobile/trpc`,
        headers() {
          return {
            'x-client-type': 'mobile',
            cookie: [
              `next-auth.session-token=${sessionToken}`,
              `__Secure-next-auth.session-token=${sessionToken}`,
              `__Host-next-auth.session-token=${sessionToken}`,
            ].join('; '),
          }
        },
      }),
    ],
  })

const getTrpcCode = (error: unknown): string => {
  const direct = (error as any)?.data?.code
  if (typeof direct === 'string') return direct
  const shape = (error as any)?.shape?.data?.code
  if (typeof shape === 'string') return shape
  return 'UNKNOWN'
}

const expectForbidden = async (run: () => Promise<unknown>) => {
  try {
    await run()
  } catch (error) {
    expect(getTrpcCode(error)).toBe('FORBIDDEN')
    return
  }
  throw new Error('Expected FORBIDDEN, but request succeeded')
}

const fetchDivisionUpdatePayload = async (client: any) => {
  const division = await client.division.get.query({
    id: liveConfig.divisionId,
  })

  return {
    id: liveConfig.divisionId,
    name: String(division?.name || 'Division'),
    poolCount: Number(division?.poolCount || 1),
    maxTeams: typeof division?.maxTeams === 'number' ? division.maxTeams : undefined,
  }
}

const fetchMatchScorePayload = async (client: any) => {
  const matches = await client.match.listByDivision.query({
    divisionId: liveConfig.divisionId,
  })
  const match = (matches as any[]).find((item) => item.id === liveConfig.matchId)

  if (!match) {
    throw new Error(
      `[mobile-api-smoke] Match ${liveConfig.matchId} not found in division ${liveConfig.divisionId}`
    )
  }

  const firstGame = [...(Array.isArray(match.games) ? match.games : [])].sort(
    (a: any, b: any) => Number(a?.index ?? 0) - Number(b?.index ?? 0)
  )[0]

  return {
    matchId: liveConfig.matchId,
    gameIndex: Number(firstGame?.index ?? 0),
    scoreA: firstGame?.scoreA == null ? 0 : Number(firstGame.scoreA),
    scoreB: firstGame?.scoreB == null ? 0 : Number(firstGame.scoreB),
    initialLocked: Boolean(match?.locked),
  }
}

describeLive('Mobile API live smoke (roles)', () => {
  const sessions: Partial<Record<RoleKey, RoleSession>> = {}
  const clients: Partial<Record<RoleKey, any>> = {}

  beforeAll(async () => {
    for (const role of ['owner', 'admin', 'score', 'none'] as const) {
      const creds = liveConfig.users[role]
      const session = await signIn(creds.email, creds.password)
      sessions[role] = session
      clients[role] = createMobileTrpcClient(session.sessionToken)
    }
  })

  afterAll(async () => {
    await Promise.all(
      (Object.values(sessions) as RoleSession[])
        .filter(Boolean)
        .map((session) => signOut(session.sessionToken))
    )
  })

  it('owner/admin can update division; score/none are forbidden', async () => {
    const ownerPayload = await fetchDivisionUpdatePayload(clients.owner)
    const adminPayload = await fetchDivisionUpdatePayload(clients.admin)

    await expect(clients.owner.division.update.mutate(ownerPayload)).resolves.toMatchObject({
      id: liveConfig.divisionId,
    })
    await expect(clients.admin.division.update.mutate(adminPayload)).resolves.toMatchObject({
      id: liveConfig.divisionId,
    })

    await expectForbidden(() => clients.score.division.update.mutate(ownerPayload))
    await expectForbidden(() => clients.none.division.update.mutate(ownerPayload))
  }, 90_000)

  it('owner/admin/score can update score; none is forbidden', async () => {
    const ownerScore = await fetchMatchScorePayload(clients.owner)
    const adminScore = await fetchMatchScorePayload(clients.admin)
    const scoreOnlyScore = await fetchMatchScorePayload(clients.score)

    await expect(clients.owner.match.updateGameScore.mutate(ownerScore)).resolves.toMatchObject({
      index: ownerScore.gameIndex,
    })
    await expect(clients.admin.match.updateGameScore.mutate(adminScore)).resolves.toMatchObject({
      index: adminScore.gameIndex,
    })
    await expect(clients.score.match.updateGameScore.mutate(scoreOnlyScore)).resolves.toMatchObject({
      index: scoreOnlyScore.gameIndex,
    })

    await expectForbidden(() => clients.none.match.updateGameScore.mutate(ownerScore))
  }, 90_000)

  it('owner/admin can lock/unlock; score/none are forbidden', async () => {
    const ownerMatch = await fetchMatchScorePayload(clients.owner)
    const adminMatch = await fetchMatchScorePayload(clients.admin)

    const ownerLocked = await clients.owner.match.lock.mutate({ id: liveConfig.matchId })
    expect(Boolean(ownerLocked?.locked)).toBe(true)
    const ownerUnlocked = await clients.owner.match.unlock.mutate({ id: liveConfig.matchId })
    expect(Boolean(ownerUnlocked?.locked)).toBe(false)
    if (ownerMatch.initialLocked) {
      await clients.owner.match.lock.mutate({ id: liveConfig.matchId })
    }

    const adminLocked = await clients.admin.match.lock.mutate({ id: liveConfig.matchId })
    expect(Boolean(adminLocked?.locked)).toBe(true)
    const adminUnlocked = await clients.admin.match.unlock.mutate({ id: liveConfig.matchId })
    expect(Boolean(adminUnlocked?.locked)).toBe(false)
    if (adminMatch.initialLocked) {
      await clients.admin.match.lock.mutate({ id: liveConfig.matchId })
    }

    await expectForbidden(() => clients.score.match.lock.mutate({ id: liveConfig.matchId }))
    await expectForbidden(() => clients.score.match.unlock.mutate({ id: liveConfig.matchId }))
    await expectForbidden(() => clients.none.match.lock.mutate({ id: liveConfig.matchId }))
    await expectForbidden(() => clients.none.match.unlock.mutate({ id: liveConfig.matchId }))
  }, 90_000)
})
