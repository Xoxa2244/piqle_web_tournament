'use client';

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutDashboard, CalendarDays, Brain, UserPlus, DollarSign,
  Users, Megaphone, PartyPopper, Sun, Moon, ChevronLeft, ChevronRight,
  ChevronDown, Search, Bell, Settings, BarChart3, Cpu, Building2,
  Menu, X, CreditCard, Plug, Activity, Bot, Mail, Rocket,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LogoIcon } from "./LogoIcon";
import { useTheme } from "../IQThemeProvider";
import { useSession, signOut } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { LogOut, UserCircle, UsersRound, Plus, Check } from "lucide-react";

interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  isAI?: boolean;
}

interface NavSection {
  id: string;
  title: string;
  icon: LucideIcon;
  items: NavItem[];
}

function buildNavSections(isMembership: boolean): NavSection[] {
  return [
  {
    id: "analytics",
    title: "ANALYTICS",
    icon: BarChart3,
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "" },
      { icon: Brain, label: "Programming IQ", path: "/programming", isAI: true },
      { icon: CalendarDays, label: "Schedule", path: "/sessions" },
    ],
  },
  {
    id: "ai-tools",
    title: "AI TOOLS",
    icon: Cpu,
    items: [
      { icon: Brain, label: "AI Advisor", path: "/advisor", isAI: true },
      { icon: Bot, label: "AI Agent", path: "/agent", isAI: true },
    ],
  },
  {
    id: "engage",
    title: "ENGAGE",
    icon: Building2,
    items: [
      { icon: Users, label: "Members", path: "/members" },
      { icon: UsersRound, label: "Cohorts", path: "/cohorts" },
      { icon: UserPlus, label: "Reactivation", path: "/reactivation" },
      { icon: Megaphone, label: "Campaigns", path: "/campaigns" },
    ],
  },
  {
    id: "system",
    title: "SYSTEM",
    icon: Settings,
    items: [
      { icon: Rocket, label: "Launch", path: "/launch" },
      { icon: CreditCard, label: "Billing", path: "/billing" },
      { icon: Plug, label: "Integrations", path: "/integrations" },
      { icon: Mail, label: "Email Domain", path: "/email-domain" },
      { icon: Settings, label: "Settings", path: "/settings" },
    ],
  },
  ]
}

export function IQSidebar({ children, clubId }: { children: React.ReactNode; clubId: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hoverExpand, setHoverExpand] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { theme, toggleTheme, isDark } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { data: clubs } = trpc.club.list.useQuery({}, { staleTime: 60_000 });
  const { data: notifications } = trpc.notification.list.useQuery(
    { limit: 10 },
    { staleTime: 15_000, refetchInterval: 30_000 }
  );
  const { data: intelligenceSettings } = trpc.intelligence.getIntelligenceSettings.useQuery(
    { clubId },
    { enabled: !!clubId, staleTime: 60_000 }
  );
  const pricingModel = intelligenceSettings?.settings?.pricingModel;
  // Default to membership when pricingModel is not yet configured (most clubs are membership-based)
  const isMembershipClub = pricingModel == null || pricingModel === 'membership' || pricingModel === 'free';
  const navSections = buildNavSections(isMembershipClub);

  const userName = session?.user?.name || session?.user?.email?.split("@")[0] || "User";
  const userEmail = session?.user?.email || "";
  const userInitials = userName.split(/\s+/).map((w: string) => w[0]?.toUpperCase()).join("").slice(0, 2) || "U";
  const myClubs = (clubs ?? []).filter((c: any) => c.isAdmin || c.isFollowing);
  const unreadNotifications = notifications?.unreadCount ?? 0;

  const basePath = `/clubs/${clubId}/intelligence`;
  const demoParam = searchParams.get("demo") === "true" ? "?demo=true" : "";

  const expanded = !collapsed || hoverExpand;

  // Close mobile sidebar on navigation
  useEffect(() => {
    setMobileOpen(false);
    setNotificationsOpen(false);
    setProfileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setCollapsed((p) => !p);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const formatNotificationTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.round(diffMs / (60 * 1000));
    if (Math.abs(diffMinutes) < 60) return `${Math.abs(diffMinutes)}m`;
    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 24) return `${Math.abs(diffHours)}h`;
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  // Shared nav content rendered inside sidebar (desktop) or mobile drawer
  const sidebarNav = (isMobile: boolean) => {
    const showExpanded = isMobile ? true : expanded;
    return (
      <>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 shrink-0" style={{ borderBottom: "1px solid var(--divider)" }}>
          <LogoIcon size={32} />
          <AnimatePresence>
            {showExpanded && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="whitespace-nowrap overflow-hidden flex flex-col"
              >
                <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--heading)", lineHeight: 1.2 }}>
                  IQ<span style={{ background: "linear-gradient(90deg, #8B5CF6, #06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Sport</span>
                </span>
                <span style={{ fontSize: "9px", fontWeight: 600, color: "#06B6D4", letterSpacing: "0.15em", lineHeight: 1 }}>INTELLIGENCE</span>
              </motion.div>
            )}
          </AnimatePresence>
          {isMobile && (
            <button onClick={() => setMobileOpen(false)} className="ml-auto p-1.5 rounded-lg" style={{ color: "var(--t3)" }}>
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {navSections.map((section) => {
            const SectionIcon = section.icon;
            const isSectionCollapsed = collapsedSections[section.id] ?? false;
            return (
              <div key={section.id}>
                {/* Section header */}
                {showExpanded ? (
                  <button
                    onClick={() => setCollapsedSections(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                    className="w-full flex items-center gap-2 px-3 py-1.5 mb-1 group"
                  >
                    <SectionIcon className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--t4)" }} />
                    <span className="text-[10px] tracking-wider" style={{ color: "var(--t4)", fontWeight: 600 }}>
                      {section.title}
                    </span>
                    <motion.div
                      animate={{ rotate: isSectionCollapsed ? -90 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="ml-auto"
                    >
                      <ChevronDown className="w-3 h-3" style={{ color: "var(--t4)" }} />
                    </motion.div>
                  </button>
                ) : (
                  <div className="flex justify-center py-1.5 mb-1">
                    <div className="w-5 h-px" style={{ background: "var(--divider)" }} />
                  </div>
                )}

                {/* Section items */}
                <AnimatePresence initial={false}>
                  {!isSectionCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden space-y-1"
                    >
                      {section.items.map((item) => {
                        const Icon = item.icon;
                        const fullPath = `${basePath}${item.path}`;
                        const active = pathname === fullPath || (item.path !== "" && pathname.startsWith(fullPath));
                        return (
                          <button
                            key={item.path}
                            onClick={() => router.push(`${fullPath}${demoParam}`)}
                            className="w-full flex items-center gap-3 rounded-xl transition-all relative group"
                            style={{
                              padding: showExpanded ? "10px 12px" : "10px 0",
                              justifyContent: showExpanded ? "flex-start" : "center",
                              background: active ? "var(--pill-active)" : "transparent",
                              color: active ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
                            }}
                          >
                            {active && (
                              <motion.div
                                layoutId={isMobile ? "sidebar-active-mobile" : "sidebar-active"}
                                className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full"
                                style={{ height: 24, background: "linear-gradient(180deg, #8B5CF6, #06B6D4)" }}
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                              />
                            )}
                            <Icon className="w-5 h-5 shrink-0" />
                            <AnimatePresence>
                              {showExpanded && (
                                <motion.span
                                  initial={{ opacity: 0, width: 0 }}
                                  animate={{ opacity: 1, width: "auto" }}
                                  exit={{ opacity: 0, width: 0 }}
                                  className="text-sm whitespace-nowrap overflow-hidden"
                                  style={{ fontWeight: active ? 600 : 500 }}
                                >
                                  {item.label}
                                </motion.span>
                              )}
                            </AnimatePresence>
                            {showExpanded && item.isAI && (
                              <span
                                className="ml-auto text-[8px] tracking-wider uppercase px-1.5 py-0.5 rounded"
                                style={{
                                  background: isDark ? "rgba(139,92,246,0.15)" : "rgba(139,92,246,0.08)",
                                  color: "#A78BFA",
                                  fontWeight: 700,
                                }}
                              >
                                AI
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="px-2 pb-3 space-y-1 shrink-0" style={{ borderTop: "1px solid var(--divider)", paddingTop: 12 }}>
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 rounded-xl transition-all"
            style={{
              padding: showExpanded ? "10px 12px" : "10px 0",
              justifyContent: showExpanded ? "flex-start" : "center",
              color: "var(--t3)",
            }}
          >
            {isDark ? <Sun className="w-5 h-5 shrink-0" /> : <Moon className="w-5 h-5 shrink-0" />}
            {showExpanded && <span className="text-sm" style={{ fontWeight: 500 }}>{isDark ? "Light Mode" : "Dark Mode"}</span>}
          </button>

          <button
            onClick={() => router.push(`/clubs/${clubId}/intelligence/settings`)}
            className="w-full flex items-center gap-3 rounded-xl transition-all"
            style={{
              padding: showExpanded ? "10px 12px" : "10px 0",
              justifyContent: showExpanded ? "flex-start" : "center",
              color: pathname.endsWith("/settings") ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
              background: pathname.endsWith("/settings") ? "var(--pill-active)" : "transparent",
            }}
          >
            <Settings className="w-5 h-5 shrink-0" />
            {showExpanded && <span className="text-sm" style={{ fontWeight: 500 }}>Settings</span>}
          </button>

          {!isMobile && (
            <button
              onClick={() => setCollapsed((p) => !p)}
              className="w-full flex items-center gap-3 rounded-xl transition-all"
              style={{
                padding: showExpanded ? "10px 12px" : "10px 0",
                justifyContent: showExpanded ? "flex-start" : "center",
                color: "var(--t3)",
              }}
            >
              {collapsed ? <ChevronRight className="w-5 h-5 shrink-0" /> : <ChevronLeft className="w-5 h-5 shrink-0" />}
              {showExpanded && <span className="text-sm" style={{ fontWeight: 500 }}>Collapse</span>}
            </button>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--page-bg)" }}>
      {/* DESKTOP SIDEBAR (hidden on mobile) */}
      <motion.aside
        animate={{ width: expanded ? 260 : 72 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onMouseEnter={() => collapsed && setHoverExpand(true)}
        onMouseLeave={() => setHoverExpand(false)}
        className="relative hidden md:flex flex-col shrink-0 h-full z-30"
        style={{
          background: "var(--sidebar-bg)",
          borderRight: "1px solid var(--sidebar-border-color)",
          backdropFilter: "var(--sidebar-blur)",
        }}
      >
        {sidebarNav(false)}
      </motion.aside>

      {/* MOBILE SIDEBAR OVERLAY */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 md:hidden"
              style={{ background: "rgba(0,0,0,0.6)" }}
            />
            {/* Drawer */}
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 z-50 w-[280px] flex flex-col md:hidden"
              style={{
                background: "var(--sidebar-bg)",
                borderRight: "1px solid var(--sidebar-border-color)",
                backdropFilter: "var(--sidebar-blur)",
              }}
            >
              {sidebarNav(true)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* MAIN */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header
          className="h-14 md:h-16 shrink-0 flex items-center justify-between px-4 md:px-6"
          style={{ borderBottom: "1px solid var(--divider)", background: "var(--sidebar-bg)", backdropFilter: "var(--glass-blur)" }}
        >
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="p-1.5 rounded-lg md:hidden"
              style={{ color: "var(--t2)" }}
            >
              <Menu className="w-6 h-6" />
            </button>
            {/* Mobile logo */}
            <div className="flex items-center gap-2 md:hidden">
              <LogoIcon size={24} />
              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--heading)" }}>
                IQ<span style={{ background: "linear-gradient(90deg, #8B5CF6, #06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Sport</span>
              </span>
            </div>
            {/* Desktop search */}
            <div
              className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", minWidth: 240 }}
            >
              <Search className="w-4 h-4" style={{ color: "var(--t4)" }} />
              <input
                placeholder="Search anything... ⌘K"
                className="bg-transparent border-none outline-none text-sm w-full"
                style={{ color: "var(--t1)" }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {/* Club name */}
            {(() => {
              const currentClub = myClubs.find((c: any) => c.id === clubId)
              return currentClub?.name ? (
                <span className="text-sm truncate max-w-[200px] hidden sm:block" style={{ color: "var(--t2)", fontWeight: 500 }}>
                  {currentClub.name}
                </span>
              ) : null
            })()}
            <div className="relative">
              <button
                onClick={() => {
                  setNotificationsOpen((prev) => !prev);
                  setProfileOpen(false);
                }}
                className="p-2 rounded-xl transition-colors relative"
                style={{ color: "var(--t3)" }}
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadNotifications > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] text-white"
                    style={{ background: "#EF4444", fontWeight: 700 }}
                  >
                    {unreadNotifications > 99 ? "99+" : unreadNotifications}
                  </span>
                )}
              </button>

              {notificationsOpen && typeof document !== 'undefined' && createPortal(
                <>
                  <div className="fixed inset-0" style={{ zIndex: 99998 }} onClick={() => setNotificationsOpen(false)} />
                  <div
                    className="fixed right-16 top-14 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl overflow-hidden"
                    style={{
                      zIndex: 99999,
                      background: isDark ? "#1e2035" : "#ffffff",
                      border: `1px solid ${isDark ? "rgba(139,92,246,0.25)" : "rgba(0,0,0,0.1)"}`,
                      boxShadow: isDark ? "0 25px 80px rgba(0,0,0,0.9)" : "0 25px 80px rgba(0,0,0,0.15)",
                    }}
                  >
                    <div
                      className="px-4 py-3 flex items-center justify-between"
                      style={{ borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` }}
                    >
                      <div>
                        <div className="text-sm" style={{ fontWeight: 700, color: isDark ? "#E2E8F0" : "#1E293B" }}>
                          Notifications
                        </div>
                        <div className="text-[11px]" style={{ color: isDark ? "#94A3B8" : "#64748B" }}>
                          Agent reminders, requests, and club updates
                        </div>
                      </div>
                      {unreadNotifications > 0 && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: "rgba(139,92,246,0.14)", color: "#A78BFA" }}
                        >
                          {unreadNotifications} unread
                        </span>
                      )}
                    </div>

                    <div className="max-h-[420px] overflow-y-auto p-2">
                      {(notifications?.items?.length ?? 0) === 0 ? (
                        <div
                          className="rounded-xl px-3 py-6 text-center text-sm"
                          style={{ color: isDark ? "#94A3B8" : "#64748B" }}
                        >
                          No notifications right now.
                        </div>
                      ) : (
                        notifications?.items?.map((item: any) => (
                          <button
                            key={item.id}
                            onClick={() => {
                              setNotificationsOpen(false);
                              router.push(item.targetUrl);
                            }}
                            className="w-full text-left rounded-xl p-3 transition-all hover:opacity-90"
                            style={{
                              background: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.03)",
                              border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)"}`,
                              marginBottom: 8,
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                                style={{
                                  background:
                                    item.type === "AGENT_ADMIN_REMINDER"
                                      ? "rgba(245,158,11,0.14)"
                                      : item.type === "CLUB_JOIN_REQUEST"
                                        ? "rgba(34,211,238,0.14)"
                                        : "rgba(139,92,246,0.14)",
                                  color:
                                    item.type === "AGENT_ADMIN_REMINDER"
                                      ? "#F59E0B"
                                      : item.type === "CLUB_JOIN_REQUEST"
                                        ? "#22D3EE"
                                        : "#A78BFA",
                                }}
                              >
                                <Bell className="w-4 h-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm truncate" style={{ fontWeight: 600, color: isDark ? "#E2E8F0" : "#1E293B" }}>
                                    {item.title}
                                  </div>
                                  <div className="text-[10px] shrink-0" style={{ color: isDark ? "#94A3B8" : "#64748B" }}>
                                    {formatNotificationTime(item.createdAt)}
                                  </div>
                                </div>
                                <div className="text-xs mt-1" style={{ color: isDark ? "#CBD5E1" : "#475569", lineHeight: 1.5 }}>
                                  {item.body}
                                </div>
                                {item.clubName && (
                                  <div className="text-[10px] mt-2" style={{ color: isDark ? "#94A3B8" : "#64748B" }}>
                                    {item.clubName}
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>,
                document.body
              )}
            </div>
            <button onClick={() => router.push(`/clubs/${clubId}/intelligence/settings`)} className="hidden md:block p-2 rounded-xl transition-colors" style={{ color: "var(--t3)" }}>
              <Settings className="w-5 h-5" />
            </button>
            {/* User Avatar + Dropdown */}
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-xs text-white transition-all hover:scale-105"
                style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)", fontWeight: 700 }}
              >
                {userInitials}
              </button>

              {profileOpen && typeof document !== 'undefined' && createPortal(
                <>
                  {/* Backdrop */}
                  <div className="fixed inset-0" style={{ zIndex: 99998 }} onClick={() => setProfileOpen(false)} />

                  {/* Dropdown — rendered via portal to escape sidebar stacking context */}
                  <div
                    className="fixed right-4 top-14 w-72 rounded-2xl overflow-y-auto max-h-[80vh]"
                    style={{
                      zIndex: 99999,
                      background: isDark ? "#1e2035" : "#ffffff",
                      border: `1px solid ${isDark ? "rgba(139,92,246,0.25)" : "rgba(0,0,0,0.1)"}`,
                      boxShadow: isDark ? "0 25px 80px rgba(0,0,0,0.9)" : "0 25px 80px rgba(0,0,0,0.15)",
                    }}
                  >
                      {/* User info */}
                      <div className="p-4" style={{ borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` }}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm text-white" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)", fontWeight: 700 }}>
                            {userInitials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate" style={{ fontWeight: 600, color: isDark ? "#E2E8F0" : "#1E293B" }}>{userName}</div>
                            <div className="text-xs truncate" style={{ color: isDark ? "#64748B" : "#94A3B8" }}>{userEmail}</div>
                          </div>
                        </div>
                      </div>

                      {/* My Clubs */}
                      {myClubs.length > 0 && (
                        <div className="p-2" style={{ borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` }}>
                          <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider" style={{ color: isDark ? "#64748B" : "#94A3B8", fontWeight: 600 }}>My Clubs ({myClubs.length})</div>
                          {myClubs.map((club: any) => (
                            <button
                              key={club.id}
                              onClick={() => { router.push(`/clubs/${club.id}/intelligence`); setProfileOpen(false); }}
                              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all"
                              style={{ background: club.id === clubId ? (isDark ? "rgba(139,92,246,0.15)" : "rgba(139,92,246,0.08)") : "transparent" }}
                            >
                              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] text-white flex-shrink-0" style={{ background: club.id === clubId ? "linear-gradient(135deg, #8B5CF6, #06B6D4)" : "rgba(139,92,246,0.2)", fontWeight: 700 }}>
                                {(club.name || "C").charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm truncate" style={{ fontWeight: club.id === clubId ? 600 : 400, color: isDark ? (club.id === clubId ? "#E2E8F0" : "#CBD5E1") : (club.id === clubId ? "#1E293B" : "#475569") }}>{club.name || "Unnamed Club"}</span>
                              {club.id === clubId && <Check className="w-4 h-4 ml-auto flex-shrink-0" style={{ color: "#8B5CF6" }} />}
                            </button>
                          ))}
                          <button
                            onClick={() => { setProfileOpen(false); router.push("/clubs?add=true"); }}
                            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all"
                          >
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ border: "1px dashed rgba(139,92,246,0.3)" }}>
                              <Plus className="w-3.5 h-3.5" style={{ color: "#A78BFA" }} />
                            </div>
                            <span className="text-sm" style={{ color: "#A78BFA", fontWeight: 500 }}>Add Club</span>
                          </button>
                        </div>
                      )}

                      {/* Menu items */}
                      <div className="p-2">
                        <button
                          onClick={() => { router.push(`/clubs/${clubId}/intelligence/settings`); setProfileOpen(false); }}
                          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all hover:opacity-80"
                          style={{ color: isDark ? "#CBD5E1" : "#475569" }}
                        >
                          <Settings className="w-4 h-4" style={{ color: isDark ? "#64748B" : "#94A3B8" }} />
                          <span className="text-sm" style={{ fontWeight: 500 }}>Club Settings</span>
                        </button>
                        <button
                          onClick={() => { router.push(`/clubs/${clubId}/intelligence/team`); setProfileOpen(false); }}
                          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all hover:opacity-80"
                          style={{ color: isDark ? "#CBD5E1" : "#475569" }}
                        >
                          <UsersRound className="w-4 h-4" style={{ color: isDark ? "#64748B" : "#94A3B8" }} />
                          <span className="text-sm" style={{ fontWeight: 500 }}>Team Management</span>
                        </button>
                        <button
                          onClick={toggleTheme}
                          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all hover:opacity-80"
                          style={{ color: isDark ? "#CBD5E1" : "#475569" }}
                        >
                          {isDark ? <Sun className="w-4 h-4" style={{ color: "#64748B" }} /> : <Moon className="w-4 h-4" style={{ color: "#94A3B8" }} />}
                          <span className="text-sm" style={{ fontWeight: 500 }}>{isDark ? "Light Mode" : "Dark Mode"}</span>
                        </button>
                      </div>

                      {/* Sign out */}
                      <div className="p-2" style={{ borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` }}>
                        <button
                          onClick={() => signOut({ callbackUrl: "/" })}
                          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all"
                          style={{ color: "#EF4444" }}
                        >
                          <LogOut className="w-4 h-4" />
                          <span className="text-sm" style={{ fontWeight: 500 }}>Sign Out</span>
                        </button>
                      </div>
                  </div>
                </>,
                document.body
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto relative">
          {/* Orbs */}
          <div className="hidden md:block fixed pointer-events-none" style={{ top: 0, left: 260, right: 0, bottom: 0, zIndex: 0 }}>
            <div className="absolute top-[-15%] right-[-10%] w-[500px] h-[500px] rounded-full blur-[120px]" style={{ background: "var(--orb-violet)" }} />
            <div className="absolute bottom-[-10%] left-[10%] w-[400px] h-[400px] rounded-full blur-[120px]" style={{ background: "var(--orb-cyan)" }} />
          </div>
          <div className="relative z-10 p-4 md:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
