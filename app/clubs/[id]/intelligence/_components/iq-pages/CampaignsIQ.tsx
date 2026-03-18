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
  Smartphone,
  X,
  AlertTriangle,
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
/* ============================================= */ /*            CAMPAIGNS PAGE                      */ /* ============================================= */ export function CampaignsIQ({ campaignData, campaignListData, isLoading: externalLoading, clubId }: { campaignData?: any; campaignListData?: any; isLoading?: boolean; clubId?: string } = {}) {
  const { isDark } = useTheme();
  const [statusFilter, setStatusFilter] = useState<'all' | CampaignStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [ncStep, setNcStep] = useState(0); // 0=audience, 1=message, 2=preview
  const [ncAudience, setNcAudience] = useState<string>('at-risk');
  const [ncChannel, setNcChannel] = useState<'email' | 'sms' | 'both'>('email');
  const [ncSubject, setNcSubject] = useState('');
  const [ncMessage, setNcMessage] = useState('');
  const [ncSent, setNcSent] = useState(false);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const filtered = campaigns.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  // Use real data for KPIs if available, otherwise derive from mocks
  const totalSent = campaignData?.totalSent ?? campaigns.reduce((s, c) => s + c.sent, 0);
  const totalRevenue = campaignData?.totalRevenue ?? campaigns.reduce((s, c) => s + c.revenue, 0);
  const avgOpenRate = campaignData?.totalSent
    ? Math.round((campaignData.totalOpened / campaignData.totalSent) * 100)
    : Math.round(campaigns.filter((c) => c.sent > 0).reduce((s, c) => s + (c.opened / c.sent) * 100, 0) / campaigns.filter((c) => c.sent > 0).length);
  const avgConvRate = campaignData?.totalSent
    ? Math.round((campaignData.totalConverted / campaignData.totalSent) * 100)
    : Math.round(campaigns.filter((c) => c.sent > 0).reduce((s, c) => s + (c.converted / c.sent) * 100, 0) / campaigns.filter((c) => c.sent > 0).length);
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
          onClick={() => { setShowNewCampaign(true); setNcStep(0); setNcSent(false); setNcSubject(''); setNcMessage(''); }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm text-white"
          style={{
            background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
            fontWeight: 600,
            boxShadow: '0 4px 15px rgba(139,92,246,0.3)',
          }}
        >
          <Plus className="w-4 h-4" /> New Campaign
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
      {/* Message Variant Performance */}
      <Card>
        <h3 className="mb-4" style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Message Variant Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--divider)" }}>
                {["Variant", "Source", "Sent", "Open Rate", "Click Rate", "Score"].map((h) => (
                  <th key={h} className="text-left text-[10px] uppercase tracking-wider pb-3 px-2" style={{ color: "var(--t4)", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { name: "Friendly Check-in v2", source: "LLM", sent: 234, openRate: 68, clickRate: 42, score: 8.5 },
                { name: "Standard Check-in", source: "Template", sent: 189, openRate: 54, clickRate: 31, score: 6.8 },
                { name: "Retention Boost - Personalized", source: "LLM", sent: 156, openRate: 72, clickRate: 48, score: 9.1 },
                { name: "Retention Boost - Standard", source: "Template", sent: 143, openRate: 58, clickRate: 35, score: 7.2 },
              ].map((v) => (
                <tr key={v.name} style={{ borderBottom: "1px solid var(--divider)" }}>
                  <td className="py-3 px-2 text-sm" style={{ color: "var(--t1)", fontWeight: 600 }}>{v.name}</td>
                  <td className="py-3 px-2">
                    <span className="px-2 py-0.5 rounded text-[10px]" style={{
                      background: v.source === "LLM" ? "rgba(6,182,212,0.15)" : "rgba(255,255,255,0.06)",
                      color: v.source === "LLM" ? "#22D3EE" : "var(--t3)",
                      fontWeight: 600,
                    }}>{v.source}</span>
                  </td>
                  <td className="py-3 px-2 text-sm" style={{ color: "var(--t2)" }}>{v.sent}</td>
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
                        <div className="h-full rounded-full" style={{ background: "#10B981", width: `${v.openRate}%` }} />
                      </div>
                      <span className="text-xs" style={{ color: "var(--t2)" }}>{v.openRate}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
                        <div className="h-full rounded-full" style={{ background: "#8B5CF6", width: `${v.clickRate}%` }} />
                      </div>
                      <span className="text-xs" style={{ color: "var(--t2)" }}>{v.clickRate}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-sm" style={{ color: v.score >= 8.5 ? "#10B981" : "var(--t1)", fontWeight: 700 }}>{v.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* LLM vs Template Comparison */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #06B6D4, #8B5CF6)" }}>
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>LLM-Generated</h3>
              <p className="text-[11px]" style={{ color: "var(--t4)" }}>Personalized messages</p>
            </div>
            <span className="ml-auto px-2.5 py-1 rounded-lg text-[10px]" style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", fontWeight: 700 }}>WINNER</span>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: "var(--t3)" }}>Open Rate</span>
                <span className="text-sm" style={{ color: "var(--t1)", fontWeight: 700 }}>70%</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
                <div className="h-full rounded-full" style={{ background: "linear-gradient(90deg, #06B6D4, #10B981)", width: "70%" }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: "var(--t3)" }}>Click Rate</span>
                <span className="text-sm" style={{ color: "var(--t1)", fontWeight: 700 }}>45%</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
                <div className="h-full rounded-full" style={{ background: "linear-gradient(90deg, #06B6D4, #10B981)", width: "45%" }} />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
              <span className="text-sm" style={{ color: "var(--t3)", fontWeight: 700 }}>T</span>
            </div>
            <div>
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Template</h3>
              <p className="text-[11px]" style={{ color: "var(--t4)" }}>Standard messages</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: "var(--t3)" }}>Open Rate</span>
                <span className="text-sm" style={{ color: "var(--t1)", fontWeight: 700 }}>56%</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
                <div className="h-full rounded-full" style={{ background: "var(--t4)", width: "56%" }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: "var(--t3)" }}>Click Rate</span>
                <span className="text-sm" style={{ color: "var(--t1)", fontWeight: 700 }}>33%</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
                <div className="h-full rounded-full" style={{ background: "var(--t4)", width: "33%" }} />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <h3 className="mb-4" style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Recent Activity</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--divider)" }}>
                {["Date", "Member", "Type", "Channel", "Status"].map((h) => (
                  <th key={h} className="text-left text-[10px] uppercase tracking-wider pb-3 px-2" style={{ color: "var(--t4)", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { date: "Mar 16, 2:34 PM", member: "Sarah Johnson", type: "CHECK IN", channel: "Email", status: "Opened" },
                { date: "Mar 16, 1:22 PM", member: "Mike Chen", type: "SLOT FILLER", channel: "SMS", status: "Delivered" },
                { date: "Mar 16, 11:05 AM", member: "Lisa Park", type: "REACTIVATION", channel: "Email", status: "Clicked" },
                { date: "Mar 15, 6:45 PM", member: "Tom Rivera", type: "SLOT FILLER", channel: "SMS", status: "Converted" },
                { date: "Mar 15, 4:12 PM", member: "Anna Garcia", type: "REACTIVATION", channel: "Email", status: "Opened" },
                { date: "Mar 15, 2:30 PM", member: "James Wilson", type: "CHECK IN", channel: "Email", status: "Delivered" },
                { date: "Mar 15, 10:15 AM", member: "Rachel Kim", type: "EVENT", channel: "Email", status: "Clicked" },
                { date: "Mar 14, 5:20 PM", member: "David Brown", type: "REACTIVATION", channel: "SMS", status: "Delivered" },
              ].map((a, i) => {
                const statusColors: Record<string, { bg: string; text: string }> = {
                  Opened: { bg: "rgba(16,185,129,0.1)", text: "#10B981" },
                  Clicked: { bg: "rgba(139,92,246,0.1)", text: "#A78BFA" },
                  Converted: { bg: "rgba(6,182,212,0.1)", text: "#22D3EE" },
                  Delivered: { bg: "rgba(255,255,255,0.04)", text: "var(--t3)" },
                };
                const sc = statusColors[a.status] || statusColors.Delivered;
                return (
                  <tr key={i} style={{ borderBottom: "1px solid var(--divider)" }}>
                    <td className="py-3 px-2 text-xs" style={{ color: "var(--t4)" }}>{a.date}</td>
                    <td className="py-3 px-2 text-sm" style={{ color: "var(--t1)", fontWeight: 600 }}>{a.member}</td>
                    <td className="py-3 px-2">
                      <span className="px-2 py-0.5 rounded text-[10px]" style={{ background: "rgba(255,255,255,0.04)", color: "var(--t3)", fontWeight: 600 }}>{a.type}</span>
                    </td>
                    <td className="py-3 px-2 text-xs" style={{ color: "var(--t2)" }}>{a.channel}</td>
                    <td className="py-3 px-2">
                      <span className="px-2 py-0.5 rounded text-[10px]" style={{ background: sc.bg, color: sc.text, fontWeight: 600 }}>{a.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Campaign List */}
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
        <Card className="!p-0 overflow-hidden">
          {filtered.map((campaign, i) => {
            const isExpanded = expandedCampaign === campaign.id;
            const openRate =
              campaign.sent > 0 ? Math.round((campaign.opened / campaign.sent) * 100) : 0;
            const clickRate =
              campaign.sent > 0 ? Math.round((campaign.clicked / campaign.sent) * 100) : 0;
            const convRate =
              campaign.sent > 0 ? Math.round((campaign.converted / campaign.sent) * 100) : 0;
            return (
              <div key={campaign.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                <div
                  className="grid items-center px-5 py-4 cursor-pointer transition-colors"
                  style={{
                    gridTemplateColumns: '40px 1fr repeat(3, 52px) 72px 100px 20px',
                    gap: '0 16px',
                  }}
                  onClick={() => setExpandedCampaign(isExpanded ? null : campaign.id)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--pill-active)' }}
                  >
                    <ChannelIcon channel={campaign.channel} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm truncate"
                        style={{ fontWeight: 600, color: 'var(--heading)' }}
                      >
                        {campaign.name}
                      </span>
                      {campaign.aiGenerated && (
                        <span
                          className="text-[8px] tracking-wider uppercase px-1.5 py-0.5 rounded shrink-0"
                          style={{
                            background: 'rgba(139,92,246,0.12)',
                            color: '#A78BFA',
                            fontWeight: 700,
                          }}
                        >
                          AI
                        </span>
                      )}
                    </div>
                    <div
                      className="flex items-center gap-3 mt-0.5 text-[11px]"
                      style={{ color: 'var(--t3)' }}
                    >
                      <span>{campaign.type}</span>
                      <span>{campaign.createdAt}</span>
                      <span>{campaign.audience} recipients</span>
                    </div>
                  </div>
                  <div className="text-center text-xs hidden md:block">
                    {campaign.sent > 0 ? (
                      <>
                        <div style={{ color: 'var(--t1)', fontWeight: 700 }}>{openRate}%</div>
                        <div className="text-[9px]" style={{ color: 'var(--t4)' }}>Opens</div>
                      </>
                    ) : <span style={{ color: 'var(--t4)' }}>—</span>}
                  </div>
                  <div className="text-center text-xs hidden md:block">
                    {campaign.sent > 0 ? (
                      <>
                        <div style={{ color: 'var(--t1)', fontWeight: 700 }}>{clickRate}%</div>
                        <div className="text-[9px]" style={{ color: 'var(--t4)' }}>Clicks</div>
                      </>
                    ) : <span style={{ color: 'var(--t4)' }}>—</span>}
                  </div>
                  <div className="text-center text-xs hidden md:block">
                    {campaign.sent > 0 ? (
                      <>
                        <div className="text-emerald-400" style={{ fontWeight: 700 }}>{convRate}%</div>
                        <div className="text-[9px]" style={{ color: 'var(--t4)' }}>Conv</div>
                      </>
                    ) : <span style={{ color: 'var(--t4)' }}>—</span>}
                  </div>
                  <div className="text-right text-xs hidden sm:block">
                    {campaign.revenue > 0 ? (
                      <span className="text-emerald-400" style={{ fontWeight: 700 }}>
                        ${campaign.revenue.toLocaleString()}
                      </span>
                    ) : <span style={{ color: 'var(--t4)' }}>—</span>}
                  </div>
                  <StatusBadge status={campaign.status} />
                  <motion.div
                    animate={{ rotate: isExpanded ? 90 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronRight className="w-4 h-4" style={{ color: 'var(--t4)' }} />
                  </motion.div>
                </div>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div
                        className="px-5 pb-5 pt-2 space-y-4"
                        style={{ borderTop: '1px solid var(--divider)' }}
                      >
                        <p className="text-sm" style={{ color: 'var(--t2)', lineHeight: 1.6 }}>
                          {campaign.description}
                        </p>
                        {campaign.sent > 0 && (
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {[
                              { label: 'Sent', value: campaign.sent, color: 'var(--t1)' },
                              { label: 'Opened', value: `${campaign.opened} (${openRate}%)`, color: '#06B6D4' },
                              { label: 'Clicked', value: `${campaign.clicked} (${clickRate}%)`, color: '#8B5CF6' },
                              { label: 'Converted', value: `${campaign.converted} (${convRate}%)`, color: '#10B981' },
                              { label: 'Revenue', value: `$${campaign.revenue.toLocaleString()}`, color: '#F59E0B' },
                            ].map((stat) => (
                              <div key={stat.label} className="p-3 rounded-lg text-center" style={{ background: 'var(--subtle)' }}>
                                <div className="text-[10px] mb-1" style={{ color: 'var(--t4)' }}>{stat.label}</div>
                                <div className="text-xs" style={{ color: stat.color, fontWeight: 700 }}>{stat.value}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {campaign.sent > 0 && (
                          <div className="flex items-center gap-1">
                            {[
                              { label: 'Sent', val: campaign.sent, color: '#8B5CF6' },
                              { label: 'Opened', val: campaign.opened, color: '#06B6D4' },
                              { label: 'Clicked', val: campaign.clicked, color: '#10B981' },
                              { label: 'Converted', val: campaign.converted, color: '#F59E0B' },
                            ].map((step, si) => (
                              <div key={step.label} className="flex items-center gap-1 flex-1">
                                <div className="flex-1">
                                  <div className="h-2 rounded-full" style={{ background: step.color, width: `${(step.val / campaign.sent) * 100}%`, opacity: 0.7 }} />
                                  <div className="text-[9px] mt-1" style={{ color: 'var(--t4)' }}>{step.label}: {step.val}</div>
                                </div>
                                {si < 3 && <ChevronRight className="w-3 h-3 shrink-0" style={{ color: 'var(--t5)' }} />}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2 justify-end">
                          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px]" style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--t2)', fontWeight: 500 }}>
                            <Copy className="w-3.5 h-3.5" /> Duplicate
                          </motion.button>
                          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px]" style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--t2)', fontWeight: 500 }}>
                            <BarChart3 className="w-3.5 h-3.5" /> Full Report
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </Card>
      </div>

      {/* New Campaign Modal */}
      <AnimatePresence>
        {showNewCampaign && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
            onClick={() => setShowNewCampaign(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl overflow-hidden"
              style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "0 25px 60px rgba(0,0,0,0.5)" }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--card-border)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}>
                    <Megaphone className="w-4 h-4 text-white" />
                  </div>
                  <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--heading)" }}>New Campaign</h2>
                </div>
                <button onClick={() => setShowNewCampaign(false)} className="p-1.5 rounded-lg transition-colors" style={{ color: "var(--t3)" }}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Steps indicator */}
              <div className="px-6 pt-4 flex items-center gap-2">
                {["Audience", "Message", "Preview"].map((step, i) => (
                  <div key={step} className="flex items-center gap-2 flex-1">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px]"
                      style={{
                        background: i <= ncStep ? "linear-gradient(135deg, #8B5CF6, #06B6D4)" : "var(--subtle)",
                        color: i <= ncStep ? "#fff" : "var(--t4)",
                        fontWeight: 700,
                      }}
                    >
                      {ncSent && i === 2 ? "✓" : i + 1}
                    </div>
                    <span className="text-[11px]" style={{ color: i <= ncStep ? "var(--t1)" : "var(--t4)", fontWeight: i === ncStep ? 600 : 400 }}>{step}</span>
                    {i < 2 && <div className="flex-1 h-px" style={{ background: i < ncStep ? "#8B5CF6" : "var(--card-border)" }} />}
                  </div>
                ))}
              </div>

              {/* Step Content */}
              <div className="px-6 py-5 space-y-4" style={{ minHeight: 240 }}>
                {ncStep === 0 && (
                  <>
                    <div>
                      <label className="text-[11px] uppercase tracking-wider mb-2 block" style={{ color: "var(--t4)", fontWeight: 600 }}>Target Audience</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: "at-risk", label: "At-Risk Members", count: 18, icon: AlertTriangle, color: "#F59E0B" },
                          { id: "critical", label: "Critical Members", count: 12, icon: AlertTriangle, color: "#EF4444" },
                          { id: "inactive-14d", label: "Inactive 14+ Days", count: 22, icon: Clock, color: "#06B6D4" },
                          { id: "all", label: "All Members", count: 127, icon: Users, color: "#8B5CF6" },
                        ].map((a) => {
                          const Icon = a.icon;
                          return (
                            <button
                              key={a.id}
                              onClick={() => setNcAudience(a.id)}
                              className="flex items-center gap-2.5 p-3 rounded-xl text-left transition-all"
                              style={{
                                background: ncAudience === a.id ? "rgba(139,92,246,0.1)" : "var(--subtle)",
                                border: `1px solid ${ncAudience === a.id ? "rgba(139,92,246,0.4)" : "var(--card-border)"}`,
                              }}
                            >
                              <Icon className="w-4 h-4 shrink-0" style={{ color: a.color }} />
                              <div>
                                <div className="text-xs" style={{ color: "var(--t1)", fontWeight: 600 }}>{a.label}</div>
                                <div className="text-[10px]" style={{ color: "var(--t4)" }}>{a.count} members</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-wider mb-2 block" style={{ color: "var(--t4)", fontWeight: 600 }}>Channel</label>
                      <div className="flex gap-2">
                        {([
                          { id: "email" as const, label: "Email", icon: Mail },
                          { id: "sms" as const, label: "SMS", icon: Smartphone },
                          { id: "both" as const, label: "Both", icon: Send },
                        ]).map((ch) => {
                          const Icon = ch.icon;
                          return (
                            <button
                              key={ch.id}
                              onClick={() => setNcChannel(ch.id)}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-all"
                              style={{
                                background: ncChannel === ch.id ? "rgba(139,92,246,0.15)" : "var(--subtle)",
                                border: `1px solid ${ncChannel === ch.id ? "rgba(139,92,246,0.4)" : "var(--card-border)"}`,
                                color: ncChannel === ch.id ? "#A78BFA" : "var(--t3)",
                                fontWeight: ncChannel === ch.id ? 600 : 400,
                              }}
                            >
                              <Icon className="w-3.5 h-3.5" /> {ch.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {ncStep === 1 && (
                  <>
                    {(ncChannel === "email" || ncChannel === "both") && (
                      <div>
                        <label className="text-[11px] uppercase tracking-wider mb-2 block" style={{ color: "var(--t4)", fontWeight: 600 }}>Subject Line</label>
                        <input
                          value={ncSubject}
                          onChange={(e) => setNcSubject(e.target.value)}
                          placeholder="e.g. We miss you at the club!"
                          className="w-full px-3 py-2.5 rounded-xl text-sm bg-transparent outline-none"
                          style={{ border: "1px solid var(--card-border)", color: "var(--t1)" }}
                        />
                      </div>
                    )}
                    <div>
                      <label className="text-[11px] uppercase tracking-wider mb-2 block" style={{ color: "var(--t4)", fontWeight: 600 }}>Message</label>
                      <textarea
                        value={ncMessage}
                        onChange={(e) => setNcMessage(e.target.value)}
                        placeholder={ncChannel === "sms" ? "Hey {name}, we have 3 open sessions this week..." : "Hi {name},\n\nWe noticed you haven't played in a while..."}
                        rows={5}
                        className="w-full px-3 py-2.5 rounded-xl text-sm bg-transparent outline-none resize-none"
                        style={{ border: "1px solid var(--card-border)", color: "var(--t1)" }}
                      />
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-[10px]" style={{ color: "var(--t4)" }}>Use {"{ name }"} for personalization</p>
                        <button
                          onClick={() => {
                            if (ncChannel === "sms") {
                              setNcMessage("[IQSport] Hey {name}, we have open sessions this week that match your preferences. Book now at app.iqsport.ai. Reply STOP to opt out.");
                              setNcSubject("");
                            } else {
                              setNcSubject("We miss you at the club, {name}!");
                              setNcMessage("Hi {name},\n\nWe noticed you haven't played in a while and wanted to reach out.\n\nWe have 3 open sessions this week that match your preferences:\n- Thursday Open Play at 6 PM (4 spots left)\n- Saturday Clinic at 9 AM (6 spots left)\n- Sunday Round Robin at 10 AM (2 spots left)\n\nBook now and get back on the court!\n\nBest,\nYour Club Team");
                            }
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] transition-all"
                          style={{ background: "rgba(139,92,246,0.1)", color: "#A78BFA", fontWeight: 600, border: "1px solid rgba(139,92,246,0.2)" }}
                        >
                          <Sparkles className="w-3 h-3" /> AI Generate
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {ncStep === 2 && !ncSent && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span style={{ color: "var(--t4)" }}>Audience:</span>
                          <span className="ml-1" style={{ color: "var(--t1)", fontWeight: 600 }}>
                            {ncAudience === "at-risk" ? "At-Risk Members (18)" : ncAudience === "critical" ? "Critical Members (12)" : ncAudience === "inactive-14d" ? "Inactive 14+ Days (22)" : "All Members (127)"}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: "var(--t4)" }}>Channel:</span>
                          <span className="ml-1" style={{ color: "var(--t1)", fontWeight: 600 }}>{ncChannel === "both" ? "Email + SMS" : ncChannel.toUpperCase()}</span>
                        </div>
                      </div>
                      {ncSubject && (
                        <div className="mt-2 text-xs">
                          <span style={{ color: "var(--t4)" }}>Subject:</span>
                          <span className="ml-1" style={{ color: "var(--t1)", fontWeight: 600 }}>{ncSubject}</span>
                        </div>
                      )}
                    </div>
                    <div className="p-4 rounded-xl" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
                      <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--t4)", fontWeight: 600 }}>Message Preview</div>
                      <div className="text-xs whitespace-pre-wrap" style={{ color: "var(--t2)", lineHeight: 1.6 }}>
                        {ncMessage.replace(/\{name\}/g, "Sarah Mitchell")}
                      </div>
                    </div>
                  </div>
                )}

                {ncStep === 2 && ncSent && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: "rgba(16,185,129,0.15)" }}>
                      <CheckCircle2 className="w-7 h-7" style={{ color: "#10B981" }} />
                    </div>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--heading)" }}>Campaign Sent!</h3>
                    <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>
                      {ncAudience === "at-risk" ? "18" : ncAudience === "critical" ? "12" : ncAudience === "inactive-14d" ? "22" : "127"} members will receive your message shortly.
                    </p>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: "1px solid var(--card-border)" }}>
                <button
                  onClick={() => { if (ncStep > 0 && !ncSent) setNcStep(ncStep - 1); else setShowNewCampaign(false); }}
                  className="px-4 py-2 rounded-xl text-xs"
                  style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t2)", fontWeight: 500 }}
                >
                  {ncStep === 0 || ncSent ? "Close" : "Back"}
                </button>
                {!ncSent && (
                  <button
                    onClick={() => {
                      if (ncStep < 2) setNcStep(ncStep + 1);
                      else setNcSent(true);
                    }}
                    disabled={ncStep === 1 && !ncMessage.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs text-white transition-all"
                    style={{
                      background: (ncStep === 1 && !ncMessage.trim()) ? "var(--subtle)" : "linear-gradient(135deg, #8B5CF6, #06B6D4)",
                      fontWeight: 600,
                      opacity: (ncStep === 1 && !ncMessage.trim()) ? 0.4 : 1,
                    }}
                  >
                    {ncStep === 2 ? <><Send className="w-3.5 h-3.5" /> Send Campaign</> : <>Next <ChevronRight className="w-3.5 h-3.5" /></>}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
