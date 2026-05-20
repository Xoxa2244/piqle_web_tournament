'use client'

/**
 * Action Center route — DASHBOARD_AND_ACTION_CENTER_SPEC.md §4.1.
 *
 * Operator-side daily landing page. The Dashboard answers "how is the
 * club doing" (strategic); Action Center answers "what hasn't been
 * done today" (operational) — feed of signals + Tier Constructor.
 */

import { useParams } from 'next/navigation'
import { ActionCenterIQ } from '../_components/iq-pages/ActionCenterIQ'

export default function ActionCenterPage() {
  const params = useParams()
  const clubId = (params?.id as string) || ''
  if (!clubId) return null
  return <ActionCenterIQ clubId={clubId} />
}
