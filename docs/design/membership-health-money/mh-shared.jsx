// mh-shared.jsx — tokens, helpers, atoms shared by all three directions
// Exported to window at end.

const MH = {
  bg: "#0B0B14",
  card: "rgba(255,255,255,0.035)",
  cardSolid: "#13131f",
  border: "rgba(255,255,255,0.08)",
  borderSoft: "rgba(255,255,255,0.05)",
  heading: "#F4F4F8",
  t2: "rgba(255,255,255,0.74)",
  t3: "rgba(255,255,255,0.5)",
  t4: "rgba(255,255,255,0.34)",
  purple: "#8B5CF6",
  purpleLt: "#A855F7",
  red: "#EF4444",
  orange: "#F97316",
  amber: "#F59E0B",
  green: "#10B981",
  cyan: "#06B6D4",
  slate: "#94A3B8",
};

const VERDICT = {
  critical: { label: "CRITICAL", color: MH.red,    bg: "rgba(239,68,68,0.14)" },
  at_risk:  { label: "AT RISK",  color: MH.orange, bg: "rgba(249,115,22,0.14)" },
  watch:    { label: "WATCH",    color: MH.amber,  bg: "rgba(245,158,11,0.14)" },
  healthy:  { label: "HEALTHY",  color: MH.green,  bg: "rgba(16,185,129,0.14)" },
  tiny:     { label: "TOO SMALL",color: MH.slate,  bg: "rgba(148,163,184,0.14)" },
};

const TREATMENT = {
  "RE-ENGAGE":    { color: MH.purple, label: "Re-engage" },
  "WINBACK":      { color: MH.cyan,   label: "Win back" },
  "UPSELL":       { color: MH.green,  label: "Upsell" },
  "PRICE_REVIEW": { color: MH.amber,  label: "Price review" },
  "BILLING_AUDIT":{ color: MH.slate,  label: "Billing audit" },
};

const fmt$ = (n) => "$" + Math.round(n).toLocaleString();
const fmtK = (n) => n >= 1000 ? "$" + (n/1000).toFixed(n >= 10000 ? 0 : 1) + "K" : "$" + n;

// Short display name: strip the "— $xx..." pricing tail, keep core + (Network)
function shortName(name) {
  const net = / \(Network\)$/.test(name);
  let core = name.replace(/ \(Network\)$/, "").split("—")[0].trim();
  return { core, net };
}

// Honesty badge — small dotted-underline chip with tooltip-ish caption
function Honesty({ children, title }) {
  return (
    <span title={title} style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
      color: MH.t4, borderBottom: `1px dotted ${MH.t4}`, cursor: "help", paddingBottom: 1,
    }}>{children}</span>
  );
}

function VerdictDot({ v, size = 8 }) {
  const c = VERDICT[v] || VERDICT.tiny;
  return <span style={{ width: size, height: size, borderRadius: 99, background: c.color, flexShrink: 0, boxShadow: `0 0 8px ${c.color}66` }} />;
}

function VerdictPill({ v }) {
  const c = VERDICT[v] || VERDICT.tiny;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
      color: c.color, background: c.bg, border: `1px solid ${c.color}40`, padding: "3px 8px", borderRadius: 6 }}>
      {c.label}
    </span>
  );
}

function NetPill() {
  return <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", color: MH.cyan, background: "rgba(6,182,212,0.14)", border: "1px solid rgba(6,182,212,0.3)", padding: "2px 7px", borderRadius: 5 }}>NETWORK</span>;
}

// Save-as-audience button (the non-dead-end treatment action) — quiet ghost style
function SaveAudienceBtn({ count, small }) {
  const [saved, setSaved] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const c = saved ? MH.green : MH.purpleLt;
  return (
    <button onClick={(e) => { e.stopPropagation(); setSaved(true); setTimeout(() => setSaved(false), 1800); }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", whiteSpace: "nowrap",
        fontSize: 12.5, fontWeight: 600, color: c,
        background: saved ? "rgba(16,185,129,0.12)" : hover ? "rgba(139,92,246,0.16)" : "rgba(139,92,246,0.08)",
        border: `1px solid ${saved ? "rgba(16,185,129,0.4)" : "rgba(139,92,246,0.3)"}`,
        padding: small ? "6px 12px" : "8px 14px", borderRadius: 8, transition: "all .15s",
      }}>
      {saved
        ? <>✓ Saved · {count.toLocaleString()}</>
        : <>＋ Save audience <span style={{ color: MH.t3, fontWeight: 700 }}>· {count.toLocaleString()}</span></>}
    </button>
  );
}

Object.assign(window, { MH, VERDICT, TREATMENT, fmt$, fmtK, shortName, Honesty, VerdictDot, VerdictPill, NetPill, SaveAudienceBtn });
