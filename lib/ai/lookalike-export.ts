export type LookalikeAudienceKey =
  | 'healthy_paid_core'
  | 'high_value_loyalists'
  | 'new_successful_converters'
  | 'vip_advocates'

export type LookalikeExportPreset =
  | 'generic_csv'
  | 'meta_custom_audience'
  | 'google_customer_match'
  | 'tiktok_custom_audience'

export const LOOKALIKE_EXPORT_PRESETS: Array<{
  key: LookalikeExportPreset
  label: string
  description: string
  fieldsSummary: string
}> = [
  {
    key: 'generic_csv',
    label: 'Generic CSV',
    description: 'Full seed export with health, revenue and membership traits.',
    fieldsSummary: 'Full member traits',
  },
  {
    key: 'meta_custom_audience',
    label: 'Meta Custom Audience',
    description: 'Lean schema for Meta-style customer list uploads.',
    fieldsSummary: 'Email, phone, first/last name, city, zip',
  },
  {
    key: 'google_customer_match',
    label: 'Google Customer Match',
    description: 'Portable schema for Google-style customer matching.',
    fieldsSummary: 'Email, phone, first/last name, country, zip',
  },
  {
    key: 'tiktok_custom_audience',
    label: 'TikTok Custom Audience',
    description: 'Minimal schema for TikTok custom audience seeding.',
    fieldsSummary: 'Email, phone, external ID',
  },
]

export interface LookalikeExportMemberRow {
  userId: string
  name: string | null
  email: string | null
  phone: string | null
  city: string | null
  zipCode: string | null
  gender: string | null
  age: number | null
  duprRating: number | null
  joinedAt: Date | null
  daysSinceJoined: number | null
  lastPlayedAt: Date | null
  daysSinceLastVisit: number | null
  totalBookings: number
  bookingsLast30: number
  totalRevenue: number
  healthScore: number | null
  riskLevel: string | null
  lifecycleStage: string | null
  membershipType: string | null
  membershipStatus: string | null
  normalizedMembershipType: string | null
  normalizedMembershipStatus: string | null
}

export interface LookalikeAudienceMemberPreview {
  userId: string
  name: string
  email: string | null
  city: string | null
  healthScore: number | null
  totalBookings: number
  totalRevenue: number
  normalizedMembershipType: string | null
  reason: string
}

export interface LookalikeAudienceSuggestion {
  key: LookalikeAudienceKey
  name: string
  description: string
  useCase: string
  memberIds: string[]
  memberCount: number
  emailCount: number
  phoneCount: number
  dualMatchCount: number
  contactableCount: number
  averageHealthScore: number
  averageRevenue: number
  previewMembers: LookalikeAudienceMemberPreview[]
  traitsSummary: string
  advisorPrompt: string
  exportFileName: string
}

export interface LookalikeAudienceExportSnapshot {
  summary: {
    totalMembers: number
    exportableMembers: number
    audienceCount: number
    summary: string
  }
  audiences: LookalikeAudienceSuggestion[]
}

export interface LookalikeExportPresetCoverage {
  memberCount: number
  emailCount: number
  phoneCount: number
  dualMatchCount: number
  contactableCount: number
  contactableRate: number
  dualMatchRate: number
}

export interface LookalikeExportPreview {
  audienceName: string
  audienceDescription: string
  audienceCount: number
  preset: LookalikeExportPreset
  presetLabel: string
  presetDescription: string
  presetFieldsSummary: string
  objective: string
  coverage: LookalikeExportPresetCoverage
  warnings: string[]
  nextSteps: string[]
}

interface InternalAudienceSuggestion extends LookalikeAudienceSuggestion {
  members: Array<LookalikeExportMemberRow & { reason: string }>
}

function quantile(values: number[], ratio: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))
  return sorted[index]
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function toPercent(value: number, total: number) {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

function splitName(name: string | null) {
  const cleaned = (name || '').trim()
  if (!cleaned) {
    return { firstName: '', lastName: '' }
  }
  const parts = cleaned.split(/\s+/)
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  }
}

function formatMembershipLabel(member: LookalikeExportMemberRow) {
  return member.normalizedMembershipType || member.membershipType || 'unknown'
}

function formatSeedReason(
  member: LookalikeExportMemberRow,
  lead: string,
  extra?: string | null,
) {
  const parts = [
    lead,
    member.healthScore != null ? `health ${member.healthScore}` : null,
    member.bookingsLast30 > 0 ? `${member.bookingsLast30} bookings in 30d` : `${member.totalBookings} total bookings`,
    member.totalRevenue > 0 ? `$${Math.round(member.totalRevenue)} revenue` : null,
    extra || null,
  ].filter(Boolean)

  return parts.join(' · ')
}

function buildAudienceSuggestion(opts: {
  key: LookalikeAudienceKey
  name: string
  description: string
  useCase: string
  advisorPrompt: string
  exportFileName: string
  members: Array<LookalikeExportMemberRow & { reason: string }>
}): InternalAudienceSuggestion {
  const previewMembers = opts.members.slice(0, 8).map((member) => ({
    userId: member.userId,
    name: member.name || 'Unknown member',
    email: member.email,
    city: member.city,
    healthScore: member.healthScore,
    totalBookings: member.totalBookings,
    totalRevenue: roundCurrency(member.totalRevenue),
    normalizedMembershipType: member.normalizedMembershipType,
    reason: member.reason,
  }))

  const averageHealthScore = average(opts.members.map((member) => member.healthScore ?? 0))
  const averageRevenue = roundCurrency(
    opts.members.length > 0
      ? opts.members.reduce((sum, member) => sum + member.totalRevenue, 0) / opts.members.length
      : 0,
  )
  const emailCount = opts.members.filter((member) => !!member.email).length
  const phoneCount = opts.members.filter((member) => !!member.phone).length
  const dualMatchCount = opts.members.filter((member) => !!member.email && !!member.phone).length
  const contactableCount = opts.members.filter((member) => !!member.email || !!member.phone).length

  const membershipMix = Array.from(
    new Set(opts.members.map((member) => formatMembershipLabel(member)).filter(Boolean)),
  )
    .slice(0, 3)
    .join(', ')

  const traitsSummary = [
    `${opts.members.length} seed members`,
    averageHealthScore > 0 ? `avg health ${averageHealthScore}` : null,
    averageRevenue > 0 ? `avg revenue $${Math.round(averageRevenue)}` : null,
    membershipMix ? `mix: ${membershipMix}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    key: opts.key,
    name: opts.name,
    description: opts.description,
    useCase: opts.useCase,
    memberIds: opts.members.map((member) => member.userId),
    memberCount: opts.members.length,
    emailCount,
    phoneCount,
    dualMatchCount,
    contactableCount,
    averageHealthScore,
    averageRevenue,
    previewMembers,
    traitsSummary,
    advisorPrompt: opts.advisorPrompt,
    exportFileName: opts.exportFileName,
    members: opts.members,
  }
}

export function buildLookalikeAudienceExport(input: {
  members: LookalikeExportMemberRow[]
}): LookalikeAudienceExportSnapshot & { internalAudiences: InternalAudienceSuggestion[] } {
  const exportableMembers = input.members.filter((member) => member.email || member.phone)
  const paidActiveMembers = exportableMembers.filter(
    (member) =>
      member.normalizedMembershipStatus === 'active' &&
      ['monthly', 'unlimited', 'package', 'discounted', 'insurance'].includes(member.normalizedMembershipType || ''),
  )
  const revenueThreshold = quantile(
    paidActiveMembers.map((member) => member.totalRevenue).filter((value) => value > 0),
    0.75,
  )

  const healthyPaidCore = paidActiveMembers
    .filter(
      (member) =>
        (member.healthScore ?? 0) >= 70 &&
        member.totalBookings >= 4 &&
        (member.daysSinceLastVisit == null || member.daysSinceLastVisit <= 21),
    )
    .sort((a, b) => (b.healthScore ?? 0) - (a.healthScore ?? 0) || b.totalBookings - a.totalBookings)
    .map((member) => ({
      ...member,
      reason: formatSeedReason(
        member,
        'Healthy paid member',
        member.daysSinceLastVisit != null ? `last played ${member.daysSinceLastVisit}d ago` : null,
      ),
    }))

  const highValueLoyalists = paidActiveMembers
    .filter(
      (member) =>
        member.totalRevenue >= revenueThreshold &&
        (member.healthScore ?? 0) >= 65 &&
        member.totalBookings >= 8,
    )
    .sort((a, b) => b.totalRevenue - a.totalRevenue || (b.healthScore ?? 0) - (a.healthScore ?? 0))
    .map((member) => ({
      ...member,
      reason: formatSeedReason(
        member,
        'High-value loyalist',
        member.bookingsLast30 > 0 ? `${member.bookingsLast30} recent bookings` : null,
      ),
    }))

  const newSuccessfulConverters = paidActiveMembers
    .filter(
      (member) =>
        (member.daysSinceJoined ?? 9999) <= 120 &&
        (member.healthScore ?? 0) >= 55 &&
        member.totalBookings >= 2 &&
        member.totalBookings <= 16,
    )
    .sort((a, b) => (a.daysSinceJoined ?? 9999) - (b.daysSinceJoined ?? 9999) || (b.healthScore ?? 0) - (a.healthScore ?? 0))
    .map((member) => ({
      ...member,
      reason: formatSeedReason(
        member,
        'New paid converter',
        member.daysSinceJoined != null ? `joined ${member.daysSinceJoined}d ago` : null,
      ),
    }))

  const vipAdvocates = exportableMembers
    .filter(
      (member) =>
        ['unlimited', 'monthly'].includes(member.normalizedMembershipType || '') &&
        member.normalizedMembershipStatus === 'active' &&
        (member.healthScore ?? 0) >= 75 &&
        (member.bookingsLast30 >= 3 || member.totalBookings >= 10),
    )
    .sort((a, b) => b.bookingsLast30 - a.bookingsLast30 || (b.healthScore ?? 0) - (a.healthScore ?? 0))
    .map((member) => ({
      ...member,
      reason: formatSeedReason(
        member,
        'VIP advocate',
        member.bookingsLast30 > 0 ? `${member.bookingsLast30} bookings in 30d` : null,
      ),
    }))

  const internalAudiences = [
    buildAudienceSuggestion({
      key: 'healthy_paid_core',
      name: 'Healthy Paid Core',
      description: 'The most stable paid members to use as a seed for broad paid acquisition and club-fit targeting.',
      useCase: 'Use as the safest baseline seed for ad platforms or partner uploads.',
      advisorPrompt:
        'Build a lookalike export plan from the Healthy Paid Core audience and explain the best acquisition angle for prospects similar to these members.',
      exportFileName: 'healthy-paid-core-lookalike.csv',
      members: healthyPaidCore,
    }),
    buildAudienceSuggestion({
      key: 'high_value_loyalists',
      name: 'High-Value Loyalists',
      description: 'Members with the strongest revenue and repeat behavior for premium growth targeting.',
      useCase: 'Use when you want acquisition to bias toward higher-LTV members instead of pure volume.',
      advisorPrompt:
        'Build a premium lookalike export plan from High-Value Loyalists and suggest the best premium acquisition angle for this club.',
      exportFileName: 'high-value-loyalists-lookalike.csv',
      members: highValueLoyalists,
    }),
    buildAudienceSuggestion({
      key: 'new_successful_converters',
      name: 'New Successful Converters',
      description: 'Recently joined members who already converted into a healthy paid state.',
      useCase: 'Use when you want to find prospects who resemble the club’s most successful new converters.',
      advisorPrompt:
        'Build a lookalike export plan from New Successful Converters and suggest the best first-offer path to attract similar prospects.',
      exportFileName: 'new-successful-converters-lookalike.csv',
      members: newSuccessfulConverters,
    }),
    buildAudienceSuggestion({
      key: 'vip_advocates',
      name: 'VIP Advocates',
      description: 'Frequent, healthy VIP-style members who look like strong community-fit prospects.',
      useCase: 'Use when community fit and recurring frequency matter more than broad top-of-funnel volume.',
      advisorPrompt:
        'Build a lookalike export plan from VIP Advocates and suggest the best community-led acquisition message for similar prospects.',
      exportFileName: 'vip-advocates-lookalike.csv',
      members: vipAdvocates,
    }),
  ].filter((audience) => audience.memberCount > 0)

  return {
    summary: {
      totalMembers: input.members.length,
      exportableMembers: exportableMembers.length,
      audienceCount: internalAudiences.length,
      summary:
        internalAudiences.length > 0
          ? `${internalAudiences.length} export-ready seed audiences from ${exportableMembers.length} members with contact data.`
          : 'No export-ready seed audiences yet — add more active paid member data first.',
    },
    audiences: internalAudiences.map(({ members, ...audience }) => audience),
    internalAudiences,
  }
}

export function buildSelectedLookalikeAudience(input: {
  snapshot: LookalikeAudienceExportSnapshot & { internalAudiences: InternalAudienceSuggestion[] }
  audienceKeys: LookalikeAudienceKey[]
}) {
  const selectedAudiences = input.snapshot.internalAudiences.filter((audience) =>
    input.audienceKeys.includes(audience.key),
  )

  if (selectedAudiences.length === 0) return null

  const dedupedMembers = new Map<string, LookalikeExportMemberRow & { reason: string }>()
  const sourcesByMember = new Map<string, Set<string>>()

  for (const audience of selectedAudiences) {
    for (const member of audience.members) {
      if (!dedupedMembers.has(member.userId)) {
        dedupedMembers.set(member.userId, { ...member })
      }
      if (!sourcesByMember.has(member.userId)) {
        sourcesByMember.set(member.userId, new Set())
      }
      sourcesByMember.get(member.userId)?.add(audience.name)
    }
  }

  const mergedMembers = Array.from(dedupedMembers.values()).map((member) => {
    const sources = Array.from(sourcesByMember.get(member.userId) || [])
    return {
      ...member,
      reason: sources.length > 1 ? `${member.reason} · sources: ${sources.join(', ')}` : member.reason,
    }
  })

  const combinedName =
    selectedAudiences.length === 1
      ? selectedAudiences[0].name
      : `Custom Seed — ${selectedAudiences.map((audience) => audience.name).join(' + ')}`

  const combinedDescription =
    selectedAudiences.length === 1
      ? selectedAudiences[0].description
      : `Combined seed audience from ${selectedAudiences.map((audience) => audience.name).join(', ')}.`

  return buildAudienceSuggestion({
    key: selectedAudiences[0].key,
    name: combinedName,
    description: combinedDescription,
    useCase: 'Custom combined seed built from multiple agent-suggested source audiences.',
    advisorPrompt: `Build a lookalike export plan from these seed audiences: ${selectedAudiences
      .map((audience) => audience.name)
      .join(', ')}.`,
    exportFileName: `${slugify(combinedName || 'lookalike-seed')}.csv`,
    members: mergedMembers,
  })
}

export function buildLookalikeExportPreview(input: {
  snapshot: LookalikeAudienceExportSnapshot & { internalAudiences: InternalAudienceSuggestion[] }
  audienceKeys: LookalikeAudienceKey[]
  preset: LookalikeExportPreset
}): LookalikeExportPreview | null {
  const audience = buildSelectedLookalikeAudience({
    snapshot: input.snapshot,
    audienceKeys: input.audienceKeys,
  })

  if (!audience) return null

  const presetMeta = LOOKALIKE_EXPORT_PRESETS.find((preset) => preset.key === input.preset) || LOOKALIKE_EXPORT_PRESETS[0]
  const emailCount = audience.members.filter((member) => !!member.email).length
  const phoneCount = audience.members.filter((member) => !!member.phone).length
  const dualMatchCount = audience.members.filter((member) => !!member.email && !!member.phone).length
  const contactableCount = audience.members.filter((member) => !!member.email || !!member.phone).length
  const memberCount = audience.members.length

  const coverage: LookalikeExportPresetCoverage = {
    memberCount,
    emailCount,
    phoneCount,
    dualMatchCount,
    contactableCount,
    contactableRate: toPercent(contactableCount, memberCount),
    dualMatchRate: toPercent(dualMatchCount, memberCount),
  }

  const warnings: string[] = []
  if (input.preset !== 'generic_csv') {
    if (coverage.contactableRate < 50) {
      warnings.push('Low contact match coverage: less than half of this seed has email or phone.')
    }
    if ((input.preset === 'meta_custom_audience' || input.preset === 'google_customer_match') && coverage.dualMatchRate < 25) {
      warnings.push('Match quality may be weak: very few seed members have both email and phone.')
    }
    if (input.preset === 'tiktok_custom_audience' && coverage.emailCount === 0 && coverage.phoneCount === 0) {
      warnings.push('TikTok export needs email or phone to be useful.')
    }
  }

  let objective = 'Hand this seed to a marketer or agency for external acquisition.'
  let nextSteps: string[] = []

  if (input.preset === 'meta_custom_audience') {
    objective = 'Upload this as a Meta customer list, then build a 1% to 3% lookalike for new guest or trial acquisition.'
    nextSteps = [
      'Upload the CSV as a Customer List audience in Meta Ads Manager.',
      'Create a lookalike audience from this seed and start with 1% similarity.',
      'Use guest or trial creative, and exclude current active members from acquisition campaigns.',
    ]
  } else if (input.preset === 'google_customer_match') {
    objective = 'Use this as a Google Customer Match seed for Search, YouTube or Performance Max acquisition.'
    nextSteps = [
      'Upload the CSV into Customer Match in Google Ads.',
      'Apply the audience to Search, YouTube or Performance Max campaigns.',
      'Bias creative and landing pages toward first booking or guest pass conversion.',
    ]
  } else if (input.preset === 'tiktok_custom_audience') {
    objective = 'Use this as a TikTok seed audience for broad top-of-funnel acquisition and lookalike expansion.'
    nextSteps = [
      'Upload the CSV as a TikTok custom audience.',
      'Create a lookalike audience from this seed and keep the first test broad.',
      'Use short-form guest or trial creative with a clear first-visit CTA.',
    ]
  } else {
    objective = 'Use this full CSV as a generic seed export for agencies, BI tooling or manual channel uploads.'
    nextSteps = [
      'Share the CSV with your marketer, agency or analytics workflow.',
      'Use it to decide which channel-specific schema to prepare next.',
      'Keep this export as the reference seed when comparing paid acquisition performance later.',
    ]
  }

  return {
    audienceName: audience.name,
    audienceDescription: audience.description,
    audienceCount: audience.memberCount,
    preset: input.preset,
    presetLabel: presetMeta.label,
    presetDescription: presetMeta.description,
    presetFieldsSummary: presetMeta.fieldsSummary,
    objective,
    coverage,
    warnings,
    nextSteps,
  }
}

function escapeCsv(value: string | number | null | undefined) {
  if (value == null) return ''
  const text = String(value)
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function buildLookalikeAudienceCsv(input: {
  audience: InternalAudienceSuggestion
  preset?: LookalikeExportPreset
}) {
  const preset = input.preset || 'generic_csv'
  let headers: string[] = []
  let rows: Array<Array<string | number | null | undefined>> = []

  if (preset === 'meta_custom_audience') {
    headers = ['email', 'phone', 'fn', 'ln', 'ct', 'zip', 'external_id']
    rows = input.audience.members.map((member) => {
      const { firstName, lastName } = splitName(member.name)
      return [member.email || '', member.phone || '', firstName, lastName, member.city || '', member.zipCode || '', member.userId]
    })
  } else if (preset === 'google_customer_match') {
    headers = ['Email', 'Phone', 'First Name', 'Last Name', 'Country', 'Zip', 'External ID']
    rows = input.audience.members.map((member) => {
      const { firstName, lastName } = splitName(member.name)
      return [member.email || '', member.phone || '', firstName, lastName, 'US', member.zipCode || '', member.userId]
    })
  } else if (preset === 'tiktok_custom_audience') {
    headers = ['Email', 'Phone Number', 'External ID']
    rows = input.audience.members.map((member) => [member.email || '', member.phone || '', member.userId])
  } else {
    headers = [
      'seed_audience_key',
      'seed_audience_name',
      'user_id',
      'name',
      'email',
      'phone',
      'city',
      'zip_code',
      'gender',
      'age',
      'dupr_rating',
      'health_score',
      'risk_level',
      'lifecycle_stage',
      'days_since_joined',
      'days_since_last_visit',
      'bookings_last_30',
      'total_bookings',
      'total_revenue_usd',
      'membership_type',
      'membership_status',
      'normalized_membership_type',
      'normalized_membership_status',
      'seed_reason',
    ]

    rows = input.audience.members.map((member) => [
      input.audience.key,
      input.audience.name,
      member.userId,
      member.name || '',
      member.email || '',
      member.phone || '',
      member.city || '',
      member.zipCode || '',
      member.gender || '',
      member.age,
      member.duprRating,
      member.healthScore,
      member.riskLevel || '',
      member.lifecycleStage || '',
      member.daysSinceJoined,
      member.daysSinceLastVisit,
      member.bookingsLast30,
      member.totalBookings,
      roundCurrency(member.totalRevenue),
      member.membershipType || '',
      member.membershipStatus || '',
      member.normalizedMembershipType || '',
      member.normalizedMembershipStatus || '',
      member.reason,
    ])
  }

  const csv = [headers, ...rows]
    .map((row) => row.map((value) => escapeCsv(value as string | number | null | undefined)).join(','))
    .join('\n')

  return {
    fileName:
      preset === 'generic_csv'
        ? input.audience.exportFileName
        : input.audience.exportFileName.replace(/\.csv$/i, `-${preset}.csv`),
    csv,
    memberCount: input.audience.memberCount,
    preset,
  }
}
