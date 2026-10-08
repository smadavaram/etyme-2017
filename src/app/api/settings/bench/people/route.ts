import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { recordAccess, recordRefusal } from '@/lib/access-log'
import {
  latestPerPerson, notOnBenchSays, onFirmsBench, personAnswer, readSwitch, turnedSays, asSwitch,
  type SwitchRow,
} from '@/lib/bench-holiday-switch'
import { benchPayDesk } from '../desk'

/**
 * GET  /api/settings/bench/people[?personId=a,b] — the holiday switch in force per person
 * POST /api/settings/bench/people { personId, paid } — turn one person's switch
 *
 * For the switch on Our bench rows (etyme-supply's screen). The same three
 * desks as the firm's own setting, and a person's switch is written only
 * for somebody on this firm's own bench: employed here, or listed here by
 * their own consent.
 *
 * A switch is about a person's pay, so every person whose switch is read
 * or turned is on the access trail, and a refused turn is recorded too.
 */

const ROW_SELECT = { personId: true, paid: true, setAt: true, setBy: { select: { name: true } } } as const

async function onBench(companyId: string, personIds: string[], now: Date): Promise<Set<string>> {
  if (personIds.length === 0) return new Set()
  const [employed, listed] = await Promise.all([
    prisma.context.findMany({
      where: {
        companyId, personId: { in: personIds }, type: 'EMPLOYEE', revokedAt: null, suspendedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { personId: true },
    }),
    prisma.benchListing.findMany({
      where: { companyId, state: 'GRANTED', revokedAt: null, lapsedAt: null, consultant: { personId: { in: personIds } } },
      select: { consultant: { select: { personId: true } } },
    }),
  ])
  const e = new Set(employed.map((c) => c.personId))
  const l = new Set(listed.map((b) => b.consultant.personId))
  return new Set(personIds.filter((id) => onFirmsBench({ employed: e.has(id), liveListing: l.has(id) })))
}

function answerOf(kind: string, firmTurns: SwitchRow[], personId: string, row: SwitchRow | null) {
  const a = personAnswer(kind, firmTurns, row)
  return {
    personId,
    paid: a.paid,
    source: a.source,
    says: a.says,
    turned: row ? turnedSays(asSwitch(row)) : null,
  }
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const refused = await benchPayDesk(caller)
  if (refused) return refused

  const companyId = caller.company!.id
  const kind = caller.company!.kind
  const asked = (request.nextUrl.searchParams.get('personId') ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean)

  const rows = await prisma.benchHolidaySwitch.findMany({
    where: { companyId, ...(asked.length ? { OR: [{ personId: null }, { personId: { in: asked } }] } : {}) },
    select: ROW_SELECT,
  })
  const firmTurns = rows.filter((r) => r.personId == null)
  const latest = latestPerPerson(rows)

  // Somebody asked about by id is answered only where they are on this
  // firm's bench; a stranger's id is left out rather than answered.
  const ids = asked.length ? [...(await onBench(companyId, asked, new Date()))] : [...latest.keys()]
  const people = ids.map((id) => answerOf(kind, firmTurns, id, latest.get(id) ?? null))

  await recordAccess(ids, {
    actorPersonId: caller.person.id,
    actorCompanyId: companyId,
    action: 'PAYROLL_VIEW',
    reason: 'Read whether public holidays on the bench are paid',
  })

  return NextResponse.json({ data: { people } })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const personId = typeof body.personId === 'string' ? body.personId.trim() : ''
  const subject = personId
    ? await prisma.person.findUnique({ where: { id: personId }, select: { id: true, name: true } })
    : null

  const refused = await benchPayDesk(caller)
  if (refused) {
    if (subject) {
      await recordRefusal([subject.id], {
        actorPersonId: caller.person.id,
        actorCompanyId: caller.company?.id,
        action: 'PAYROLL_VIEW',
        allowed: false,
        reason: 'Not the owner, admin or finance desk of a firm with a bench',
      })
    }
    return refused
  }

  const companyId = caller.company!.id
  const companyName = caller.company!.name
  if (!subject) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Say whose holiday pay this is: the person on your bench.', field: 'personId' } },
      { status: 422 }
    )
  }

  const s = readSwitch(body)
  if (!s.ok) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: s.message, field: 'paid' } }, { status: 422 })
  }

  const ours = await onBench(companyId, [subject.id], new Date())
  if (!ours.has(subject.id)) {
    await recordRefusal([subject.id], {
      actorPersonId: caller.person.id,
      actorCompanyId: companyId,
      action: 'PAYROLL_VIEW',
      allowed: false,
      reason: 'Not on this firm’s bench',
    })
    return NextResponse.json(
      { error: { code: 'NOT_ON_OUR_BENCH', message: notOnBenchSays(companyName) } },
      { status: 403 }
    )
  }

  // The read is recorded before the switch moves, through the one door.
  // It was a third write inside the transaction below; written first and
  // waited for, a failed row stops the switch rather than leaving a change
  // nobody can trace, which is what the transaction was there to ensure.
  await recordAccess([subject.id], {
    actorPersonId: caller.person.id,
    actorCompanyId: companyId,
    action: 'PAYROLL_VIEW',
    reason: 'Turned their holiday pay on the bench',
  })

  await prisma.$transaction([
    prisma.benchHolidaySwitch.create({
      data: { companyId, personId: subject.id, paid: s.paid, setById: caller.person.id },
    }),
    prisma.automationLog.create({
      data: {
        companyId,
        action: 'BENCH_HOLIDAY_PAY_SWITCHED',
        summary: `${caller.person.name} switched ${s.paid ? 'on' : 'off'} holiday pay on the bench for ${subject.name}`,
        reason: 'Turned by the owner, admin or finance desk',
        payload: { paid: s.paid, personId: subject.id, byPersonId: caller.person.id },
        reversible: true,
      },
    }),
  ])

  const rows = await prisma.benchHolidaySwitch.findMany({
    where: { companyId, OR: [{ personId: null }, { personId: subject.id }] },
    select: ROW_SELECT,
  })
  const person = answerOf(caller.company!.kind, rows.filter((r) => r.personId == null), subject.id, latestPerPerson(rows).get(subject.id) ?? null)
  const firmOff = s.paid && !person.paid
  return NextResponse.json({
    data: {
      person,
      message: firmOff
        ? `Switched on for ${subject.name}. ${companyName} does not pay public holidays on the bench yet, so nothing is paid until the firm turns it on in settings.`
        : `${s.paid ? 'Switched on' : 'Switched off'} for ${subject.name}.`,
    },
  })
}
