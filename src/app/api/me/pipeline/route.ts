import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * GET /api/me/pipeline
 *
 * Where a consultant has been put forward, by whom, and what happened.
 *
 * The largest blind spot in the product. Every vendor could see exactly
 * where they had sent somebody; the person being sent could see a count
 * and nothing else. "Never hearing back" is the single most common
 * complaint in this industry and this is the screen that answers it.
 *
 * It also finishes the loop the consent ask started. Somebody who was
 * asked "OK for us to submit you?" and said yes has a reasonable claim
 * to know what became of it.
 *
 * ── What a client is not told ────────────────────────────────────────
 *
 * Everything here is the consultant's own record: submissions with their
 * name on them, interviews arranged for them. This is the one view where
 * the whole picture belongs, because it is their own working life and
 * every row is a thing somebody did to them or on their behalf.
 *
 * What it does not carry is the vendor's side of it — no margin, no
 * client contact, no note written about them internally. Those belong to
 * the vendor, and a consultant seeing them would end the vendor's
 * willingness to record anything honestly.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const personId = caller.person.id
  const now = new Date()

  const submissions = await prisma.submission.findMany({
    where: { personId },
    include: {
      fromCompany: { select: { id: true, name: true } },
      toCompany: { select: { id: true, name: true } },
      requirement: { select: { title: true, location: true } },
      interviews: {
        select: {
          id: true, round: true, mode: true, state: true,
          proposedSlots: true, proposedAt: true,
          company: { select: { name: true } },
        },
        orderBy: { round: 'asc' },
      },
    },
    orderBy: { submittedAt: 'desc' },
    take: 100,
  })

  const rows = submissions.map((s) => ({
    id: s.id,
    role: s.requirement.title,
    location: s.requirement.location,
    // Who put them forward. The question the whole screen exists to
    // answer, and the one a consultant on three benches cannot answer
    // for themselves.
    submittedBy: s.fromCompany.name,
    // Who received it. Often an agency rather than the end client, and
    // saying so is more honest than implying it went straight to the
    // buyer.
    submittedTo: s.toCompany.name,
    submittedOn: s.submittedAt.toISOString().slice(0, 10),
    status: s.status,
    says: saysOf(s.status, s.interviews.length),
    // Their own rate on this submission. It is about them and they
    // agreed to it; withholding it here would be strange.
    rateCents: s.rate,
    interviews: s.interviews.map((i) => ({
      id: i.id,
      round: i.round,
      mode: i.mode,
      state: i.state,
      with: i.company.name,
      // Slots, not a single time: a proposed interview has several and
      // showing one of them as if it were fixed is how somebody misses
      // the actual meeting.
      slots: Array.isArray(i.proposedSlots) ? i.proposedSlots : [],
      proposedOn: i.proposedAt.toISOString().slice(0, 10),
    })),
  }))

  const interviewsAhead = rows
    .flatMap((r) => r.interviews.map((i) => ({ ...i, role: r.role, submittedBy: r.submittedBy })))
    .filter((i) => i.state === 'PROPOSED' || i.state === 'CONFIRMED')

  const live = rows.filter((r) => !['REJECTED', 'WITHDRAWN', 'CLOSED'].includes(r.status))

  return NextResponse.json({
    data: {
      submissions: rows,
      interviewsAhead,
      summary: {
        total: rows.length,
        live: live.length,
        interviews: interviewsAhead.length,
        // Named plainly, because it is the number people actually want
        // and nobody ever tells them.
        says:
          rows.length === 0
            ? 'Nobody has put you forward yet.'
            : `${rows.length} submission${rows.length === 1 ? '' : 's'} in your name, ` +
              `${live.length} still open` +
              (interviewsAhead.length > 0 ? `, ${interviewsAhead.length} interview to come.` : '.'),
      },
      asOf: now.toISOString(),
    },
  })
}

/**
 * What a status means, said to the person it happened to.
 *
 * Never the code. "SUBMITTED" on a screen is a database column; "your
 * name is with them and they have not come back yet" is what somebody
 * actually wants to know.
 */
function saysOf(status: string, interviews: number): string {
  switch (status) {
    case 'SUBMITTED':
      return 'With them now. Nobody has come back yet.'
    case 'SHORTLISTED':
      return 'They shortlisted you.'
    case 'INTERVIEWING':
      return interviews > 0 ? `Interviewing — ${interviews} arranged.` : 'Interviewing.'
    case 'OFFERED':
      return 'They made an offer.'
    case 'PLACED':
      return 'You got it.'
    case 'REJECTED':
      return 'They went a different way.'
    case 'WITHDRAWN':
      return 'Taken off it.'
    default:
      return status
  }
}
