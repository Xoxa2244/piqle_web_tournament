import { TRPCClientError } from '@trpc/client'
import { useQuery } from '@tanstack/react-query'

import { trpc } from '../lib/trpc'

/** FORBIDDEN / 403 — на случай если get всё же вызовется и откажет. */
function isTournamentAccessForbidden(e: unknown): boolean {
  const err = e as TRPCClientError<any> & {
    data?: { code?: string; httpStatus?: number }
  }

  const msg = String(err?.message ?? e ?? '')
  if (/you do not have access to this tournament/i.test(msg)) return true
  if (/do not have access/i.test(msg) && /tournament/i.test(msg)) return true

  const d = err?.data
  if (d && typeof d === 'object') {
    if ((d as { code?: string }).code === 'FORBIDDEN') return true
    if ((d as { httpStatus?: number }).httpStatus === 403) return true
  }

  try {
    const blob = JSON.stringify(err?.data ?? err?.shape ?? err)
    if (blob.includes('FORBIDDEN')) return true
  } catch {
    /* ignore */
  }

  return false
}

/**
 * Owner/admin flags (`userAccessInfo`) для экрана турнира / регистрации.
 *
 * Сначала смотрим `tournament.list`: если турнира нет в списке доступных пользователю,
 * **не** вызываем `tournament.get` — иначе бэкенд отвечает 403 и RN/LogBox шумит, хотя для UI
 * достаточно `userAccessInfo: null`.
 *
 * Если турнир в списке — вызываем `get` и берём `userAccessInfo` (нужна точная роль).
 */
export function useTournamentAccessInfo(tournamentId: string, enabled: boolean) {
  const utils = trpc.useUtils()

  return useQuery({
    queryKey: ['tournament-access-info', tournamentId],
    enabled: Boolean(tournamentId) && enabled,
    retry: false,
    queryFn: async () => {
      const list = await utils.tournament.list.fetch()
      const row = (list as { id: string; isOwner?: boolean }[]).find((t) => t.id === tournamentId)

      if (!row) {
        return { userAccessInfo: null as const }
      }

      try {
        const full = await utils.tournament.get.fetch({ id: tournamentId })
        return { userAccessInfo: full.userAccessInfo }
      } catch (e) {
        if (isTournamentAccessForbidden(e)) {
          return { userAccessInfo: null as const }
        }
        throw e
      }
    },
  })
}
