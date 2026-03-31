'use client'
import { useState } from 'react'
import { motion } from 'motion/react'
import { Plus } from 'lucide-react'
import { useTheme } from '../IQThemeProvider'
import { CampaignKPIs } from './campaigns/CampaignKPIs'
import { CampaignChart } from './campaigns/CampaignChart'
import { CampaignList } from './campaigns/CampaignList'
import { AutomationBanner } from './campaigns/AutomationBanner'
import { CampaignCreator } from './campaigns/CampaignCreator'
import { CampaignSuggestions } from './campaigns/CampaignSuggestions'

interface CampaignsIQProps {
  campaignData: any
  campaignListData: any
  variantData?: any
  isLoading: boolean
  clubId: string
}

export function CampaignsIQ({ campaignData, campaignListData, variantData, isLoading, clubId }: CampaignsIQProps) {
  const { isDark } = useTheme()
  const [showCreator, setShowCreator] = useState(false)
  const [initialType, setInitialType] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-5">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse rounded-2xl h-32" style={{ background: 'var(--subtle)' }} />
        ))}
      </div>
    )
  }

  if (!campaignData?.summary) {
    return (
      <>
        <CampaignSuggestions
          clubId={clubId}
          onSelectType={(type) => {
            setInitialType(type)
            setShowCreator(true)
          }}
        />
        {showCreator && (
          <CampaignCreator
            clubId={clubId}
            initialType={initialType}
            onClose={() => { setShowCreator(false); setInitialType(null) }}
            onSuccess={() => { setShowCreator(false); setInitialType(null) }}
          />
        )}
      </>
    )
  }

  const { summary, byDay } = campaignData
  const campaigns = campaignListData?.campaigns ?? []

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 max-w-[1400px] mx-auto">
      {/* Automation status */}
      <AutomationBanner clubId={clubId} />

      {/* Header + New Campaign */}
      <div className="flex items-center justify-between">
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--heading)' }}>Campaigns</h1>
        <button
          onClick={() => setShowCreator(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02]"
          style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}
        >
          <Plus className="w-4 h-4" /> New Campaign
        </button>
      </div>

      {/* KPI cards */}
      <CampaignKPIs summary={summary} variantData={variantData} />

      {/* Performance chart */}
      {byDay?.length > 0 && <CampaignChart byDay={byDay} />}

      {/* Campaign list */}
      <CampaignList campaigns={campaigns} />

      {/* Campaign Creator modal */}
      {showCreator && (
        <CampaignCreator
          clubId={clubId}
          initialType={initialType}
          onClose={() => { setShowCreator(false); setInitialType(null) }}
          onSuccess={() => { setShowCreator(false); setInitialType(null) }}
        />
      )}
    </motion.div>
  )
}
