import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import {
  chain, position, mayAssert, supersede, historyOf, gaps, live,
  type Assertion, type Record_, type Role,
} from '@/lib/work-ledger'
import { postAssertion, reversePostingsFor } from '@/lib/order-postings'

/**
 * GET  /api/timesheets/:id/assert — where every party stands
 * POST /api/timesheets/:id/assert — one party says its piece
 *
 * Hours are a fact; approvals are opinions about that fact. The chain is
 * derived from the contracts at read time, so a party joining an
 * assignment mid-flight appears immediately with nothing asserted rather
 * than needing somebody to backfill rows they did not know were missing.
 *
 * Nothing is edited. A correction supersedes and both rows remain, which
 * is why the audit chain costs nothing to produce.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Who has to say something about these hours.
 *
 * Walked from the contract rather than stored, because storing it is
 * what made 2017 duplicate a timesheet down the chain and then have to
 * reconcile the copies.
 */
async function expectedLegs(sellContractId: string) {
  const sell = await prisma.sellContract.findUnique({
    where: { id: sellContractId },
    select: {
      companyId: true,
      billRate: true,
      company: { select: { id: true, name: true } },
      clientCompany: { select: { id: true, name: true } },
      endClientCompany: { select: { id: true, name: true } },
      person: { select: { id: true } },
    },
  })
  if (!sell) return null

  const endClient = sell.endClientCompany ?? sell.clientCompany
  const legs: { companyId: string; companyName: string; role: Role; rateCents: number }[] = [
    {
      companyId: endClient.id,
      companyName: endClient.name,
      role: 'CLIENT_APPROVAL',
      rateCents: sell.billRate,
    },
  ]

  // A prime sits between only where the paying client and the end client
  // are different companies. Where they are the same there is no middle
  // leg, and inventing one would leave every direct placement waiting on
  // a party that does not exist.
  if (sell.endClientCompany && sell.endClientCompany.id !== sell.clientCompany.id) {
    legs.push({
      companyId: sell.clientCompany.id,
      companyName: sell.clientCompany.name,
      role: 'PASS_THROUGH',
      rateCents: sell.billRate,
    })
  }

  // Who actually pays the person. The buy contract carries their rate,
  // which is not the client's rate and never was.
  const buy = await prisma.buyContract.findFirst({
    where: { candidates: { some: { personId: sell.person.id } } },
    select: {
      companyId: true,
      company: { select: { id: true, name: true } },
      candidates: { select: { payRate: true }, take: 1 },
    },
  })

  // Zero, never the bill rate. Falling back to what the client pays says
  // "we pay them exactly what we bill", which silently zeroes the margin
  // and is never true of any placement anywhere. Zero is visibly wrong;
  // the bill rate is invisibly wrong, which is worse.
  legs.push({
    companyId: buy?.company.id ?? sell.company.id,
    companyName: buy?.company.name ?? sell.company.name,
    role: 'EMPLOYER_ACCEPTANCE',
    rateCents: buy?.candidates[0]?.payRate ?? 0,
  })

  return { legs, sell }
}

function toRecord(t: any): Record_ {
  const days = Object.entries((t.days ?? {}) as Record<string, number>)
    .map(([on, hours]) => ({ on, hours: Number(hours) }))
    .sort((a, b) => a.on.localeCompare(b.on))

  return {
    id: t.id,
    personId: t.personId,
    personName: t.person.name,
    days,
    periodStart: iso(t.periodStart),
    periodEnd: iso(t.periodEnd),
    submittedAt: t.submittedAt ?? t.periodEnd,
    supersededById: null,
  }
}

function toAssertion(a: any, names: Map<string, string>): Assertion {
  return {
    id: a.id,
    recordId: a.timesheetId,
    companyId: a.companyId,
    companyName: names.get(a.companyId) ?? 'A company',
    role: a.role as Role,
    from: a.coversFrom ? iso(a.coversFrom) : null,
    to: a.coversTo ? iso(a.coversTo) : null,
    hours: Number(a.hours),
    rateCents: a.rateCents,
    state: a.state,
    at: a.at,
    byId: a.byId,
    auto: a.auto,
    note: a.note,
    supersedesId: a.supersedesId,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Timesheets')
  if (notStaff) return notStaff

  const { id } = await params

  const t = await prisma.timesheet.findUnique({
    where: { id },
    include: {
      person: { select: { name: true } },
      assertions: { orderBy: { at: 'asc' } },
    },
  })
  if (!t) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No timesheet by that id.' } },
      { status: 404 }
    )
  }

  const walked = await expectedLegs(t.sellContractId)
  if (!walked) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'That timesheet has no contract behind it.' } },
      { status: 404 }
    )
  }

  // Only a party to the chain may read it.
  const isParty = walked.legs.some((l) => l.companyId === caller.company?.id)
  if (!isParty) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No timesheet by that id.' } },
      { status: 404 }
    )
  }

  const names = new Map(walked.legs.map((l) => [l.companyId, l.companyName]))
  const record = toRecord(t)
  const all = t.assertions.map((a) => toAssertion(a, names))
  const legs = chain(record, walked.legs, all)

  const claimed = await prisma.company.findMany({
    where: { id: { in: walked.legs.map((l) => l.companyId) }, claimedAt: { not: null } },
    select: { id: true },
  })

  return NextResponse.json({
    data: {
      timesheetId: t.id,
      person: t.person.name,
      period: `${record.periodStart} to ${record.periodEnd}`,
      submittedHours: record.days.reduce((n, d) => n + d.hours, 0),
      legs: legs.map((l) => ({
        ...l,
        yours: l.companyId === caller.company?.id,
        history: historyOf(all, l.companyId, l.role),
      })),
      ...position(record, legs),
      // A leg whose company is not here cannot assert anything, and
      // resolving it to somebody else's approval is how a sub-vendor
      // pays on a signature nobody collected.
      gaps: gaps(legs, new Set(claimed.map((c) => c.id))),
    },
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Timesheets')
  if (notStaff) return notStaff

  const { id } = await params
  const companyId = caller.company!.id
  const now = new Date()
  const body = await request.json().catch(() => ({}))

  const t = await prisma.timesheet.findUnique({
    where: { id },
    include: {
      person: { select: { name: true } },
      assertions: { orderBy: { at: 'asc' } },
    },
  })
  if (!t) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No timesheet by that id.' } },
      { status: 404 }
    )
  }

  const walked = await expectedLegs(t.sellContractId)
  if (!walked) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'That timesheet has no contract behind it.' } },
      { status: 404 }
    )
  }

  const names = new Map(walked.legs.map((l) => [l.companyId, l.companyName]))
  const record = toRecord(t)
  const all = t.assertions.map((a) => toAssertion(a, names))
  const mine = walked.legs.find((l) => l.companyId === companyId)

  if (!mine) {
    return NextResponse.json(
      { error: { code: 'NOT_YOURS', message: 'That is not your part of this chain to answer.' } },
      { status: 403 }
    )
  }

  // ── Correcting what we already said ─────────────────────────────────
  if (body?.supersedes) {
    const old = all.find((a) => a.id === body.supersedes && a.companyId === companyId)
    if (!old || old.state !== 'LIVE') {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No live answer of yours by that id.' } },
        { status: 404 }
      )
    }

    const v = supersede(old, Number(body.hours), String(body.note ?? ''), caller.person.id, now)
    if (!v.ok) {
      return NextResponse.json(
        { error: { code: 'NEEDS_REASON', message: v.says, field: 'note' } },
        { status: 422 }
      )
    }

    const [, added] = await prisma.$transaction([
      prisma.workAssertion.update({ where: { id: old.id }, data: { state: 'SUPERSEDED' } }),
      prisma.workAssertion.create({
        data: {
          timesheetId: t.id,
          companyId,
          role: old.role,
          coversFrom: old.from ? new Date(old.from) : null,
          coversTo: old.to ? new Date(old.to) : null,
          hours: Number(body.hours),
          rateCents: old.rateCents,
          state: 'LIVE',
          byId: caller.person.id,
          auto: false,
          note: String(body.note).trim(),
          supersedesId: old.id,
        },
      }),
    ])

    // The money follows the correction. The old postings are cancelled
    // in the month they belonged to and the new ones written, so a
    // month already reported does not silently change shape.
    await reversePostingsFor(old.id, String(body.note).trim(), caller.person.id)
    await postAssertion(added.id, caller.person.id)

    return NextResponse.json({ data: { assertionId: added.id, says: v.says } })
  }

  // ── Withdrawing ─────────────────────────────────────────────────────
  if (body?.withdraw) {
    const old = all.find((a) => a.id === body.withdraw && a.companyId === companyId)
    if (!old || old.state !== 'LIVE') {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No live answer of yours by that id.' } },
        { status: 404 }
      )
    }
    if (String(body?.note ?? '').trim().length < 5) {
      return NextResponse.json(
        {
          error: {
            code: 'NEEDS_REASON',
            message: 'Say why you are withdrawing it. The row stays visible either way.',
            field: 'note',
          },
        },
        { status: 422 }
      )
    }

    await prisma.workAssertion.update({
      where: { id: old.id },
      data: { state: 'WITHDRAWN', note: String(body.note).trim() },
    })

    await reversePostingsFor(old.id, String(body.note).trim(), caller.person.id)

    return NextResponse.json({
      data: { says: `Withdrawn. ${old.companyName} no longer stands behind those hours.` },
    })
  }

  // ── Saying it for the first time ────────────────────────────────────
  const may = mayAssert(companyId, mine.role, walked.legs, all)
  if (!may.ok) {
    return NextResponse.json(
      { error: { code: 'CANNOT_ASSERT', message: may.says } },
      { status: 409 }
    )
  }

  const from = body?.from ? new Date(String(body.from)) : null
  const to = body?.to ? new Date(String(body.to)) : null
  const covered = record.days
    .filter((d) => (!body?.from || d.on >= String(body.from)) && (!body?.to || d.on <= String(body.to)))
    .reduce((n, d) => n + d.hours, 0)

  const hours = body?.hours != null ? Number(body.hours) : covered

  // Accepting a different number needs a reason, for the same reason a
  // reduction on a payslip does: somebody finds out later and asks.
  if (hours !== covered && String(body?.note ?? '').trim().length < 3) {
    return NextResponse.json(
      {
        error: {
          code: 'NEEDS_REASON',
          message: `Accepting ${hours} against ${covered}. Say why.`,
          field: 'note',
        },
      },
      { status: 422 }
    )
  }

  const created = await prisma.workAssertion.create({
    data: {
      timesheetId: t.id,
      companyId,
      role: mine.role,
      coversFrom: from,
      coversTo: to,
      hours,
      rateCents: mine.rateCents,
      state: 'LIVE',
      byId: caller.person.id,
      auto: false,
      note: body?.note ? String(body.note).trim() : null,
    },
  })

  // Revenue when the client approves, pay and burden when the employer
  // accepts. Posted to the month the work was done rather than the month
  // somebody got round to signing it.
  await postAssertion(created.id, caller.person.id)

  const after = chain(record, walked.legs, [...all, toAssertion(created, names)])
  const p = position(record, after)

  return NextResponse.json({
    data: { assertionId: created.id, ...p, says: p.says },
  })
}
