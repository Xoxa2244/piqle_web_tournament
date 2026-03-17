'use client'
import { useState, useRef } from 'react';
import { motion, useInView, AnimatePresence } from 'motion/react';
import {
  Megaphone,
  Send,
  Users,
  Mail,
  TrendingUp,
  Clock,
  Target,
  Sparkles,
  ChevronRight,
  Plus,
  Eye,
  MousePointer,
  DollarSign,
  CheckCircle2,
  XCircle,
  PauseCircle,
  PlayCircle,
  Edit3,
  Copy,
  BarChart3,
  Zap,
  ArrowUpRight,
  Filter,
  Search,
  MessageSquare,
  Bell,
  Calendar,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
} from 'recharts';
import { useTheme } from '../IQThemeProvider';
/* --- Mock Data --- */ const campaignPerformance = [
  { week: 'W1', sent: 120, opened: 78, clicked: 34, converted: 12 },
  { week: 'W2', sent: 95, opened: 62, clicked: 28, converted: 10 },
  { week: 'W3', sent: 140, opened: 98, clicked: 45, converted: 18 },
  { week: 'W4', sent: 110, opened: 72, clicked: 32, converted: 14 },
];
type CampaignStatus = 'active' | 'completed' | 'draft' | 'paused';
interface Campaign {
  id: string;
  name: string;
  type: string;
  status: CampaignStatus;
  audience: number;
  sent: number;
  opened: number;
  clicked: number;
  converted: number;
  revenue: number;
  createdAt: string;
  scheduledFor?: string;
  aiGenerated: boolean;
  channel: 'email' | 'sms' | 'push';
  description: string;
}
const campaigns: Campaign[] = [
  {
    id: 'c1',
    name: 'Weekend Warrior Special',
    type: 'Promotion',
    status: 'active',
    audience: 45,
    sent: 45,
    opened: 32,
    clicked: 18,
    converted: 8,
    revenue: 640,
    createdAt: 'Mar 14',
    aiGenerated: true,
    channel: 'email',
    description: 'Targeted promotion for weekend players with 20% off Saturday afternoon sessions',
  },
  {
    id: 'c2',
    name: 'Win-Back: 30-Day Inactive',
    type: 'Reactivation',
    status: 'active',
    audience: 12,
    sent: 12,
    opened: 8,
    clicked: 5,
    converted: 3,
    revenue: 1840,
    createdAt: 'Mar 10',
    aiGenerated: true,
    channel: 'email',
    description:
      'Personalized reactivation campaign for members inactive 30+ days with free session offer',
  },
  {
    id: 'c3',
    name: 'Spring League Registration',
    type: 'Event',
    status: 'active',
    audience: 68,
    sent: 68,
    opened: 52,
    clicked: 28,
    converted: 15,
    revenue: 2250,
    createdAt: 'Mar 8',
    aiGenerated: false,
    channel: 'email',
    description: 'Announcement and early bird registration for the Spring 2026 Pickleball League',
  },
  {
    id: 'c4',
    name: 'Tuesday Morning Boost',
    type: 'Slot Fill',
    status: 'completed',
    audience: 23,
    sent: 23,
    opened: 18,
    clicked: 12,
    converted: 7,
    revenue: 420,
    createdAt: 'Mar 5',
    aiGenerated: true,
    channel: 'sms',
    description:
      'AI-targeted campaign to fill empty Tuesday morning slots with beginner-friendly messaging',
  },
  {
    id: 'c5',
    name: 'New Member Welcome Series',
    type: 'Onboarding',
    status: 'active',
    audience: 14,
    sent: 14,
    opened: 12,
    clicked: 9,
    converted: 6,
    revenue: 540,
    createdAt: 'Mar 1',
    aiGenerated: true,
    channel: 'email',
    description:
      '5-email drip sequence for new members: welcome, first booking tips, meet the community, etc.',
  },
  {
    id: 'c6',
    name: "Valentine's Mixer Promo",
    type: 'Event',
    status: 'completed',
    audience: 85,
    sent: 85,
    opened: 58,
    clicked: 32,
    converted: 22,
    revenue: 1760,
    createdAt: 'Feb 10',
    aiGenerated: false,
    channel: 'email',
    description: "Promotion for the Valentine's Day mixer event with couples discount",
  },
  {
    id: 'c7',
    name: 'Premium Upgrade Nudge',
    type: 'Upsell',
    status: 'paused',
    audience: 32,
    sent: 18,
    opened: 12,
    clicked: 6,
    converted: 2,
    revenue: 598,
    createdAt: 'Feb 28',
    aiGenerated: true,
    channel: 'email',
    description:
      'Targeted upsell campaign for regular members to upgrade to premium membership tier',
  },
  {
    id: 'c8',
    name: 'Summer Camp Early Bird',
    type: 'Event',
    status: 'draft',
    audience: 0,
    sent: 0,
    opened: 0,
    clicked: 0,
    converted: 0,
    revenue: 0,
    createdAt: 'Mar 16',
    aiGenerated: true,
    channel: 'email',
    description: 'AI-drafted campaign for upcoming summer camp program with early bird pricing',
  },
];
const channelPerformance = [
  { channel: 'Email', sent: 280, openRate: 68, clickRate: 32, convRate: 12, revenue: 6200 },
  { channel: 'SMS', sent: 45, openRate: 92, clickRate: 48, convRate: 22, revenue: 1840 },
  { channel: 'Push', sent: 120, openRate: 45, clickRate: 18, convRate: 8, revenue: 960 },
];
const aiSuggestions = [
  {
    title: 'Re-engage Evening Players',
    desc: "18 evening regulars haven't booked this week. Suggest a 'Reserve Your Spot' nudge.",
    impact: '+$360',
    confidence: 91,
  },
  {
    title: 'Upsell Clinic Attendees',
    desc: '12 clinic participants are ready for league play based on rating progression.',
    impact: '+$720',
    confidence: 87,
  },
  {
    title: 'Birthday Campaign',
    desc: '4 members have birthdays this week. Send personalized offers.',
    impact: '+$180',
    confidence: 94,
  },
];
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        backdropFilter: 'var(--glass-blur)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {' '}
      {children}{' '}
    </div>
  );
}
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-4 py-3 text-xs"
      style={{
        background: 'var(--tooltip-bg)',
        border: '1px solid var(--tooltip-border)',
        color: 'var(--tooltip-color)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {' '}
      <div className="mb-2" style={{ fontWeight: 600 }}>
        {label}
      </div>{' '}
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          {' '}
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />{' '}
          <span style={{ color: 'var(--t3)' }}>{p.name}:</span>{' '}
          <span style={{ fontWeight: 600 }}>{p.value}</span>{' '}
        </div>
      ))}{' '}
    </div>
  );
}
function StatusBadge({ status }: { status: CampaignStatus }) {
  const map: Record<CampaignStatus, { bg: string; color: string; icon: any; label: string }> = {
    active: { bg: 'rgba(16,185,129,0.1)', color: '#10B981', icon: PlayCircle, label: 'Active' },
    completed: {
      bg: 'rgba(139,92,246,0.1)',
      color: '#A78BFA',
      icon: CheckCircle2,
      label: 'Completed',
    },
    draft: { bg: 'rgba(255,255,255,0.05)', color: 'var(--t3)', icon: Edit3, label: 'Draft' },
    paused: { bg: 'rgba(245,158,11,0.1)', color: '#F59E0B', icon: PauseCircle, label: 'Paused' },
  };
  const c = map[status];
  const Icon = c.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px]"
      style={{ background: c.bg, color: c.color, fontWeight: 600 }}
    >
      {' '}
      <Icon className="w-3 h-3" /> {c.label}{' '}
    </span>
  );
}
function ChannelIcon({ channel }: { channel: string }) {
  if (channel === 'email') return <Mail className="w-3.5 h-3.5" />;
  if (channel === 'sms') return <MessageSquare className="w-3.5 h-3.5" />;
  return <Bell className="w-3.5 h-3.5" />;
}
/* ============================================= */ /*            CAMPAIGNS PAGE                      */ /* ============================================= */ export function CampaignsIQ() {
  const { isDark } = useTheme();
  const [statusFilter, setStatusFilter] = useState<'all' | CampaignStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const filtered = campaigns.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  const totalSent = campaigns.reduce((s, c) => s + c.sent, 0);
  const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
  const avgOpenRate = Math.round(
    campaigns.filter((c) => c.sent > 0).reduce((s, c) => s + (c.opened / c.sent) * 100, 0) /
      campaigns.filter((c) => c.sent > 0).length,
  );
  const avgConvRate = Math.round(
    campaigns.filter((c) => c.sent > 0).reduce((s, c) => s + (c.converted / c.sent) * 100, 0) /
      campaigns.filter((c) => c.sent > 0).length,
  );
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5 }}
      className="space-y-6 max-w-[1400px] mx-auto"
    >
      {' '}
      {/* Header */}{' '}
      <div className="flex items-center justify-between flex-wrap gap-4">
        {' '}
        <div>
          {' '}
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--heading)' }}>
            Smart Campaigns
          </h1>{' '}
          <p className="text-sm mt-1" style={{ color: 'var(--t3)' }}>
            AI-crafted campaigns that target the right members at the right time
          </p>{' '}
        </div>{' '}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm text-white"
          style={{
            background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
            fontWeight: 600,
            boxShadow: '0 4px 15px rgba(139,92,246,0.3)',
          }}
        >
          {' '}
          <Plus className="w-4 h-4" /> New Campaign{' '}
        </motion.button>{' '}
      </div>{' '}
      {/* KPI Row */}{' '}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {' '}
        {[
          {
            label: 'Total Sent',
            value: totalSent.toString(),
            icon: Send,
            gradient: 'from-violet-500 to-purple-600',
            sub: 'This month',
          },
          {
            label: 'Avg Open Rate',
            value: `${avgOpenRate}%`,
            icon: Eye,
            gradient: 'from-cyan-500 to-teal-500',
            sub: 'Industry avg: 45%',
          },
          {
            label: 'Avg Conversion',
            value: `${avgConvRate}%`,
            icon: Target,
            gradient: 'from-emerald-500 to-green-500',
            sub: '+4% vs last month',
          },
          {
            label: 'Campaign Revenue',
            value: `$${(totalRevenue / 1000).toFixed(1)}K`,
            icon: DollarSign,
            gradient: 'from-amber-500 to-orange-500',
            sub: 'From all campaigns',
          },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              {' '}
              <Card>
                {' '}
                <div className="flex items-center gap-3">
                  {' '}
                  <div
                    className={`w-10 h-10 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center`}
                  >
                    {' '}
                    <Icon className="w-5 h-5 text-white" />{' '}
                  </div>{' '}
                  <div>
                    {' '}
                    <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--heading)' }}>
                      {kpi.value}
                    </div>{' '}
                    <div className="text-[11px]" style={{ color: 'var(--t3)' }}>
                      {kpi.label}
                    </div>{' '}
                  </div>{' '}
                </div>{' '}
                <div className="text-[10px] mt-2" style={{ color: 'var(--t4)' }}>
                  {kpi.sub}
                </div>{' '}
              </Card>{' '}
            </motion.div>
          );
        })}{' '}
      </div>{' '}
      {/* Charts + AI Suggestions */}{' '}
      <div className="grid lg:grid-cols-3 gap-4">
        {' '}
        {/* Funnel Chart */}{' '}
        <Card className="lg:col-span-2">
          {' '}
          <h3
            className="mb-4"
            style={{ fontSize: '14px', fontWeight: 700, color: 'var(--heading)' }}
          >
            Weekly Campaign Performance
          </h3>{' '}
          <ResponsiveContainer width="100%" height={240}>
            {' '}
            <BarChart data={campaignPerformance}>
              {' '}
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />{' '}
              <XAxis
                dataKey="week"
                stroke="var(--chart-axis)"
                tick={{ fill: 'var(--chart-tick)', fontSize: 11 }}
              />{' '}
              <YAxis
                stroke="var(--chart-axis)"
                tick={{ fill: 'var(--chart-tick)', fontSize: 11 }}
              />{' '}
              <Tooltip content={<CustomTooltip />} />{' '}
              <Bar dataKey="sent" name="Sent" fill="#8B5CF6" radius={[4, 4, 0, 0]} />{' '}
              <Bar dataKey="opened" name="Opened" fill="#06B6D4" radius={[4, 4, 0, 0]} />{' '}
              <Bar dataKey="clicked" name="Clicked" fill="#10B981" radius={[4, 4, 0, 0]} />{' '}
              <Bar dataKey="converted" name="Converted" fill="#F59E0B" radius={[4, 4, 0, 0]} />{' '}
            </BarChart>{' '}
          </ResponsiveContainer>{' '}
          <div className="flex items-center gap-6 mt-3 text-[10px]">
            {' '}
            {[
              { label: 'Sent', color: '#8B5CF6' },
              { label: 'Opened', color: '#06B6D4' },
              { label: 'Clicked', color: '#10B981' },
              { label: 'Converted', color: '#F59E0B' },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                {' '}
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />{' '}
                <span style={{ color: 'var(--t3)' }}>{l.label}</span>{' '}
              </div>
            ))}{' '}
          </div>{' '}
        </Card>{' '}
        {/* AI Suggestions */}{' '}
        <Card>
          {' '}
          <div className="flex items-center gap-2 mb-4">
            {' '}
            <Sparkles className="w-4 h-4 text-violet-400" />{' '}
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--heading)' }}>
              AI Suggestions
            </h3>{' '}
          </div>{' '}
          <div className="space-y-3">
            {' '}
            {aiSuggestions.map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="p-3 rounded-xl cursor-pointer transition-all hover:scale-[1.02]"
                style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}
              >
                {' '}
                <div className="flex items-start justify-between mb-1.5">
                  {' '}
                  <span className="text-xs" style={{ fontWeight: 700, color: 'var(--heading)' }}>
                    {s.title}
                  </span>{' '}
                  <span className="text-[10px] text-emerald-400" style={{ fontWeight: 700 }}>
                    {s.impact}
                  </span>{' '}
                </div>{' '}
                <p className="text-[11px] mb-2" style={{ color: 'var(--t3)', lineHeight: 1.5 }}>
                  {s.desc}
                </p>{' '}
                <div className="flex items-center justify-between">
                  {' '}
                  <div className="flex items-center gap-1">
                    {' '}
                    <div
                      className="w-12 h-1 rounded-full overflow-hidden"
                      style={{ background: 'var(--subtle)' }}
                    >
                      {' '}
                      <div
                        className="h-full rounded-full"
                        style={{
                          background: 'linear-gradient(90deg, #8B5CF6, #06B6D4)',
                          width: `${s.confidence}%`,
                        }}
                      />{' '}
                    </div>{' '}
                    <span className="text-[9px]" style={{ color: 'var(--t4)' }}>
                      {s.confidence}%
                    </span>{' '}
                  </div>{' '}
                  <button
                    className="flex items-center gap-1 text-[10px] text-violet-400"
                    style={{ fontWeight: 600 }}
                  >
                    {' '}
                    Launch <ChevronRight className="w-3 h-3" />{' '}
                  </button>{' '}
                </div>{' '}
              </motion.div>
            ))}{' '}
          </div>{' '}
        </Card>{' '}
      </div>{' '}
      {/* Channel Performance */}{' '}
      <Card>
        {' '}
        <h3 className="mb-4" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--heading)' }}>
          Channel Performance
        </h3>{' '}
        <div className="grid md:grid-cols-3 gap-4">
          {' '}
          {channelPerformance.map((ch) => (
            <div
              key={ch.channel}
              className="p-4 rounded-xl"
              style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}
            >
              {' '}
              <div className="flex items-center gap-2 mb-3">
                {' '}
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'var(--pill-active)' }}
                >
                  {' '}
                  <ChannelIcon channel={ch.channel.toLowerCase()} />{' '}
                </div>{' '}
                <span className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>
                  {ch.channel}
                </span>{' '}
              </div>{' '}
              <div className="grid grid-cols-2 gap-3">
                {' '}
                {[
                  { label: 'Sent', value: ch.sent },
                  { label: 'Open Rate', value: `${ch.openRate}%` },
                  { label: 'Click Rate', value: `${ch.clickRate}%` },
                  { label: 'Revenue', value: `$${ch.revenue.toLocaleString()}` },
                ].map((stat) => (
                  <div key={stat.label}>
                    {' '}
                    <div className="text-[10px]" style={{ color: 'var(--t4)' }}>
                      {stat.label}
                    </div>{' '}
                    <div className="text-xs" style={{ color: 'var(--t1)', fontWeight: 700 }}>
                      {stat.value}
                    </div>{' '}
                  </div>
                ))}{' '}
              </div>{' '}
            </div>
          ))}{' '}
        </div>{' '}
      </Card>{' '}
      {/* Campaign List */}{' '}
      <div>
        {' '}
        <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
          {' '}
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--heading)' }}>
            All Campaigns
          </h3>{' '}
          <div className="flex items-center gap-3">
            {' '}
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{
                background: 'var(--subtle)',
                border: '1px solid var(--card-border)',
                minWidth: 200,
              }}
            >
              {' '}
              <Search className="w-4 h-4" style={{ color: 'var(--t4)' }} />{' '}
              <input
                placeholder="Search campaigns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-sm w-full"
                style={{ color: 'var(--t1)' }}
              />{' '}
            </div>{' '}
            <div
              className="flex rounded-xl overflow-hidden"
              style={{ border: '1px solid var(--card-border)' }}
            >
              {' '}
              {(['all', 'active', 'completed', 'draft', 'paused'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className="px-3 py-2 text-[11px] capitalize transition-all"
                  style={{
                    background: statusFilter === s ? 'var(--pill-active)' : 'transparent',
                    color: statusFilter === s ? (isDark ? '#C4B5FD' : '#7C3AED') : 'var(--t3)',
                    fontWeight: statusFilter === s ? 600 : 500,
                  }}
                >
                  {' '}
                  {s}{' '}
                </button>
              ))}{' '}
            </div>{' '}
          </div>{' '}
        </div>{' '}
        <div className="space-y-3">
          {' '}
          {filtered.map((campaign, i) => {
            const isExpanded = expandedCampaign === campaign.id;
            const openRate =
              campaign.sent > 0 ? Math.round((campaign.opened / campaign.sent) * 100) : 0;
            const clickRate =
              campaign.sent > 0 ? Math.round((campaign.clicked / campaign.sent) * 100) : 0;
            const convRate =
              campaign.sent > 0 ? Math.round((campaign.converted / campaign.sent) * 100) : 0;
            return (
              <motion.div
                key={campaign.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                {' '}
                <Card className="!p-0 overflow-hidden">
                  {' '}
                  <div
                    className="flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors"
                    onClick={() => setExpandedCampaign(isExpanded ? null : campaign.id)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {' '}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: 'var(--pill-active)' }}
                    >
                      {' '}
                      <ChannelIcon channel={campaign.channel} />{' '}
                    </div>{' '}
                    <div className="flex-1 min-w-0">
                      {' '}
                      <div className="flex items-center gap-2">
                        {' '}
                        <span
                          className="text-sm truncate"
                          style={{ fontWeight: 600, color: 'var(--heading)' }}
                        >
                          {campaign.name}
                        </span>{' '}
                        {campaign.aiGenerated && (
                          <span
                            className="text-[8px] tracking-wider uppercase px-1.5 py-0.5 rounded"
                            style={{
                              background: 'rgba(139,92,246,0.12)',
                              color: '#A78BFA',
                              fontWeight: 700,
                            }}
                          >
                            AI
                          </span>
                        )}{' '}
                      </div>{' '}
                      <div
                        className="flex items-center gap-3 mt-0.5 text-[11px]"
                        style={{ color: 'var(--t3)' }}
                      >
                        {' '}
                        <span>{campaign.type}</span> <span>{campaign.createdAt}</span>{' '}
                        <span>{campaign.audience} recipients</span>{' '}
                      </div>{' '}
                    </div>{' '}
                    {campaign.sent > 0 && (
                      <div className="hidden md:flex items-center gap-6 text-xs">
                        {' '}
                        <div className="text-center">
                          {' '}
                          <div style={{ color: 'var(--t1)', fontWeight: 700 }}>
                            {openRate}%
                          </div>{' '}
                          <div className="text-[9px]" style={{ color: 'var(--t4)' }}>
                            Opens
                          </div>{' '}
                        </div>{' '}
                        <div className="text-center">
                          {' '}
                          <div style={{ color: 'var(--t1)', fontWeight: 700 }}>
                            {clickRate}%
                          </div>{' '}
                          <div className="text-[9px]" style={{ color: 'var(--t4)' }}>
                            Clicks
                          </div>{' '}
                        </div>{' '}
                        <div className="text-center">
                          {' '}
                          <div className="text-emerald-400" style={{ fontWeight: 700 }}>
                            {convRate}%
                          </div>{' '}
                          <div className="text-[9px]" style={{ color: 'var(--t4)' }}>
                            Conv
                          </div>{' '}
                        </div>{' '}
                      </div>
                    )}{' '}
                    <div className="text-right hidden sm:block">
                      {' '}
                      {campaign.revenue > 0 && (
                        <div className="text-xs text-emerald-400" style={{ fontWeight: 700 }}>
                          ${campaign.revenue.toLocaleString()}
                        </div>
                      )}{' '}
                    </div>{' '}
                    <StatusBadge status={campaign.status} />{' '}
                    <motion.div
                      animate={{ rotate: isExpanded ? 90 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {' '}
                      <ChevronRight className="w-4 h-4" style={{ color: 'var(--t4)' }} />{' '}
                    </motion.div>{' '}
                  </div>{' '}
                  <AnimatePresence>
                    {' '}
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        {' '}
                        <div
                          className="px-5 pb-5 pt-2 space-y-4"
                          style={{ borderTop: '1px solid var(--divider)' }}
                        >
                          {' '}
                          <p className="text-sm" style={{ color: 'var(--t2)', lineHeight: 1.6 }}>
                            {campaign.description}
                          </p>{' '}
                          {campaign.sent > 0 && (
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                              {' '}
                              {[
                                { label: 'Sent', value: campaign.sent, color: 'var(--t1)' },
                                {
                                  label: 'Opened',
                                  value: `${campaign.opened} (${openRate}%)`,
                                  color: '#06B6D4',
                                },
                                {
                                  label: 'Clicked',
                                  value: `${campaign.clicked} (${clickRate}%)`,
                                  color: '#8B5CF6',
                                },
                                {
                                  label: 'Converted',
                                  value: `${campaign.converted} (${convRate}%)`,
                                  color: '#10B981',
                                },
                                {
                                  label: 'Revenue',
                                  value: `$${campaign.revenue.toLocaleString()}`,
                                  color: '#F59E0B',
                                },
                              ].map((stat) => (
                                <div
                                  key={stat.label}
                                  className="p-3 rounded-lg text-center"
                                  style={{ background: 'var(--subtle)' }}
                                >
                                  {' '}
                                  <div className="text-[10px] mb-1" style={{ color: 'var(--t4)' }}>
                                    {stat.label}
                                  </div>{' '}
                                  <div
                                    className="text-xs"
                                    style={{ color: stat.color, fontWeight: 700 }}
                                  >
                                    {stat.value}
                                  </div>{' '}
                                </div>
                              ))}{' '}
                            </div>
                          )}{' '}
                          {/* Funnel visualization */}{' '}
                          {campaign.sent > 0 && (
                            <div className="flex items-center gap-1">
                              {' '}
                              {[
                                { label: 'Sent', val: campaign.sent, color: '#8B5CF6' },
                                { label: 'Opened', val: campaign.opened, color: '#06B6D4' },
                                { label: 'Clicked', val: campaign.clicked, color: '#10B981' },
                                { label: 'Converted', val: campaign.converted, color: '#F59E0B' },
                              ].map((step, si) => (
                                <div key={step.label} className="flex items-center gap-1 flex-1">
                                  {' '}
                                  <div className="flex-1">
                                    {' '}
                                    <div
                                      className="h-2 rounded-full"
                                      style={{
                                        background: step.color,
                                        width: `${(step.val / campaign.sent) * 100}%`,
                                        opacity: 0.7,
                                      }}
                                    />{' '}
                                    <div className="text-[9px] mt-1" style={{ color: 'var(--t4)' }}>
                                      {step.label}: {step.val}
                                    </div>{' '}
                                  </div>{' '}
                                  {si < 3 && (
                                    <ChevronRight
                                      className="w-3 h-3 shrink-0"
                                      style={{ color: 'var(--t5)' }}
                                    />
                                  )}{' '}
                                </div>
                              ))}{' '}
                            </div>
                          )}{' '}
                          <div className="flex items-center gap-2 justify-end">
                            {' '}
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px]"
                              style={{
                                background: 'var(--subtle)',
                                border: '1px solid var(--card-border)',
                                color: 'var(--t2)',
                                fontWeight: 500,
                              }}
                            >
                              {' '}
                              <Copy className="w-3.5 h-3.5" /> Duplicate{' '}
                            </motion.button>{' '}
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px]"
                              style={{
                                background: 'var(--subtle)',
                                border: '1px solid var(--card-border)',
                                color: 'var(--t2)',
                                fontWeight: 500,
                              }}
                            >
                              {' '}
                              <BarChart3 className="w-3.5 h-3.5" /> Full Report{' '}
                            </motion.button>{' '}
                          </div>{' '}
                        </div>{' '}
                      </motion.div>
                    )}{' '}
                  </AnimatePresence>{' '}
                </Card>{' '}
              </motion.div>
            );
          })}{' '}
        </div>{' '}
      </div>{' '}
    </motion.div>
  );
}
