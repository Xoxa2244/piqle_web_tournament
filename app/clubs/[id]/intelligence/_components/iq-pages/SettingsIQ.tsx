'use client'

import { useState } from "react";
import { motion } from "motion/react";
import {
  Settings, Globe, Dumbbell, Calendar, Clock, DollarSign,
  Target, Mail, Smartphone, Volume2, Zap, Check, Bell,
  Shield, ChevronDown,
} from "lucide-react";
import { useTheme } from "../IQThemeProvider";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 ${className}`} style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", backdropFilter: "var(--glass-blur)", boxShadow: "var(--card-shadow)" }}>
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}>
        <Icon className="w-4.5 h-4.5 text-white" />
      </div>
      <div>
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--heading)" }}>{title}</h3>
        <p className="text-xs mt-0.5" style={{ color: "var(--t4)" }}>{subtitle}</p>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const { isDark } = useTheme();
  return (
    <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "var(--subtle)" }}>
      <div>
        <div className="text-sm" style={{ fontWeight: 600, color: "var(--t1)" }}>{label}</div>
        {description && <div className="text-[11px] mt-0.5" style={{ color: "var(--t4)" }}>{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="w-11 h-6 rounded-full transition-all relative shrink-0"
        style={{ background: checked ? "linear-gradient(135deg, #8B5CF6, #06B6D4)" : isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }}
      >
        <motion.div
          animate={{ x: checked ? 20 : 2 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="absolute top-1 w-4 h-4 rounded-full bg-white"
          style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }}
        />
      </button>
    </div>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  const { isDark } = useTheme();
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-xl text-xs transition-all"
      style={{
        background: selected ? "var(--pill-active)" : "var(--subtle)",
        color: selected ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
        fontWeight: selected ? 600 : 500,
        border: selected ? "1px solid rgba(139,92,246,0.2)" : "1px solid transparent",
      }}
    >
      {children}
    </button>
  );
}

type SettingsIQProps = {
  intelligenceData?: any;
  automationData?: any;
  saveMutation?: any;
  saveAutoMutation?: any;
  isLoading?: boolean;
  clubId?: string;
};

export function SettingsIQ({ intelligenceData, automationData, saveMutation, saveAutoMutation, isLoading: externalLoading, clubId }: SettingsIQProps = {}) {
  const { isDark } = useTheme();

  // Hydrate from real data or use defaults
  const realSettings = intelligenceData?.settings;
  const realAutomation = automationData?.settings;

  // Club Profile
  const [timezone, setTimezone] = useState("America/New_York");
  const [sports, setSports] = useState(["pickleball", "padel", "tennis"]);
  const [courts, setCourts] = useState(6);
  const [operatingDays, setOperatingDays] = useState(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  const [openTime, setOpenTime] = useState("06:00");
  const [closeTime, setCloseTime] = useState("22:00");
  const [pricingModel, setPricingModel] = useState("per_session");
  const [sessionPrice, setSessionPrice] = useState(15);

  // Communication
  const [channel, setChannel] = useState("both");
  const [tone, setTone] = useState("friendly");
  const [maxMessages, setMaxMessages] = useState(4);

  // Automation
  const [autoHealthyWatch, setAutoHealthyWatch] = useState(true);
  const [autoWatchRisk, setAutoWatchRisk] = useState(true);
  const [autoRiskCritical, setAutoRiskCritical] = useState(false);
  const [autoChurned, setAutoChurned] = useState(false);

  // Goals
  const [goals, setGoals] = useState(["fill_sessions", "improve_retention"]);

  const [saved, setSaved] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from server data once
  if (realSettings && !hydrated) {
    if (realSettings.timezone) setTimezone(realSettings.timezone);
    if (realSettings.sportTypes?.length) setSports(realSettings.sportTypes);
    if (realSettings.courtCount) setCourts(realSettings.courtCount);
    if (realSettings.operatingDays?.length) setOperatingDays(realSettings.operatingDays);
    if (realSettings.operatingHoursStart) setOpenTime(realSettings.operatingHoursStart);
    if (realSettings.operatingHoursEnd) setCloseTime(realSettings.operatingHoursEnd);
    if (realSettings.pricingModel) setPricingModel(realSettings.pricingModel);
    if (realSettings.avgSessionPriceCents) setSessionPrice(realSettings.avgSessionPriceCents / 100);
    if (realSettings.communicationPreferences?.preferredChannel) setChannel(realSettings.communicationPreferences.preferredChannel);
    if (realSettings.communicationPreferences?.tone) setTone(realSettings.communicationPreferences.tone);
    if (realSettings.communicationPreferences?.maxMessagesPerWeek) setMaxMessages(realSettings.communicationPreferences.maxMessagesPerWeek);
    if (realSettings.goals?.length) setGoals(realSettings.goals);
    setHydrated(true);
  }
  if (realAutomation && !hydrated) {
    if (realAutomation.healthyToWatch !== undefined) setAutoHealthyWatch(realAutomation.healthyToWatch);
    if (realAutomation.watchToAtRisk !== undefined) setAutoWatchRisk(realAutomation.watchToAtRisk);
    if (realAutomation.atRiskToCritical !== undefined) setAutoRiskCritical(realAutomation.atRiskToCritical);
    if (realAutomation.churned !== undefined) setAutoChurned(realAutomation.churned);
  }

  const handleSave = () => {
    if (saveMutation && clubId) {
      saveMutation.mutate({
        clubId,
        settings: {
          timezone,
          sportTypes: sports,
          courtCount: courts,
          operatingDays,
          operatingHoursStart: openTime,
          operatingHoursEnd: closeTime,
          pricingModel,
          avgSessionPriceCents: Math.round(sessionPrice * 100),
          goals,
          communicationPreferences: { preferredChannel: channel, tone, maxMessagesPerWeek: maxMessages },
        },
      }, { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); } });
    }
    if (saveAutoMutation && clubId) {
      saveAutoMutation.mutate({
        clubId,
        settings: {
          enabled: true,
          healthyToWatch: autoHealthyWatch,
          watchToAtRisk: autoWatchRisk,
          atRiskToCritical: autoRiskCritical,
          churned: autoChurned,
          channel,
        },
      });
    }
    if (!saveMutation) {
      // Mock mode
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const toggleSport = (id: string) => setSports(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  const toggleDay = (d: string) => setOperatingDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  const toggleGoal = (g: string) => setGoals(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6 max-w-[1000px] mx-auto"
    >
      {/* Header */}
      <div>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--heading)" }}>Settings</h1>
        <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>Configure your club profile, AI automation, and communication preferences</p>
      </div>

      {/* Club Profile */}
      <Card>
        <SectionHeader icon={Settings} title="Club Profile" subtitle="Basic club information for AI context" />
        <div className="space-y-4">
          {/* Timezone */}
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
            >
              {["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Toronto", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Australia/Sydney"].map(tz => (
                <option key={tz} value={tz}>{tz.replace("_", " ")}</option>
              ))}
            </select>
          </div>

          {/* Sports */}
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Sports</label>
            <div className="flex flex-wrap gap-2">
              {[{ id: "pickleball", label: "Pickleball" }, { id: "tennis", label: "Tennis" }, { id: "padel", label: "Padel" }, { id: "squash", label: "Squash" }, { id: "badminton", label: "Badminton" }].map(s => (
                <Chip key={s.id} selected={sports.includes(s.id)} onClick={() => toggleSport(s.id)}>{s.label}</Chip>
              ))}
            </div>
          </div>

          {/* Courts */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Number of Courts</label>
              <input
                type="number" min={1} max={50} value={courts}
                onChange={(e) => setCourts(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
              />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Avg Session Price ($)</label>
              <input
                type="number" min={0} max={500} value={sessionPrice}
                onChange={(e) => setSessionPrice(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
              />
            </div>
          </div>

          {/* Operating Days */}
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Operating Days</label>
            <div className="flex gap-1.5">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
                <Chip key={d} selected={operatingDays.includes(d)} onClick={() => toggleDay(d)}>{d}</Chip>
              ))}
            </div>
          </div>

          {/* Hours */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Opens</label>
              <input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }} />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Closes</label>
              <input type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }} />
            </div>
          </div>

          {/* Pricing */}
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Pricing Model</label>
            <div className="flex flex-wrap gap-2">
              {[{ id: "per_session", label: "Per Session" }, { id: "membership", label: "Membership" }, { id: "free", label: "Free" }, { id: "hybrid", label: "Hybrid" }].map(p => (
                <Chip key={p.id} selected={pricingModel === p.id} onClick={() => setPricingModel(p.id)}>{p.label}</Chip>
              ))}
            </div>
          </div>

          {/* Goals */}
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Club Goals</label>
            <div className="flex flex-wrap gap-2">
              {[{ id: "fill_sessions", label: "Fill Sessions" }, { id: "grow_membership", label: "Grow Membership" }, { id: "improve_retention", label: "Improve Retention" }, { id: "increase_revenue", label: "Increase Revenue" }, { id: "reduce_no_shows", label: "Reduce No-Shows" }].map(g => (
                <Chip key={g.id} selected={goals.includes(g.id)} onClick={() => toggleGoal(g.id)}>{g.label}</Chip>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Communication */}
      <Card>
        <SectionHeader icon={Mail} title="Communication" subtitle="Outreach preferences for AI campaigns" />
        <div className="space-y-4">
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Channel</label>
            <div className="flex gap-2">
              {[{ id: "email", label: "Email", icon: Mail }, { id: "sms", label: "SMS", icon: Smartphone }, { id: "both", label: "Email + SMS", icon: Mail }].map(c => (
                <Chip key={c.id} selected={channel === c.id} onClick={() => setChannel(c.id)}>{c.label}</Chip>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Tone</label>
            <div className="flex gap-2">
              {["friendly", "professional", "casual"].map(t => (
                <Chip key={t} selected={tone === t} onClick={() => setTone(t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</Chip>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Max Messages per Week: <strong style={{ color: "var(--t1)" }}>{maxMessages}</strong></label>
            <input
              type="range" min={1} max={7} value={maxMessages}
              onChange={(e) => setMaxMessages(Number(e.target.value))}
              className="w-full accent-violet-500"
            />
            <div className="flex justify-between text-[10px] mt-1" style={{ color: "var(--t4)" }}>
              <span>1/week</span><span>7/week</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Automation */}
      <Card>
        <SectionHeader icon={Zap} title="AI Automation" subtitle="Auto-trigger campaigns when member health changes" />
        <div className="space-y-3">
          <Toggle checked={autoHealthyWatch} onChange={setAutoHealthyWatch} label="Healthy → Watch" description="Send gentle check-in when frequency drops" />
          <Toggle checked={autoWatchRisk} onChange={setAutoWatchRisk} label="Watch → At Risk" description="Send retention boost when engagement drops significantly" />
          <Toggle checked={autoRiskCritical} onChange={setAutoRiskCritical} label="At Risk → Critical" description="Urgent win-back with personal offer" />
          <Toggle checked={autoChurned} onChange={setAutoChurned} label="Churned 21+ days" description="Reactivation campaign with special incentive" />
        </div>
      </Card>

      {/* Save */}
      <div className="flex justify-end pb-8">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm text-white"
          style={{
            background: saved ? "linear-gradient(135deg, #10B981, #059669)" : "linear-gradient(135deg, #8B5CF6, #06B6D4)",
            fontWeight: 600,
            boxShadow: saved ? "0 4px 15px rgba(16,185,129,0.3)" : "0 4px 15px rgba(139,92,246,0.3)",
          }}
        >
          {saved ? <><Check className="w-4 h-4" /> Saved</> : "Save Changes"}
        </motion.button>
      </div>
    </motion.div>
  );
}
