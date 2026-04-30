export interface QuickCohortState {
  membershipStatus: string[]
  membershipType: string[]
  activityLevel: string[]
  riskLevel: string[]
  engagementTrend: string[]
  valueTier: string[]
  joinedWithinDays: string
  inactiveDays: string
  sessionsPerMonthMin: string
  sessionsPerMonthMax: string
}

export const EMPTY_QUICK_COHORT: QuickCohortState = {
  membershipStatus: [],
  membershipType: [],
  activityLevel: [],
  riskLevel: [],
  engagementTrend: [],
  valueTier: [],
  joinedWithinDays: '',
  inactiveDays: '',
  sessionsPerMonthMin: '',
  sessionsPerMonthMax: '',
}

export const QUICK_COHORT_QUERY_KEYS = [
  'cohortBuilder',
  'cohortName',
  'cohortDescription',
  'qfStatus',
  'qfTier',
  'qfActivity',
  'qfRisk',
  'qfTrend',
  'qfValue',
  'qfJoined',
  'qfInactive',
  'qfFreqMin',
  'qfFreqMax',
] as const

function splitCsv(value: string | null) {
  if (!value) return []
  return value.split(',').map((entry) => entry.trim()).filter(Boolean)
}

export function buildQuickCohortSearchParams(input: {
  name?: string | null
  description?: string | null
  quickFilters: QuickCohortState
}) {
  const params = new URLSearchParams()
  params.set('cohortBuilder', 'quick')

  if (input.name?.trim()) params.set('cohortName', input.name.trim())
  if (input.description?.trim()) params.set('cohortDescription', input.description.trim())
  if (input.quickFilters.membershipStatus.length > 0) params.set('qfStatus', input.quickFilters.membershipStatus.join(','))
  if (input.quickFilters.membershipType.length > 0) params.set('qfTier', input.quickFilters.membershipType.join(','))
  if (input.quickFilters.activityLevel.length > 0) params.set('qfActivity', input.quickFilters.activityLevel.join(','))
  if (input.quickFilters.riskLevel.length > 0) params.set('qfRisk', input.quickFilters.riskLevel.join(','))
  if (input.quickFilters.engagementTrend.length > 0) params.set('qfTrend', input.quickFilters.engagementTrend.join(','))
  if (input.quickFilters.valueTier.length > 0) params.set('qfValue', input.quickFilters.valueTier.join(','))
  if (input.quickFilters.joinedWithinDays) params.set('qfJoined', input.quickFilters.joinedWithinDays)
  if (input.quickFilters.inactiveDays) params.set('qfInactive', input.quickFilters.inactiveDays)
  if (input.quickFilters.sessionsPerMonthMin) params.set('qfFreqMin', input.quickFilters.sessionsPerMonthMin)
  if (input.quickFilters.sessionsPerMonthMax) params.set('qfFreqMax', input.quickFilters.sessionsPerMonthMax)

  return params
}

export function parseQuickCohortSearchParams(params: { get: (key: string) => string | null }) {
  if (params.get('cohortBuilder') !== 'quick') return null

  return {
    mode: 'quick' as const,
    name: params.get('cohortName') || '',
    description: params.get('cohortDescription') || '',
    quickFilters: {
      membershipStatus: splitCsv(params.get('qfStatus')),
      membershipType: splitCsv(params.get('qfTier')),
      activityLevel: splitCsv(params.get('qfActivity')),
      riskLevel: splitCsv(params.get('qfRisk')),
      engagementTrend: splitCsv(params.get('qfTrend')),
      valueTier: splitCsv(params.get('qfValue')),
      joinedWithinDays: params.get('qfJoined') || '',
      inactiveDays: params.get('qfInactive') || '',
      sessionsPerMonthMin: params.get('qfFreqMin') || '',
      sessionsPerMonthMax: params.get('qfFreqMax') || '',
    },
  }
}

function mapMembersRiskToQuickRisk(value: string) {
  if (value === 'power') return 'healthy'
  if (value === 'regular') return 'watch'
  if (value === 'at-risk') return 'at_risk'
  if (value === 'critical') return 'critical'
  return null
}

export function mapMembersFiltersToQuickCohort(input: {
  view: 'all' | 'at-risk' | 'reactivation'
  searchQuery: string
  filterActivity: string
  filterRisk: string
  filterTrend: string
  filterValue: string
  filterMembershipType: string
  filterMembershipStatus: string
}) {
  const searchQuery = input.searchQuery.trim()
  if (searchQuery) {
    return { supported: false as const, reason: 'search' }
  }
  if (input.view === 'reactivation') {
    return { supported: false as const, reason: 'reactivation' }
  }

  const quickFilters: QuickCohortState = {
    ...EMPTY_QUICK_COHORT,
  }

  if (input.filterMembershipStatus !== 'all') {
    quickFilters.membershipStatus = [input.filterMembershipStatus]
  }
  if (input.filterMembershipType !== 'all') {
    quickFilters.membershipType = [input.filterMembershipType]
  }
  if (input.filterActivity !== 'all') {
    quickFilters.activityLevel = [input.filterActivity]
  }

  if (input.filterRisk !== 'all') {
    const mapped = mapMembersRiskToQuickRisk(input.filterRisk)
    if (!mapped) return { supported: false as const, reason: 'risk' }
    quickFilters.riskLevel = [mapped]
  } else if (input.view === 'at-risk') {
    quickFilters.riskLevel = ['at_risk', 'critical']
  }

  if (input.filterTrend !== 'all') {
    quickFilters.engagementTrend = [input.filterTrend]
  }

  if (input.filterValue !== 'all') {
    quickFilters.valueTier = [input.filterValue]
  }

  return {
    supported: true as const,
    quickFilters,
  }
}
