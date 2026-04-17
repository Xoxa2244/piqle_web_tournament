export interface CampaignGuestTrialActivityRow {
  id: string
  type: string | null
  status: string | null
  channel: string | null
  createdAt: Date | string
  userName: string
  reasoning?: unknown
}

export interface CampaignGuestTrialOfferSummary {
  key: string
  label: string
  count: number
  stage: string | null
  destinationDescriptor: string | null
}

export interface CampaignGuestTrialRouteSummary {
  key: string
  label: string
  count: number
  destinationType: string | null
}

export interface CampaignReferralOfferSummary {
  key: string
  label: string
  count: number
  lane: string | null
  destinationDescriptor: string | null
}

export interface CampaignReferralLaneSummary {
  key: string
  label: string
  count: number
}

export interface CampaignReferralRouteSummary {
  key: string
  label: string
  count: number
  destinationType: string | null
}

export interface CampaignReferredGuestSourceSummary {
  key: string
  label: string
  count: number
  lane: string | null
  destinationDescriptor: string | null
}

export interface CampaignReferredGuestRouteSummary {
  key: string
  label: string
  count: number
  destinationType: string | null
}

export interface CampaignGuestTrialActivityLog extends Omit<CampaignGuestTrialActivityRow, 'reasoning'> {
  guestTrialOfferKey: string | null
  guestTrialOfferName: string | null
  guestTrialOfferStage: string | null
  guestTrialRouteKey: string | null
  guestTrialDestinationDescriptor: string | null
  guestTrialDestinationType: string | null
  referralOfferKey: string | null
  referralOfferName: string | null
  referralOfferLane: string | null
  referralRouteKey: string | null
  referralDestinationDescriptor: string | null
  referralDestinationType: string | null
  referredGuestSourceOfferKey: string | null
  referredGuestSourceOfferName: string | null
  referredGuestSourceLane: string | null
  referredGuestSourceRouteKey: string | null
  referredGuestSourceDestinationDescriptor: string | null
  referredGuestSourceDestinationType: string | null
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function getGuestTrialAttribution(reasoning: unknown) {
  const reasoningRecord = toRecord(reasoning)
  const attribution = toRecord(reasoningRecord.guestTrialAttribution)
  const referralSource = toRecord(attribution.referralSource)

  const offerKey = typeof attribution.offerKey === 'string' ? attribution.offerKey : null
  const offerName = typeof attribution.offerName === 'string' ? attribution.offerName : null
  const offerStage = typeof attribution.offerStage === 'string' ? attribution.offerStage : null
  const routeKey = typeof attribution.routeKey === 'string' ? attribution.routeKey : null
  const destinationDescriptor = typeof attribution.destinationDescriptor === 'string'
    ? attribution.destinationDescriptor
    : null
  const destinationType = typeof attribution.destinationType === 'string'
    ? attribution.destinationType
    : null
  const referralOfferKey = typeof referralSource.offerKey === 'string' ? referralSource.offerKey : null
  const referralOfferName = typeof referralSource.offerName === 'string' ? referralSource.offerName : null
  const referralOfferLane = typeof referralSource.offerLane === 'string' ? referralSource.offerLane : null
  const referralRouteKey = typeof referralSource.routeKey === 'string' ? referralSource.routeKey : null
  const referralDestinationDescriptor = typeof referralSource.destinationDescriptor === 'string'
    ? referralSource.destinationDescriptor
    : null
  const referralDestinationType = typeof referralSource.destinationType === 'string'
    ? referralSource.destinationType
    : null

  if (
    !offerKey
    && !routeKey
    && !destinationDescriptor
    && !referralOfferKey
    && !referralOfferLane
    && !referralRouteKey
    && !referralDestinationDescriptor
  ) return null

  return {
    offerKey,
    offerName,
    offerStage,
    routeKey: routeKey || destinationDescriptor,
    destinationDescriptor,
    destinationType,
    referralSource: (
      referralOfferKey
      || referralOfferName
      || referralOfferLane
      || referralRouteKey
      || referralDestinationDescriptor
    )
      ? {
        offerKey: referralOfferKey,
        offerName: referralOfferName,
        offerLane: referralOfferLane,
        routeKey: referralRouteKey || referralDestinationDescriptor,
        destinationDescriptor: referralDestinationDescriptor,
        destinationType: referralDestinationType,
      }
      : null,
  }
}

function getReferralAttribution(reasoning: unknown) {
  const reasoningRecord = toRecord(reasoning)
  const attribution = toRecord(reasoningRecord.referralAttribution)

  const offerKey = typeof attribution.offerKey === 'string' ? attribution.offerKey : null
  const offerName = typeof attribution.offerName === 'string' ? attribution.offerName : null
  const offerLane = typeof attribution.offerLane === 'string' ? attribution.offerLane : null
  const routeKey = typeof attribution.routeKey === 'string' ? attribution.routeKey : null
  const destinationDescriptor = typeof attribution.destinationDescriptor === 'string'
    ? attribution.destinationDescriptor
    : null
  const destinationType = typeof attribution.destinationType === 'string'
    ? attribution.destinationType
    : null

  if (!offerKey && !offerLane && !routeKey && !destinationDescriptor) return null

  return {
    offerKey,
    offerName,
    offerLane,
    routeKey: routeKey || destinationDescriptor,
    destinationDescriptor,
    destinationType,
  }
}

export function buildCampaignGuestTrialAnalytics(rows: CampaignGuestTrialActivityRow[]) {
  const offerMap = new Map<string, CampaignGuestTrialOfferSummary>()
  const routeMap = new Map<string, CampaignGuestTrialRouteSummary>()
  const referralOfferMap = new Map<string, CampaignReferralOfferSummary>()
  const referralLaneMap = new Map<string, CampaignReferralLaneSummary>()
  const referralRouteMap = new Map<string, CampaignReferralRouteSummary>()
  const referredGuestSourceMap = new Map<string, CampaignReferredGuestSourceSummary>()
  const referredGuestRouteMap = new Map<string, CampaignReferredGuestRouteSummary>()

  const recentLogs: CampaignGuestTrialActivityLog[] = rows.map((row) => {
    const attribution = getGuestTrialAttribution(row.reasoning)
    const referralAttribution = getReferralAttribution(row.reasoning)

    if (attribution?.offerKey && attribution.offerName) {
      const currentOffer = offerMap.get(attribution.offerKey) || {
        key: attribution.offerKey,
        label: attribution.offerName,
        count: 0,
        stage: attribution.offerStage,
        destinationDescriptor: attribution.destinationDescriptor,
      }
      currentOffer.count += 1
      offerMap.set(attribution.offerKey, currentOffer)
    }

    if (attribution?.routeKey && attribution.destinationDescriptor) {
      const currentRoute = routeMap.get(attribution.routeKey) || {
        key: attribution.routeKey,
        label: attribution.destinationDescriptor,
        count: 0,
        destinationType: attribution.destinationType,
      }
      currentRoute.count += 1
      routeMap.set(attribution.routeKey, currentRoute)
    }

    if (attribution?.referralSource?.offerKey && attribution.referralSource.offerName) {
      const currentSource = referredGuestSourceMap.get(attribution.referralSource.offerKey) || {
        key: attribution.referralSource.offerKey,
        label: attribution.referralSource.offerName,
        count: 0,
        lane: attribution.referralSource.offerLane,
        destinationDescriptor: attribution.referralSource.destinationDescriptor,
      }
      currentSource.count += 1
      referredGuestSourceMap.set(attribution.referralSource.offerKey, currentSource)
    }

    if (attribution?.referralSource?.routeKey && attribution.referralSource.destinationDescriptor) {
      const currentRoute = referredGuestRouteMap.get(attribution.referralSource.routeKey) || {
        key: attribution.referralSource.routeKey,
        label: attribution.referralSource.destinationDescriptor,
        count: 0,
        destinationType: attribution.referralSource.destinationType,
      }
      currentRoute.count += 1
      referredGuestRouteMap.set(attribution.referralSource.routeKey, currentRoute)
    }

    if (referralAttribution?.offerKey && referralAttribution.offerName) {
      const currentOffer = referralOfferMap.get(referralAttribution.offerKey) || {
        key: referralAttribution.offerKey,
        label: referralAttribution.offerName,
        count: 0,
        lane: referralAttribution.offerLane,
        destinationDescriptor: referralAttribution.destinationDescriptor,
      }
      currentOffer.count += 1
      referralOfferMap.set(referralAttribution.offerKey, currentOffer)
    }

    if (referralAttribution?.offerLane) {
      const label = referralAttribution.offerLane.replace(/_/g, ' ')
      const currentLane = referralLaneMap.get(referralAttribution.offerLane) || {
        key: referralAttribution.offerLane,
        label,
        count: 0,
      }
      currentLane.count += 1
      referralLaneMap.set(referralAttribution.offerLane, currentLane)
    }

    if (referralAttribution?.routeKey && referralAttribution.destinationDescriptor) {
      const currentRoute = referralRouteMap.get(referralAttribution.routeKey) || {
        key: referralAttribution.routeKey,
        label: referralAttribution.destinationDescriptor,
        count: 0,
        destinationType: referralAttribution.destinationType,
      }
      currentRoute.count += 1
      referralRouteMap.set(referralAttribution.routeKey, currentRoute)
    }

    return {
      id: row.id,
      type: row.type,
      status: row.status,
      channel: row.channel,
      createdAt: row.createdAt,
      userName: row.userName,
      guestTrialOfferKey: attribution?.offerKey || null,
      guestTrialOfferName: attribution?.offerName || null,
      guestTrialOfferStage: attribution?.offerStage || null,
      guestTrialRouteKey: attribution?.routeKey || null,
      guestTrialDestinationDescriptor: attribution?.destinationDescriptor || null,
      guestTrialDestinationType: attribution?.destinationType || null,
      referralOfferKey: referralAttribution?.offerKey || null,
      referralOfferName: referralAttribution?.offerName || null,
      referralOfferLane: referralAttribution?.offerLane || null,
      referralRouteKey: referralAttribution?.routeKey || null,
      referralDestinationDescriptor: referralAttribution?.destinationDescriptor || null,
      referralDestinationType: referralAttribution?.destinationType || null,
      referredGuestSourceOfferKey: attribution?.referralSource?.offerKey || null,
      referredGuestSourceOfferName: attribution?.referralSource?.offerName || null,
      referredGuestSourceLane: attribution?.referralSource?.offerLane || null,
      referredGuestSourceRouteKey: attribution?.referralSource?.routeKey || null,
      referredGuestSourceDestinationDescriptor: attribution?.referralSource?.destinationDescriptor || null,
      referredGuestSourceDestinationType: attribution?.referralSource?.destinationType || null,
    }
  })

  return {
    recentLogs,
    topGuestTrialOffers: Array.from(offerMap.values()).sort((a, b) => b.count - a.count),
    topGuestTrialRoutes: Array.from(routeMap.values()).sort((a, b) => b.count - a.count),
    topReferralOffers: Array.from(referralOfferMap.values()).sort((a, b) => b.count - a.count),
    topReferralLanes: Array.from(referralLaneMap.values()).sort((a, b) => b.count - a.count),
    topReferralRoutes: Array.from(referralRouteMap.values()).sort((a, b) => b.count - a.count),
    topReferredGuestSources: Array.from(referredGuestSourceMap.values()).sort((a, b) => b.count - a.count),
    topReferredGuestRoutes: Array.from(referredGuestRouteMap.values()).sort((a, b) => b.count - a.count),
  }
}
