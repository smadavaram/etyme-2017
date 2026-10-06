import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { resolveClientCompany } from '@/lib/resolve-client-company'
import { askGoesTo } from '@/lib/chain-top'
import { notifyBulk, type NotifyParams } from '@/lib/notify'
import { logAccess } from '@/lib/access-log'
import { daysOnSite } from '@/lib/tenure-days'
import { askBack } from '../ask-back-standing'
import { hasPermission } from '@/lib/permissions'
import { permissionsToJudgeBy } from '@/lib/program-seat'
import type { CompanyKind } from '@/components/session-provider'
import { jobListWord } from '@/app/dashboard/requirements/words'

/**
 * POST /api/alumni/ask-back   { personId, clientCompanyId? }
 *
 * A client asks for somebody who worked on its site before.
 *
 * Three rules, each one a sentence in the tests:
 *
 * 1. **Only for a client the caller acts for.** The client is resolved
 *    the way the alumni list resolves it (`resolveClientCompany`): the
 *    caller's own company, or a client that granted the caller a seat.
 *    A `clientCompanyId` naming anybody else is refused in a sentence.
 *    It used to be taken from the body unchecked, so any signed-in
 *    caller could write a re-engagement against any client.
 *
 * 2. **Only where the ledger reads them eligible** (Addendum E §E.2.3).
 *    The same standing the list, the ledger and the award read; inside
 *    a break the refusal carries the day, past the limit with no break
 *    rule it carries none.
 *
 * 3. **The ask goes to a supplier, never to the person** — Etyme places
 *    nobody. It goes where `/api/people/[id]/ask` sends an ask, by the
 *    one rule in `lib/chain-top` (`askGoesTo`): the firm holding the
 *    person's consent on its bench where the client deals with it, else
 *    the prime above it, else the rung the client paid, else whoever
 *    last put them forward. It used to tell the caller's own firm's
 *    staff, which on a client's desk told the client about itself and
 *    told no supplier at all. No firm below the rung the client pays is
 *    named or reached from here.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const personId = typeof body?.personId === 'string' ? body.personId : null
  const requestedClientId = typeof body?.clientCompanyId === 'string' ? body.clientCompanyId : null

  if (!personId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Who? Pick somebody from the list of people who worked here before.', field: 'personId' } },
      { status: 422 }
    )
  }

  // ── Whose site this is ─────────────────────────────────────────────
  const { client, seat, error: clientError } = await resolveClientCompany(caller, requestedClientId)
  if (clientError) {
    logAccess({
      subjectId: personId, actorPersonId: caller.person.id, actorCompanyId: caller.company?.id,
      action: 'TENURE_VIEW', allowed: false, reason: 'Asked somebody back to a client it does not act for',
    })
    return clientError
  }
  if (requestedClientId && requestedClientId !== client.id) {
    // A seat resolved to a different client than the one named. Refused
    // rather than quietly written against the other one.
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: `You act for ${client.name} here, so you can only ask people back to ${client.name}.` } },
      { status: 403 }
    )
  }

  // ── Whose desk asks ────────────────────────────────────────────────
  //
  // The same desk that asks for a person by name (`/api/people/[id]/ask`):
  // whoever raises job requests here, judged by the seat's role under a
  // seat. Reading who worked here before is wider — a compliance officer
  // reads the list — but asking somebody back is a request for supply,
  // and that is the hiring desk's. The refusal names the desks that may.
  const permissions = permissionsToJudgeBy(caller, seat ?? null)
  if (!hasPermission(permissions, 'requirements.write')) {
    const word = jobListWord('CLIENT' as CompanyKind)
    const desks = await prisma.role.findMany({
      where: { companyId: client.id, OR: [{ permissions: { has: 'requirements.write' } }, { permissions: { has: '*' } }] },
      select: { name: true },
      orderBy: { name: 'asc' },
    })
    const names = [...new Set(desks.map((d) => d.name))]
    const who = names.length === 0
      ? `whoever raises ${word.plural.toLowerCase()} there`
      : names.length === 1 ? `the ${names[0]} desk` : `the ${names.slice(0, -1).join(', ')} or ${names[names.length - 1]} desk`
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: `Asking somebody back to ${client.name} is for ${who}, the desk that raises ${word.plural.toLowerCase()}. You can read who worked here before; ask them to put the request in.` } },
      { status: 403 }
    )
  }

  const now = new Date()
  const [person, contracts] = await Promise.all([
    prisma.person.findUnique({ where: { id: personId }, select: { id: true, name: true } }),
    // Tenure aggregates at the end client, whoever was paid.
    prisma.sellContract.findMany({
      where: { personId, ...endClientFilter(client.id), state: { in: ['IN_PROGRESS', 'ENDED', 'PAUSED'] } },
      select: { id: true, personId: true, companyId: true, clientCompanyId: true, startDate: true, endDate: true, state: true },
    }),
  ])

  if (!person || contracts.length === 0) {
    logAccess({
      subjectId: personId, actorPersonId: caller.person.id, actorCompanyId: caller.company?.id,
      action: 'TENURE_VIEW', allowed: false, reason: `Not a former worker at ${client.name}`,
    })
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `That person has not worked at ${client.name}, so there is nobody to ask back.` } },
      { status: 404 }
    )
  }
  logAccess({
    subjectId: personId, actorPersonId: caller.person.id, actorCompanyId: caller.company?.id,
    action: 'TENURE_VIEW', reason: `Ask back at ${client.name}`,
  })

  if (contracts.some((c) => c.state === 'IN_PROGRESS' || c.state === 'PAUSED')) {
    return NextResponse.json(
      { error: { code: 'CONFLICT', message: `${person.name} is already on contract at ${client.name}.` } },
      { status: 409 }
    )
  }

  // ── The ledger ─────────────────────────────────────────────────────
  const [tenureRule, breakRule] = await Promise.all([
    prisma.governanceRule.findFirst({ where: { policy: { companyId: client.id, isActive: true }, ruleType: 'TENURE_CAP', isActive: true } }),
    prisma.governanceRule.findFirst({ where: { policy: { companyId: client.id, isActive: true }, ruleType: 'BREAK_IN_SERVICE', isActive: true } }),
  ])
  // Read raw, the way the ledger (/api/tenure) and the alumni list read them.
  const limitRules = {
    capMonths: tenureRule ? (tenureRule.parameters as any).maxMonths ?? null : null,
    breakDays: breakRule ? (breakRule.parameters as any).breakDays ?? null : null,
  }
  const verdict = askBack(
    contracts.map((c) => ({ startDate: c.startDate, endDate: c.endDate, live: c.state !== 'ENDED' })),
    limitRules,
    now
  )
  if (!verdict.canReengage) {
    const inBreak = verdict.ledgerStatus === 'IN_BREAK'
    return NextResponse.json(
      {
        error: {
          code: inBreak ? 'BREAK_PERIOD' : 'TIME_LIMIT',
          message: `${person.name} cannot be asked back to ${client.name} yet. ${verdict.reengageBlockReason ?? ''}`.trim(),
          eligibleDate: verdict.eligibleDate,
        },
      },
      { status: 409 }
    )
  }

  // ── Which supplier hears it ────────────────────────────────────────
  //
  // Decided on ids, by the rule the person page's ask uses; only the
  // firms it lands on are looked up by name, and each is one this client
  // deals with.
  const [listings, subs] = await Promise.all([
    prisma.benchListing.findMany({ where: { consultant: { personId }, state: 'GRANTED' }, select: { companyId: true } }),
    prisma.submission.findMany({ where: { toCompanyId: client.id, personId }, select: { fromCompanyId: true }, orderBy: { submittedAt: 'desc' } }),
  ])
  const route = askGoesTo({
    rungs: contracts,
    benchHolderIds: listings.map((l) => l.companyId),
    submitterIds: subs.map((s) => s.fromCompanyId),
    clientCompanyId: client.id,
  })
  if (route.toCompanyIds.length === 0) {
    return NextResponse.json(
      {
        error: {
          code: 'NO_SUPPLIER_OF_YOUR_OWN',
          message: `None of the firms ${client.name} buys through can put ${person.name} forward. Ask one of your suppliers to bring them, and the submission comes through them.`,
        },
      },
      { status: 409 }
    )
  }
  const firms = await prisma.company.findMany({ where: { id: { in: route.toCompanyIds } }, select: { id: true, name: true } })

  const recipients = await prisma.context.findMany({
    where: { companyId: { in: route.toCompanyIds }, role: { permissions: { hasSome: ['submissions.create', '*'] } } },
    select: { personId: true, companyId: true },
  })
  const through = route.throughAPrime ? ` ${client.name} buys through you here, so the ask comes to you rather than to anyone below you.` : ''
  const notes: NotifyParams[] = recipients
    .filter((r) => r.personId !== caller.person.id)
    .map((r) => ({
      personId: r.personId,
      companyId: r.companyId ?? undefined,
      type: 'CONTRACT',
      title: `${client.name} would like ${person.name} back`,
      body: `${caller.person.name} at ${client.name} asked to bring back ${person.name}, who worked there before. Put them forward if they are available.${through}`,
      data: { personId, clientCompanyId: client.id, action: 'ASK_BACK' },
    }))
  await notifyBulk(notes)

  await prisma.automationLog.create({
    data: {
      companyId: client.id,
      action: 'ALUMNI_ASK_BACK',
      summary: `Asked ${firms.map((f) => f.name).join(' and ')} to bring back ${person.name} at ${client.name}`,
      reason: `${caller.person.name} asked from the list of people who worked at ${client.name} before; the ledger reads them clear to come back. It cannot be undone: the supplier has been told, and a notice sent cannot be unsent`,
      payload: {
        personId,
        clientCompanyId: client.id,
        toCompanyIds: route.toCompanyIds,
        routedBy: route.reason,
        totalDays: daysOnSite(contracts, now),
        tenureCapMonths: limitRules.capMonths,
        ledgerStatus: verdict.ledgerStatus,
      },
      // A notice sent cannot be unsent: the supplier has already been told.
      reversible: false,
    },
  })

  const asked = firms.map((f) => f.name)
  return NextResponse.json({
    data: {
      personId,
      personName: person.name,
      clientName: client.name,
      asked,
      throughAPrime: route.throughAPrime,
      message: `${asked.join(' and ')} ${asked.length === 1 ? 'has' : 'have'} been asked to bring back ${person.name}.`,
    },
  })
}
