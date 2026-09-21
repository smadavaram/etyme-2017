import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { resolveProgram, unitsReachedBy } from '@/lib/resolve-client-company'
import { seatTrail } from '@/lib/program-seat'
import { asPayer } from '@/lib/chain-top'
import { logBulkAccess } from '@/lib/access-log'
import { HOURS_PER_MONTH, annualSpendMinor } from '../spend'

/**
 * GET /api/program/org
 *
 * The multi-manager org view — Addendum E client workforce governance.
 *
 * BRD Addendum E / client-console prototype: "Each manager found their own
 * vendors and negotiated their own rates. Nobody has seen this together
 * before, because it has never existed in one place — it lives across ten
 * inboxes, fourteen AP records and a procurement folder."
 *
 * Three rollups, all computed from SellContract.hiringManagerId and
 * SellContract.orgUnitId:
 *
 *   managers  — headcount, vendor count, spend, and rate range per manager
 *   variance  — same skill priced differently across managers, with the
 *               annualised saving of moving everyone to the median
 *   vendors   — the vendor tail: preferred / occasional / one-time
 *
 * This is a decision surface, not a working surface. It exists to be read
 * once and acted on, so it returns findings rather than rows.
 */

// The 160-hour month, and the sentence that owns it, live in
// `../spend` — shared with the program dashboard and the census page,
// because three screens computing the same assumption three times is
// three chances for them to disagree on a CFO's desk.

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

/**
 * Annual cost of one contractor at an hourly rate in cents, **in whole
 * currency**. Every figure on this screen is annualized dollars rather
 * than cents, which is why the division is here and not in `spend`.
 */
function annualCost(rateCents: number): number {
  return (annualSpendMinor(rateCents) ?? 0) / 100
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const url = request.nextUrl

  // Resolve first. A program office in a seat reads this under the
  // client's own desk, and a seat scoped to one business unit reads that
  // unit and everything under it — which on this screen is the whole
  // point, because the finding is "your managers pay different rates"
  // and a seat over one division must not answer it for another.
  const { client: clientCompany, seat, error: clientError } = await resolveProgram(
    caller,
    url.searchParams.get('clientCompanyId')
  )
  if (clientError) return clientError

  const seatUnits = await unitsReachedBy(seat)

  // Every rung standing at this end client, across every vendor.
  //
  // A chain puts the same person here more than once — Nike buys Helena
  // from Computer Systems, who buys her from CloudEPA, and both legs
  // name Nike as the site. Read as rows that was two contractors, two
  // vendors and two rates, the lower of them the prime's cost.
  const rungs = await prisma.sellContract.findMany({
    where: {
      ...endClientFilter(clientCompany.id),
      ...(seatUnits ? { orgUnitId: { in: seatUnits } } : {}),
      state: { in: ['IN_PROGRESS', 'VERIFIED', 'PENDING_VERIFICATION'] },
    },
    select: {
      id: true,
      billRate: true,
      personId: true,
      companyId: true,
      clientCompanyId: true,
      hiringManagerId: true,
      orgUnitId: true,
      person: {
        select: {
          id: true,
          name: true,
          consultant: { select: { skills: true, headline: true } },
        },
      },
      company: { select: { id: true, name: true } },
      hiringManager: { select: { id: true, name: true } },
      orgUnit: { select: { id: true, name: true } },
    },
  })

  // One row per placement, and a rate only on the rung this client is
  // itself billed on. A person whose top rung is not in this list is
  // still standing on the site and is still a head; they carry no price,
  // and the basis line below says how many.
  const rows = asPayer(rungs, clientCompany.id)
  const contracts = rows
    .filter(r => r.rateCents !== null)
    .map(r => ({ ...r.contract, billRate: r.rateCents as number }))
  const headcount = rows.length
  const unpriced = rows.length - contracts.length

  logBulkAccess([...new Set(rungs.map(c => c.personId))], {
    actorPersonId: caller.person.id,
    actorCompanyId: caller.company?.id,
    action: 'CONTRACT_VIEW',
    reason: seat ? seatTrail(seat, 'Org view') : `Org view at ${clientCompany.name}`,
  })

  // ── Managers ──
  interface ManagerRollup {
    managerId: string
    managerName: string
    orgUnit: string | null
    headcount: number
    vendorIds: Set<string>
    rates: number[]
    skills: Set<string>
  }

  const managerMap = new Map<string, ManagerRollup>()
  // Contracts with no named owner are surfaced separately rather than hidden —
  // an unowned contractor is itself a governance finding.
  let unassigned = 0

  for (const c of contracts) {
    if (!c.hiringManager) {
      unassigned++
      continue
    }
    const key = c.hiringManager.id
    let m = managerMap.get(key)
    if (!m) {
      m = {
        managerId: c.hiringManager.id,
        managerName: c.hiringManager.name,
        orgUnit: c.orgUnit?.name ?? null,
        headcount: 0,
        vendorIds: new Set(),
        rates: [],
        skills: new Set(),
      }
      managerMap.set(key, m)
    }
    m.headcount++
    m.vendorIds.add(c.companyId)
    m.rates.push(c.billRate)
    for (const s of c.person.consultant?.skills ?? []) m.skills.add(s)
  }

  const managers = [...managerMap.values()]
    .map(m => {
      const flags: string[] = []
      if (m.vendorIds.size >= 3) {
        flags.push(`${m.vendorIds.size} vendors for ${m.headcount} placement${m.headcount === 1 ? '' : 's'}`)
      }
      const spread = m.rates.length > 1 ? Math.max(...m.rates) - Math.min(...m.rates) : 0
      if (spread > 4000) {
        flags.push(`$${Math.round(spread / 100)}/hr spread inside one team`)
      }
      return {
        managerId: m.managerId,
        managerName: m.managerName,
        orgUnit: m.orgUnit,
        headcount: m.headcount,
        vendors: m.vendorIds.size,
        annualSpend: Math.round(m.rates.reduce((sum, r) => sum + annualCost(r), 0)),
        rateMin: Math.min(...m.rates),
        rateMax: Math.max(...m.rates),
        skills: [...m.skills].slice(0, 4),
        flags,
      }
    })
    .sort((a, b) => b.annualSpend - a.annualSpend)

  // ── Rate variance by skill ──
  // A skill counts as varied when two or more managers buy it at different
  // prices. The saving is what moving everyone above the median down to it
  // would return over a year — an opportunity, not a committed number.
  interface SkillRollup {
    skill: string
    entries: { contractId: string; rate: number; managerId: string; managerName: string; vendorName: string; personName: string }[]
  }

  const skillMap = new Map<string, SkillRollup>()

  for (const c of contracts) {
    if (!c.hiringManager) continue
    for (const skill of c.person.consultant?.skills ?? []) {
      let s = skillMap.get(skill)
      if (!s) {
        s = { skill, entries: [] }
        skillMap.set(skill, s)
      }
      s.entries.push({
        contractId: c.id,
        rate: c.billRate,
        managerId: c.hiringManager.id,
        managerName: c.hiringManager.name,
        vendorName: c.company.name,
        personName: c.person.name,
      })
    }
  }

  const variance = [...skillMap.values()]
    .map(s => {
      const managerIds = new Set(s.entries.map(e => e.managerId))
      const rates = s.entries.map(e => e.rate)
      const lo = Math.min(...rates)
      const hi = Math.max(...rates)
      const med = median(rates)
      // Annualised cost of every placement priced above the median
      const saving = s.entries
        .filter(e => e.rate > med)
        .reduce((sum, e) => sum + (annualCost(e.rate) - annualCost(med)), 0)

      return {
        skill: s.skill,
        headcount: s.entries.length,
        managers: managerIds.size,
        rateMin: lo,
        rateMax: hi,
        rateMedian: med,
        spread: hi - lo,
        annualSaving: Math.round(saving),
        entries: s.entries.sort((a, b) => b.rate - a.rate),
      }
    })
    // Only a skill bought by more than one manager at more than one price
    // is actionable — a single team paying one rate is not a finding.
    .filter(v => v.managers > 1 && v.spread > 0)
    .sort((a, b) => b.annualSaving - a.annualSaving)

  // ── Vendor tail ──
  const vendorMap = new Map<string, { id: string; name: string; placements: number; managerIds: Set<string>; skills: Set<string> }>()

  for (const c of contracts) {
    let v = vendorMap.get(c.companyId)
    if (!v) {
      v = { id: c.companyId, name: c.company.name, placements: 0, managerIds: new Set(), skills: new Set() }
      vendorMap.set(c.companyId, v)
    }
    v.placements++
    if (c.hiringManagerId) v.managerIds.add(c.hiringManagerId)
    for (const s of c.person.consultant?.skills ?? []) v.skills.add(s)
  }

  function tierFor(placements: number): 'preferred' | 'occasional' | 'one-time' {
    if (placements >= 5) return 'preferred'
    if (placements >= 2) return 'occasional'
    return 'one-time'
  }

  const vendors = [...vendorMap.values()]
    .map(v => ({
      id: v.id,
      name: v.name,
      placements: v.placements,
      managers: v.managerIds.size,
      skills: [...v.skills].slice(0, 4),
      tier: tierFor(v.placements),
    }))
    .sort((a, b) => b.placements - a.placements)

  const totalAnnualSpend = contracts.reduce((sum, c) => sum + annualCost(c.billRate), 0)
  const oneTimeVendors = vendors.filter(v => v.tier === 'one-time').length

  // Headline saving, counted per PERSON rather than per skill row.
  //
  // A contractor carries several skills, so the same person shows up in
  // several variance rows — someone on SAP MM and SAP SD appears in both.
  // Summing the rows would bank their renegotiation twice and overstate the
  // total. Each contract is therefore counted once, at the largest saving
  // available to it across the skills it appears in.
  const savingPerContract = new Map<string, number>()
  for (const v of variance) {
    for (const e of v.entries) {
      if (e.rate <= v.rateMedian) continue
      const saving = annualCost(e.rate) - annualCost(v.rateMedian)
      const key = e.contractId
      savingPerContract.set(key, Math.max(savingPerContract.get(key) ?? 0, saving))
    }
  }
  const totalSaving = [...savingPerContract.values()].reduce((sum, s) => sum + s, 0)

  return NextResponse.json({
    data: {
      client: { id: clientCompany.id, name: clientCompany.name },
      summary: {
        managers: managers.length,
        vendors: vendors.length,
        oneTimeVendors,
        headcount,
        unpriced,
        unassigned,
        annualSpend: Math.round(totalAnnualSpend),
        annualSaving: Math.round(totalSaving),
      },
      managers,
      variance,
      vendors,
      // Every number above is derived from bill rates over a 160-hour month.
      // Stated so a reader knows what they are looking at (CLAUDE.md: a bare
      // number is a bug).
      basis:
        `Annualised from the rates ${clientCompany.name} is itself billed, at ${HOURS_PER_MONTH} hours/month, across ` +
        `${contracts.length} of ${headcount} live contractor(s) on site. ` +
        (unpriced > 0
          ? `${unpriced} ${unpriced === 1 ? 'is' : 'are'} on site through a supplier chain whose top contract is not live here, ` +
            `so ${unpriced === 1 ? 'that person is' : 'those people are'} counted as head(s) and carry no rate — ` +
            `what a supplier pays its own supplier is not this client's price. `
          : '') +
        `Somebody bought through a chain is counted once, at the contract ${clientCompany.name} pays. ` +
        `Rate variance is the difference between what a contractor is billed at and the median for that skill; ` +
        `each person is counted once even when they appear under several skills. It is an opportunity, not a committed saving.`,
    },
  })
}
