import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { awardDoor } from '@/lib/award'
import {
  headline, waitingOn, placeFromRound, shapeRow as shape, rowToInterview as asInterview,
} from '@/lib/interviews'

/**
 * GET /api/interviews — everything either side of this company is in
 *
 * One list, both chairs. A client sees what they booked; a supplier sees
 * what they have been asked to confirm. The scoping is the whole
 * boundary: host or supplier on the row, and nobody else.
 *
 * Ordered by what needs doing rather than by date. An interview waiting
 * on somebody for two days is more urgent than one happening on Friday
 * that everybody has already agreed to.
 */
export async function GET(request: NextRequest) {
  const onlySubmission = request.nextUrl.searchParams.get('submission')
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Interviews')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const now = new Date()

  const rows = await prisma.interview.findMany({
    where: {
      OR: [{ companyId }, { vendorId: companyId }],
      // One person's rounds, when asked for. Interviews left the client's
      // menu because a program office opens a candidate and asks what
      // happened to them, rather than reading a list of everybody's
      // rounds — so the list has to be able to answer that narrower
      // question. Still scoped to the caller's own company either way: a
      // submission id from elsewhere returns nothing rather than
      // somebody else's panel.
      ...(onlySubmission ? { submissionId: onlySubmission } : {}),
    },
    include: {
      submission: {
        select: {
          id: true, rate: true, status: true, personId: true, requirementId: true,
          fromCompanyId: true, toCompanyId: true,
          person: { select: { name: true } },
          requirement: { select: { id: true, title: true, interviewers: true, companyId: true } },
          fromCompany: { select: { name: true } },
          toCompany: { select: { name: true } },
        },
      },
    },
    orderBy: { proposedAt: 'desc' },
    take: 200,
  })

  // The contract behind each offered candidate, keyed the way the award
  // keys its own idempotency — one person, one requisition — so a row
  // already placed leads to its placement rather than offering Place
  // twice. Only offered rounds are looked up: nothing else offers Place.
  const offered = rows.filter((r) => r.outcome === 'OFFER')
  const lines = offered.length
    ? await prisma.sellContract.findMany({
        where: {
          OR: offered.map((r) => ({
            requirementId: r.submission.requirementId,
            personId: r.submission.personId,
          })),
        },
        select: { id: true, requirementId: true, personId: true },
      })
    : []
  const lineFor = new Map(lines.map((l) => [`${l.requirementId}:${l.personId}`, l.id]))
  const mayHire = hasPermission(caller.permissions, 'requirements.write')

  const items = rows.map((row) => {
    const names = {
      vendor: row.submission.fromCompany.name,
      client: row.submission.toCompany?.name ?? 'the client',
      consultant: row.submission.person.name,
    }
    const i = asInterview(row)
    const w = waitingOn(i, now, names)
    const you = row.companyId === companyId ? ('CLIENT' as const) : ('VENDOR' as const)

    return {
      ...shape(row),
      you,
      names,
      role: row.submission.requirement.title,
      requirementId: row.submission.requirement.id,
      // The requirement's panel — every round starts with it. The client's
      // own; a supplier does not see who the client puts in the room.
      panel: row.companyId === companyId ? row.submission.requirement.interviewers : [],
      submissionId: row.submission.id,
      rateCents: row.submission.rate,
      says: headline(i, now, names, caller.person.timezone),
      // Whether this row is waiting on the person reading it. The only
      // thing that turns a list into a to-do.
      yours:
        row.state === 'PROPOSED' &&
        (you === 'CLIENT' ? w.on.includes('CLIENT') : w.on.some((p) => p !== 'CLIENT')),
      overdue: w.overdue,
      // Once a round ends in an offer: whether this reader may place the
      // candidate, asked of `awardDoor` — the function the award route
      // refuses on — so the page never offers a Place the click would
      // be turned away from, and reads the refusal as a sentence.
      place: (() => {
        if (row.outcome !== 'OFFER') return placeFromRound({ outcome: row.outcome, personName: names.consultant, contractId: null, award: null })
        const s = row.submission
        const contractId = lineFor.get(`${s.requirementId}:${s.personId}`) ?? null
        const door = awardDoor({
          callerCompanyId: caller.company?.id ?? null,
          callerCompanyName: caller.company?.name ?? null,
          mayHire,
          requirementCompanyId: s.requirement.companyId,
          fromCompanyId: s.fromCompanyId,
          fromCompanyName: s.fromCompany.name,
          toCompanyId: s.toCompanyId,
          toCompanyName: s.toCompany.name,
          personName: s.person.name,
          status: s.status,
          contractId,
        })
        return placeFromRound({
          outcome: row.outcome,
          personName: names.consultant,
          contractId,
          award: { open: door.open, says: door.says },
        })
      })(),
    }
  })

  // What needs doing first: yours, then overdue, then soonest.
  const ordered = [...items].sort((a, b) => {
    if (a.yours !== b.yours) return a.yours ? -1 : 1
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
    const at = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER
    const bt = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER
    return at - bt
  })

  const needsYou = ordered.filter((i) => i.yours).length
  const booked = ordered.filter((i) => i.state === 'CONFIRMED').length

  return NextResponse.json({
    data: {
      interviews: ordered,
      summary:
        ordered.length === 0
          ? 'No interviews yet.'
          : needsYou > 0
            ? `${needsYou} waiting on you. ${booked} booked.`
            : `${booked} booked, nothing waiting on you.`,
    },
  })
}
