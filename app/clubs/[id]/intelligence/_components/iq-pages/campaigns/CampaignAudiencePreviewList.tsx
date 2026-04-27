'use client'

import React, { useState } from 'react'
import type { CampaignAudiencePreviewMember } from './useCampaignCreator'

interface CampaignAudiencePreviewListProps {
  members: CampaignAudiencePreviewMember[]
  title?: string
  emptyText?: string
  compact?: boolean
}

export function CampaignAudiencePreviewList({
  members,
  title = 'Recipients',
  emptyText = 'No matching members found',
  compact = false,
}: CampaignAudiencePreviewListProps) {
  const [expanded, setExpanded] = useState(false)
  const limit = compact ? 4 : 3
  const visible = expanded ? members : members.slice(0, limit)

  return (
    <div className="rounded-xl px-3 py-3" style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}>
      <div className="text-[11px] mb-2" style={{ color: 'var(--t3)', fontWeight: 600 }}>
        {title}
      </div>

      {members.length === 0 ? (
        <div className="text-xs" style={{ color: 'var(--t4)' }}>
          {emptyText}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {visible.map((member) => (
              <div
                key={member.id}
                className="rounded-lg px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}
              >
                <div className="text-xs" style={{ color: 'var(--heading)', fontWeight: 600 }}>
                  {member.name}
                </div>
                {(member.subtitle || member.email) && (
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--t4)' }}>
                    {member.subtitle ?? member.email}
                  </div>
                )}
              </div>
            ))}
          </div>
          {members.length > limit && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="mt-3 text-[11px] transition-colors"
              style={{ color: '#8B5CF6', fontWeight: 700 }}
            >
              {expanded ? 'Show less' : `Show all ${members.length}`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
