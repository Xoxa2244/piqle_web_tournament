/** @vitest-environment node */

import { describe, expect, it, vi } from 'vitest'
import { divisionRouter } from '@/server/routers/division'
import { matchRouter } from '@/server/routers/match'
import { teamRouter } from '@/server/routers/team'

type AccessRole = 'OWNER' | 'ADMIN' | 'SCORE_ONLY' | 'NONE'

const TOURNAMENT_ID = 'tournament-1'
const DIVISION_ID = 'division-1'
const NEW_DIVISION_ID = 'division-new'
const TEAM_ID = 'team-1'
const MATCH_ID = 'match-1'
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
  const tournamentFindUnique = vi.fn(async (args: any) => {
    const id = args?.where?.id
    if (id !== TOURNAMENT_ID) {
      return null
    }

    if (args?.select?.userId && args?.select?.format) {
      return {
        userId: OWNER_ID,
        format: 'ROUND_ROBIN',
      }
    }

    if (args?.select?.userId) {
      return {
        userId: OWNER_ID,
      }
    }

    if (args?.select?.format) {
      return {
        format: 'ROUND_ROBIN',
      }
    }

    return {
      id: TOURNAMENT_ID,
      userId: OWNER_ID,
      format: 'ROUND_ROBIN',
    }
  })

  const divisionFindUnique = vi.fn(async (args: any) => {
    const id = args?.where?.id
    if (id !== DIVISION_ID && id !== NEW_DIVISION_ID) {
      return null
    }

    if (args?.include?.matches) {
      return null
    }

    if (args?.include?.teams && args?.include?.pools) {
      return {
        id,
        name: 'Division A',
        tournamentId: TOURNAMENT_ID,
        pools: [
          { id: 'pool-1', name: 'Pool 1', order: 1 },
          { id: 'pool-2', name: 'Pool 2', order: 2 },
        ],
        teams: [
          {
            id: 'team-1',
            teamPlayers: [{ player: { duprRating: { toNumber: () => 4.5 } } }],
          },
          {
            id: 'team-2',
            teamPlayers: [{ player: { duprRating: { toNumber: () => 4.0 } } }],
          },
          {
            id: 'team-3',
            teamPlayers: [],
          },
        ],
      }
    }

    if (args?.include?.pools) {
      return {
        id,
        name: 'Division A',
        tournamentId: TOURNAMENT_ID,
        poolCount: 1,
        pools: [{ id: 'pool-1', name: 'Pool 1', order: 1 }],
      }
    }

    if (args?.select?.tournament?.select?.userId) {
      return {
        tournamentId: TOURNAMENT_ID,
        tournament: {
          userId: OWNER_ID,
        },
      }
    }

    if (args?.select?.tournamentId) {
      return {
        tournamentId: TOURNAMENT_ID,
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
      create: vi.fn(async ({ data }: any) => ({
        id: NEW_DIVISION_ID,
        tournamentId: data.tournamentId,
        name: data.name,
      })),
      update: vi.fn(async ({ where, data }: any) => ({
        id: where.id,
        name: data?.name ?? 'Division A',
        poolCount: data?.poolCount ?? 1,
        tournamentId: TOURNAMENT_ID,
      })),
      delete: vi.fn(async ({ where }: any) => ({
        id: where.id,
      })),
    },
    divisionConstraints: {
      upsert: vi.fn(async ({ where, create, update }: any) => ({
        id: `constraints-${where?.divisionId ?? create?.divisionId ?? 'unknown'}`,
        divisionId: where?.divisionId ?? create?.divisionId,
        ...create,
        ...update,
      })),
    },
    tournament: {
      findUnique: tournamentFindUnique,
    },
    tournamentAccess: {
      findMany: vi.fn(async ({ where }: any) => {
        if (where?.tournamentId !== TOURNAMENT_ID || where?.userId !== userId) {
          return []
        }
        return buildAccessRows(role, userId)
      }),
      findFirst: vi.fn(async () => null),
    },
    team: {
      create: vi.fn(async ({ data }: any) => ({
        id: TEAM_ID,
        divisionId: data.divisionId,
        name: data.name,
      })),
      findUnique: vi.fn(async ({ where }: any) => {
        if (where?.id !== TEAM_ID) {
          return null
        }
        return {
          id: TEAM_ID,
          name: 'Team A',
          divisionId: DIVISION_ID,
          division: {
            id: DIVISION_ID,
            name: 'Division A',
            tournamentId: TOURNAMENT_ID,
          },
        }
      }),
      update: vi.fn(async ({ where, data }: any) => ({
        id: where.id,
        divisionId: data?.divisionId ?? DIVISION_ID,
        name: data?.name ?? 'Team A',
      })),
      delete: vi.fn(async ({ where }: any) => ({
        id: where.id,
      })),
    },
    teamPlayer: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    match: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async ({ where }: any) => {
        if (where?.id !== MATCH_ID) {
          return null
        }
        return {
          id: MATCH_ID,
          divisionId: DIVISION_ID,
          rrGroupId: null,
          division: {
            tournamentId: TOURNAMENT_ID,
            tournament: {
              format: 'ROUND_ROBIN',
            },
          },
          rrGroup: null,
          games: [
            {
              id: 'existing-game',
              index: 0,
              scoreA: null,
              scoreB: null,
              winner: null,
            },
          ],
          teamA: { id: 'team-a' },
          teamB: { id: 'team-b' },
          tiebreaker: null,
        }
      }),
      update: vi.fn(async ({ where, data }: any) => ({
        id: where.id,
        winnerTeamId: data?.winnerTeamId ?? null,
        locked: data?.locked,
      })),
    },
    game: {
      upsert: vi.fn(async ({ where, create, update }: any) => ({
        id: `upserted-${where?.matchId_index?.matchId}-${where?.matchId_index?.index}`,
        index: where?.matchId_index?.index ?? 0,
        scoreA: update?.scoreA ?? create?.scoreA ?? null,
        scoreB: update?.scoreB ?? create?.scoreB ?? null,
        winner: update?.winner ?? create?.winner ?? null,
      })),
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

  it('owner can update game score and create team', async () => {
    const prisma = createPrismaMock('OWNER', OWNER_ID)
    const matchCaller = matchRouter.createCaller(createCtx(OWNER_ID, prisma))
    const teamCaller = teamRouter.createCaller(createCtx(OWNER_ID, prisma))

    await expect(
      matchCaller.updateGameScore({
        matchId: MATCH_ID,
        gameIndex: 0,
        scoreA: 11,
        scoreB: 7,
      })
    ).resolves.toMatchObject({
      id: `upserted-${MATCH_ID}-0`,
      scoreA: 11,
      scoreB: 7,
    })

    await expect(
      teamCaller.create({
        divisionId: DIVISION_ID,
        name: 'Created by owner',
      })
    ).resolves.toMatchObject({
      id: TEAM_ID,
      divisionId: DIVISION_ID,
    })
  })

  it('admin can update score and update team', async () => {
    const prisma = createPrismaMock('ADMIN', ADMIN_ID)
    const matchCaller = matchRouter.createCaller(createCtx(ADMIN_ID, prisma))
    const teamCaller = teamRouter.createCaller(createCtx(ADMIN_ID, prisma))

    await expect(
      matchCaller.updateGameScore({
        matchId: MATCH_ID,
        gameIndex: 0,
        scoreA: 9,
        scoreB: 11,
      })
    ).resolves.toMatchObject({
      id: `upserted-${MATCH_ID}-0`,
      scoreA: 9,
      scoreB: 11,
    })

    await expect(
      teamCaller.update({
        id: TEAM_ID,
        name: 'Renamed by admin',
      })
    ).resolves.toMatchObject({
      id: TEAM_ID,
      name: 'Renamed by admin',
    })
  })

  it('score-only user can update game score but cannot create team', async () => {
    const prisma = createPrismaMock('SCORE_ONLY', SCORE_ID)
    const matchCaller = matchRouter.createCaller(createCtx(SCORE_ID, prisma))
    const teamCaller = teamRouter.createCaller(createCtx(SCORE_ID, prisma))

    await expect(
      matchCaller.updateGameScore({
        matchId: MATCH_ID,
        gameIndex: 0,
        scoreA: 11,
        scoreB: 3,
      })
    ).resolves.toMatchObject({
      id: `upserted-${MATCH_ID}-0`,
      scoreA: 11,
      scoreB: 3,
    })

    await expect(
      teamCaller.create({
        divisionId: DIVISION_ID,
        name: 'Should fail',
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(prisma.team.create).not.toHaveBeenCalled()
  })

  it('no-access user is blocked from score update and team create', async () => {
    const prisma = createPrismaMock('NONE', NONE_ID)
    const matchCaller = matchRouter.createCaller(createCtx(NONE_ID, prisma))
    const teamCaller = teamRouter.createCaller(createCtx(NONE_ID, prisma))

    await expect(
      matchCaller.updateGameScore({
        matchId: MATCH_ID,
        gameIndex: 0,
        scoreA: 8,
        scoreB: 11,
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(
      teamCaller.create({
        divisionId: DIVISION_ID,
        name: 'Should fail',
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })

    expect(prisma.game.upsert).not.toHaveBeenCalled()
    expect(prisma.team.create).not.toHaveBeenCalled()
  })

  it('owner can create/delete division and lock/unlock match', async () => {
    const prisma = createPrismaMock('OWNER', OWNER_ID)
    const divisionCaller = divisionRouter.createCaller(createCtx(OWNER_ID, prisma))
    const matchCaller = matchRouter.createCaller(createCtx(OWNER_ID, prisma))

    await expect(
      divisionCaller.create({
        tournamentId: TOURNAMENT_ID,
        name: 'Owner Division',
        teamKind: 'DOUBLES_2v2',
        pairingMode: 'FIXED',
      })
    ).resolves.toMatchObject({
      id: NEW_DIVISION_ID,
      tournamentId: TOURNAMENT_ID,
      name: 'Owner Division',
    })

    await expect(
      divisionCaller.delete({
        id: DIVISION_ID,
      })
    ).resolves.toMatchObject({
      id: DIVISION_ID,
    })

    await expect(
      matchCaller.lock({
        id: MATCH_ID,
      })
    ).resolves.toMatchObject({
      id: MATCH_ID,
      locked: true,
    })

    await expect(
      matchCaller.unlock({
        id: MATCH_ID,
      })
    ).resolves.toMatchObject({
      id: MATCH_ID,
      locked: false,
    })
  })

  it('admin can create/delete division and lock/unlock match', async () => {
    const prisma = createPrismaMock('ADMIN', ADMIN_ID)
    const divisionCaller = divisionRouter.createCaller(createCtx(ADMIN_ID, prisma))
    const matchCaller = matchRouter.createCaller(createCtx(ADMIN_ID, prisma))

    await expect(
      divisionCaller.create({
        tournamentId: TOURNAMENT_ID,
        name: 'Admin Division',
        teamKind: 'DOUBLES_2v2',
        pairingMode: 'FIXED',
      })
    ).resolves.toMatchObject({
      id: NEW_DIVISION_ID,
      tournamentId: TOURNAMENT_ID,
      name: 'Admin Division',
    })

    await expect(
      divisionCaller.delete({
        id: DIVISION_ID,
      })
    ).resolves.toMatchObject({
      id: DIVISION_ID,
    })

    await expect(
      matchCaller.lock({
        id: MATCH_ID,
      })
    ).resolves.toMatchObject({
      id: MATCH_ID,
      locked: true,
    })

    await expect(
      matchCaller.unlock({
        id: MATCH_ID,
      })
    ).resolves.toMatchObject({
      id: MATCH_ID,
      locked: false,
    })
  })

  it('score-only user is blocked from division create/delete and lock/unlock', async () => {
    const prisma = createPrismaMock('SCORE_ONLY', SCORE_ID)
    const divisionCaller = divisionRouter.createCaller(createCtx(SCORE_ID, prisma))
    const matchCaller = matchRouter.createCaller(createCtx(SCORE_ID, prisma))

    await expect(
      divisionCaller.create({
        tournamentId: TOURNAMENT_ID,
        name: 'Should fail',
        teamKind: 'DOUBLES_2v2',
        pairingMode: 'FIXED',
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })

    await expect(
      divisionCaller.delete({
        id: DIVISION_ID,
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })

    await expect(
      matchCaller.lock({
        id: MATCH_ID,
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })

    await expect(
      matchCaller.unlock({
        id: MATCH_ID,
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })

    expect(prisma.division.create).not.toHaveBeenCalled()
    expect(prisma.division.delete).not.toHaveBeenCalled()
  })

  it('no-access user is blocked from admin-only division and lock actions', async () => {
    const prisma = createPrismaMock('NONE', NONE_ID)
    const divisionCaller = divisionRouter.createCaller(createCtx(NONE_ID, prisma))
    const matchCaller = matchRouter.createCaller(createCtx(NONE_ID, prisma))

    await expect(
      divisionCaller.create({
        tournamentId: TOURNAMENT_ID,
        name: 'Should fail',
        teamKind: 'DOUBLES_2v2',
        pairingMode: 'FIXED',
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })

    await expect(
      divisionCaller.delete({
        id: DIVISION_ID,
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })

    await expect(
      matchCaller.lock({
        id: MATCH_ID,
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })

    await expect(
      matchCaller.unlock({
        id: MATCH_ID,
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })

    expect(prisma.division.create).not.toHaveBeenCalled()
    expect(prisma.division.delete).not.toHaveBeenCalled()
  })

  it('owner/admin can set constraints and distribute teams by dupr', async () => {
    const ownerPrisma = createPrismaMock('OWNER', OWNER_ID)
    const adminPrisma = createPrismaMock('ADMIN', ADMIN_ID)
    const ownerCaller = divisionRouter.createCaller(createCtx(OWNER_ID, ownerPrisma))
    const adminCaller = divisionRouter.createCaller(createCtx(ADMIN_ID, adminPrisma))

    await expect(
      ownerCaller.setConstraints({
        divisionId: DIVISION_ID,
        minDupr: 3.2,
        maxDupr: 5.0,
        genders: 'MIXED',
      })
    ).resolves.toMatchObject({
      divisionId: DIVISION_ID,
      genders: 'MIXED',
    })
    await expect(
      ownerCaller.distributeTeamsByDupr({
        divisionId: DIVISION_ID,
      })
    ).resolves.toMatchObject({
      success: true,
    })

    await expect(
      adminCaller.setConstraints({
        divisionId: DIVISION_ID,
        minDupr: 3.0,
        maxDupr: 5.5,
        genders: 'ANY',
      })
    ).resolves.toMatchObject({
      divisionId: DIVISION_ID,
      genders: 'ANY',
    })
    await expect(
      adminCaller.distributeTeamsByDupr({
        divisionId: DIVISION_ID,
      })
    ).resolves.toMatchObject({
      success: true,
    })

    expect(ownerPrisma.team.update).toHaveBeenCalled()
    expect(adminPrisma.team.update).toHaveBeenCalled()
  })

  it('score-only/no-access are blocked from constraints and dupr distribution', async () => {
    const scorePrisma = createPrismaMock('SCORE_ONLY', SCORE_ID)
    const nonePrisma = createPrismaMock('NONE', NONE_ID)
    const scoreCaller = divisionRouter.createCaller(createCtx(SCORE_ID, scorePrisma))
    const noneCaller = divisionRouter.createCaller(createCtx(NONE_ID, nonePrisma))

    await expect(
      scoreCaller.setConstraints({
        divisionId: DIVISION_ID,
        minDupr: 3.4,
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(
      scoreCaller.distributeTeamsByDupr({
        divisionId: DIVISION_ID,
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })

    await expect(
      noneCaller.setConstraints({
        divisionId: DIVISION_ID,
        minDupr: 3.4,
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(
      noneCaller.distributeTeamsByDupr({
        divisionId: DIVISION_ID,
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })

    expect(scorePrisma.team.update).not.toHaveBeenCalled()
    expect(nonePrisma.team.update).not.toHaveBeenCalled()
  })
})
