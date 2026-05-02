'use client'
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertTriangle, Clock, Mail, Smartphone, ChevronRight,
  Heart, Sparkles, Search,
} from "lucide-react";
import { DuprBadge } from './shared/SmsBadge'
import { OutreachConfirmIQModal } from './shared/OutreachConfirmIQModal'
import { useReactivationSendFlow } from './shared/useReactivationSendFlow'
import { buildReactivationDraft } from './shared/reactivationDraft'

/* ── Types ── */
interface MembersReactivationSectionProps {
  candidates?: any[];
  aiProfiles?: Record<string, any>;
  isLoading?: boolean;
  onRegenerate?: () => void;
  sendReactivation?: any;
  clubId?: string;
  clubName?: string;
  isDark: boolean;

  /** P2-T8 follow-up: bulk select wired to the parent's selection state so
   *  the same BulkSelectToolbar that serves the main Members list also fires
   *  here. Lets admin tick a few reactivation candidates and bundle them
   *  into a cohort / campaign in one go. */
  selectedMemberIds?: Set<string>;
  onToggleSelection?: (memberId: string) => void;
}

type RiskLevel = "high" | "medium" | "low";

/* ── Helpers ── */
function HealthBar({ score }: { score: number }) {
  const color = score <= 30 ? "#EF4444" : score <= 50 ? "#F59E0B" : "#10B981";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
        <motion.div className="h-full rounded-full" style={{ background: color, width: `${score}%` }} initial={{ width: 0 }} whileInView={{ width: `${score}%` }} transition={{ duration: 0.8 }} viewport={{ once: true }} />
      </div>
      <span className="text-[10px]" style={{ color, fontWeight: 700 }}>{score}</span>
    </div>
  );
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  const map: Record<RiskLevel, { bg: string; text: string; label: string }> = {
    high: { bg: "rgba(239,68,68,0.1)", text: "#F87171", label: "High Risk" },
    medium: { bg: "rgba(249,115,22,0.1)", text: "#FB923C", label: "Medium" },
    low: { bg: "rgba(16,185,129,0.1)", text: "#34D399", label: "Low Risk" },
  };
  const c = map[risk];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px]" style={{ background: c.bg, color: c.text, fontWeight: 700 }}>
      <AlertTriangle className="w-3 h-3" />
      {c.label}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 ${className}`} style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", backdropFilter: "var(--glass-blur)", boxShadow: "var(--card-shadow)" }}>
      {children}
    </div>
  );
}

function mapCandidate(c: any, aiProfiles?: Record<string, any>) {
  const userId = c.member?.id;
  const profile = userId && aiProfiles ? aiProfiles[userId] : undefined;
  const score = c.score || 0;
  return {
    id: userId || String(Math.random()),
    name: c.member?.name || c.member?.email || "Unknown",
    avatar: (c.member?.name || "??").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase(),
    email: c.member?.email || "",
    risk: (score < 20 ? "high" : score < 35 ? "medium" : "low") as RiskLevel,
    healthScore: score,
    daysSincePlay: c.daysSinceLastActivity || 0,
    totalSessions: c.totalHistoricalBookings || 0,
    rating: c.member?.duprRatingDoubles || 0,
    churnReason: c.churnReasons?.length
      ? c.churnReasons.map((r: any) => r.summary).join(". ")
      : (c.reasoning?.summary || "Declining engagement"),
    healthFactors: c.reasoning?.components
      ? Object.entries(c.reasoning.components).map(([key, comp]: [string, any]) => ({
          name: key.replace(/_/g, " ").replace(/\b\w/g, (ch: string) => ch.toUpperCase()),
          score: comp.score || 0,
          label: comp.explanation || `Score: ${comp.score || 0}`,
        }))
      : [],
    reactivationMessage: profile?.reactivationMessage || null,
    hasAiProfile: !!profile,
    contacted: !!c.lastContactedAt,
  };
}

/* ── Component ── */
export function MembersReactivationSection({
  candidates,
  aiProfiles,
  isLoading,
  onRegenerate,
  sendReactivation,
  clubId,
  clubName,
  isDark,
  selectedMemberIds,
  onToggleSelection,
}: MembersReactivationSectionProps) {
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingModal, setPendingModal] = useState<{ memberId: string; channel: "email" | "sms" } | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const { sentOutreach, sendStatus, send, isPendingFor } = useReactivationSendFlow({ sendReactivation, clubId })

  const mapped = (candidates || []).map((c) => mapCandidate(c, aiProfiles));
  const filtered = mapped.filter((m) =>
    !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const hasAiProfiles = aiProfiles && Object.keys(aiProfiles).length > 0;
  const activeModalMember = pendingModal ? mapped.find((member) => member.id === pendingModal.memberId) || null : null

  /* Loading */
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: "var(--subtle)" }} />
        ))}
      </div>
    );
  }

  /* Empty */
  if (!candidates || candidates.length === 0) {
    return (
      <Card className="text-center py-12">
        <Heart className="w-10 h-10 mx-auto mb-3" style={{ color: "#10B981" }} />
        <div className="text-sm" style={{ fontWeight: 700, color: "var(--heading)" }}>No members need reactivation right now</div>
        <div className="text-xs mt-1" style={{ color: "var(--t3)" }}>All members are actively engaged. Great job!</div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: "var(--t3)" }}>{filtered.length} member{filtered.length !== 1 ? "s" : ""} to re-engage</span>
          {onRegenerate && !hasAiProfiles && (
            <button
              onClick={onRegenerate}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] transition-all"
              style={{ background: "rgba(139,92,246,0.12)", color: "#A78BFA", border: "1px solid rgba(139,92,246,0.2)", fontWeight: 600 }}
            >
              <Sparkles className="w-3 h-3" /> Generate AI Profiles
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", minWidth: 200 }}>
          <Search className="w-4 h-4" style={{ color: "var(--t4)" }} />
          <input
            placeholder="Search members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-sm w-full"
            style={{ color: "var(--t1)" }}
          />
        </div>
      </div>

      {/* Member Cards */}
      <div className="space-y-3">
        {filtered.map((member, i) => {
          const isExpanded = expandedMember === member.id;
          const isSelected = !!selectedMemberIds?.has(member.id);
          return (
            <motion.div key={member.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className="!p-0 overflow-hidden">
                {/* Main Row */}
                <div
                  className="flex items-center gap-3 px-4 py-4 cursor-pointer transition-colors"
                  style={{
                    background: isSelected ? "rgba(139,92,246,0.06)" : undefined,
                  }}
                  onClick={() => setExpandedMember(isExpanded ? null : member.id)}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? "rgba(139,92,246,0.06)" : "transparent"; }}
                >
                  {/* P2-T8: per-row checkbox — click stops propagation so the
                      card click still expands the row. Hidden when parent
                      hasn't wired selection state. */}
                  {onToggleSelection && (
                    <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelection(member.id)}
                        aria-label={`Select ${member.name}`}
                        className="w-4 h-4 rounded cursor-pointer"
                        style={{ accentColor: "#8B5CF6" }}
                      />
                    </div>
                  )}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xs text-white shrink-0"
                    style={{
                      background: member.risk === "high" ? "linear-gradient(135deg, #EF4444, #DC2626)"
                        : member.risk === "medium" ? "linear-gradient(135deg, #F59E0B, #D97706)"
                        : "linear-gradient(135deg, #10B981, #059669)",
                      fontWeight: 700,
                    }}
                  >
                    {member.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ fontWeight: 600, color: "var(--heading)" }}>{member.name}</span>
                      <RiskBadge risk={member.risk} />
                      {member.contacted && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(139,92,246,0.1)", color: "#A78BFA", fontWeight: 600 }}>Contacted</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px]" style={{ color: "var(--t3)" }}>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{member.daysSincePlay}d since last play</span>
                      {member.rating > 0 && <DuprBadge rating={member.rating} />}
                      <span>{member.totalSessions} sessions</span>
                    </div>
                  </div>
                  <HealthBar score={member.healthScore} />
                  <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronRight className="w-4 h-4" style={{ color: "var(--t4)" }} />
                  </motion.div>
                </div>

                {/* Expanded */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                      <div className="px-5 pb-5 pt-2 space-y-4" style={{ borderTop: "1px solid var(--divider)" }}>
                        {/* Churn Reason */}
                        <div className="text-xs" style={{ color: "var(--t3)" }}>{member.churnReason}</div>

                        {/* Health Factors */}
                        {member.healthFactors.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {member.healthFactors.map((f) => (
                              <div key={f.name} className="p-2 rounded-lg" style={{ background: "var(--subtle)" }}>
                                <div className="text-[10px] mb-0.5" style={{ color: "var(--t4)" }}>{f.name}</div>
                                <div className="text-xs" style={{ fontWeight: 700, color: f.score >= 70 ? "#10B981" : f.score >= 40 ? "#F59E0B" : "#EF4444" }}>
                                  {f.score}<span style={{ color: "var(--t4)", fontWeight: 400 }}>/100</span>
                                </div>
                                <div className="text-[9px] mt-0.5" style={{ color: "var(--t4)" }}>{f.label}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* AI Reactivation Message */}
                        {member.reactivationMessage && (
                          <div className="p-3 rounded-lg" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}>
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Sparkles className="w-3 h-3" style={{ color: "#A78BFA" }} />
                              <span className="text-[10px] uppercase tracking-wider" style={{ color: "#A78BFA", fontWeight: 700 }}>AI Reactivation Message</span>
                            </div>
                            <div className="text-xs" style={{ color: "var(--t2)", lineHeight: 1.5 }}>{member.reactivationMessage}</div>
                          </div>
                        )}

                        {/* Outreach Buttons */}
                        <div className="flex items-center gap-2">
                          {sentOutreach[member.id] ? (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] flex items-center gap-1" style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", fontWeight: 600 }}>
                              ✓ Sent via {sentOutreach[member.id]}
                            </span>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setDraftMessage(buildReactivationDraft({
                                    memberName: member.name,
                                    clubName,
                                    daysSinceLastActivity: member.daysSincePlay,
                                  }));
                                  setPendingModal({ memberId: member.id, channel: "email" });
                                }}
                                className="px-2.5 py-1 rounded-lg text-[10px] flex items-center gap-1 transition-colors"
                                style={{ background: "rgba(139,92,246,0.15)", color: "#A78BFA", fontWeight: 600 }}
                              >
                                  <Mail className="w-3 h-3" /> Email
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDraftMessage(buildReactivationDraft({
                                      memberName: member.name,
                                      clubName,
                                      daysSinceLastActivity: member.daysSincePlay,
                                    }));
                                    setPendingModal({ memberId: member.id, channel: "sms" });
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-[10px] flex items-center gap-1 transition-colors"
                                  style={{ background: "rgba(249,115,22,0.14)", color: "#FB923C", fontWeight: 600 }}
                                >
                                  <Smartphone className="w-3 h-3" /> SMS
                                </button>
                            </>
                          )}
                        </div>
                        {sendStatus[member.id]?.reason && sendStatus[member.id]?.state !== "sent" && (
                          <div className="text-[10px]" style={{ color: sendStatus[member.id]?.state === "skipped" ? "#F59E0B" : "#F87171" }}>
                            {sendStatus[member.id]?.reason}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <OutreachConfirmIQModal
        open={!!pendingModal && !!activeModalMember}
        channel={pendingModal?.channel || "email"}
        title={pendingModal?.channel === "sms" ? "Send Re-engagement SMS" : "Send Re-engagement Email"}
        description={
          pendingModal?.channel === "sms"
            ? "Review the member context, then send the reactivation SMS in the same IQSport flow used across the platform."
            : "Review the member context, then send the reactivation outreach in the same IQSport flow used across the platform."
        }
        memberName={activeModalMember?.name}
        memberEmail={activeModalMember?.email}
        editableMessage={draftMessage}
        onEditableMessageChange={setDraftMessage}
        messageLabel={pendingModal?.channel === "sms" ? "SMS Draft" : "Email Draft"}
        confirmText={pendingModal?.channel === "sms" ? "Send SMS" : "Send Email"}
        isPending={pendingModal ? isPendingFor(pendingModal.memberId, pendingModal.channel) : false}
        onClose={() => {
          setPendingModal(null)
          setDraftMessage("")
        }}
        onConfirm={() => {
          if (!activeModalMember || !pendingModal) return
          send(
            {
              memberId: activeModalMember.id,
              channel: pendingModal.channel,
              memberName: activeModalMember.name,
              customMessage: draftMessage.trim() || undefined,
            },
            {
              onSettled: () => {
                setPendingModal(null)
                setDraftMessage("")
              },
            },
          )
        }}
      />
    </div>
  );
}
