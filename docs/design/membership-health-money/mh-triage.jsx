// mh-triage.jsx — Direction B: Triage action queue
// Reframes the wall as a prioritized to-do list sorted by $ impact.
// Healthy tiers collapse into a single "no action" strip.

function ActionCard({ t, rank }) {
  const v = VERDICT[t.verdict];
  const { core, net } = shortName(t.name);
  const tr = TREATMENT[t.treat.type];
  const verb = {
    "RE-ENGAGE": `Re-engage ${t.treat.who} silent members`,
    "WINBACK": `Win back ${t.treat.who} lapsed members`,
    "UPSELL": `Upsell ${t.treat.who} free power users`,
    "PRICE_REVIEW": `Review pricing on ${t.active} members`,
  }[t.treat.type] || "Review tier";

  return (
    <div style={{
      background: MH.card, border: `1px solid ${MH.border}`, borderLeft: `3px solid ${v.color}`,
      borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", gap: 18,
    }}>
      <div style={{ width: 30, textAlign: "center", flexShrink: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: MH.t4 }}>{rank}</div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: tr.color, textTransform: "uppercase", background: tr.color + "1f", border: `1px solid ${tr.color}40`, padding: "2px 7px", borderRadius: 5 }}>{tr.label}</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: MH.heading }}>{verb}</span>
        </div>
        <div style={{ fontSize: 12, color: MH.t3, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{ color: MH.t2, fontWeight: 600 }}>{core}</span>
          {net && <NetPill />}
          <span style={{ color: MH.t4 }}>·</span>
          <span><VerdictPill v={t.verdict} /></span>
          <span style={{ color: MH.t4 }}>·</span>
          <span>{t.zombie}% of {t.active} silent</span>
        </div>
      </div>

      {/* impact */}
      <div style={{ textAlign: "right", flexShrink: 0, width: 110 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: MH.green, letterSpacing: "-0.02em", lineHeight: 1 }}>+{fmtK(t.treat.impact)}</div>
        <div style={{ fontSize: 11, color: MH.t4, marginTop: 4 }}>/mo recoverable</div>
      </div>

      <div style={{ flexShrink: 0 }}>
        <SaveAudienceBtn count={t.treat.who} small />
      </div>
    </div>
  );
}

function DirTriage() {
  const all = window.MH_TIERS;
  const actions = all.filter(t => t.treat && t.treat.impact > 0).sort((a, b) => b.treat.impact - a.treat.impact);
  const holding = all.filter(t => !t.treat || t.treat.impact === 0);
  const totalRecover = actions.reduce((s, t) => s + t.treat.impact, 0);
  const holdMRR = holding.reduce((s, t) => s + t.mrr, 0);
  const c = window.MH_CLUB;

  return (
    <div style={{ background: MH.bg, padding: 32, fontFamily: "Inter, sans-serif", color: MH.heading }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.01em" }}>What to do this week</div>
          <div style={{ fontSize: 13, color: MH.t3, marginTop: 4 }}>{actions.length} actions across your membership tiers, ranked by recoverable revenue.</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: MH.green, letterSpacing: "-0.02em", lineHeight: 1 }}>+{fmt$(totalRecover)}</div>
          <div style={{ fontSize: 11, color: MH.t4, marginTop: 5 }}>
            /mo recoverable · <Honesty title="Assumes each campaign recovers half of the at-risk MRR, at this club's measured 77% silent-churn rate">half of at-risk, measured</Honesty>
          </div>
        </div>
      </div>

      {/* action queue */}
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {actions.map((t, i) => <ActionCard key={t.id} t={t} rank={i + 1} />)}
      </div>

      {/* holding strip */}
      <div style={{ marginTop: 18, background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.18)", borderRadius: 14, padding: "16px 22px", display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ width: 9, height: 9, borderRadius: 99, background: MH.green, boxShadow: `0 0 10px ${MH.green}` }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: MH.heading }}>{holding.length} tiers healthy</span>
        <span style={{ fontSize: 13, color: MH.t3 }}>— holding {fmt$(holdMRR)} MRR, no action needed.</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {holding.map(t => {
            const { core } = shortName(t.name);
            return <span key={t.id} style={{ fontSize: 11, color: MH.t3, background: "rgba(255,255,255,0.04)", border: `1px solid ${MH.borderSoft}`, padding: "3px 9px", borderRadius: 99, whiteSpace: "nowrap" }}>{core}</span>;
          })}
        </div>
      </div>

      <div style={{ fontSize: 11, color: MH.t4, marginTop: 16, lineHeight: 1.5 }}>
        Est. MRR = active × contracted catalog price (not actual transactions). At-risk = silent members × this club's measured {c.churnPct}% never-return rate × price. “Save as audience” builds a filtered member segment you can act on from Members.
      </div>
    </div>
  );
}
window.DirTriage = DirTriage;
