import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { standingOf, type RosterLine } from '@/lib/consultant-portfolio'
import {
  ourBenchRow, byFreeDate, managesLine, cityOf, dayOf, isoDay, holdStands,
  type OurBenchRow,
} from '@/lib/internal-moves'
import { seatFacts, refuse } from './facts'
import { recordAccess } from '@/lib/access-log'

/**
 * GET /api/bench/ours
 *
 * Our bench: a firm's own people coming off a project or between
 * projects, with their skills, place, free date, current project and the
 * manager releasing them — and, for a manager, the project team they may
 * flag and the positions they may hold somebody for.
 *
 * Read by the firm's managers and HR and by nobody else (`mayReadOurBench`
 * in lib/internal-moves): never a client, never an engineer on the
 * roster. Every person shown is on the access trail before the answer
 * leaves, as somebody listed as coming free before they are.
 *
 * Not `/api/bench?scope=payroll`. That is the whole roster and what each
 * person is on; this is who is moving, which is a different question with
 * its own readers.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { verdict, seat } = await seatFacts(caller)
  if (!verdict.ok) return refuse(verdict.code, verdict.message)
  const companyId = caller.company!.id
  const now = new Date()
  const today = dayOf(now)

  const seats = await prisma.context.findMany({
    where: {
      companyId, type: 'EMPLOYEE', revokedAt: null, suspendedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      personId: true,
      role: { select: { name: true } },
      person: { select: { name: true, consultant: { select: { skills: true, location: true } } } },
    },
  })
  const people = new Map<string, { name: string; seat: string | null; skills: string[]; place: string | null }>()
  for (const s of seats) {
    if (people.has(s.personId)) continue
    people.set(s.personId, {
      name: s.person.name,
      seat: s.role?.name ?? null,
      skills: s.person.consultant?.skills ?? [],
      place: s.person.consultant?.location ?? null,
    })
  }
  const ids = [...people.keys()]

  const [sells, buys, releases, holds] = await Promise.all([
    prisma.sellContract.findMany({
      where: { companyId, personId: { in: ids }, state: { in: ['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'IN_PROGRESS', 'PAUSED', 'ENDED'] } },
      select: {
        id: true, personId: true, state: true, startDate: true, endDate: true, deliveryUnitId: true, workOrderId: true,
        clientCompany: { select: { name: true } },
        endClientCompany: { select: { name: true } },
        workLocation: { select: { city: true } },
        requirement: { select: { title: true, location: true } },
        workOrder: { select: { title: true, number: true } },
      },
    }),
    prisma.buyContractCandidate.findMany({
      where: {
        personId: { in: ids }, state: { in: ['ACTIVE', 'ENDED'] },
        buyContract: { companyId, state: { in: ['PENDING_VERIFICATION', 'VERIFIED', 'IN_PROGRESS', 'PAUSED', 'ENDED'] } },
      },
      select: { personId: true, startDate: true, endDate: true, state: true, buyContract: { select: { state: true } } },
    }),
    prisma.projectRelease.findMany({
      where: { companyId, withdrawnAt: null, holds: { none: { endedHow: 'PLACED' } } },
    }),
    prisma.projectHold.findMany({
      where: {
        companyId,
        OR: [{ live: 'LIVE' }, { endedHow: 'PLACED', placedStartsOn: { gte: today } }],
      },
    }),
  ])

  const managerIds = [...new Set([...releases.map((r) => r.releasedById), ...holds.map((h) => h.heldById)])]
  const managers = new Map(
    (await prisma.person.findMany({ where: { id: { in: managerIds } }, select: { id: true, name: true } })).map((p) => [p.id, p.name])
  )

  // Where the reader may name a client: the whole firm unless the firm
  // walls its accounts and the reader sits on one.
  const walled = Boolean(caller.company?.accountWalls && seat.orgUnitId)
  const mayName = (deliveryUnitId: string | null) => !walled || !deliveryUnitId || seat.unitIds.includes(deliveryUnitId)

  const linesOf = new Map<string, RosterLine[]>()
  const add = (id: string, l: RosterLine) => linesOf.set(id, [...(linesOf.get(id) ?? []), l])
  for (const c of sells) {
    if (c.state === 'DRAFT') continue
    add(c.personId, {
      live: c.state === 'IN_PROGRESS' || c.state === 'PAUSED',
      paused: c.state === 'PAUSED',
      startsOn: c.startDate, endsOn: c.endDate ?? null,
      clientName: c.endClientCompany?.name ?? c.clientCompany?.name ?? null,
    })
  }
  for (const b of buys) {
    const s = b.buyContract.state
    add(b.personId, {
      live: b.state === 'ACTIVE' && (s === 'IN_PROGRESS' || s === 'PAUSED'),
      paused: s === 'PAUSED', startsOn: b.startDate ?? null, endsOn: b.endDate ?? null, clientName: null,
    })
  }

  const site = (c: (typeof sells)[number]) => ({
    client: c.endClientCompany?.name ?? c.clientCompany?.name ?? null,
    city: cityOf(c.workLocation) ?? cityOf(c.requirement?.location ?? null),
  })
  const liveLine = (personId: string) =>
    sells
      .filter((c) => c.personId === personId && (c.state === 'IN_PROGRESS' || c.state === 'PAUSED'))
      .sort((a, b) => (b.endDate?.getTime() ?? Infinity) - (a.endDate?.getTime() ?? Infinity))[0] ?? null

  const rows: OurBenchRow[] = []
  const viewer = { personId: caller.person.id, as: verdict.as }
  for (const [personId, p] of people) {
    const release = releases.find((r) => r.personId === personId) ?? null
    const placed = holds.find((h) => h.personId === personId && h.endedHow === 'PLACED') ?? null
    const live = holds.find((h) => h.personId === personId && h.live === 'LIVE' && holdStands(h, today)) ?? null
    const lines = linesOf.get(personId) ?? []
    const standing = standingOf({ personId, name: p.name, seat: p.seat, practice: null, skills: p.skills, listed: false, lines }, now)
    if (!release && !placed && standing.standing !== 'BETWEEN_PROJECTS') continue

    const current = liveLine(personId)
    const lastEnded = lines
      .filter((l) => !l.live && l.endsOn)
      .reduce<Date | null>((a, l) => (a && a > l.endsOn! ? a : l.endsOn!), null)
    rows.push(
      ourBenchRow(
        {
          personId, name: p.name, seat: p.seat, skills: p.skills, place: p.place,
          release: release
            ? {
                id: release.id, rollsOffOn: release.rollsOffOn, keepUntil: release.keepUntil,
                confirmedAt: release.confirmedAt, releaserId: release.releasedById,
                releaserName: managers.get(release.releasedById) ?? 'A manager',
              }
            : null,
          current: current ? site(current) : null,
          mayNameProject: current ? mayName(current.deliveryUnitId) : true,
          lastEnded,
          hold: live
            ? { id: live.id, heldById: live.heldById, heldByName: managers.get(live.heldById) ?? 'A manager', forTitle: live.forTitle, until: live.until, forKind: live.forRequirementId ? ('REQUIREMENT' as const) : ('ORDER' as const) }
            : null,
          moving: placed && placed.placedStartsOn
            ? {
                toClient: sells.find((c) => c.id === placed.placedSellContractId)
                  ? site(sells.find((c) => c.id === placed.placedSellContractId)!).client
                  : placed.forTitle,
                startsOn: placed.placedStartsOn,
              }
            : null,
          today: now,
        },
        viewer
      )
    )
  }
  rows.sort(byFreeDate)

  // ── What a manager may act on ───────────────────────────────────────
  const manager = verdict.as === 'MANAGER'
  const team = manager
    ? sells
        .filter((c) => (c.state === 'IN_PROGRESS' || c.state === 'PAUSED') && managesLine(seat, c))
        .map((c) => {
          const r = releases.find((x) => x.sellContractId === c.id) ?? null
          return {
            sellContractId: c.id,
            personId: c.personId,
            name: people.get(c.personId)?.name ?? 'Somebody',
            ...site(c),
            startsOn: isoDay(c.startDate),
            endsOn: c.endDate ? isoDay(c.endDate) : null,
            release: r
              ? { id: r.id, rollsOffOn: isoDay(r.rollsOffOn), keepUntil: r.keepUntil ? isoDay(r.keepUntil) : null, confirmed: r.confirmedAt != null }
              : null,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    : []

  const maySubmit = hasPermission(caller.permissions, 'submissions.create')
  const positions: {
    kind: 'ORDER' | 'REQUIREMENT'
    key: string
    title: string
    client: string | null
    city: string | null
    sellContractId?: string
    workOrderId?: string
    requirementId?: string
  }[] = []
  if (manager) {
    // A line on an order the manager's own project runs under — the order
    // is the position, and its latest line is whose terms a new line copies.
    const byOrder = new Map<string, (typeof sells)[number]>()
    for (const c of sells) {
      if (!c.workOrderId || !['IN_PROGRESS', 'VERIFIED', 'PENDING_VERIFICATION'].includes(c.state)) continue
      if (!managesLine(seat, c)) continue
      const held = byOrder.get(c.workOrderId)
      if (!held || (c.endDate?.getTime() ?? Infinity) > (held.endDate?.getTime() ?? Infinity)) byOrder.set(c.workOrderId, c)
    }
    for (const [workOrderId, c] of byOrder) {
      const s = site(c)
      const what = c.requirement?.title ?? c.workOrder?.title ?? 'the project'
      positions.push({
        kind: 'ORDER', key: `order:${workOrderId}`, workOrderId, sellContractId: c.id,
        title: `${what} — ${[s.client, s.city].filter(Boolean).join(', ')}`,
        ...s,
      })
    }
    // A client's job request the firm was sent, or its own — only for a
    // desk that may put somebody forward, so the screen never offers a
    // position whose placement the submission door would refuse.
    if (maySubmit) {
      const reqs = await prisma.requirement.findMany({
        where: {
          status: 'OPEN',
          OR: [
            { companyId },
            { invitations: { some: { toCompanyId: companyId, status: { in: ['SENT', 'ACCEPTED'] } } } },
          ],
        },
        select: { id: true, title: true, location: true, company: { select: { name: true } }, endClientCompany: { select: { name: true } } },
        take: 50,
      })
      for (const r of reqs) {
        const client = r.endClientCompany?.name ?? r.company.name
        positions.push({
          kind: 'REQUIREMENT', key: `req:${r.id}`, requirementId: r.id,
          title: `${r.title} — ${[client, cityOf(r.location)].filter(Boolean).join(', ')}`,
          client, city: cityOf(r.location),
        })
      }
    }
  }

  if (rows.length) {
    await recordAccess(rows.map((r) => r.personId), {
      actorPersonId: caller.person.id,
      actorCompanyId: companyId,
      action: 'RELEASING_SOON_VIEW',
      reason: `Read on Our bench at ${caller.company!.name}, as ${verdict.as === 'HR' ? 'HR' : 'a manager'}.`,
    })
  }

  return NextResponse.json({
    data: {
      viewer: { personId: caller.person.id, as: verdict.as, maySubmit },
      rows,
      team,
      positions,
      summary: {
        rollingOff: rows.filter((r) => r.status === 'ROLLING_OFF').length,
        kept: rows.filter((r) => r.status === 'KEPT').length,
        between: rows.filter((r) => r.status === 'BETWEEN_PROJECTS').length,
        moving: rows.filter((r) => r.status === 'MOVING').length,
        held: rows.filter((r) => r.hold).length,
      },
    },
  })
}
