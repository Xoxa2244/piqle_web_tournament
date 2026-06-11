// mh-money.jsx — Direction A: Money-first
// Tiers sorted by MRR desc. Proportional MRR bars (width encodes magnitude,
// red segment = at-risk share). Click a row → right slide-over drawer with
// the tier detail + "Save as audience" action.

function MoneyRow({ t, maxMRR, onOpen, active }) {
  const v = VERDICT[t.verdict];
  const { core, net } = shortName(t.name);
  const barW = Math.max(6, (t.mrr / maxMRR) * 100);
  const riskW = t.mrr > 0 ? (t.atRisk / t.mrr) * 100 : 0;
  const big = t.mrr >= 12000, mid = t.mrr >= 4000 && !big;
  const valSize = big ? 30 : mid ? 24 : 20;

  return (
    <div onClick={() => onOpen(t)} style={{
      background: active ? "rgba(255,255,255,0.06)" : MH.card,
      border: `1px solid ${active ? v.color + "66" : MH.border}`,
      borderLeft: `3px solid ${v.color}`, borderRadius: 14, padding: big ? "20px 22px" : "15px 22px",
      cursor: "pointer", transition: "all .15s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        {/* identity */}
        <div style={{ width: 250, flexShrink: 0, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <VerdictDot v={t.verdict} />
            <span style={{ fontSize: 15, fontWeight: 700, color: MH.heading, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{core}</span>
            {net && <NetPill />}
          </div>
          <div style={{ fontSize: 11, color: MH.t4, paddingLeft: 16 }}>
            {t.price > 0 ? `$${t.price}/mo` : "Free"} · {t.active.toLocaleString()} active · health {t.health}/100
          </div>
        </div>

        {/* proportional MRR bar */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ height: big ? 16 : 12, borderRadius: 8, background: "rgba(255,255,255,0.05)", overflow: "hidden", display: "flex" }}>
            <div style={{ width: barW + "%", height: "100%", display: "flex", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ width: (100 - riskW) + "%", background: t.mrr > 0 ? `linear-gradient(90deg,${MH.purple},${MH.purpleLt})` : MH.slate }} />
              <div style={{ width: riskW + "%", background: MH.red }} title={`${fmt$(t.atRisk)} at risk`} />
            </div>
          </div>
          {t.atRisk > 0 && (
            <div style={{ fontSize: 11, color: MH.t4, marginTop: 5, display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: MH.red }} />
              <span style={{ color: MH.red, fontWeight: 600 }}>{fmt$(t.atRisk)} at risk</span>
              <span>· {t.zombie}% silent</span>
            </div>
          )}
        </div>

        {/* money */}
        <div style={{ width: 120, flexShrink: 0, textAlign: "right" }}>
          <div style={{ fontSize: valSize, fontWeight: 800, color: MH.heading, letterSpacing: "-0.02em", lineHeight: 1 }}>{fmtK(t.mrr)}</div>
          <div style={{ marginTop: 4 }}><Honesty title="Active members × contracted catalog price — not actual transactions">est. MRR</Honesty></div>
        </div>

        {/* chevron affordance */}
        <div style={{ width: 16, flexShrink: 0, textAlign: "center", color: active ? v.color : MH.t4, fontSize: 18 }}>›</div>
      </div>
    </div>
  );
}

// Right slide-over drawer
function MoneyDrawer({ t, onClose }) {
  if (!t) return null;
  const v = VERDICT[t.verdict];
  const { core, net } = shortName(t.name);
  const stats = [
    ["Zombie", t.zombie + "%", t.zombie >= 65 ? MH.red : t.zombie >= 45 ? MH.orange : MH.t2],
    ["Power", t.power + "%", MH.green],
    ["Bookings", t.perMember + "/mo", MH.t2],
    ["Silent members", t.zombies.toLocaleString(), MH.red],
  ];
  return (
    <>
      {/* backdrop */}
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)", zIndex: 60 }} />
      {/* panel */}
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 440, maxWidth: "100%", background: "#0E0E1A",
        borderLeft: `1px solid ${MH.border}`, zIndex: 70, padding: 26, overflowY: "auto", boxShadow: "-20px 0 60px rgba(0,0,0,0.5)" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <VerdictPill v={t.verdict} />
              {net && <NetPill />}
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, color: MH.heading, lineHeight: 1.25 }}>{core}</div>
            <div style={{ fontSize: 12, color: MH.t4, marginTop: 5 }}>{t.price > 0 ? `$${t.price}/mo` : "Free"} · {t.active.toLocaleString()} active · health {t.health}/100</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${MH.border}`, color: MH.t3, width: 30, height: 30, borderRadius: 8, cursor: "pointer", fontSize: 15, flexShrink: 0 }}>✕</button>
        </div>

        {/* MRR callout */}
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <div style={{ flex: 1, background: MH.card, border: `1px solid ${MH.border}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: MH.heading, letterSpacing: "-0.02em" }}>{fmt$(t.mrr)}</div>
            <div style={{ marginTop: 4 }}><Honesty title="Active × contracted catalog price — not actual transactions">est. MRR</Honesty></div>
          </div>
          <div style={{ flex: 1, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.22)", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: MH.red, letterSpacing: "-0.02em" }}>{fmt$(t.atRisk)}</div>
            <div style={{ marginTop: 4 }}><Honesty title="Silent members × measured 77% never-return rate × price">at risk · measured</Honesty></div>
          </div>
        </div>

        {/* stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          {stats.map(([k, val, c]) => (
            <div key={k} style={{ background: MH.card, border: `1px solid ${MH.border}`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: MH.t4, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>{k}</div>
              <div style={{ fontSize: 19, fontWeight: 700, color: c }}>{val}</div>
            </div>
          ))}
        </div>

        {/* diagnostic */}
        <div style={{ fontSize: 13, color: MH.t2, lineHeight: 1.6, marginTop: 18, padding: "14px 16px", background: MH.card, border: `1px solid ${MH.border}`, borderRadius: 12 }}>
          <span style={{ color: v.color, fontWeight: 700 }}>{t.zombies.toLocaleString()} of {t.active.toLocaleString()} ({t.zombie}%)</span> have 0 bookings in 30 days.
          {" "}<span style={{ color: MH.green, fontWeight: 600 }}>{t.powerUsers} power users</span> ({t.power}%) are the core of this tier.
        </div>

        {/* treatment + action */}
        {t.treat && t.treat.who > 0 ? (
          <div style={{ marginTop: 18, padding: 18, background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.22)", borderRadius: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: TREATMENT[t.treat.type].color, textTransform: "uppercase", background: TREATMENT[t.treat.type].color + "1f", border: `1px solid ${TREATMENT[t.treat.type].color}40`, padding: "2px 7px", borderRadius: 5 }}>{TREATMENT[t.treat.type].label}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: MH.green }}>+{fmt$(t.treat.impact)}/mo potential</span>
            </div>
            <div style={{ fontSize: 13, color: MH.t3, lineHeight: 1.5, marginBottom: 16 }}>
              Build a segment of the <b style={{ color: MH.t2 }}>{t.treat.who.toLocaleString()}</b> {t.treat.type === "UPSELL" ? "free power users" : "silent members"} on this tier. Recovering half the at-risk MRR = <span style={{ color: MH.green, fontWeight: 700 }}>+{fmt$(t.treat.impact)}/mo</span>.
            </div>
            <SaveAudienceBtn count={t.treat.who} />
          </div>
        ) : (
          <div style={{ marginTop: 18, padding: 18, background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 14, fontSize: 14, color: MH.green, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            ✓ Healthy — no action needed on this tier.
          </div>
        )}
      </div>
    </>
  );
}

function DirMoney() {
  const tiers = [...window.MH_TIERS].sort((a, b) => b.mrr - a.mrr);
  const maxMRR = Math.max(...tiers.map(t => t.mrr));
  const c = window.MH_CLUB;
  const [sel, setSel] = React.useState(null);
  return (
    <div style={{ position: "relative", background: MH.bg, padding: 32, fontFamily: "Inter, sans-serif", color: MH.heading, overflow: "hidden" }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.01em" }}>Membership Health</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, color: MH.t3 }}>
            <span style={{ color: MH.heading, fontWeight: 700, fontSize: 18 }}>{fmt$(c.estMRR)}</span> est. MRR
            <span style={{ margin: "0 8px", color: MH.t4 }}>·</span>
            <span style={{ color: MH.red, fontWeight: 700, fontSize: 18 }}>{fmt$(c.mrrAtRisk)}</span> at risk
          </div>
          <div style={{ fontSize: 11, color: MH.t4, marginTop: 4 }}>
            <Honesty title="Measured from this club's own history: 77% of silent members never return">{c.churnPct}% measured churn</Honesty>
          </div>
        </div>
      </div>

      {/* legend */}
      <div style={{ display: "flex", gap: 18, fontSize: 11, color: MH.t4, marginBottom: 18, alignItems: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 18, height: 8, borderRadius: 4, background: `linear-gradient(90deg,${MH.purple},${MH.purpleLt})` }} /> Secured MRR</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 18, height: 8, borderRadius: 4, background: MH.red }} /> At-risk MRR</span>
        <span style={{ marginLeft: "auto" }}>Bar width = share of largest tier · click any row to open</span>
      </div>

      {/* rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tiers.map(t => <MoneyRow key={t.id} t={t} maxMRR={maxMRR} onOpen={setSel} active={sel && sel.id === t.id} />)}
      </div>

      <MoneyDrawer t={sel} onClose={() => setSel(null)} />
    </div>
  );
}
window.DirMoney = DirMoney;
