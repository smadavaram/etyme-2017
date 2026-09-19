import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { cronAuthorized } from '@/lib/cron-auth'
import { labelOf } from '@/lib/cycle-kinds'
import { prisma } from '@/lib/db'
import { notifyBulk, type NotifyParams } from '@/lib/notify'
import type { Permission } from '@/lib/permissions'
import {
  bodyFor,
  companiesHearing,
  titleFor,
  whoHears,
  type Legs,
  type SeatReader,
} from '@/lib/due-cycle-desks'

/**
 * GET /api/cron/due-cycles
 *
 * BUILD.md §5: "dueCycles — scan for cycles due within N days"
 *
 * Runs nightly via Vercel cron. Finds cycles with a dueOn date within 7
 * days that nothing has completed yet, and tells the desk that can act.
 *
 * ── What this used to do, and why it was three bugs ──────────────────
 *
 * It told `sellContract.personId` — the consultant — about every kind,
 * so the contractor on a placement was told to raise her own client's
 * invoice and told about running her own payroll. It titled the notice
 * with the engine's own enum, so she read "SALARY_CALCULATE cycle due in
 * 3 days" about her own pay. And it included only the sell contract,
 * then skipped every cycle without one — which is all three buy-side
 * kinds, so pay day had never once been surfaced by this job.
 *
 * Routing now lives in `lib/due-cycle-desks`, as a table with a permission beside
 * each kind, so a seventh kind cannot arrive with nobody mapped to it.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const windowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  try {
    // Both legs. `lib/cycle-kinds` files the salary and vendor-bill
    // cycles on the buy contract, where the payroll screen reads them,
    // so a scan that includes only the sell leg is blind to half the
    // table.
    const dueCycles = await prisma.cycle.findMany({
      where: { dueOn: { lte: windowEnd }, completedAt: null },
      include: {
        sellContract: {
          select: {
            id: true,
            companyId: true,
            clientCompanyId: true,
            personId: true,
            approverPersonId: true,
            person: { select: { name: true } },
            clientCompany: { select: { name: true } },
          },
        },
        buyContract: {
          select: {
            id: true,
            companyId: true,
            vendorCompanyId: true,
            company: { select: { name: true } },
            vendorCompany: { select: { name: true } },
            candidates: {
              where: { state: 'ACTIVE' },
              select: { person: { select: { name: true } } },
              take: 8,
            },
          },
        },
      },
      orderBy: { dueOn: 'asc' },
    })

    if (dueCycles.length === 0) {
      return NextResponse.json({
        data: { scanned: true, due: 0, message: 'No cycles due within 7 days' },
      })
    }

    const legsOf = (c: (typeof dueCycles)[number]): Legs => ({
      sell: c.sellContract
        ? {
            id: c.sellContract.id,
            companyId: c.sellContract.companyId,
            clientCompanyId: c.sellContract.clientCompanyId,
            personId: c.sellContract.personId,
            personName: c.sellContract.person.name,
            clientName: c.sellContract.clientCompany.name,
            approverPersonId: c.sellContract.approverPersonId,
          }
        : null,
      buy: c.buyContract
        ? {
            id: c.buyContract.id,
            companyId: c.buyContract.companyId,
            companyName: c.buyContract.company.name,
            vendorCompanyId: c.buyContract.vendorCompanyId,
            vendorName: c.buyContract.vendorCompany?.name ?? null,
            personNames: c.buyContract.candidates.map((x) => x.person.name),
          }
        : null,
    })

    // Group by kind for the summary
    const byKind = new Map<string, number>()
    for (const c of dueCycles) byKind.set(c.kind, (byKind.get(c.kind) ?? 0) + 1)

    // Identify past-due cycles (dueOn already passed, still not completed)
    const pastDue = dueCycles.filter((c) => c.dueOn <= now)

    // One book per company, so a tenant's automation log carries its own
    // counts and never another tenant's. The scan is global; the record
    // of it is not.
    interface Book {
      due: number
      pastDue: number
      told: Set<string>
      kinds: Map<string, number>
    }
    const books = new Map<string, Book>()
    const book = (companyId: string): Book => {
      let hit = books.get(companyId)
      if (!hit) {
        hit = { due: 0, pastDue: 0, told: new Set(), kinds: new Map() }
        books.set(companyId, hit)
      }
      return hit
    }

    // A kind nobody is mapped to. Today that is only an INVOICE_DUE or
    // VENDOR_BILL_DUE row written before those were retired — counted
    // rather than dropped in silence, and never a crash.
    const unrouted = new Map<string, number>()

    for (const cycle of dueCycles) {
      const companies = companiesHearing(cycle.kind, legsOf(cycle))
      if (companies.length === 0) {
        unrouted.set(cycle.kind, (unrouted.get(cycle.kind) ?? 0) + 1)
        continue
      }
      for (const companyId of companies) {
        const b = book(companyId)
        b.due += 1
        if (cycle.dueOn <= now) b.pastDue += 1
        b.kinds.set(cycle.kind, (b.kinds.get(cycle.kind) ?? 0) + 1)
      }
    }

    // Create notifications for upcoming cycles (due in 1-7 days)
    const upcoming = dueCycles.filter((c) => c.dueOn > now)
    const seats = seatReader(now)

    // The same run can reach one person twice — the owner of a small
    // firm is both the AR desk and the payroll desk — and a retried cron
    // invocation can reach them again an hour later. There is no unique
    // constraint on Notification, so the old `try/catch` around the
    // insert caught nothing it claimed to. Both are handled here.
    const sentSince = new Date(now.getTime() - 20 * 60 * 60 * 1000)
    const already = new Set<string>()
    for (const n of await prisma.notification.findMany({
      where: { type: 'CYCLE_DUE', createdAt: { gte: sentSince } },
      select: { personId: true, data: true },
    })) {
      const cycleId = (n.data as { cycleId?: string } | null)?.cycleId
      if (cycleId) already.add(`${cycleId}:${n.personId}`)
    }

    const rows: NotifyParams[] = []
    const notifiedCycles = new Set<string>()
    let viaOwner = 0

    for (const cycle of upcoming) {
      const daysUntilDue = Math.ceil(
        (cycle.dueOn.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      )

      // Only notify at 7, 3, and 1 day marks
      if (![1, 3, 7].includes(daysUntilDue)) continue

      const legs = legsOf(cycle)
      const told = await whoHears(cycle.kind, legs, seats)

      for (const t of told) {
        const key = `${cycle.id}:${t.personId}`
        if (already.has(key)) continue
        already.add(key)
        if (t.viaOwner) viaOwner += 1
        book(t.companyId).told.add(t.personId)
        notifiedCycles.add(cycle.id)
        rows.push({
          personId: t.personId,
          companyId: t.companyId,
          type: 'CYCLE_DUE',
          title: titleFor(cycle.kind, daysUntilDue),
          body: bodyFor(cycle.kind, legs, cycle.dueOn),
          entityId: legs.sell?.id ?? legs.buy?.id,
          data: {
            cycleId: cycle.id,
            kind: cycle.kind,
            dueOn: cycle.dueOn.toISOString(),
            sellContractId: cycle.sellContractId,
            buyContractId: cycle.buyContractId,
            because: t.because,
            viaOwner: t.viaOwner,
          },
        })
      }
    }

    // One write, and one that marks an in-app row SENT rather than
    // leaving it PENDING forever — which is what a direct create did,
    // so every cycle notice ever written still claims it never left.
    if (rows.length > 0) await notifyBulk(rows)

    // AutomationLog — one line per company, carrying that company's own
    // counts. It used to write a single row against whichever sell
    // contract happened to be first in the result set, so one tenant's
    // log recorded every tenant's cycles.
    for (const [companyId, b] of books) {
      if (b.told.size === 0) continue
      const kinds = [...b.kinds.entries()]
        .map(([kind, n]) => `${labelOf(kind).toLowerCase()} (${n})`)
        .join(', ')
      await prisma.automationLog.create({
        data: {
          companyId,
          action: 'DUE_CYCLES_SCAN',
          summary:
            `${b.told.size} ${b.told.size === 1 ? 'person' : 'people'} told about ` +
            `${b.due} date${b.due === 1 ? '' : 's'} inside seven days` +
            (b.pastDue > 0 ? `, ${b.pastDue} already past` : '') +
            `: ${kinds}.`,
          reason:
            'A cycle is money due on a date decided in advance. The desk that can act ' +
            'on it is the desk that is told.',
          payload: {
            due: b.due,
            pastDue: b.pastDue,
            told: b.told.size,
            byKind: Object.fromEntries(b.kinds),
          },
          reversible: false,
        },
      })
    }

    return NextResponse.json({
      data: {
        scanned: true,
        due: dueCycles.length,
        pastDue: pastDue.length,
        notified: notifiedCycles.size,
        people: rows.length,
        viaOwner,
        companies: books.size,
        unrouted: Object.fromEntries(unrouted),
        byKind: Object.fromEntries(byKind),
        message:
          `${dueCycles.length} cycles due, ${pastDue.length} past due, ` +
          `${rows.length} notification${rows.length === 1 ? '' : 's'} sent to ` +
          `${books.size} compan${books.size === 1 ? 'y' : 'ies'}`,
      },
    })
  } catch (err: any) {
    reportError('Due-cycles scan failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Due-cycles scan failed' } },
      { status: 500 }
    )
  }
}

/**
 * Seats, read once per company and permission for the whole run.
 *
 * A nightly scan over every open cycle in the world would otherwise ask
 * the same question a thousand times. A suspended, revoked or expired
 * seat is not a desk — telling somebody who will be refused on arrival
 * is the bug this file already had once.
 */
function seatReader(now: Date): SeatReader {
  const live = {
    revokedAt: null,
    suspendedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  }
  const byPermission = new Map<string, Promise<string[]>>()
  const byOwner = new Map<string, Promise<string[]>>()

  return {
    holders(companyId: string, permission: Permission) {
      const key = `${companyId}:${permission}`
      let hit = byPermission.get(key)
      if (!hit) {
        hit = prisma.context
          .findMany({
            where: {
              companyId,
              ...live,
              // '*' is how `hasPermission` in lib/permissions reads a
              // wildcard role, and how the seeded Owner role is written.
              // Matching the bare name alone would miss every owner.
              role: { permissions: { hasSome: [permission, '*'] } },
            },
            select: { personId: true },
          })
          .then((seatRows) => [...new Set(seatRows.map((r) => r.personId))])
        byPermission.set(key, hit)
      }
      return hit
    },

    owners(companyId: string) {
      let hit = byOwner.get(companyId)
      if (!hit) {
        hit = prisma.context
          .findMany({
            where: { companyId, ...live, role: { name: 'Owner' } },
            select: { personId: true },
          })
          .then((seatRows) => [...new Set(seatRows.map((r) => r.personId))])
        byOwner.set(companyId, hit)
      }
      return hit
    },
  }
}
