import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import {
  headline, waitingOn, shapeRow as shape, rowToInterview as asInterview,
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
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Interviews')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const now = new Date()

  const rows = await prisma.interview.findMany({
    where: { OR: [{ companyId }, { vendorId: companyId }] },
    include: {
      submission: {
        select: {
          id: true, rate: true,
          person: { select: { name: true } },
          requirement: { select: { id: true, title: true } },
          fromCompany: { select: { name: true } },
          toCompany: { select: { name: true } },
        },
      },
    },
    orderBy: { proposedAt: 'desc' },
    take: 200,
  })

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
      submissionId: row.submission.id,
      rateCents: row.submission.rate,
      says: headline(i, now, names),
      // Whether this row is waiting on the person reading it. The only
      // thing that turns a list into a to-do.
      yours:
        row.state === 'PROPOSED' &&
        (you === 'CLIENT' ? w.on.includes('CLIENT') : w.on.some((p) => p !== 'CLIENT')),
      overdue: w.overdue,
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
