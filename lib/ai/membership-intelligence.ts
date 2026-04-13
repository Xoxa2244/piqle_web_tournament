import type {
  MembershipSignal,
  NormalizedMembership,
  NormalizedMembershipStatus,
  NormalizedMembershipType,
} from '@/types/intelligence'

function normalizeText(value?: string | null) {
  return value
    ? value.toLowerCase().trim().replace(/\s+/g, ' ')
    : ''
}

function inferMembershipStatus(rawStatus: string, rawType: string): NormalizedMembershipStatus {
  if (!rawStatus && !rawType) return 'unknown'

  if (/no membership|non-member|non member|no member/.test(rawStatus)) return 'none'
  if (/suspend|freeze|frozen|hold|pause/.test(rawStatus)) return 'suspended'
  if (/expire|expired|lapsed|ended/.test(rawStatus)) return 'expired'
  if (/cancel|cancelled|canceled/.test(rawStatus)) return 'cancelled'
  if (/trial|intro/.test(rawStatus)) return 'trial'
  if (/guest|drop in|drop-in|day pass|pay per play|pay-per-play/.test(rawStatus)) return 'guest'
  if (/active|current/.test(rawStatus)) return 'active'

  if (/trial|intro/.test(rawType)) return 'trial'
  if (/guest|drop in|drop-in|day pass|pay per play|pay-per-play/.test(rawType)) return 'guest'

  return 'unknown'
}

function inferMembershipType(rawType: string, normalizedStatus: NormalizedMembershipStatus): NormalizedMembershipType {
  if (!rawType && normalizedStatus === 'unknown') return 'unknown'

  if (/employee|staff|comped|complimentary|team member|house account/.test(rawType)) return 'staff'
  if (/silver sneakers|renew active|one pass|tivity|insurance|medicare/.test(rawType)) return 'insurance'
  if (/trial|intro/.test(rawType) || normalizedStatus === 'trial') return 'trial'
  if (/guest pass|guest/.test(rawType)) return 'guest'
  if (/drop in|drop-in|pay per play|pay-per-play|day pass|single session/.test(rawType)) return 'drop_in'
  if (/package|pack|bundle|credit|class pack|session pack|punch/.test(rawType)) return 'package'
  if (/vip|premium|all access|unlimited/.test(rawType)) return 'unlimited'
  if (/discount|student|senior|hero|military/.test(rawType)) return 'discounted'
  if (/month|monthly|open play pass|membership|court pass|pass/.test(rawType)) return 'monthly'

  if (normalizedStatus === 'guest') return 'guest'
  if (normalizedStatus === 'none') return 'drop_in'

  return rawType ? 'unknown' : 'unknown'
}

function statusTypeConflict(
  status: NormalizedMembershipStatus,
  type: NormalizedMembershipType,
) {
  if (status === 'none' && !['drop_in', 'guest', 'unknown'].includes(type)) return true
  if (status === 'guest' && !['drop_in', 'guest', 'trial', 'unknown'].includes(type)) return true
  if (status === 'trial' && !['trial', 'guest', 'drop_in', 'unknown'].includes(type)) return true
  return false
}

function statusTypeAlignment(
  status: NormalizedMembershipStatus,
  type: NormalizedMembershipType,
) {
  if (status === 'active' && ['monthly', 'unlimited', 'package', 'discounted', 'insurance', 'staff'].includes(type)) return true
  if (status === 'trial' && type === 'trial') return true
  if (status === 'guest' && ['guest', 'drop_in'].includes(type)) return true
  if (status === 'none' && ['guest', 'drop_in'].includes(type)) return true
  if (['suspended', 'expired', 'cancelled'].includes(status) && type !== 'unknown') return true
  return false
}

function resolveMembershipSignal(
  confidence: number,
  status: NormalizedMembershipStatus,
  type: NormalizedMembershipType,
): MembershipSignal {
  if (confidence <= 0 || (status === 'unknown' && type === 'unknown')) return 'missing'
  if (confidence >= 70) return 'strong'
  return 'weak'
}

export function normalizeMembership(input: {
  membershipType?: string | null
  membershipStatus?: string | null
}): NormalizedMembership {
  const rawType = input.membershipType?.trim() || null
  const rawStatus = input.membershipStatus?.trim() || null

  const normalizedStatus = inferMembershipStatus(
    normalizeText(rawStatus),
    normalizeText(rawType),
  )
  const normalizedType = inferMembershipType(
    normalizeText(rawType),
    normalizedStatus,
  )

  let confidence = 0
  if (rawType) confidence += 25
  if (rawStatus) confidence += 25
  if (normalizedStatus !== 'unknown') confidence += 25
  if (normalizedType !== 'unknown') confidence += 15
  if (rawStatus && normalizedStatus !== 'unknown' && !rawType) confidence += 20
  if (statusTypeAlignment(normalizedStatus, normalizedType)) confidence += 10
  if (statusTypeConflict(normalizedStatus, normalizedType)) confidence -= 35
  if ((rawType || rawStatus) && normalizedStatus === 'unknown' && normalizedType === 'unknown') {
    confidence = 35
  }

  confidence = Math.max(0, Math.min(100, confidence))

  return {
    rawType,
    rawStatus,
    normalizedType,
    normalizedStatus,
    confidence,
    signal: resolveMembershipSignal(confidence, normalizedStatus, normalizedType),
  }
}
