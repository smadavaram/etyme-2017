import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { standingAgainstLimit } from '@/lib/tenure-days'
import { boxLine, childrenOf, kindWord, rollUp, type UnitFacts } from './tree'
import type { BoxRead, SeatName, TreeRead } from './types'
import { readCompanySeats, peopleOf, countSeats, peopleWords } from '@/lib/company-seats'

/**
 * The tree as Settings → Team structure draws it, read at one company and
 * nowhere else. Every figure is one the record already holds, read here
 * and not computed a second way:
 *   - people: the seats on the box (`Context.orgUnitId`);
 *   - contractors: the live lines charged to it (`SellContract.orgUnitId`);
 *   - open jobs: the published job requests charged to it;
 *   - the nearest time limit: the person's days at the company across
 *     every supplier, by the time limit's own reader (lib/tenure-days),
 *     only where the company set a time limit;
 *   - countries and time zones: the site a SITE box stands for;
 *   - currencies: the currencies its contractors' lines bill in, never a
 *     currency guessed from a country.
 */

export const LIVE_LINES = ['IN_PROGRESS', 'DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'PAUSED'] as const
const NAMES_PER_BOX = 400

export type { SeatName, ContractorName, BoxRead, TreeRead } from './types'

export async function readTree(companyId: string, viewerPersonId: string, now = new Date()): Promise<TreeRead> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, name: true, kind: true, accountWalls: true } })
  const [units, seats, lines, jobs, rules, last] = await Promise.all([
    prisma.orgUnit.findMany({
      where: { companyId },
      select: {
        id: true, parentId: true, name: true, kind: true, position: true, leadContextId: true, leadSetAt: true,
        leadSetBy: { select: { name: true } },
        location: { select: { id: true, name: true, country: true, timeZone: true, region: true } },
      },
    }),
    // The one reader of a company's seats (lib/company-seats): the
    // company's own people, never a consultant on its books or the shared
    // sample seat, and never named with the company's own name.
    readCompanySeats(companyId).then((all) => peopleOf(all).map((c) => ({
      id: c.contextId, orgUnitId: c.orgUnitId, grantedAt: c.grantedAt, state: c.state,
      person: { name: c.name, email: c.email }, role: c.roleName ? { name: c.roleName } : null,
    }))),
    prisma.sellContract.findMany({
      where: { orgUnit: { companyId }, state: { in: [...LIVE_LINES] } },
      select: {
        id: true, personId: true, orgUnitId: true, state: true, billCurrency: true,
        person: { select: { name: true } }, company: { select: { name: true } }, requirement: { select: { title: true } },
      },
      orderBy: { startDate: 'asc' },
      take: 20000,
    }),
    prisma.requirement.groupBy({ by: ['orgUnitId'], where: { orgUnit: { companyId }, status: 'OPEN' }, _count: { _all: true } }),
    prisma.governanceRule.findMany({
      where: { policy: { companyId, isActive: true }, isActive: true, ruleType: { in: ['TENURE_CAP', 'BREAK_IN_SERVICE'] } },
      select: { ruleType: true, parameters: true },
    }),
    prisma.orgChange.findFirst({
      where: { companyId, act: { not: 'UNDO' }, undoneAt: null },
      orderBy: { at: 'desc' },
      select: { id: true, says: true, at: true, actorPersonId: true, actor: { select: { name: true } } },
    }),
  ])

  const seat = (c: (typeof seats)[number]): SeatName => ({ contextId: c.id, name: c.person.name, role: c.role?.name ?? null, email: c.person.email })
  const seatById = new Map(seats.map((c) => [c.id, c]))

  // ── The time limit, where the company set one ──
  const cap = rules.find((r) => r.ruleType === 'TENURE_CAP')
  const brk = rules.find((r) => r.ruleType === 'BREAK_IN_SERVICE')
  const limitMonths = cap ? Number((cap.parameters as Record<string, unknown>)?.maxMonths ?? 18) : null
  const breakDays = brk ? Number((brk.parameters as Record<string, unknown>)?.breakDays ?? 30) : null
  const daysLeft = new Map<string, number | null>()
  const onSite = lines.filter((l) => l.state === 'IN_PROGRESS')
  if (limitMonths !== null && onSite.length) {
    const history = await prisma.sellContract.findMany({
      where: { AND: [endClientFilter(companyId), { personId: { in: [...new Set(onSite.map((l) => l.personId))] }, state: { in: ['IN_PROGRESS', 'ENDED', 'PAUSED'] } }] },
      select: { personId: true, startDate: true, endDate: true, state: true },
    })
    const by = new Map<string, typeof history>()
    for (const h of history) by.set(h.personId, [...(by.get(h.personId) ?? []), h])
    for (const personId of new Set(onSite.map((l) => l.personId))) {
      const s = standingAgainstLimit(
        (by.get(personId) ?? []).map((l) => ({ startDate: l.startDate, endDate: l.endDate, live: l.state !== 'ENDED' })),
        { capMonths: limitMonths, breakDays },
        now
      )
      daysLeft.set(personId, s.limitDays !== null ? s.limitDays - s.countedDays : null)
    }
  }

  // ── Each box's own facts ──
  const own = new Map<string, UnitFacts>()
  const blank = (): UnitFacts => ({ people: 0, contractors: 0, openJobs: 0, nearestLimitDays: null, countries: [], currencies: [], timeZones: [] })
  const factsOf = (id: string) => {
    if (!own.has(id)) own.set(id, blank())
    return own.get(id)!
  }
  for (const c of seats) if (c.orgUnitId) factsOf(c.orgUnitId).people++
  const peopleAt = new Map<string, Set<string>>()
  for (const l of lines) {
    if (!l.orgUnitId) continue
    const f = factsOf(l.orgUnitId)
    // Contractors are the people on site; somebody whose start is still
    // waiting is named on the box and not counted, as Sites counts them.
    const set = peopleAt.get(l.orgUnitId) ?? new Set<string>()
    if (l.state === 'IN_PROGRESS' && !set.has(l.personId)) {
      f.contractors++
      set.add(l.personId)
    }
    peopleAt.set(l.orgUnitId, set)
    if (l.billCurrency && !f.currencies.includes(l.billCurrency)) f.currencies.push(l.billCurrency)
    const d = l.state === 'IN_PROGRESS' ? daysLeft.get(l.personId) ?? null : null
    if (d !== null) f.nearestLimitDays = f.nearestLimitDays === null ? d : Math.min(f.nearestLimitDays, d)
  }
  for (const j of jobs) if (j.orgUnitId) factsOf(j.orgUnitId).openJobs += j._count._all
  for (const u of units) {
    if (u.kind !== 'SITE' || !u.location) continue
    const f = factsOf(u.id)
    f.countries = [u.location.country]
    if (u.location.timeZone) f.timeZones = [u.location.timeZone]
  }
  const rows = units.map((u) => ({ id: u.id, parentId: u.parentId, name: u.name, kind: u.kind, position: u.position }))
  const rolled = rollUp(rows, own)

  // ── The boxes, in the Owner's order, top down ──
  const ordered: typeof units = []
  const walk = (parentId: string | null, depth: number) => {
    if (depth > 64) return
    for (const c of childrenOf(rows, parentId)) {
      ordered.push(units.find((u) => u.id === c.id)!)
      walk(c.id, depth + 1)
    }
  }
  walk(null, 0)

  const boxes: BoxRead[] = ordered.map((u) => {
    const lead = u.leadContextId ? seatById.get(u.leadContextId) : null
    const people = seats.filter((c) => c.orgUnitId === u.id).map(seat)
    const seen = new Set<string>()
    const contractors = lines
      .filter((l) => l.orgUnitId === u.id && !seen.has(l.personId) && seen.add(l.personId))
      .map((l) => ({ sellContractId: l.id, personId: l.personId, name: l.person.name, job: l.requirement?.title ?? null, supplier: l.company.name, onSite: l.state === 'IN_PROGRESS' }))
    const roll = rolled.get(u.id) ?? { ...blank(), sites: 0, teams: 0 }
    return {
      id: u.id, parentId: u.parentId, name: u.name, kind: u.kind, kindWord: kindWord(u.kind), position: u.position,
      lead: lead ? { ...seat(lead), setBy: u.leadSetBy?.name ?? null, setAt: u.leadSetAt?.toISOString() ?? null } : null,
      site: u.kind === 'SITE' && u.location ? u.location : null,
      people: people.slice(0, NAMES_PER_BOX),
      contractors: contractors.slice(0, NAMES_PER_BOX),
      morePeople: Math.max(people.length - NAMES_PER_BOX, 0),
      moreContractors: Math.max(contractors.length - NAMES_PER_BOX, 0),
      roll,
      line: boxLine(roll),
    }
  })

  const ownerSeat = seats.find((c) => c.role?.name === 'Owner') ?? null
  const leads = new Set(units.map((u) => u.leadContextId).filter(Boolean))
  return {
    company,
    owner: ownerSeat ? seat(ownerSeat) : null,
    boxes,
    unplaced: seats.filter((c) => !c.orgUnitId && !leads.has(c.id) && c.id !== ownerSeat?.id).map(seat),
    seats: seats.map(seat),
    // What the tree counts, said: "6 people: 3 with access · 3 invited".
    // The company's own box is a box, never one of its people.
    peopleSays: peopleWords(countSeats(seats)),
    limitMonths,
    lastChange: last ? { id: last.id, says: last.says, by: last.actor?.name ?? null, at: last.at.toISOString(), yours: last.actorPersonId === viewerPersonId } : null,
    contractorPersonIds: [...new Set(lines.map((l) => l.personId))],
  }
}
