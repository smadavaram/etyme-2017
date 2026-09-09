import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import {
  stateAfterConfirming, stillValid, settle, noShow, reasonFor, headline,
  earliest, type Party, type Outcome,
  shapeRow as shape, rowToInterview as asInterview,
} from '@/lib/interviews'

/**
 * POST /api/interviews/:id — confirm it, call it off, or say what happened
 *
 * One route, three verbs, because they are the same object moving and
 * splitting them into three would mean three places that have to agree
 * about who may do what.
 *
 *   confirm   the supplier, or the consultant, says yes to a slot
 *   cancel    either side calls it off
 *   outcome   the client says what came of it
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Interviews')
  if (notStaff) return notStaff

  const { id } = await params
  const companyId = caller.company!.id
  const now = new Date()

  const row = await prisma.interview.findFirst({
    where: { id, OR: [{ companyId }, { vendorId: companyId }] },
    include: {
      submission: {
        select: {
          id: true, personId: true,
          person: { select: { name: true } },
          fromCompany: { select: { name: true } },
          toCompany: { select: { name: true } },
        },
      },
    },
  })

  if (!row) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No interview by that id.' } },
      { status: 404 }
    )
  }

  const isClient = row.companyId === companyId
  const names = {
    vendor: row.submission.fromCompany.name,
    client: row.submission.toCompany?.name ?? 'the client',
    consultant: row.submission.person.name,
  }

  const body = await request.json().catch(() => ({}))
  const action = String(body?.action ?? '')

  // ── Confirm ─────────────────────────────────────────────────────────
  if (action === 'confirm') {
    if (row.state === 'CANCELLED' || row.state === 'DONE' || row.state === 'NO_SHOW') {
      return NextResponse.json(
        {
          error: {
            code: 'FINISHED',
            message: 'That round is already finished. Confirming it now changes nothing.',
          },
        },
        { status: 409 }
      )
    }

    const slots = (row.proposedSlots as any[]).map((s) => ({
      start: new Date(s.start),
      end: new Date(s.end),
    }))

    // Which slot they picked, or the earliest still standing.
    const chosen = body?.slotStart
      ? slots.find((s) => s.start.toISOString() === new Date(body.slotStart).toISOString())
      : (row.scheduledAt ? { start: row.scheduledAt, end: row.scheduledAt } : earliest(slots.filter((s) => stillValid(s, now))))

    if (!chosen || !stillValid(chosen, now)) {
      return NextResponse.json(
        {
          error: {
            code: 'SLOT_GONE',
            message:
              'Every time offered has passed. Ask for new times rather than confirming one that has gone.',
          },
        },
        { status: 409 }
      )
    }

    // Who is confirming. A supplier may answer for a consultant with no
    // seat here, and it is recorded as exactly that.
    const forConsultant = body?.forConsultant === true

    const data: any = { scheduledAt: chosen.start }
    if (isClient) {
      data.clientConfirmedAt = now
    } else {
      data.vendorConfirmedAt = now
      if (forConsultant) {
        data.consultantConfirmedAt = now
        data.consultantConfirmedVia = 'VENDOR_ASSERTED'
      }
    }

    const next = { ...row, ...data }
    data.state = stateAfterConfirming(asInterview(next))

    const saved = await prisma.interview.update({ where: { id: row.id }, data, include: { submission: false } as any })

    return NextResponse.json({
      data: { ...shape(saved), says: headline(asInterview(saved), now, names, caller.person.timezone) },
    })
  }

  // ── Cancel ──────────────────────────────────────────────────────────
  if (action === 'cancel') {
    const reason = String(body?.reason ?? '').trim()

    // A cancellation with no reason is the thing that makes the other
    // side stop answering, and it is one sentence to type.
    if (reason.length < 3) {
      return NextResponse.json(
        {
          error: {
            code: 'NO_REASON',
            message:
              'Say why. A cancellation with no reason attached is what makes the other side stop answering.',
            field: 'reason',
          },
        },
        { status: 422 }
      )
    }

    const saved = await prisma.interview.update({
      where: { id: row.id },
      data: { state: 'CANCELLED', cancelledAt: now, cancelledReason: reason },
    })

    return NextResponse.json({
      data: { ...shape(saved), says: `Round ${row.round} called off: ${reason}` },
    })
  }

  // ── Who is in the room ──────────────────────────────────────────────
  //
  // Set once when the round was proposed and never changeable after,
  // which is not how interviews go: somebody drops out the morning of,
  // an architect is pulled in, a panel of two becomes three. The list
  // was write-once for no reason other than that nothing had been
  // written to change it.
  //
  // Names, not seats — plenty of interviewers have no account here, and
  // requiring one would mean the client's own principal engineer cannot
  // be listed.
  if (action === 'interviewers') {
    // The side running the round owns its panel. A supplier does not
    // decide who at the client will be in the room.
    if (!isClient) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_YOURS',
            message: 'Only the company running the interview decides who is in it.',
          },
        },
        { status: 403 }
      )
    }

    if (row.state === 'CANCELLED' || row.state === 'DONE' || row.state === 'NO_SHOW') {
      return NextResponse.json(
        {
          error: {
            code: 'FINISHED',
            message: 'That round is over. Changing who was in it now would be rewriting it.',
          },
        },
        { status: 409 }
      )
    }

    const current = row.interviewers ?? []
    const add = (Array.isArray(body?.add) ? body.add : [])
      .map((n: unknown) => String(n ?? '').trim())
      .filter(Boolean)
    const remove = (Array.isArray(body?.remove) ? body.remove : [])
      .map((n: unknown) => String(n ?? '').trim())
      .filter(Boolean)
    const replace: string[] | null = Array.isArray(body?.interviewers)
      ? body.interviewers.map((n: unknown) => String(n ?? '').trim()).filter(Boolean)
      : null

    if (!replace && add.length === 0 && remove.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'NOTHING_TO_DO',
            message: 'Say who to add or who to take off.',
            field: 'interviewers',
          },
        },
        { status: 422 }
      )
    }

    // Case-insensitive on removal and on the duplicate check, because
    // "Dana Okafor" and "dana okafor" are one person and a panel that
    // lists them twice is a panel somebody has to explain.
    const lower = (n: string) => n.toLowerCase()
    const next: string[] = replace ?? [
      ...current.filter((n) => !remove.some((r: string) => lower(r) === lower(n))),
      ...add.filter(
        (n: string) =>
          !current.some((c) => lower(c) === lower(n)) &&
          !add.slice(0, add.indexOf(n)).some((a: string) => lower(a) === lower(n))
      ),
    ]

    const saved = await prisma.interview.update({
      where: { id: row.id },
      data: { interviewers: next },
    })

    const gone = current.filter((n) => !next.some((x) => lower(x) === lower(n)))
    const joined = next.filter((n) => !current.some((x) => lower(x) === lower(n)))

    return NextResponse.json({
      data: {
        ...shape(saved),
        says:
          next.length === 0
            ? `Round ${row.round} has nobody listed. The interview still stands; the panel is simply not recorded.`
            : `Round ${row.round}: ${next.join(', ')}` +
              (joined.length ? ` · added ${joined.join(', ')}` : '') +
              (gone.length ? ` · removed ${gone.join(', ')}` : ''),
      },
    })
  }

  // ── What happened ───────────────────────────────────────────────────
  if (action === 'outcome') {
    // Only the side that ran it may say what came of it. A supplier
    // recording their own candidate as having passed is not feedback.
    if (!isClient) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_YOURS',
            message: 'Only the company that ran the interview can say what came of it.',
          },
        },
        { status: 403 }
      )
    }

    const missed = body?.noShowBy as Party | undefined

    if (missed) {
      const v = noShow(missed, names)
      const saved = await prisma.interview.update({
        where: { id: row.id },
        data: {
          state: v.state,
          noShowBy: missed,
          decidedAt: now,
          decidedById: caller.person.id,
          feedback: typeof body?.feedback === 'string' ? body.feedback : null,
        },
      })

      // A consultant who did not turn up closes the submission, and the
      // reason is a withdrawal rather than a fault in the package.
      if (v.closed) {
        await prisma.submission.update({
          where: { id: row.submissionId },
          data: {
            status: 'REJECTED',
            rejectReason: reasonFor('REJECT', missed),
            rejectNote: v.says,
            rejectedAt: now,
          },
        })
      }

      return NextResponse.json({ data: { ...shape(saved), says: v.says } })
    }

    const outcome = body?.outcome as Outcome
    if (!['ADVANCE', 'OFFER', 'REJECT'].includes(outcome)) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: 'Say what came of it: advance, offer, or reject.',
            field: 'outcome',
          },
        },
        { status: 422 }
      )
    }

    const feedback = String(body?.feedback ?? '').trim()

    // A rejection with no feedback is the single most common thing a
    // supplier complains about, and the reason the next submission is no
    // better than the last one.
    if (outcome === 'REJECT' && feedback.length < 3) {
      return NextResponse.json(
        {
          error: {
            code: 'NO_FEEDBACK',
            message:
              'Say why they are out. It is the only thing that makes the next submission better, and it takes a sentence.',
            field: 'feedback',
          },
        },
        { status: 422 }
      )
    }

    const v = settle(row.round, outcome, names.consultant)

    const saved = await prisma.interview.update({
      where: { id: row.id },
      data: {
        state: v.state,
        outcome,
        feedback: feedback || null,
        decidedAt: now,
        decidedById: caller.person.id,
      },
    })

    if (outcome === 'REJECT') {
      await prisma.submission.update({
        where: { id: row.submissionId },
        data: {
          status: 'REJECTED',
          // Interviewing well and losing to somebody better is not a
          // fault in the submission, and counting it as one would teach
          // suppliers to stop sending their best people to competitive
          // roles.
          rejectReason: reasonFor('REJECT', null),
          rejectNote: feedback,
          rejectedAt: now,
        },
      })
    }

    if (outcome === 'OFFER') {
      await prisma.submission.update({
        where: { id: row.submissionId },
        data: { status: 'OFFERED' },
      })
    }

    return NextResponse.json({ data: { ...shape(saved), says: v.says } })
  }

  return NextResponse.json(
    {
      error: {
        code: 'VALIDATION',
        message: 'Say what you are doing: confirm, cancel, or outcome.',
        field: 'action',
      },
    },
    { status: 422 }
  )
}
