import { NextResponse } from 'next/server'
import type { CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { resolveProgram, unitsReachedBy } from '@/lib/resolve-client-company'
import { accountFilterFor } from '@/lib/account-walls'
import { andAll } from '@/lib/walls'
import { chainTop } from '@/lib/chain-top'
import { logBulkAccess } from '@/lib/access-log'
import { seatTrail } from '@/lib/program-seat'
import { hasAnyPermission } from '@/lib/permissions'
import { standingAgainstLimit, monthsOf } from '@/lib/tenure-days'
import { matchInvoices, payGate } from '@/lib/invoice-match'
import { regionContracts, regionRequirements, regionReceipts } from '@/lib/region-scope'
import { shownAt, type ShownRow } from '@/lib/document-stages/countries'
import { spendLine } from '@/lib/program-spend'
import { reportingRatesFor, spendInReporting, type RateTable } from '@/lib/money/reporting-currency'
import { startPaperwork } from '../desk-findings'
import { readerScope, type ReaderScope } from '../reader-scope'
import {
  cells, regionRows, managerRows, contractorRows, greeting, factsWhere, inRegion, sumFigures,
  countryCodeFor, waitingOn, regionOfSite, currenciesSays,
  NO_REGION,
  type Facts, type Manager, type OnSite, type Site, type Receipt, type Figures, type RegionRow,
  type ManagerRow, type ContractorRow, type Greeting,
} from './rollup'

/**
 * The program by region: the one read behind the program page's "By
 * region" tab (founder, 2026-10-27, the region map).
 *
 * Three altitudes from one read, never a second dashboard:
 *
 *   no `region`, no `manager`   one row per region, and the program's total
 *   `region`                    that region's hiring managers, and how each
 *                               of its countries runs (regulatory's
 *                               confirmed lines only)
 *   `manager`                   that manager's contractors
 *
 * ── Who reads how much ───────────────────────────────────────────────
 *
 * A head of operations or a CFO reads every region and picks one. A
 * regional manager's seat sits on a REGION unit, and every read below is
 * narrowed to that region's sites and plants (`lib/region-scope`): the
 * rollup is their one region, and asking for another is refused in a
 * sentence. A hiring manager's seat on a plant reads that plant. A
 * program office in a seat is narrowed by its seat's unit, as the program
 * page is.
 *
 * Invoice receipts are counted only for a desk that reads them
 * (`invoices.read` or `payments.record`); for anybody else the figure is
 * null and the page says why, never a zero.
 *
 * Every person read is logged, under the seat where there is one.
 */

export interface RegionsData {
  client: { id: string; name: string }
  /** How much this reader's seat reaches. */
  reader: { reach: 'PROGRAM' | 'REGION' | 'SITE'; label: string | null }
  level: 'PROGRAM' | 'REGION' | 'MANAGER'
  greeting: Greeting
  regions: RegionRow[]
  total: Figures
  /** Set at the region and manager levels. */
  region: {
    label: string
    leads: string[]
    figures: Figures
    managers: ManagerRow[]
    /** How each country in the region runs: regulatory's confirmed lines, nothing unconfirmed. */
    countries: ShownRow[]
  } | null
  /** Set at the manager level. */
  manager: { id: string | null; name: string; plants: string[]; contractors: ContractorRow[] } | null
  /** Why invoice receipts are not counted for this reader; null where they are. */
  receiptsSays: string | null
  /** Why no time limit is shown; null where the client set one. */
  limitSays: string | null
  /** What a spend figure rests on. */
  spendSays: string
  /** "in 8 currencies": how many currencies the program's spend is in. */
  currenciesSays: string
  /**
   * The program's spend as one figure, money's rollup (`spendInReporting`):
   * the sentence printed beside it, which names the rates it used ("sample
   * rates … not market rates" until the company sets its own), or the
   * currency it has no rate for, in which case every `spendOneCurrency` is
   * null and only the currencies are shown.
   */
  oneCurrency: { reportingCurrency: string; says: string; sampleRates: boolean }
}

type Result = { data: RegionsData; error: null } | { data: null; error: NextResponse }

const refuse = (status: number, code: string, message: string): Result => ({
  data: null,
  error: NextResponse.json({ error: { code, message } }, { status }),
})

/** The live states of a line, as the program page reads them. */
const LIVE = ['IN_PROGRESS', 'DRAFT', 'PENDING_VERIFICATION', 'VERIFIED'] as const

export async function regionsView(
  caller: CallerContext,
  ask: { requestedClientId: string | null; region: string | null; manager: string | null; trail?: string }
): Promise<Result> {
  const { client, seat, acting, error } = await resolveProgram(caller, ask.requestedClientId)
  if (error) return { data: null, error }

  const now = new Date()
  const reach = await readerScope(caller, client.id)

  // A seat on a region or a plant reads that and no other region.
  if (reach && ask.region && !(await regionHeld(client.id, reach, ask.region))) {
    return refuse(403, 'OUT_OF_REGION', `Your seat reads ${reach.label} only, so ${ask.region} is not on your page.`)
  }

  const facts = await readFacts(caller, client, { seat, acting, reach, now, trail: ask.trail })
  const all = cells(facts)
  const rates = await reportingRatesFor(client.id, now)
  const inOne = <F extends Figures>(f: F): F => withOneCurrency(f, rates, now)
  const regions = regionRows(facts, all).map(inOne)
  const total = inOne(sumFigures(regions, facts.receipts !== null))
  const rolled = spendInReporting(total.spend, rates.reportingCurrency, rates, now)

  // The level asked for. A seat that reads one region opens on it.
  const regionAsked = ask.region ?? (reach && regions.length === 1 ? regions[0].label : null)
  const managerAsked = ask.manager

  let level: RegionsData['level'] = 'PROGRAM'
  let region: RegionsData['region'] = null
  let manager: RegionsData['manager'] = null
  let said = greeting(facts)

  if (managerAsked) {
    const id = managerAsked === 'none' ? null : managerAsked
    const theirs = all.filter((c) => c.managerId === id && (!ask.region || c.region === ask.region))
    if (theirs.length === 0) {
      return refuse(404, 'NOT_FOUND', 'Nobody by that name manages a plant you read.')
    }
    const keep = (p: { manager: Manager }) => p.manager.id === id
    const scoped = factsWhere(facts, keep)
    level = 'MANAGER'
    manager = {
      id, name: theirs[0].manager,
      plants: [...new Set(theirs.map((c) => c.plant))],
      contractors: contractorRows(facts, id),
    }
    const label = ask.region ?? theirs[0].region
    region = regionPanel(facts, all.map(inOne), regions, label)
    said = greeting(scoped)
  } else if (regionAsked) {
    if (!regions.some((r) => r.label === regionAsked)) {
      return refuse(404, 'NOT_FOUND', `${client.name} has no region called ${regionAsked}.`)
    }
    level = 'REGION'
    region = regionPanel(facts, all.map(inOne), regions, regionAsked)
    said = greeting(factsWhere(facts, inRegion(facts, regionAsked)))
  }

  return {
    error: null,
    data: {
      client: { id: client.id, name: client.name },
      reader: { reach: reach?.kind ?? 'PROGRAM', label: reach?.label ?? null },
      level,
      greeting: said,
      regions,
      total,
      region,
      manager,
      receiptsSays: facts.receipts === null
        ? 'Invoice receipts are read by the AP clerk and finance, so they are not counted on your page.'
        : null,
      limitSays: facts.limitMonths === null ? `${client.name} has set no time limit, so nobody is counted against one.` : null,
      spendSays: spendLine({ priced: 1, unpriced: total.unpriced }),
      currenciesSays: currenciesSays(total.spend),
      oneCurrency: { reportingCurrency: rolled.reportingCurrency, says: rolled.says, sampleRates: rolled.sampleRates },
    },
  }
}

/** A figure's spend as one amount in the reporting currency, or null where a rate is missing. */
function withOneCurrency<F extends Figures>(f: F, rates: RateTable, on: Date): F {
  if (f.spend.length === 0) return f
  const r = spendInReporting(f.spend, rates.reportingCurrency, rates, on)
  return { ...f, spendOneCurrency: r.total ? { currency: r.reportingCurrency, minor: r.total.minor } : null }
}

function regionPanel(facts: Facts, all: ManagerRow[], regions: RegionRow[], label: string): NonNullable<RegionsData['region']> {
  const row = regions.find((r) => r.label === label)
  const sites = facts.sites.filter((s) => regionOfSite(s) === label)
  const codes = [...new Set(sites.map(countryCodeFor))]
  return {
    label,
    leads: row?.leads ?? [],
    figures: row ?? sumFigures([], facts.receipts !== null),
    managers: managerRows(facts, label, all),
    countries: label === NO_REGION ? [] : shownAt(codes),
  }
}

/** Whether a region label is one this narrowed seat reads. */
async function regionHeld(clientId: string, reach: ReaderScope, label: string): Promise<boolean> {
  if (reach.scope.siteIds.length === 0) return false
  const sites = await prisma.companyLocation.findMany({
    where: { companyId: clientId, id: { in: reach.scope.siteIds } },
    select: { region: true },
  })
  return sites.some((s) => (s.region ?? NO_REGION) === label)
}

// ── The read ─────────────────────────────────────────────────────────

async function readFacts(
  caller: CallerContext,
  client: { id: string; name: string },
  ctx: {
    seat: Awaited<ReturnType<typeof resolveProgram>>['seat']
    acting: CallerContext
    reach: ReaderScope | null
    now: Date
    trail?: string
  }
): Promise<Facts & { limitMonths: number | null }> {
  const { seat, acting, reach, now } = ctx
  const seatUnits = await unitsReachedBy(seat)
  const unitWall: Record<string, unknown> = seatUnits ? { orgUnitId: { in: seatUnits } } : {}
  const wall = await accountFilterFor(acting)
  const lineWhere = andAll(endClientFilter(client.id), wall.where, unitWall, reach ? regionContracts(reach.scope) : {})

  const [siteRows, units, leadSeats, rules, everyRung] = await Promise.all([
    prisma.companyLocation.findMany({
      where: { companyId: client.id, ...(reach ? { id: { in: reach.scope.siteIds } } : {}) },
      select: { id: true, name: true, city: true, state: true, country: true, region: true },
      orderBy: { name: 'asc' },
    }),
    prisma.orgUnit.findMany({ where: { companyId: client.id }, select: { id: true, name: true, kind: true, parentId: true } }),
    prisma.context.findMany({
      where: { companyId: client.id, revokedAt: null, orgUnit: { kind: 'REGION' } },
      select: { person: { select: { name: true } }, orgUnit: { select: { name: true } } },
    }),
    prisma.governanceRule.findMany({
      where: { policy: { companyId: client.id, isActive: true }, isActive: true, ruleType: { in: ['TENURE_CAP', 'BREAK_IN_SERVICE'] } },
      select: { ruleType: true, parameters: true },
    }),
    prisma.sellContract.findMany({
      where: andAll(lineWhere, { state: { in: [...LIVE] } }),
      select: {
        id: true, personId: true, companyId: true, clientCompanyId: true, state: true,
        startDate: true, endDate: true, billRate: true, billCurrency: true, workLocationId: true,
        person: { select: { name: true } },
        company: { select: { name: true } },
        hiringManager: { select: { id: true, name: true } },
        requirement: { select: { title: true } },
      },
    }),
  ])
  const sites: Site[] = siteRows
  const siteIds = new Set(sites.map((s) => s.id))
  const siteByName = new Map(sites.map((s) => [s.name, s.id]))

  // The rung the client pays, one per person; where a lower rung carries
  // the site and the top one does not, the person is still at that site.
  const tops = chainTop(everyRung)
  const siteOfPerson = new Map<string, string | null>()
  for (const c of everyRung) if (c.workLocationId && !siteOfPerson.get(c.personId)) siteOfPerson.set(c.personId, c.workLocationId)
  const topOf = new Map(tops.map((c) => [c.personId, c]))
  const placed = (personId: string, own: string | null) => {
    const top = topOf.get(personId)
    const siteId = own ?? top?.workLocationId ?? siteOfPerson.get(personId) ?? null
    return {
      siteId: siteId && siteIds.has(siteId) ? siteId : null,
      manager: managerOf(top?.hiringManager ?? null),
    }
  }

  // ── The time limit, across every supplier ──
  const cap = rules.find((r) => r.ruleType === 'TENURE_CAP')
  const brk = rules.find((r) => r.ruleType === 'BREAK_IN_SERVICE')
  const limitMonths = cap ? Number((cap.parameters as Record<string, unknown>)?.maxMonths ?? 18) : null
  const breakDays = brk ? Number((brk.parameters as Record<string, unknown>)?.breakDays ?? 30) : null
  const onSiteTops = tops.filter((c) => c.state === 'IN_PROGRESS')
  const history = onSiteTops.length
    ? await prisma.sellContract.findMany({
        where: andAll(endClientFilter(client.id), { personId: { in: onSiteTops.map((c) => c.personId) }, state: { in: ['IN_PROGRESS', 'ENDED', 'PAUSED'] } }),
        select: { personId: true, startDate: true, endDate: true, state: true },
      })
    : []
  const linesOf = new Map<string, typeof history>()
  for (const l of history) linesOf.set(l.personId, [...(linesOf.get(l.personId) ?? []), l])

  const onSite: OnSite[] = onSiteTops.map((c) => {
    const lines = (linesOf.get(c.personId) ?? []).map((l) => ({ startDate: l.startDate, endDate: l.endDate, live: l.state !== 'ENDED' }))
    const standing = standingAgainstLimit(lines, { capMonths: limitMonths, breakDays }, now)
    return {
      contractId: c.id, personId: c.personId, personName: c.person.name,
      ...placed(c.personId, c.workLocationId),
      // A stored zero is not a rate: an importer writes zero into a column
      // that cannot be null, and a free contractor is a wrong number.
      rateMinor: (c.billRate ?? 0) > 0 ? c.billRate : null,
      currency: c.billCurrency,
      supplier: c.company.name,
      job: c.requirement?.title ?? null,
      monthsHere: monthsOf(standing.daysOnSite),
      daysLeft: standing.limitDays !== null ? standing.limitDays - standing.countedDays : null,
    }
  })

  // ── Starts the paperwork will refuse, the verdict activation gives ──
  const notStarted = tops.filter((c) => c.state !== 'IN_PROGRESS')
  const verdicts = await Promise.all(notStarted.map(async (c) => ({
    c,
    papers: await startPaperwork(
      { id: c.id, personId: c.personId, companyId: c.companyId, startDate: c.startDate, endDate: c.endDate, person: c.person, requirement: c.requirement },
      { supplierPhrase: c.company.name, clientName: client.name, now }
    ),
  })))
  const held = verdicts.filter((v) => v.papers.outcome === 'BLOCK').map(({ c, papers }) => ({
    contractId: c.id, personId: c.personId, personName: c.person.name,
    ...placed(c.personId, c.workLocationId),
    waitingOn: waitingOn(papers.short),
  }))

  // ── Open jobs, at the plant they are charged to ──
  const unitById = new Map(units.map((u) => [u.id, u]))
  const regionUp = (unitId: string | null): string | null => {
    let u = unitId ? unitById.get(unitId) : undefined
    for (let i = 0; u && i < 32; i++) {
      if (u.kind === 'REGION') return u.name
      u = u.parentId ? unitById.get(u.parentId) : undefined
    }
    return null
  }
  const jobs = await prisma.requirement.findMany({
    where: andAll(
      { status: { in: ['OPEN', 'DRAFT'] }, OR: [{ companyId: client.id }, { msa: { clientId: client.id } }] },
      unitWall,
      reach ? regionRequirements(reach.scope) : {},
    ),
    select: {
      id: true, title: true, orgUnitId: true, location: true,
      owner: { select: { id: true, name: true } }, raisedBy: { select: { id: true, name: true } },
    },
  })
  const open = jobs.map((j) => {
    const unitName = j.orgUnitId ? unitById.get(j.orgUnitId)?.name : undefined
    const siteId = (unitName && siteByName.get(unitName)) ?? (j.location ? siteByName.get(j.location) : undefined) ?? null
    return { id: j.id, title: j.title, manager: managerOf(j.owner ?? j.raisedBy), siteId, region: regionUp(j.orgUnitId) }
  })

  // ── Weeks filed and not signed ──
  const weekRows = await prisma.timesheet.findMany({
    where: {
      status: 'SUBMITTED', clientApprovedAt: null,
      sellContract: andAll(endClientFilter(client.id), unitWall, reach ? regionContracts(reach.scope) : {}),
    },
    select: { id: true, personId: true, person: { select: { name: true } }, sellContract: { select: { workLocationId: true } } },
  })
  const weeks = weekRows.map((w) => ({
    id: w.id, personId: w.personId, personName: w.person.name, ...placed(w.personId, w.sellContract.workLocationId),
  }))

  // ── Papers the client asked for, not in yet ──
  const people = [...new Set(tops.map((c) => c.personId))]
  const packets = people.length
    ? await prisma.documentPacket.findMany({
        where: {
          companyId: client.id, direction: 'COLLECT', completedAt: null, cancelledAt: null,
          expiresAt: { gt: now }, subjectPersonId: { in: people },
        },
        select: { subjectPersonId: true, items: { where: { state: 'PENDING', required: true }, select: { id: true } } },
      })
    : []
  const asked = packets.flatMap((p) => p.items.map(() => ({ personId: p.subjectPersonId!, ...placed(p.subjectPersonId!, null) })))

  // ── Invoice receipts, for a desk that reads them ──
  const readsReceipts = hasAnyPermission(acting.permissions, ['invoices.read', 'payments.record'])
  let receipts: Receipt[] | null = null
  let receiptPeople: string[] = []
  if (readsReceipts) {
    const rows = await prisma.invoice.findMany({
      where: andAll(
        { status: { notIn: ['DRAFT', 'ISSUED', 'CANCELLED', 'VOID'] } },
        { invoiceLines: { some: { sellContract: andAll({ clientCompanyId: client.id }, unitWall) } } },
        reach ? regionReceipts(reach.scope) : {},
      ),
      select: {
        id: true, number: true, status: true,
        invoiceLines: {
          select: {
            personId: true, person: { select: { name: true } },
            sellContract: { select: { clientCompanyId: true, workLocationId: true, company: { select: { name: true } } } },
          },
        },
      },
    })
    const unpaid = rows.filter((r) => r.status !== 'PAID').map((r) => r.id)
    const matches = await matchInvoices(unpaid)
    receipts = rows.map((r) => {
      const line = r.invoiceLines.find((l) => l.sellContract?.clientCompanyId === client.id) ?? r.invoiceLines[0]
      const match = matches.get(r.id) ?? null
      const gate = r.status === 'PAID' ? null : payGate({ number: r.number, status: r.status }, match)
      const over = match?.lines.find((l) => l.hoursSigned !== null && l.hoursBilled > l.hoursSigned)
      if (line?.personId) receiptPeople.push(line.personId)
      return {
        id: r.id, number: r.number,
        supplier: line?.sellContract?.company.name ?? 'A supplier',
        personName: line?.person?.name ?? 'several people',
        ...(line?.personId ? placed(line.personId, line.sellContract?.workLocationId ?? null) : { siteId: null, manager: managerOf(null) }),
        state: r.status === 'PAID' ? 'PAID' : gate?.ok ? 'READY' : 'HELD',
        heldSays: gate && !gate.ok
          ? over ? `${hours(over.hoursBilled)} billed, ${hours(over.hoursSigned!)} signed` : null
          : null,
      }
    })
    receiptPeople = [...new Set(receiptPeople)]
  }

  // ── Every person read, logged ──
  const read = [...new Set([...people, ...weeks.map((w) => w.personId), ...receiptPeople])]
  const what = ctx.trail ?? 'Program by region'
  logBulkAccess(read, {
    actorPersonId: caller.person.id,
    actorCompanyId: caller.company?.id,
    action: 'CONTRACT_VIEW',
    reason: seat ? seatTrail(seat, what) : `${what} at ${client.name}${reach ? `, ${reach.label} only` : ''}`,
  })

  const leads = new Map<string, string[]>()
  for (const s of leadSeats) {
    if (!s.orgUnit) continue
    leads.set(s.orgUnit.name, [...(leads.get(s.orgUnit.name) ?? []), s.person.name].sort())
  }

  return { sites, leads, onSite, held, open, weeks, asked, receipts, limitMonths }
}

function managerOf(p: { id: string; name: string } | null): Manager {
  return p ? { id: p.id, name: p.name } : { id: null, name: '' }
}

function hours(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, '')} hours`
}
