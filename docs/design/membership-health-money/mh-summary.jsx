// mh-summary.jsx — Direction C: Summary + drill
// One overview panel (MRR split · engagement distribution · verdict counts),
// then a dense compact tier list; click a row to expand detail inline.

function MiniStat({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: MH.t4, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function SummaryRow({ t }) {
  const [open, setOpen] = React.useState(false);
  const v = VERDICT[t.verdict];
  const { core, net } = shortName(t.name);
  const zColor = t.zombie >= 65 ? MH.red : t.zombie >= 45 ? MH.orange : t.zombie >= 25 ? MH.amber : MH.t3;
  return (
    <div style={{ borderBottom: `1px solid ${MH.borderSoft}` }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "grid", gridTemplateColumns: "20px 1fr 88px 80px 96px 96px 22px", alignItems: "center", gap: 12, padding: "13px 6px", cursor: "pointer" }}>
        <VerdictDot v={t.verdict} />
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: MH.heading, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{core}</span>
          {net && <NetPill />}
        </div>
        <div style={{ fontSize: 13, color: MH.t3, textAlign: "right" }}>{t.active.toLocaleString()}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: zColor, textAlign: "right" }}>{t.zombie}%</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: MH.heading, textAlign: "right" }}>{fmtK(t.mrr)}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.atRisk > 0 ? MH.red : MH.t4, textAlign: "right" }}>{t.atRisk > 0 ? fmtK(t.atRisk) : "—"}</div>
        <div style={{ fontSize: 12, color: MH.t4, textAlign: "center", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</div>
      </div>
      {open && (
        <div style={{ padding: "4px 6px 18px 32px", display: "flex", gap: 28, alignItems: "center" }}>
          <div style={{ flex: 1, fontSize: 13, color: MH.t2, lineHeight: 1.6 }}>
            <span style={{ color: zColor, fontWeight: 700 }}>{t.zombies} of {t.active} ({t.zombie}%)</span> have 0 bookings in 30d.
            {" "}<span style={{ color: MH.green, fontWeight: 600 }}>{t.powerUsers} power users</span> ({t.power}%) are the core.
            {" "}Avg {t.perMember} bookings/member.
          </div>
          {t.treat && t.treat.impact > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: TREATMENT[t.treat.type].color, textTransform: "uppercase" }}>{TREATMENT[t.treat.type].label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: MH.green }}>+{fmt$(t.treat.impact)}/mo</div>
              </div>
              <SaveAudienceBtn count={t.treat.who} small />
            </div>
          ) : (
            <span style={{ fontSize: 12, color: MH.green, fontWeight: 600, flexShrink: 0 }}>✓ Healthy — no action</span>
          )}
        </div>
      )}
    </div>
  );
}

function DirSummary() {
  const tiers = [...window.MH_TIERS].sort((a, b) => {
    const order = { critical: 0, at_risk: 1, watch: 2, healthy: 3, tiny: 4 };
    return order[a.verdict] - order[b.verdict] || b.mrr - a.mrr;
  });
  const c = window.MH_CLUB;
  const securedPct = Math.round((c.estMRR - c.mrrAtRisk) / c.estMRR * 100);
  // club-wide engagement split (anchored to measured churn)
  const eng = [
    { k: "Silent", pct: 77, color: MH.red },
    { k: "Light", pct: 11, color: MH.amber },
    { k: "Regular", pct: 7, color: MH.cyan },
    { k: "Power", pct: 5, color: MH.green },
  ];

  return (
    <div style={{ background: MH.bg, padding: 32, fontFamily: "Inter, sans-serif", color: MH.heading }}>
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.01em" }}>Membership Health</div>
      <div style={{ fontSize: 13, color: MH.t3, marginTop: 4, marginBottom: 20 }}>The whole picture first — then drill into any tier.</div>

      {/* overview panel */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1.3fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* MRR split */}
        <div style={{ background: MH.card, border: `1px solid ${MH.border}`, borderRadius: 16, padding: 20 }}>
          <MiniStat label="Monthly recurring revenue">
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>{fmt$(c.estMRR)}</span>
              <Honesty title="Active × contracted catalog price — not actual transactions">est.</Honesty>
            </div>
          </MiniStat>
          <div style={{ height: 12, borderRadius: 6, overflow: "hidden", display: "flex", marginTop: 14 }}>
            <div style={{ width: securedPct + "%", background: `linear-gradient(90deg,${MH.purple},${MH.purpleLt})` }} />
            <div style={{ width: (100 - securedPct) + "%", background: MH.red }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12 }}>
            <span style={{ color: MH.t3 }}><span style={{ color: MH.purpleLt, fontWeight: 700 }}>{fmt$(c.estMRR - c.mrrAtRisk)}</span> secured</span>
            <span style={{ color: MH.t3 }}><span style={{ color: MH.red, fontWeight: 700 }}>{fmt$(c.mrrAtRisk)}</span> at risk</span>
          </div>
        </div>

        {/* engagement distribution */}
        <div style={{ background: MH.card, border: `1px solid ${MH.border}`, borderRadius: 16, padding: 20 }}>
          <MiniStat label={`Engagement · ${c.activeMembers.toLocaleString()} active`}>
            <div style={{ height: 12, borderRadius: 6, overflow: "hidden", display: "flex", marginTop: 4 }}>
              {eng.map(e => <div key={e.k} style={{ width: e.pct + "%", background: e.color }} title={`${e.k} ${e.pct}%`} />)}
            </div>
          </MiniStat>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 14 }}>
            {eng.map(e => (
              <span key={e.k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: MH.t3 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: e.color }} />
                {e.k} <b style={{ color: MH.t2 }}>{e.pct}%</b>
              </span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: MH.t4, marginTop: 10 }}>
            <Honesty title="77% of silent members never return — measured from this club's own history">{c.churnPct}% of silent never return</Honesty>
          </div>
        </div>

        {/* verdict counts */}
        <div style={{ background: MH.card, border: `1px solid ${MH.border}`, borderRadius: 16, padding: 20 }}>
          <MiniStat label="Tier verdicts">
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: MH.red, letterSpacing: "-0.02em" }}>{c.needAction}</span>
              <span style={{ fontSize: 14, color: MH.t3 }}>need action</span>
            </div>
          </MiniStat>
          <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 12, color: MH.t3 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><VerdictDot v="watch" /> {c.watch} watch</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><VerdictDot v="healthy" /> {c.healthy} healthy</span>
          </div>
          <div style={{ fontSize: 12, color: MH.green, marginTop: 14, fontWeight: 600 }}>{fmt$(c.upsell)} upsell potential</div>
        </div>
      </div>

      {/* compact list */}
      <div style={{ background: MH.card, border: `1px solid ${MH.border}`, borderRadius: 16, padding: "6px 16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "20px 1fr 88px 80px 96px 96px 22px", gap: 12, padding: "10px 6px", fontSize: 10, color: MH.t4, textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: `1px solid ${MH.border}` }}>
          <span></span><span>Tier</span><span style={{ textAlign: "right" }}>Active</span><span style={{ textAlign: "right" }}>Zombie</span><span style={{ textAlign: "right" }}>Est. MRR</span><span style={{ textAlign: "right" }}>At risk</span><span></span>
        </div>
        {tiers.map(t => <SummaryRow key={t.id} t={t} />)}
      </div>
    </div>
  );
}
window.DirSummary = DirSummary;
