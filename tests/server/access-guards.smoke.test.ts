/** @vitest-environment node */

import { describe, expect, it, vi } from 'vitest'
import { divisionRouter } from '@/server/routers/division'
import { matchRouter } from '@/server/routers/match'

type AccessRole = 'OWNER' | 'ADMIN' | 'SCORE_ONLY' | 'NONE'

const TOURNAMENT_ID = 'tournament-1'
const DIVISION_ID = 'division-1'
const OWNER_ID = 'owner-user'
const ADMIN_ID = 'admin-user'
const SCORE_ID = 'score-user'
const NONE_ID = 'none-user'

const buildAccessRows = (role: AccessRole, userId: string) => {
  if (role === 'ADMIN') {
    return [
      {
        userId,
        tournamentId: TOURNAMENT_ID,
        divisionId: DIVISION_ID,
        accessLevel: 'ADMIN',
      },
    ]
  }

  if (role === 'SCORE_ONLY') {
    return [
      {
        userId,
        tournamentId: TOURNAMENT_ID,
        divisionId: DIVISION_ID,
        accessLevel: 'SCORE_ONLY',
      },
    ]
  }

  return []
}

const createPrismaMock = (role: AccessRole, userId: string) => {
  const divisionFindUnique = vi.fn(async (args: any) => {
    const id = args?.where?.id
    if (id !== DIVISION_ID) {
      return null
    }

    if (args?.include?.pools) {
      return {
        id: DIVISION_ID,
        name: 'Division A',
        tournamentId: TOURNAMENT_ID,
        poolCount: 1,
        pools: [{ id: 'pool-1', name: 'Pool 1', order: 1 }],
      }
    }

    return {
      tournamentId: TOURNAMENT_ID,
      tournament: {
        userId: OWNER_ID,
      },
    }
  })

  const prisma = {
    division: {
      findUnique: divisionFindUnique,
      update: vi.fn(async ({ where, data }: any) => ({
        id: where.id,
        name: data?.name ?? 'Division A',
        poolCount: data?.poolCount ?? 1,
        tournamentId: TOURNAMENT_ID,
      })),
    },
    divisionConstraints: {
      upsert: vi.fn(async () => ({})),
    },
    tournamentAccess: {
      findMany: vi.fn(async ({ where }: any) => {
        if (where?.tournamentId !== TOURNAMENT_ID || where?.userId !== userId) {
          return []
        }
        return buildAccessRows(role, userId)
      }),
    },
    match: {
      findMany: vi.fn(async () => []),
    },
    auditLog: {
      create: vi.fn(async () => ({ id: 'audit-1' })),
    },
  }

  return prisma
}

const createCtx = (userId: string, prisma: any) =>
  ({
    prisma,
    clientType: 'web',
    session: {
      user: {
        id: userId,
        email: `${userId}@example.com`,
        name: null,
        image: null,
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    },
  }) as any

describe('Access guards smoke', () => {
  it('owner can update division and list matches', async () => {
    const prisma = createPrismaMock('OWNER', OWNER_ID)
    const divisionCaller = divisionRouter.createCaller(createCtx(OWNER_ID, prisma))
    const matchCaller = matchRouter.createCaller(createCtx(OWNER_ID, prisma))

    await expect(
      divisionCaller.update({
        id: DIVISION_ID,
        name: 'Updated by owner',
      })
    ).resolves.toMatchObject({
      id: DIVISION_ID,
      name: 'Updated by owner',
    })

    await expect(
      matchCaller.listByDivision({
        divisionId: DIVISION_ID,
      })
    ).resolves.toEqual([])
  })

  it('admin can update division and list matches', async () => {
    const prisma = createPrismaMock('ADMIN', ADMIN_ID)
    const divisionCaller = divisionRouter.createCaller(createCtx(ADMIN_ID, prisma))
    const matchCaller = matchRouter.createCaller(createCtx(ADMIN_ID, prisma))

    await expect(
      divisionCaller.update({
        id: DIVISION_ID,
        name: 'Updated by admin',
      })
    ).resolves.toMatchObject({
      id: DIVISION_ID,
      name: 'Updated by admin',
    })

    await expect(
      matchCaller.listByDivision({
        divisionId: DIVISION_ID,
      })
    ).resolves.toEqual([])
  })

  it('score-only user cannot update division, but can list matches', async () => {
    const prisma = createPrismaMock('SCORE_ONLY', SCORE_ID)
    const divisionCaller = divisionRouter.createCaller(createCtx(SCORE_ID, prisma))
    const matchCaller = matchRouter.createCaller(createCtx(SCORE_ID, prisma))

    await expect(
      divisionCaller.update({
        id: DIVISION_ID,
        name: 'Should fail',
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })

    await expect(
      matchCaller.listByDivision({
        divisionId: DIVISION_ID,
      })
    ).resolves.toEqual([])
  })

  it('no-access user is blocked from update and match list', async () => {
    const prisma = createPrismaMock('NONE', NONE_ID)
    const divisionCaller = divisionRouter.createCaller(createCtx(NONE_ID, prisma))
    const matchCaller = matchRouter.createCaller(createCtx(NONE_ID, prisma))

    await expect(
      divisionCaller.update({
        id: DIVISION_ID,
        name: 'Should fail',
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })

    await expect(
      matchCaller.listByDivision({
        divisionId: DIVISION_ID,
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })

    expect(prisma.match.findMany).not.toHaveBeenCalled()
  })
})
