import type { PrismaClient } from '@prisma/client'

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)

const daysAgo = (days: number) => new Date(Date.now() - days * 86400000)

type BellExtra = Record<string, unknown> & { _sort: string }

/**
 * Дополнительные пункты для колокольчика (доступ к турниру, вейтлист, регистрация, матчи, платежи).
 * Склеиваются в `notification.list` вместе с приглашениями, клубами и фидбеком.
 */
export async function buildExtraBellItems(prisma: PrismaClient, userId: string): Promise<BellExtra[]> {
  const extra: BellExtra[] = []

  try {
    const owned = await prisma.tournament.findMany({
      where: { userId },
      select: { id: true },
    })
    const ownedIds = owned.map((o) => o.id)
    if (ownedIds.length > 0) {
      const pendingAccess = await prisma.tournamentAccessRequest.findMany({
        where: { tournamentId: { in: ownedIds }, status: 'PENDING' },
        include: {
          user: { select: { name: true, email: true, image: true } },
          tournament: { select: { id: true, title: true, image: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      })
      for (const req of pendingAccess) {
        const requester = req.user?.name || req.user?.email || 'Someone'
        const t = req.createdAt.toISOString()
        extra.push({
          _sort: t,
          id: `tournament-access-pending-${req.id}`,
          type: 'TOURNAMENT_ACCESS_PENDING',
          title: 'Tournament access request',
          body: `${requester} requested staff access for "${req.tournament.title}".`,
          createdAt: t,
          readAt: null,
          targetUrl: `/tournaments/${req.tournament.id}`,
          tournamentId: req.tournament.id,
          tournamentImage: req.tournament.image ?? null,
          userAvatarUrl: req.user?.image ?? null,
          requesterName: requester,
          requestId: req.id,
        })
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const approved = await prisma.tournamentAccessRequest.findMany({
      where: { userId, status: 'APPROVED', updatedAt: { gte: daysAgo(90) } },
      include: { tournament: { select: { id: true, title: true, image: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 15,
    })
    for (const req of approved) {
      const t = req.updatedAt.toISOString()
      extra.push({
        _sort: t,
        id: `tournament-access-approved-${req.id}`,
        type: 'TOURNAMENT_ACCESS_GRANTED',
        title: 'Tournament access approved',
        body: `You can now help run "${req.tournament.title}".`,
        createdAt: t,
        readAt: null,
        targetUrl: `/tournaments/${req.tournament.id}`,
        tournamentId: req.tournament.id,
        tournamentImage: req.tournament.image ?? null,
      })
    }
  } catch {
    /* ignore */
  }

  try {
    const rejectAudits = await prisma.auditLog.findMany({
      where: { action: 'REJECT_ACCESS_REQUEST', createdAt: { gte: daysAgo(90) } },
      orderBy: { createdAt: 'desc' },
      take: 80,
      include: { tournament: { select: { id: true, title: true, image: true } } },
    })
    for (const a of rejectAudits) {
      const uid = (a.payload as { userId?: string } | null)?.userId
      if (uid !== userId) continue
      const t = a.createdAt.toISOString()
      extra.push({
        _sort: t,
        id: `tournament-access-denied-${a.id}`,
        type: 'TOURNAMENT_ACCESS_DENIED',
        title: 'Access request declined',
        body: `Your request to help run "${a.tournament.title}" was declined.`,
        createdAt: t,
        readAt: null,
        targetUrl: `/tournaments/${a.tournament.id}`,
        tournamentId: a.tournament.id,
        tournamentImage: a.tournament.image ?? null,
      })
    }
  } catch {
    /* ignore */
  }

  try {
    const promoAudits = await prisma.auditLog.findMany({
      where: { action: 'WAITLIST_MOVE_TO_SLOT', createdAt: { gte: daysAgo(90) } },
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: { tournament: { select: { id: true, title: true, image: true } } },
    })
    for (const a of promoAudits) {
      const teamId = (a.payload as { teamId?: string } | null)?.teamId
      if (!teamId) continue
      const tp = await prisma.teamPlayer.findFirst({
        where: { teamId, player: { userId } },
        select: { id: true },
      })
      if (!tp) continue
      const t = a.createdAt.toISOString()
      extra.push({
        _sort: t,
        id: `waitlist-promoted-${a.id}`,
        type: 'WAITLIST_PROMOTED',
        title: 'Moved off waitlist',
        body: `You're in the draw for "${a.tournament.title}".`,
        createdAt: t,
        readAt: null,
        targetUrl: `/tournaments/${a.tournament.id}`,
        tournamentId: a.tournament.id,
        tournamentImage: a.tournament.image ?? null,
      })
    }
  } catch {
    /* ignore */
  }

  try {
    const wlJoins = await prisma.auditLog.findMany({
      where: {
        action: 'PLAYER_JOIN_WAITLIST',
        actorUserId: userId,
        createdAt: { gte: daysAgo(90) },
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: { tournament: { select: { id: true, title: true, image: true } } },
    })
    for (const a of wlJoins) {
      const t = a.createdAt.toISOString()
      extra.push({
        _sort: t,
        id: `waitlist-joined-${a.id}`,
        type: 'REGISTRATION_WAITLIST',
        title: 'Waitlist spot',
        body: `You're on the waitlist for "${a.tournament.title}".`,
        createdAt: t,
        readAt: null,
        targetUrl: `/tournaments/${a.tournament.id}`,
        tournamentId: a.tournament.id,
        tournamentImage: a.tournament.image ?? null,
      })
    }
  } catch {
    /* ignore */
  }

  try {
    const payments = await prisma.payment.findMany({
      where: { player: { userId }, updatedAt: { gte: daysAgo(90) } },
      orderBy: { updatedAt: 'desc' },
      take: 25,
      include: { tournament: { select: { title: true, image: true } } },
    })
    const now = Date.now()
    for (const p of payments) {
      const title = p.tournament.title
      const t = p.updatedAt.toISOString()
      if (p.status === 'PAID') {
        extra.push({
          _sort: t,
          id: `payment-paid-${p.id}`,
          type: 'PAYMENT_STATUS',
          title: 'Payment received',
          body: `Entry fee paid for "${title}".`,
          createdAt: t,
          readAt: null,
          targetUrl: `/tournaments/${p.tournamentId}`,
          tournamentId: p.tournamentId,
          tournamentImage: p.tournament.image ?? null,
          paymentStatus: 'PAID',
        })
      } else if (p.status === 'FAILED') {
        extra.push({
          _sort: t,
          id: `payment-failed-${p.id}`,
          type: 'PAYMENT_STATUS',
          title: 'Payment failed',
          body: `We couldn't process payment for "${title}". Try again from registration.`,
          createdAt: t,
          readAt: null,
          targetUrl: `/tournaments/${p.tournamentId}`,
          tournamentId: p.tournamentId,
          tournamentImage: p.tournament.image ?? null,
          paymentStatus: 'FAILED',
        })
      } else if (p.status === 'CANCELED') {
        extra.push({
          _sort: t,
          id: `payment-canceled-${p.id}`,
          type: 'PAYMENT_STATUS',
          title: 'Payment canceled',
          body: `Checkout was canceled for "${title}".`,
          createdAt: t,
          readAt: null,
          targetUrl: `/tournaments/${p.tournamentId}`,
          tournamentId: p.tournamentId,
          tournamentImage: p.tournament.image ?? null,
          paymentStatus: 'CANCELED',
        })
      } else if (p.status === 'PENDING' && p.dueAt) {
        const due = p.dueAt.getTime()
        if (due > now && due < now + 7 * 24 * 60 * 60 * 1000) {
          extra.push({
            _sort: p.dueAt.toISOString(),
            id: `payment-due-${p.id}`,
            type: 'PAYMENT_STATUS',
            title: 'Payment due',
            body: `Complete entry fee for "${title}" before ${fmtDate(p.dueAt)}.`,
            createdAt: p.updatedAt.toISOString(),
            readAt: null,
            targetUrl: `/tournaments/${p.tournamentId}`,
            tournamentId: p.tournamentId,
            tournamentImage: p.tournament.image ?? null,
            paymentStatus: 'PENDING',
          })
        }
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const players = await prisma.player.findMany({
      where: { userId },
      select: { id: true },
    })
    const playerIds = players.map((p) => p.id)
    if (playerIds.length === 0) return extra

    const tps = await prisma.teamPlayer.findMany({
      where: { playerId: { in: playerIds } },
      select: { teamId: true },
    })
    const teamIds = Array.from(new Set(tps.map((x) => x.teamId)))
    if (teamIds.length === 0) return extra

    const dayStart = new Date()
    dayStart.setUTCHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 3)

    const rrMatches = await prisma.match.findMany({
      where: {
        winnerTeamId: null,
        matchDayId: { not: null },
        matchDay: { date: { gte: dayStart, lt: dayEnd } },
        OR: [{ teamAId: { in: teamIds } }, { teamBId: { in: teamIds } }],
      },
      include: {
        matchDay: true,
        division: { include: { tournament: { select: { id: true, title: true, image: true } } } },
        teamA: { select: { name: true } },
        teamB: { select: { name: true } },
      },
      take: 20,
    })

    for (const m of rrMatches) {
      const div = m.division
      const tour = div?.tournament
      if (!tour || !m.matchDay) continue
      const dayLabel = fmtDate(m.matchDay.date)
      const t = m.matchDay.date.toISOString()
      extra.push({
        _sort: t,
        id: `match-reminder-rr-${m.id}`,
        type: 'MATCH_REMINDER',
        title: 'Upcoming match',
        body: `"${tour.title}" · ${m.teamA.name} vs ${m.teamB.name} (${dayLabel})`,
        createdAt: t,
        readAt: null,
        targetUrl: `/tournaments/${tour.id}`,
        tournamentId: tour.id,
        tournamentImage: tour.image ?? null,
      })
    }

    const indy = await prisma.indyMatchup.findMany({
      where: {
        status: { in: ['PENDING', 'READY', 'IN_PROGRESS'] },
        matchDay: { date: { gte: dayStart, lt: dayEnd } },
        OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],
      },
      include: {
        matchDay: true,
        division: { include: { tournament: { select: { id: true, title: true, image: true } } } },
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
      take: 20,
    })

    for (const m of indy) {
      const tour = m.division?.tournament
      if (!tour || !m.matchDay) continue
      const dayLabel = fmtDate(m.matchDay.date)
      const t = m.matchDay.date.toISOString()
      extra.push({
        _sort: t,
        id: `match-reminder-indy-${m.id}`,
        type: 'MATCH_REMINDER',
        title: 'Upcoming match',
        body: `"${tour.title}" · ${m.homeTeam.name} vs ${m.awayTeam.name} (${dayLabel})`,
        createdAt: t,
        readAt: null,
        targetUrl: `/tournaments/${tour.id}`,
        tournamentId: tour.id,
        tournamentImage: tour.image ?? null,
      })
    }
  } catch {
    /* ignore */
  }

  return extra
}
