import type {
  MembershipMappingMatchMode,
  MembershipMappingRule,
  MembershipMappingSettings,
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

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function normalizeMatchMode(value: unknown): MembershipMappingMatchMode {
  return value === 'equals' ? 'equals' : 'contains'
}

function normalizeMembershipMappingRule(value: unknown): MembershipMappingRule | null {
  const record = toRecord(value)
  const rawLabel = typeof record.rawLabel === 'string' ? record.rawLabel.trim() : ''
  if (!rawLabel) return null

  const source = record.source === 'status' || record.source === 'either'
    ? record.source
    : 'type'
  const matchMode = normalizeMatchMode(record.matchMode)
  const normalizedType = typeof record.normalizedType === 'string'
    ? record.normalizedType as Exclude<NormalizedMembershipType, 'unknown'>
    : null
  const normalizedStatus = typeof record.normalizedStatus === 'string'
    ? record.normalizedStatus as Exclude<NormalizedMembershipStatus, 'unknown'>
    : null

  if (!normalizedType && !normalizedStatus) return null

  return {
    rawLabel,
    source,
    matchMode,
    normalizedType,
    normalizedStatus,
  }
}

export function resolveMembershipMappings(automationSettings?: unknown): MembershipMappingSettings {
  const automation = toRecord(automationSettings)
  const intelligence = toRecord(automation.intelligence)
  const rawMappings = toRecord(intelligence.membershipMappings)
  const rawRules = Array.isArray(rawMappings.rules) ? rawMappings.rules : []

  return {
    rules: rawRules
      .map((rule) => normalizeMembershipMappingRule(rule))
      .filter((rule): rule is MembershipMappingRule => Boolean(rule)),
  }
}

function matchesRule(rawValue: string | null, rule: MembershipMappingRule) {
  const candidate = normalizeText(rawValue)
  const target = normalizeText(rule.rawLabel)
  if (!candidate || !target) return false
  if (rule.matchMode === 'equals') return candidate === target
  return candidate.includes(target)
}

function applyMembershipMappings(input: {
  rawType: string | null
  rawStatus: string | null
  membershipMappings?: MembershipMappingSettings | null
}) {
  const rules = input.membershipMappings?.rules || []
  let normalizedType: NormalizedMembershipType | null = null
  let normalizedStatus: NormalizedMembershipStatus | null = null
  let matchedRuleLabel: string | null = null
  let matchedByClubRule = false

  for (const rule of rules) {
    const matchesType = (rule.source === 'type' || rule.source === 'either')
      && matchesRule(input.rawType, rule)
    const matchesStatus = (rule.source === 'status' || rule.source === 'either')
      && matchesRule(input.rawStatus, rule)

    if (!matchesType && !matchesStatus) continue

    if (!matchedRuleLabel) matchedRuleLabel = rule.rawLabel
    matchedByClubRule = true

    if (!normalizedType && rule.normalizedType) {
      normalizedType = rule.normalizedType
    }

    if (!normalizedStatus && rule.normalizedStatus) {
      normalizedStatus = rule.normalizedStatus
    }

    if (normalizedType && normalizedStatus) break
  }

  return {
    normalizedType,
    normalizedStatus,
    matchedByClubRule,
    matchedRuleLabel,
  }
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
  membershipMappings?: MembershipMappingSettings | null
}): NormalizedMembership {
  const rawType = input.membershipType?.trim() || null
  const rawStatus = input.membershipStatus?.trim() || null
  const mapped = applyMembershipMappings({
    rawType,
    rawStatus,
    membershipMappings: input.membershipMappings,
  })

  const normalizedStatus = mapped.normalizedStatus || inferMembershipStatus(
    normalizeText(rawStatus),
    normalizeText(rawType),
  )
  const normalizedType = mapped.normalizedType || inferMembershipType(
    normalizeText(rawType),
    normalizedStatus,
  )

  let confidence = 0
  if (rawType) confidence += 25
  if (rawStatus) confidence += 25
  if (normalizedStatus !== 'unknown') confidence += 25
  if (normalizedType !== 'unknown') confidence += 15
  if (mapped.normalizedStatus) confidence += 20
  if (mapped.normalizedType) confidence += 20
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
    mappedByClubRule: mapped.matchedByClubRule,
    matchedRuleLabel: mapped.matchedRuleLabel,
  }
}
