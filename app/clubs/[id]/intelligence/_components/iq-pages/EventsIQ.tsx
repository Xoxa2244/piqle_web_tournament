'use client'
import { useState, useRef } from 'react';
import { motion, useInView, AnimatePresence } from 'motion/react';
import {
  PartyPopper,
  CalendarDays,
  Users,
  DollarSign,
  Clock,
  MapPin,
  TrendingUp,
  Star,
  Sparkles,
  ChevronRight,
  Plus,
  Target,
  ArrowUpRight,
  Filter,
  Search,
  Ticket,
  Trophy,
  Music,
  Heart,
  Zap,
  Eye,
  CheckCircle2,
  AlertCircle,
  Megaphone,
  BarChart3,
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
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useTheme } from '../IQThemeProvider';
/* --- Mock Data --- */ const eventRevenue = [
  { month: 'Oct', revenue: 2400, events: 4 },
  { month: 'Nov', revenue: 3200, events: 5 },
  { month: 'Dec', revenue: 2800, events: 4 },
  { month: 'Jan', revenue: 3800, events: 6 },
  { month: 'Feb', revenue: 4200, events: 7 },
  { month: 'Mar', revenue: 4600, events: 8 },
];
const eventTypes = [
  { name: 'Tournaments', value: 35, color: '#8B5CF6' },
  { name: 'Open Play', value: 25, color: '#06B6D4' },
  { name: 'Clinics', value: 20, color: '#10B981' },
  { name: 'League Nights', value: 15, color: '#F59E0B' },
  { name: 'Special', value: 5, color: '#EF4444' },
];
type EventStatus = 'upcoming' | 'active' | 'completed' | 'cancelled';
interface ClubEvent {
  id: string;
  name: string;
  type: string;
  status: EventStatus;
  date: string;
  time: string;
  duration: string;
  court: string;
  sport: string;
  capacity: number;
  registered: number;
  waitlist: number;
  price: number;
  revenue: number;
  description: string;
  aiPrediction?: { attendance: number; revenue: number; confidence: number };
  tags: string[];
}
const events: ClubEvent[] = [
  {
    id: 'e1',
    name: 'Spring Championship Tournament',
    type: 'Tournament',
    status: 'upcoming',
    date: 'Mar 22, 2026',
    time: '9:00 AM',
    duration: '8 hours',
    court: 'All Courts',
    sport: 'Pickleball',
    capacity: 32,
    registered: 28,
    waitlist: 4,
    price: 45,
    revenue: 1260,
    description:
      'Annual spring championship with divisions for all skill levels. Prizes for top 3 in each division.',
    aiPrediction: { attendance: 31, revenue: 1395, confidence: 92 },
    tags: ['competitive', 'all-levels', 'prizes'],
  },
  {
    id: 'e2',
    name: 'Friday Night Social Mixer',
    type: 'Open Play',
    status: 'upcoming',
    date: 'Mar 21, 2026',
    time: '6:30 PM',
    duration: '3 hours',
    court: 'Courts 1-3',
    sport: 'Pickleball',
    capacity: 24,
    registered: 18,
    waitlist: 0,
    price: 20,
    revenue: 360,
    description:
      'Casual round-robin mixer with music, snacks, and drinks. Great for meeting new players!',
    aiPrediction: { attendance: 22, revenue: 440, confidence: 87 },
    tags: ['social', 'casual', 'food-included'],
  },
  {
    id: 'e3',
    name: 'Advanced Strategies Clinic',
    type: 'Clinic',
    status: 'upcoming',
    date: 'Mar 23, 2026',
    time: '10:00 AM',
    duration: '2 hours',
    court: 'Court 2',
    sport: 'Pickleball',
    capacity: 12,
    registered: 10,
    waitlist: 2,
    price: 35,
    revenue: 350,
    description:
      'Deep dive into advanced shot selection, positioning, and game strategy with Coach Mike.',
    aiPrediction: { attendance: 12, revenue: 420, confidence: 94 },
    tags: ['advanced', 'coaching', 'skills'],
  },
  {
    id: 'e4',
    name: 'Padel Introduction Workshop',
    type: 'Clinic',
    status: 'upcoming',
    date: 'Mar 24, 2026',
    time: '2:00 PM',
    duration: '90 min',
    court: 'Court 3',
    sport: 'Padel',
    capacity: 8,
    registered: 5,
    waitlist: 0,
    price: 25,
    revenue: 125,
    description: 'First time playing padel? Learn the basics in this beginner-friendly workshop.',
    aiPrediction: { attendance: 7, revenue: 175, confidence: 82 },
    tags: ['beginner', 'padel', 'intro'],
  },
  {
    id: 'e5',
    name: 'Thursday League Night',
    type: 'League',
    status: 'active',
    date: 'Mar 17, 2026',
    time: '6:00 PM',
    duration: '3 hours',
    court: 'Courts 1-4',
    sport: 'Pickleball',
    capacity: 32,
    registered: 30,
    waitlist: 2,
    price: 15,
    revenue: 450,
    description:
      'Weekly league play. Current season: Week 8 of 12. Standings updated after each night.',
    tags: ['league', 'weekly', 'competitive'],
  },
  {
    id: 'e6',
    name: "Valentine's Doubles Mixer",
    type: 'Open Play',
    status: 'completed',
    date: 'Feb 14, 2026',
    time: '7:00 PM',
    duration: '3 hours',
    court: 'All Courts',
    sport: 'Pickleball',
    capacity: 40,
    registered: 38,
    waitlist: 6,
    price: 25,
    revenue: 950,
    description:
      "Special Valentine's Day event with couples and singles divisions. Food and drinks included.",
    tags: ['social', 'special', 'couples'],
  },
  {
    id: 'e7',
    name: 'Winter Open Tournament',
    type: 'Tournament',
    status: 'completed',
    date: 'Feb 8, 2026',
    time: '8:00 AM',
    duration: '10 hours',
    court: 'All Courts',
    sport: 'Pickleball',
    capacity: 48,
    registered: 48,
    waitlist: 12,
    price: 50,
    revenue: 2400,
    description: 'Largest tournament of the season with players from 5 local clubs.',
    tags: ['competitive', 'inter-club', 'full'],
  },
  {
    id: 'e8',
    name: 'Kids Summer Camp Preview',
    type: 'Special',
    status: 'upcoming',
    date: 'Mar 29, 2026',
    time: '9:00 AM',
    duration: '4 hours',
    court: 'Courts 1-2',
    sport: 'Pickleball',
    capacity: 20,
    registered: 8,
    waitlist: 0,
    price: 15,
    revenue: 120,
    description: 'Free preview session for the upcoming summer kids camp. Ages 8-14.',
    aiPrediction: { attendance: 16, revenue: 240, confidence: 75 },
    tags: ['kids', 'preview', 'summer'],
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
          <span style={{ fontWeight: 600 }}>
            {typeof p.value === 'number' && p.name.includes('Revenue')
              ? `$${p.value.toLocaleString()}`
              : p.value}
          </span>{' '}
        </div>
      ))}{' '}
    </div>
  );
}
function EventStatusBadge({ status }: { status: EventStatus }) {
  const map: Record<EventStatus, { bg: string; color: string; label: string }> = {
    upcoming: { bg: 'rgba(6,182,212,0.1)', color: '#22D3EE', label: 'Upcoming' },
    active: { bg: 'rgba(16,185,129,0.1)', color: '#10B981', label: 'Live Now' },
    completed: { bg: 'rgba(139,92,246,0.1)', color: '#A78BFA', label: 'Completed' },
    cancelled: { bg: 'rgba(239,68,68,0.1)', color: '#F87171', label: 'Cancelled' },
  };
  const c = map[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px]"
      style={{ background: c.bg, color: c.color, fontWeight: 600 }}
    >
      {' '}
      {status === 'active' && (
        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: c.color }} />
      )}{' '}
      {c.label}{' '}
    </span>
  );
}
function CapacityBar({
  registered,
  capacity,
  waitlist,
}: {
  registered: number;
  capacity: number;
  waitlist: number;
}) {
  const pct = Math.min((registered / capacity) * 100, 100);
  const color = pct >= 90 ? '#EF4444' : pct >= 70 ? '#F59E0B' : '#10B981';
  return (
    <div>
      {' '}
      <div className="flex items-center justify-between text-[10px] mb-1">
        {' '}
        <span style={{ color: 'var(--t3)' }}>
          {registered}/{capacity} registered
        </span>{' '}
        {waitlist > 0 && (
          <span style={{ color: '#F59E0B', fontWeight: 600 }}>+{waitlist} waitlist</span>
        )}{' '}
      </div>{' '}
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--subtle)' }}>
        {' '}
        <motion.div
          className="h-full rounded-full"
          style={{ background: color, width: `${pct}%` }}
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        />{' '}
      </div>{' '}
    </div>
  );
}
function TypeIcon({ type }: { type: string }) {
  const map: Record<string, { icon: any; gradient: string }> = {
    Tournament: { icon: Trophy, gradient: 'from-violet-500 to-purple-600' },
    'Open Play': { icon: Music, gradient: 'from-cyan-500 to-teal-500' },
    Clinic: { icon: Target, gradient: 'from-emerald-500 to-green-500' },
    League: { icon: Star, gradient: 'from-amber-500 to-yellow-500' },
    Special: { icon: PartyPopper, gradient: 'from-pink-500 to-rose-500' },
  };
  const cfg = map[type] || map.Special;
  const Icon = cfg.icon;
  return (
    <div
      className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shrink-0`}
    >
      {' '}
      <Icon className="w-5 h-5 text-white" />{' '}
    </div>
  );
}
/* ============================================= */ /*              EVENTS PAGE                       */ /* ============================================= */

export function EventsIQ({ embedded = false, eventsListData }: { embedded?: boolean; eventsListData?: any }) {
  const { isDark } = useTheme();
  const [statusFilter, setStatusFilter] = useState<'all' | EventStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  // Use real events data when available
  const displayEvents: ClubEvent[] = eventsListData?.events?.length
    ? eventsListData.events.map((e: any) => ({
        id: e.id, name: e.name, type: e.type === 'SOCIAL' ? 'Mixer' : e.type === 'LEAGUE_PLAY' ? 'League Night' : e.type,
        status: (e.status === 'SCHEDULED' ? 'upcoming' : e.status === 'IN_PROGRESS' ? 'active' : e.status === 'COMPLETED' ? 'completed' : 'cancelled') as EventStatus,
        date: new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        time: e.startTime ? `${e.startTime} - ${e.endTime || ''}` : '',
        court: e.court || 'TBD', registered: e.registered, capacity: e.capacity,
        revenue: e.revenue, waitlisted: 0, format: e.type === 'SOCIAL' ? 'Social' : 'Competitive',
        description: '', aiPrediction: null,
      }))
    : events;

  const displayEventRevenue = eventsListData?.eventRevenue?.length
    ? eventsListData.eventRevenue.map((r: any) => ({
        month: new Date(r.month + '-01').toLocaleDateString('en-US', { month: 'short' }),
        revenue: r.revenue, events: r.events,
      }))
    : eventRevenue;

  const displayEventTypes = eventsListData?.events?.length
    ? (() => {
        const types: Record<string, number> = {};
        eventsListData.events.forEach((e: any) => { types[e.type] = (types[e.type] || 0) + 1; });
        const total = Object.values(types).reduce((s, v) => s + v, 0);
        const colors = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444'];
        return Object.entries(types).map(([name, count], i) => ({
          name: name === 'SOCIAL' ? 'Mixers' : name === 'LEAGUE_PLAY' ? 'League Nights' : name,
          value: Math.round((count / total) * 100), color: colors[i % colors.length],
        }));
      })()
    : eventTypes;

  const filtered = displayEvents.filter((e) => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (searchQuery && !e.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  const totalRevenue = displayEvents.reduce((s, e) => s + e.revenue, 0);
  const totalRegistered = displayEvents.reduce((s, e) => s + e.registered, 0);
  const upcomingCount = displayEvents.filter((e) => e.status === 'upcoming').length;
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={embedded ? "space-y-6" : "space-y-6 max-w-[1400px] mx-auto"}
    >
      {!embedded && (
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--heading)' }}>
            Event Intelligence
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--t3)' }}>
            Plan, promote, and analyze events with AI-powered predictions
          </p>
        </div>
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
          <Plus className="w-4 h-4" /> Create Event
        </motion.button>
      </div>
      )}{' '}
      {/* KPI Row */}{' '}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {' '}
        {[
          {
            label: 'Total Sessions',
            value: displayEvents.length.toLocaleString(),
            icon: CalendarDays,
            gradient: 'from-cyan-500 to-teal-500',
            sub: 'In selected period',
          },
          {
            label: 'Total Registrations',
            value: totalRegistered.toLocaleString(),
            icon: Users,
            gradient: 'from-violet-500 to-purple-600',
            sub: 'Player-session slots',
          },
          {
            label: 'Upcoming',
            value: upcomingCount.toLocaleString(),
            icon: Clock,
            gradient: 'from-emerald-500 to-green-500',
            sub: 'Scheduled sessions',
          },
          {
            label: 'Avg Players/Session',
            value: displayEvents.length > 0 ? (totalRegistered / displayEvents.length).toFixed(1) : '0',
            icon: Target,
            gradient: 'from-amber-500 to-orange-500',
            sub: 'Per session average',
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
      {/* Charts */}{' '}
      <div className="grid lg:grid-cols-3 gap-4">
        {' '}
        <Card className="lg:col-span-2">
          {' '}
          <h3
            className="mb-4"
            style={{ fontSize: '14px', fontWeight: 700, color: 'var(--heading)' }}
          >
            Sessions by Month
          </h3>{' '}
          <ResponsiveContainer width="100%" height={240}>
            {' '}
            <BarChart data={displayEventRevenue}>
              {' '}
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />{' '}
              <XAxis
                dataKey="month"
                stroke="var(--chart-axis)"
                tick={{ fill: 'var(--chart-tick)', fontSize: 11 }}
              />{' '}
              <YAxis
                stroke="var(--chart-axis)"
                tick={{ fill: 'var(--chart-tick)', fontSize: 11 }}
              />{' '}
              <Tooltip content={<CustomTooltip />} />{' '}
              <Bar dataKey="events" name="Sessions" fill="#8B5CF6" radius={[6, 6, 0, 0]} />{' '}
            </BarChart>{' '}
          </ResponsiveContainer>{' '}
        </Card>{' '}
        <Card>
          {' '}
          <h3
            className="mb-4"
            style={{ fontSize: '14px', fontWeight: 700, color: 'var(--heading)' }}
          >
            Event Types
          </h3>{' '}
          <div className="flex items-center justify-center" style={{ height: 160 }}>
            {' '}
            <ResponsiveContainer width="100%" height="100%">
              {' '}
              <PieChart>
                {' '}
                <Pie
                  data={displayEventTypes}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={65}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {' '}
                  {displayEventTypes.map((e) => (
                    <Cell key={e.name} fill={e.color} />
                  ))}{' '}
                </Pie>{' '}
                <Tooltip content={<CustomTooltip />} />{' '}
              </PieChart>{' '}
            </ResponsiveContainer>{' '}
          </div>{' '}
          <div className="space-y-2 mt-2">
            {' '}
            {displayEventTypes.map((t) => (
              <div key={t.name} className="flex items-center justify-between text-xs">
                {' '}
                <div className="flex items-center gap-2">
                  {' '}
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />{' '}
                  <span style={{ color: 'var(--t2)' }}>{t.name}</span>{' '}
                </div>{' '}
                <span style={{ color: 'var(--t1)', fontWeight: 600 }}>{t.value}%</span>{' '}
              </div>
            ))}{' '}
          </div>{' '}
        </Card>{' '}
      </div>{' '}
      {/* Filters */}{' '}
      <div className="flex items-center justify-between flex-wrap gap-4">
        {' '}
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--heading)' }}>
          All Events
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
              placeholder="Search events..."
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
            {(['all', 'upcoming', 'active', 'completed'] as const).map((s) => (
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
      {/* Event Cards */}{' '}
      <div className="space-y-3">
        {' '}
        {filtered.map((event, i) => {
          const isExpanded = expandedEvent === event.id;
          return (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              {' '}
              <Card className="!p-0 overflow-hidden">
                {' '}
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors"
                  onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {' '}
                  <TypeIcon type={event.type} />{' '}
                  <div className="flex-1 min-w-0">
                    {' '}
                    <div className="flex items-center gap-2">
                      {' '}
                      <span
                        className="text-sm truncate"
                        style={{ fontWeight: 600, color: 'var(--heading)' }}
                      >
                        {event.name}
                      </span>{' '}
                      <EventStatusBadge status={event.status} />{' '}
                    </div>{' '}
                    <div
                      className="flex items-center gap-3 mt-0.5 text-[11px]"
                      style={{ color: 'var(--t3)' }}
                    >
                      {' '}
                      <span className="flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" />
                        {event.date}
                      </span>{' '}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {event.time}
                      </span>{' '}
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {event.court}
                      </span>{' '}
                      <span className="hidden sm:inline-flex items-center gap-1">
                        {event.sport}
                      </span>{' '}
                    </div>{' '}
                  </div>{' '}
                  <div className="hidden md:block w-40">
                    {' '}
                    <CapacityBar
                      registered={event.registered}
                      capacity={event.capacity}
                      waitlist={event.waitlist}
                    />{' '}
                  </div>{' '}
                  <div className="text-right hidden sm:block">
                    {' '}
                    <div className="text-xs" style={{ color: 'var(--heading)', fontWeight: 700 }}>
                      ${event.revenue.toLocaleString()}
                    </div>{' '}
                    <div className="text-[10px]" style={{ color: 'var(--t4)' }}>
                      ${event.price}/person
                    </div>{' '}
                  </div>{' '}
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
                          {event.description}
                        </p>{' '}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {' '}
                          {[
                            { label: 'Duration', value: event.duration },
                            { label: 'Price', value: `$${event.price}` },
                            { label: 'Registered', value: `${event.registered}/${event.capacity}` },
                            { label: 'Revenue', value: `$${event.revenue.toLocaleString()}` },
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
                                style={{ color: 'var(--t1)', fontWeight: 700 }}
                              >
                                {stat.value}
                              </div>{' '}
                            </div>
                          ))}{' '}
                        </div>{' '}
                        {/* AI Prediction */}{' '}
                        {event.aiPrediction && (
                          <div
                            className="p-4 rounded-xl"
                            style={{
                              background: 'rgba(139,92,246,0.05)',
                              border: '1px solid rgba(139,92,246,0.1)',
                            }}
                          >
                            {' '}
                            <div className="flex items-center gap-2 mb-3">
                              {' '}
                              <Sparkles className="w-4 h-4 text-violet-400" />{' '}
                              <span
                                className="text-xs"
                                style={{ fontWeight: 700, color: 'var(--heading)' }}
                              >
                                AI Prediction
                              </span>{' '}
                              <span
                                className="text-[9px] px-1.5 py-0.5 rounded-lg"
                                style={{
                                  background: 'rgba(139,92,246,0.15)',
                                  color: '#A78BFA',
                                  fontWeight: 600,
                                }}
                              >
                                {' '}
                                {event.aiPrediction.confidence}% confidence{' '}
                              </span>{' '}
                            </div>{' '}
                            <div className="grid grid-cols-2 gap-4">
                              {' '}
                              <div>
                                {' '}
                                <div className="text-[10px]" style={{ color: 'var(--t4)' }}>
                                  Predicted Attendance
                                </div>{' '}
                                <div className="flex items-center gap-2">
                                  {' '}
                                  <span
                                    className="text-lg"
                                    style={{ fontWeight: 800, color: 'var(--heading)' }}
                                  >
                                    {event.aiPrediction.attendance}
                                  </span>{' '}
                                  <span className="text-[10px]" style={{ color: 'var(--t4)' }}>
                                    of {event.capacity}
                                  </span>{' '}
                                  {event.aiPrediction.attendance > event.registered && (
                                    <span
                                      className="text-[10px] text-emerald-400"
                                      style={{ fontWeight: 600 }}
                                    >
                                      {' '}
                                      +{event.aiPrediction.attendance - event.registered}{' '}
                                      expected{' '}
                                    </span>
                                  )}{' '}
                                </div>{' '}
                              </div>{' '}
                              <div>
                                {' '}
                                <div className="text-[10px]" style={{ color: 'var(--t4)' }}>
                                  Predicted Revenue
                                </div>{' '}
                                <div className="flex items-center gap-2">
                                  {' '}
                                  <span
                                    className="text-lg text-emerald-400"
                                    style={{ fontWeight: 800 }}
                                  >
                                    ${event.aiPrediction.revenue.toLocaleString()}
                                  </span>{' '}
                                  {event.aiPrediction.revenue > event.revenue && (
                                    <span
                                      className="text-[10px] text-emerald-400"
                                      style={{ fontWeight: 600 }}
                                    >
                                      {' '}
                                      +${event.aiPrediction.revenue - event.revenue}{' '}
                                    </span>
                                  )}{' '}
                                </div>{' '}
                              </div>{' '}
                            </div>{' '}
                          </div>
                        )}{' '}
                        {/* Tags */}{' '}
                        <div className="flex items-center gap-2 flex-wrap">
                          {' '}
                          {event.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2.5 py-1 rounded-lg text-[10px]"
                              style={{
                                background: 'var(--badge-bg)',
                                color: 'var(--t3)',
                                fontWeight: 500,
                              }}
                            >
                              {' '}
                              #{tag}{' '}
                            </span>
                          ))}{' '}
                        </div>{' '}
                        {/* Actions */}{' '}
                        <div className="flex items-center gap-2 justify-end">
                          {' '}
                          {event.status === 'upcoming' && (
                            <>
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
                                <Megaphone className="w-3.5 h-3.5" /> Promote{' '}
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
                                <Users className="w-3.5 h-3.5" /> Manage Roster{' '}
                              </motion.button>{' '}
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] text-white"
                                style={{
                                  background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
                                  fontWeight: 600,
                                }}
                              >
                                {' '}
                                <Sparkles className="w-3.5 h-3.5" /> AI Boost Attendance{' '}
                              </motion.button>{' '}
                            </>
                          )}{' '}
                          {event.status === 'completed' && (
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
                              <BarChart3 className="w-3.5 h-3.5" /> View Report{' '}
                            </motion.button>
                          )}{' '}
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
      {/* Summary */}{' '}
      <div className="text-center text-xs py-4" style={{ color: 'var(--t4)' }}>
        {' '}
        Showing {filtered.length} of {displayEvents.length} events{' '}
      </div>{' '}
    </motion.div>
  );
}
