import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { resolveClientCompany } from '@/lib/resolve-client-company'
import { logBulkAccess } from '@/lib/access-log'

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

/** Hours per month used to annualise an hourly bill rate. */
const HOURS_PER_MONTH = 160
const MONTHS_PER_YEAR = 12

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

/** Annual cost of one contractor at an hourly rate in cents. */
function annualCost(rateCents: number): number {
  return (rateCents * HOURS_PER_MONTH * MONTHS_PER_YEAR) / 100
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const url = request.nextUrl

  const { client: clientCompany, error: clientError } = await resolveClientCompany(
    caller,
    url.searchParams.get('clientCompanyId')
  )
  if (clientError) return clientError

  // Live contractors at this end client, across every vendor.
  const contracts = await prisma.sellContract.findMany({
    where: {
      ...endClientFilter(clientCompany.id),
      state: { in: ['IN_PROGRESS', 'VERIFIED', 'PENDING_VERIFICATION'] },
    },
    select: {
      id: true,
      billRate: true,
      personId: true,
      companyId: true,
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

  logBulkAccess([...new Set(contracts.map(c => c.personId))], {
    actorPersonId: caller.person.id,
    actorCompanyId: caller.company?.id,
    action: 'CONTRACT_VIEW',
    reason: `Org view at ${clientCompany.name}`,
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
        headcount: contracts.length,
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
        `Annualised from bill rates at ${HOURS_PER_MONTH} hours/month across ${contracts.length} live contractor(s) at ${clientCompany.name}. ` +
        `Rate variance is the difference between what a contractor is billed at and the median for that skill; ` +
        `each person is counted once even when they appear under several skills. It is an opportunity, not a committed saving.`,
    },
  })
}
