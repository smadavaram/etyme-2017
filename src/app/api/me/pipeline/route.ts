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
          id: true, round: true, stage: true, mode: true, state: true,
          proposedSlots: true, proposedAt: true, scheduledAt: true,
          durationMins: true, location: true, consultantConfirmedAt: true,
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
    interviews: s.interviews.map((i) => {
      // Slots, not a single time: a proposed interview has several and
      // showing one of them as if it were fixed is how somebody misses
      // the actual meeting.
      //
      // Normalised here rather than on the screen. The rows were written
      // by three different callers over two years and carry `start`,
      // `at`, or a bare ISO string; a page guessing between them is a
      // page that will one day show a candidate the wrong hour.
      const slots = normaliseSlots(i.proposedSlots)
      const booked = bookedTime(i.scheduledAt, i.state, slots)
      return {
        id: i.id,
        round: i.round,
        // The client's own word for the round — SCREEN, TECHNICAL,
        // FINAL, or whatever they call it. Never translated into ours.
        stage: i.stage,
        mode: i.mode,
        state: i.state,
        with: i.company.name,
        // Where do I go. A link for a video call, an address for a site.
        location: i.location,
        durationMins: i.durationMins,
        slots,
        proposedOn: i.proposedAt.toISOString().slice(0, 10),
        // Whether it is still waiting on them. A round they have already
        // answered must not offer the buttons again — tapping one would
        // be refused by the route, and being refused for answering twice
        // reads as the product losing their answer.
        answeredByYou: i.state !== 'PROPOSED' || i.consultantConfirmedAt !== null,
        // The time it is actually at, with the reason we believe it.
        // Null where nothing on file supports one, because a plausible
        // wrong hour on an interview is worse than a blank.
        confirmedStart: booked.start,
        confirmedBasis: booked.basis,
      }
    }),
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

/**
 * The offered times, in one shape.
 *
 * `[{ start, end }]` is what the schema says. What is actually in the
 * column, across everything that has ever written one, is that plus
 * `{ at }` plus bare ISO strings. The respond route accepts all three
 * as the value of `slot`, and it compares on the start — so the start
 * is what travels, and the page never has to guess.
 */
function normaliseSlots(raw: unknown): { start: string; end: string | null }[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((s: any) => ({
      start: String(typeof s === 'string' ? s : (s?.start ?? s?.at ?? '')),
      end: typeof s === 'object' && s !== null && s.end ? String(s.end) : null,
    }))
    .filter((s) => s.start !== '')
}

/**
 * When a confirmed round actually is — or null, saying why not.
 *
 * `scheduledAt` is the answer whenever it is set. Where it is not, one
 * offered time is still an answer: a round with a single slot, accepted,
 * happens at that slot. Two or more offered times and no `scheduledAt`
 * is genuinely unknown, and the screen says so rather than picking the
 * first one, which would be a booking nobody made.
 */
function bookedTime(
  scheduledAt: Date | null,
  state: string,
  slots: { start: string }[]
): { start: string | null; basis: 'scheduled' | 'the only time offered' | null } {
  if (scheduledAt) return { start: scheduledAt.toISOString(), basis: 'scheduled' }
  if (state === 'CONFIRMED' && slots.length === 1) {
    return { start: slots[0].start, basis: 'the only time offered' }
  }
  return { start: null, basis: null }
}
