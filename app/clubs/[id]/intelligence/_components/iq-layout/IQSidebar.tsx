'use client';

import { useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutDashboard, CalendarDays, Brain, Puzzle, UserPlus, DollarSign,
  Users, Megaphone, PartyPopper, Sun, Moon, ChevronLeft, ChevronRight,
  ChevronDown, Search, Bell, Settings, BarChart3, Cpu, Building2,
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

const navSections: NavSection[] = [
  {
    id: "analytics",
    title: "ANALYTICS",
    icon: BarChart3,
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "" },
      { icon: CalendarDays, label: "Sessions", path: "/sessions" },
      { icon: DollarSign, label: "Revenue", path: "/revenue" },
    ],
  },
  {
    id: "ai-tools",
    title: "AI TOOLS",
    icon: Cpu,
    items: [
      { icon: Brain, label: "AI Advisor", path: "/advisor", isAI: true },
      { icon: Puzzle, label: "Slot Filler", path: "/slot-filler", isAI: true },
      { icon: UserPlus, label: "Reactivation", path: "/reactivation", isAI: true },
    ],
  },
  {
    id: "management",
    title: "MANAGEMENT",
    icon: Building2,
    items: [
      { icon: Users, label: "Members", path: "/members" },
      { icon: Megaphone, label: "Campaigns", path: "/campaigns" },
      { icon: PartyPopper, label: "Events", path: "/events" },
    ],
  },
];

export function IQSidebar({ children, clubId }: { children: React.ReactNode; clubId: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hoverExpand, setHoverExpand] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [profileOpen, setProfileOpen] = useState(false);
  const { theme, toggleTheme, isDark } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { data: clubs } = trpc.club.list.useQuery({}, { staleTime: 60_000 });

  const userName = session?.user?.name || session?.user?.email?.split("@")[0] || "User";
  const userEmail = session?.user?.email || "";
  const userInitials = userName.split(/\s+/).map((w: string) => w[0]?.toUpperCase()).join("").slice(0, 2) || "U";
  const myClubs = (clubs ?? []).filter((c: any) => c.isAdmin || c.isFollowing);

  const basePath = `/clubs/${clubId}/intelligence`;
  const demoParam = searchParams.get("demo") === "true" ? "?demo=true" : "";

  const expanded = !collapsed || hoverExpand;

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

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--page-bg)" }}>
      {/* SIDEBAR */}
      <motion.aside
        animate={{ width: expanded ? 260 : 72 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onMouseEnter={() => collapsed && setHoverExpand(true)}
        onMouseLeave={() => setHoverExpand(false)}
        className="relative flex flex-col shrink-0 h-full z-30"
        style={{
          background: "var(--sidebar-bg)",
          borderRight: "1px solid var(--sidebar-border-color)",
          backdropFilter: "var(--sidebar-blur)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 shrink-0" style={{ borderBottom: "1px solid var(--divider)" }}>
          <LogoIcon size={32} />
          <AnimatePresence>
            {expanded && (
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
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {navSections.map((section) => {
            const SectionIcon = section.icon;
            const isSectionCollapsed = collapsedSections[section.id] ?? false;
            return (
              <div key={section.id}>
                {/* Section header */}
                {expanded ? (
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
                              padding: expanded ? "10px 12px" : "10px 0",
                              justifyContent: expanded ? "flex-start" : "center",
                              background: active ? "var(--pill-active)" : "transparent",
                              color: active ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
                            }}
                          >
                            {active && (
                              <motion.div
                                layoutId="sidebar-active"
                                className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full"
                                style={{ height: 24, background: "linear-gradient(180deg, #8B5CF6, #06B6D4)" }}
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                              />
                            )}
                            <Icon className="w-5 h-5 shrink-0" />
                            <AnimatePresence>
                              {expanded && (
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
                            {expanded && item.isAI && (
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
              padding: expanded ? "10px 12px" : "10px 0",
              justifyContent: expanded ? "flex-start" : "center",
              color: "var(--t3)",
            }}
          >
            {isDark ? <Sun className="w-5 h-5 shrink-0" /> : <Moon className="w-5 h-5 shrink-0" />}
            {expanded && <span className="text-sm" style={{ fontWeight: 500 }}>{isDark ? "Light Mode" : "Dark Mode"}</span>}
          </button>

          <button
            onClick={() => router.push(`/clubs/${clubId}/intelligence/settings`)}
            className="w-full flex items-center gap-3 rounded-xl transition-all"
            style={{
              padding: expanded ? "10px 12px" : "10px 0",
              justifyContent: expanded ? "flex-start" : "center",
              color: pathname.endsWith("/settings") ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
              background: pathname.endsWith("/settings") ? "var(--pill-active)" : "transparent",
            }}
          >
            <Settings className="w-5 h-5 shrink-0" />
            {expanded && <span className="text-sm" style={{ fontWeight: 500 }}>Settings</span>}
          </button>

          <button
            onClick={() => setCollapsed((p) => !p)}
            className="w-full flex items-center gap-3 rounded-xl transition-all"
            style={{
              padding: expanded ? "10px 12px" : "10px 0",
              justifyContent: expanded ? "flex-start" : "center",
              color: "var(--t3)",
            }}
          >
            {collapsed ? <ChevronRight className="w-5 h-5 shrink-0" /> : <ChevronLeft className="w-5 h-5 shrink-0" />}
            {expanded && <span className="text-sm" style={{ fontWeight: 500 }}>Collapse</span>}
          </button>
        </div>
      </motion.aside>

      {/* MAIN */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header
          className="h-16 shrink-0 flex items-center justify-between px-6"
          style={{ borderBottom: "1px solid var(--divider)", background: "var(--sidebar-bg)", backdropFilter: "var(--glass-blur)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl"
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

          <div className="flex items-center gap-3">
            <button className="relative p-2 rounded-xl transition-colors" style={{ color: "var(--t3)" }}>
              <Bell className="w-5 h-5" />
              <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
            </button>
            <button onClick={() => router.push(`/clubs/${clubId}/intelligence/settings`)} className="p-2 rounded-xl transition-colors" style={{ color: "var(--t3)" }}>
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

              <AnimatePresence>
                {profileOpen && (
                  <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />

                    {/* Dropdown */}
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-12 w-72 z-50 rounded-2xl overflow-hidden"
                      style={{
                        background: "var(--card-bg)",
                        border: "1px solid var(--card-border)",
                        backdropFilter: "blur(20px)",
                        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
                      }}
                    >
                      {/* User info */}
                      <div className="p-4" style={{ borderBottom: "1px solid var(--divider)" }}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm text-white" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)", fontWeight: 700 }}>
                            {userInitials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate" style={{ fontWeight: 600, color: "var(--heading)" }}>{userName}</div>
                            <div className="text-xs truncate" style={{ color: "var(--t4)" }}>{userEmail}</div>
                          </div>
                        </div>
                      </div>

                      {/* My Clubs */}
                      {myClubs.length > 0 && (
                        <div className="p-2" style={{ borderBottom: "1px solid var(--divider)" }}>
                          <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider" style={{ color: "var(--t4)", fontWeight: 600 }}>My Clubs</div>
                          {myClubs.map((club: any) => (
                            <button
                              key={club.id}
                              onClick={() => { router.push(`/clubs/${club.id}/intelligence`); setProfileOpen(false); }}
                              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all"
                              style={{ background: club.id === clubId ? "var(--pill-active)" : "transparent" }}
                            >
                              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] text-white flex-shrink-0" style={{ background: club.id === clubId ? "linear-gradient(135deg, #8B5CF6, #06B6D4)" : "rgba(139,92,246,0.2)", fontWeight: 700 }}>
                                {(club.name || "C").charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm truncate" style={{ fontWeight: club.id === clubId ? 600 : 400, color: club.id === clubId ? "var(--heading)" : "var(--t2)" }}>{club.name}</span>
                              {club.id === clubId && <Check className="w-4 h-4 ml-auto flex-shrink-0" style={{ color: "#8B5CF6" }} />}
                            </button>
                          ))}
                          <button
                            onClick={async () => {
                              setProfileOpen(false);
                              router.push("/clubs");
                            }}
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
                          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all"
                          style={{ color: "var(--t2)" }}
                        >
                          <Settings className="w-4 h-4" style={{ color: "var(--t3)" }} />
                          <span className="text-sm" style={{ fontWeight: 500 }}>Club Settings</span>
                        </button>
                        <button
                          onClick={() => { router.push(`/clubs/${clubId}/intelligence/team`); setProfileOpen(false); }}
                          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all"
                          style={{ color: "var(--t2)" }}
                        >
                          <UsersRound className="w-4 h-4" style={{ color: "var(--t3)" }} />
                          <span className="text-sm" style={{ fontWeight: 500 }}>Team Management</span>
                        </button>
                        <button
                          onClick={toggleTheme}
                          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all"
                          style={{ color: "var(--t2)" }}
                        >
                          {isDark ? <Sun className="w-4 h-4" style={{ color: "var(--t3)" }} /> : <Moon className="w-4 h-4" style={{ color: "var(--t3)" }} />}
                          <span className="text-sm" style={{ fontWeight: 500 }}>{isDark ? "Light Mode" : "Dark Mode"}</span>
                        </button>
                      </div>

                      {/* Sign out */}
                      <div className="p-2" style={{ borderTop: "1px solid var(--divider)" }}>
                        <button
                          onClick={() => signOut({ callbackUrl: "/" })}
                          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all"
                          style={{ color: "#EF4444" }}
                        >
                          <LogOut className="w-4 h-4" />
                          <span className="text-sm" style={{ fontWeight: 500 }}>Sign Out</span>
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
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
          <div className="relative z-10 p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
