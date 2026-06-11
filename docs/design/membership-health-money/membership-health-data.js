// membership-health-data.js — shared tier dataset (Indy Pickleball Club, from screenshot)
// Numbers anchored to the live screen; rest extrapolated to a believable 12-tier wall.
window.MH_CLUB = {
  name: "Indy Pickleball Club",
  locations: 3,
  estMRR: 61676,
  activeMembers: 12398,
  mrrAtRisk: 29609,
  churnPct: 77,
  upsell: 1320,
  needAction: 7,
  healthy: 6,
  watch: 5,
};

// verdict: critical | at_risk | watch | healthy | tiny
// kind: paid | free
window.MH_TIERS = [
  { id: "opp",      name: "Open Play Pass — $49.99/Month for Unlimited Open Play", price: 49.99, verdict: "critical", health: 0,  mrr: 24845, active: 497, zombie: 77, power: 8,  perMember: 1.6, atRisk: 14722, zombies: 383, powerUsers: 42, network: false, kind: "paid", treat: { type: "RE-ENGAGE", impact: 7361, who: 383 } },
  { id: "oppn",     name: "Open Play Pass — $49.99/Month for Unlimited Open Play (Network)", price: 49.99, verdict: "critical", health: 3, mrr: 7548, active: 151, zombie: 68, power: 14, perMember: 2.6, atRisk: 3959, zombies: 103, powerUsers: 21, network: true, kind: "paid", treat: { type: "RE-ENGAGE", impact: 1980, who: 103 } },
  { id: "prem",     name: "Premium Annual — Unlimited + 4 Guest Passes", price: 99, verdict: "at_risk", health: 38, mrr: 9801, active: 99, zombie: 52, power: 18, perMember: 3.1, atRisk: 3200, zombies: 51, powerUsers: 18, network: false, kind: "paid", treat: { type: "RE-ENGAGE", impact: 1600, who: 51 } },
  { id: "jr",       name: "Junior Academy — $39/Month Youth Program", price: 39, verdict: "at_risk", health: 41, mrr: 4212, active: 108, zombie: 48, power: 11, perMember: 2.0, atRisk: 1521, zombies: 52, powerUsers: 12, network: false, kind: "paid", treat: { type: "WINBACK", impact: 760, who: 52 } },
  { id: "stu",      name: "Student Pass — $19/Month (Verified .edu)", price: 19, verdict: "at_risk", health: 44, mrr: 1140, active: 60, zombie: 50, power: 9, perMember: 1.8, atRisk: 480, zombies: 30, powerUsers: 5, network: false, kind: "paid", treat: { type: "WINBACK", impact: 240, who: 30 } },
  { id: "fam",      name: "Family Plan — $129/Month up to 4 Members", price: 129, verdict: "watch", health: 61, mrr: 6450, active: 50, zombie: 30, power: 22, perMember: 4.2, atRisk: 1400, zombies: 15, powerUsers: 11, network: false, kind: "paid", treat: { type: "PRICE_REVIEW", impact: 0, who: 0 } },
  { id: "drop",     name: "Drop-in Monthly — $59/Month Flex Access", price: 59, verdict: "watch", health: 58, mrr: 2360, active: 40, zombie: 27, power: 15, perMember: 3.0, atRisk: 560, zombies: 11, powerUsers: 6, network: false, kind: "paid", treat: { type: "RE-ENGAGE", impact: 280, who: 11 } },
  { id: "snr",      name: "Senior Social — $29/Month Daytime Access", price: 29, verdict: "watch", health: 63, mrr: 2030, active: 70, zombie: 26, power: 19, perMember: 3.4, atRisk: 520, zombies: 18, powerUsers: 13, network: false, kind: "paid", treat: { type: "RE-ENGAGE", impact: 260, who: 18 } },
  { id: "ten",      name: "Court Time 10-Pack — $79/Month Reserved", price: 79, verdict: "watch", health: 66, mrr: 3160, active: 40, zombie: 28, power: 25, perMember: 4.8, atRisk: 700, zombies: 11, powerUsers: 10, network: false, kind: "paid", treat: { type: "PRICE_REVIEW", impact: 0, who: 0 } },
  { id: "dink",     name: "Dink Master Annual — $89/Month Coaching Tier", price: 89, verdict: "healthy", health: 84, mrr: 5340, active: 60, zombie: 12, power: 35, perMember: 6.1, atRisk: 300, zombies: 7, powerUsers: 21, network: false, kind: "paid", treat: null },
  { id: "corp",     name: "Corporate Membership — $199/Month Team Access", price: 199, verdict: "healthy", health: 88, mrr: 3980, active: 20, zombie: 10, power: 40, perMember: 7.2, atRisk: 200, zombies: 2, powerUsers: 8, network: false, kind: "paid", treat: null },
  { id: "guest",    name: "Guest Pass — Free Trial Access", price: 0, verdict: "watch", health: 55, mrr: 0, active: 210, zombie: 35, power: 7, perMember: 1.2, atRisk: 0, zombies: 74, powerUsers: 15, network: false, kind: "free", treat: { type: "UPSELL", impact: 1320, who: 15 } },
];
