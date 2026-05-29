/**
 * Diagnostic: run real club sessions through the Programming Health v2
 * family aggregator and print the family → program tree.
 *
 * This is the manual-test harness for Phase 1 §1c — it exercises the exact
 * same SQL the getProgrammingFamilyHealth endpoint runs, then the pure
 * aggregateProgramFamilies(), so what prints here is what the UI will show.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/inspect-program-families.ts
 *   npx tsx --env-file=.env.local scripts/inspect-program-families.ts --club=<uuid> --days=30
 *   (default: auto-find a club whose name matches "IPC East", days=30)
 */

import { prisma } from '../lib/prisma'
import { aggregateProgramFamilies, type AggregatorSessionRow } from '../lib/ai/program-family-aggregator'
import { normalizeProgramTitle } from '../lib/ai/program-title-normalizer'
import { classifyProgramFamily, type ProgramFamily } from '../lib/ai/program-family-classifier'
import { buildProgramFamilySeries } from '../lib/ai/program-family-series'
import { buildProgrammingInsights } from '../lib/ai/program-family-insights'

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit?.split('=')[1]
}

async function main() {
  const days = Number(arg('days') ?? 30)
  let clubId = arg('club')
  let clubName: string | null = null

  if (!clubId) {
    const club = await prisma.club.findFirst({
      where: { name: { contains: 'IPC East', mode: 'insensitive' } },
      select: { id: true, name: true },
    })
    if (!club) {
      const all = await prisma.club.findMany({ select: { id: true, name: true }, take: 20 })
      console.error('No "IPC East" club found. Available clubs:')
      all.forEach((c) => console.error(`  ${c.id}  ${c.name}`))
      process.exit(1)
    }
    clubId = club.id
    clubName = club.name
  } else {
    const club = await prisma.club.findUnique({ where: { id: clubId }, select: { name: true } })
    clubName = club?.name ?? null
  }

  const now = new Date()
  const windowStart = new Date(now.getTime() - 2 * days * 86_400_000)

  console.log(`\nClub: ${clubName} (${clubId})`)
  console.log(`Period: ${days}d   Window: ${windowStart.toISOString().slice(0, 10)} → ${now.toISOString().slice(0, 10)}\n`)

  const rows = (await prisma.$queryRawUnsafe(
    `
    WITH window_sessions AS (
      SELECT ps.id, ps.title, ps.format::text AS format, ps.category,
             ps."maxPlayers" AS max_players, ps.date
      FROM play_sessions ps
      -- ::text on the COLUMN is universal: no-op on prod (TEXT) and a clean
      -- cast on the dev DB (UUID), so this diagnostic runs against either.
      WHERE ps."clubId"::text = $1 AND ps.date >= $2 AND ps.date < $3
    ),
    booking_counts AS (
      SELECT psb."sessionId" AS session_id, COUNT(*)::int AS confirmed
      FROM play_session_bookings psb
      WHERE psb.status = 'CONFIRMED'
        AND psb."sessionId" IN (SELECT id FROM window_sessions)
      GROUP BY psb."sessionId"
    )
    SELECT ws.id, ws.title, ws.format, ws.category, ws.max_players, ws.date,
           COALESCE(bc.confirmed, 0)::int AS confirmed_count
    FROM window_sessions ws
    LEFT JOIN booking_counts bc ON bc.session_id = ws.id
    `,
    clubId,
    windowStart,
    now,
  )) as Array<{
    id: string
    title: string | null
    format: string | null
    category: string | null
    max_players: number | null
    date: Date
    confirmed_count: number
  }>

  console.log(`Loaded ${rows.length} sessions across the 2×${days}d window.\n`)

  // --raw: dump distinct (raw title → normalized → family) so we can see
  // exactly what the normalizer/classifier do to real titles.
  if (process.argv.includes('--raw')) {
    const seen = new Map<string, { norm: string; fam: string; n: number }>()
    for (const r of rows) {
      const key = r.title ?? '(null)'
      const ex = seen.get(key)
      if (ex) {
        ex.n++
      } else {
        seen.set(key, {
          norm: normalizeProgramTitle(r.title, clubName) || '(untitled)',
          fam: classifyProgramFamily({ title: r.title, format: r.format, category: r.category }),
          n: 1,
        })
      }
    }
    const sorted = Array.from(seen.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    console.log(`${sorted.length} distinct raw titles:\n`)
    for (const [raw, v] of sorted) {
      console.log(`[${v.fam.padEnd(14)}] x${String(v.n).padStart(3)}  ${JSON.stringify(raw)}`)
      console.log(`${' '.repeat(22)}→ ${JSON.stringify(v.norm)}`)
    }
    await prisma.$disconnect()
    return
  }

  const sessionRows: AggregatorSessionRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    format: r.format,
    category: r.category,
    maxPlayers: r.max_players,
    date: r.date,
    confirmedCount: r.confirmed_count,
  }))

  // --caps=FAMILY: diagnose fill >100% — group the family's current-period
  // sessions by their maxPlayers value, with confirmed-booking stats, so we
  // can see whether the listed capacity is systematically too low.
  const capsFamily = arg('caps') as ProgramFamily | undefined
  if (capsFamily) {
    const periodStart = new Date(now.getTime() - days * 86_400_000)
    const fam = sessionRows.filter(
      (r) =>
        classifyProgramFamily({ title: r.title, format: r.format, category: r.category }) === capsFamily &&
        new Date(r.date) >= periodStart &&
        new Date(r.date) < now,
    )
    const byCap = new Map<number, { sessions: number; confirmed: number; over: number }>()
    for (const r of fam) {
      const cap = r.maxPlayers ?? 0
      const g = byCap.get(cap) ?? { sessions: 0, confirmed: 0, over: 0 }
      g.sessions++
      g.confirmed += r.confirmedCount
      if (r.confirmedCount > cap) g.over++
      byCap.set(cap, g)
    }
    console.log(`maxPlayers breakdown — ${capsFamily} (current ${days}d, ${fam.length} sessions)\n`)
    console.log('  maxPlayers │ sessions │ avg confirmed │ # overbooked')
    for (const [cap, g] of Array.from(byCap.entries()).sort((a, b) => a[0] - b[0])) {
      const avg = (g.confirmed / g.sessions).toFixed(1)
      console.log(`  ${String(cap).padStart(10)} │ ${String(g.sessions).padStart(8)} │ ${avg.padStart(13)} │ ${String(g.over).padStart(12)}`)
    }
    console.log('\n  sample (title · maxPlayers · confirmed):')
    for (const r of fam.slice(0, 12)) {
      console.log(`   ${(r.title ?? '').slice(0, 46).padEnd(48)} cap ${String(r.maxPlayers ?? 0).padStart(3)} · ${r.confirmedCount} confirmed`)
    }
    await prisma.$disconnect()
    return
  }

  // --prices=FAMILY: is the over-admission monetized? Pull pricePerSlot for
  // the family's current-period sessions (PlaySessionBooking has no per-booking
  // payment field — pricePerSlot is the only money signal in the schema).
  const pricesFamily = arg('prices') as ProgramFamily | undefined
  if (pricesFamily) {
    const periodStart = new Date(now.getTime() - days * 86_400_000)
    const priced = (await prisma.$queryRawUnsafe(
      `SELECT ps.id, ps.title, ps.format::text AS format, ps.category,
              ps."pricePerSlot" AS price
       FROM play_sessions ps
       WHERE ps."clubId"::text = $1 AND ps.date >= $2 AND ps.date < $3`,
      clubId, periodStart, now,
    )) as Array<{ id: string; title: string | null; format: string | null; category: string | null; price: number | null }>
    const fam = priced.filter(
      (r) => classifyProgramFamily({ title: r.title, format: r.format, category: r.category }) === pricesFamily,
    )
    let free = 0, zero = 0
    const priceCount = new Map<number, number>()
    for (const r of fam) {
      if (r.price == null) free++
      else if (r.price === 0) zero++
      else priceCount.set(r.price, (priceCount.get(r.price) ?? 0) + 1)
    }
    console.log(`pricePerSlot — ${pricesFamily} (current ${days}d, ${fam.length} sessions)\n`)
    console.log(`  price = null (not set):  ${free}`)
    console.log(`  price = 0 (free):        ${zero}`)
    for (const [p, c] of Array.from(priceCount.entries()).sort((a, b) => a[0] - b[0])) {
      console.log(`  price = $${p.toFixed(2).padEnd(7)} ${c} sessions`)
    }
    await prisma.$disconnect()
    return
  }

  // --series=FAMILY [--program=key]: print the drill-down time series the
  // chart modal will plot (§1f-i verification).
  const seriesFamily = arg('series') as ProgramFamily | undefined
  if (seriesFamily) {
    const s = buildProgramFamilySeries(sessionRows, {
      now,
      periodDays: days,
      family: seriesFamily,
      programKey: arg('program') ?? null,
      clubName,
    })
    console.log(`Series — ${s.family}${s.programKey ? ` / ${s.programKey}` : ''}  (${s.granularity}, ${days}d)\n`)
    for (const b of s.buckets) {
      const fill = b.fillRate == null ? '   —' : `${b.fillRate}%`.padStart(4)
      console.log(`  ${b.label.padEnd(10)}  ${String(b.sessions).padStart(3)} sess  ${String(b.participants).padStart(4)} ppl  fill ${fill}`)
    }
    console.log(`\n  TOTAL: ${s.totals.sessions} sess · ${s.totals.participants} ppl · fill ${s.totals.fillRate == null ? '—' : s.totals.fillRate + '%'}`)
    await prisma.$disconnect()
    return
  }

  const result = aggregateProgramFamilies(sessionRows, { now, periodDays: days, clubName })

  const fmtTrend = (t: { deltaPct: number; direction: string } | null) =>
    t === null ? '   —  ' : `${t.direction === 'up' ? '▲' : t.direction === 'down' ? '▼' : '▬'}${t.deltaPct >= 0 ? '+' : ''}${t.deltaPct}%`
  const fmtFill = (f: number | null) => (f === null ? '  — ' : `${f}%`.padStart(4))

  console.log('═'.repeat(72))
  console.log(`ROLLUP (current ${days}d):  ${result.rollup.sessions} sessions   ${result.rollup.participants} participants   fill ${fmtFill(result.rollup.fillRate)}`)
  console.log(`hasComparison: ${result.hasComparison}`)
  console.log('═'.repeat(72))

  for (const fam of result.families) {
    console.log(
      `\n${fam.emoji} ${fam.label.toUpperCase().padEnd(22)} ` +
        `${String(fam.sessions).padStart(3)} sess  ` +
        `${String(fam.participants).padStart(4)} ppl  ` +
        `fill ${fmtFill(fam.fillRate)}  ` +
        `trend ${fmtTrend(fam.trend)}`,
    )
    for (const p of fam.programs) {
      console.log(
        `   └─ ${p.title.slice(0, 40).padEnd(42)} ` +
          `${String(p.sessions).padStart(3)} sess  ` +
          `${String(p.participants).padStart(4)} ppl  ` +
          `fill ${fmtFill(p.fillRate)}  ` +
          `trend ${fmtTrend(p.trend)}`,
      )
    }
  }
  // Part 2 — insights ("что делать")
  const insights = buildProgrammingInsights(sessionRows, { now, periodDays: days, clubName })
  console.log('\n' + '═'.repeat(72))
  console.log(`INSIGHTS (${insights.length})`)
  console.log('═'.repeat(72))
  for (const i of insights) {
    const sev = i.severity === 'critical' ? '🔴' : '🟠'
    console.log(`\n${sev} [${i.kind}] ${i.title}`)
    console.log(`   ${i.detail}`)
    console.log(`   → ${i.treatmentLabel}  (goal: ${i.treatmentGoal})`)
  }

  console.log('\n' + '═'.repeat(72))
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
