import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import {
  raiseRequest, produceExport, heldCategories, categoriesHeldAbout, audiencesOf,
  reference, contactEmail, coolingEndsAtFor,
} from '@/lib/data-request'
import { holdersOf } from '@/lib/erasure'
import { logAccess } from '@/lib/access-log'

/**
 * The subject's own door: what is held about you, a copy of it, and a
 * way to ask to be forgotten.
 *
 * ── No permission, on purpose ────────────────────────────────────────
 *
 * Nothing here asks for one. It is the caller's own record, scoped to
 * `caller.person.id` in every query, and a permission gate on your own
 * file would be a gate the person it protects cannot open. The same
 * reasoning as `/api/me/papers`.
 *
 * ── And yet the read is logged, unlike the rest of /api/me ───────────
 *
 * `/api/me/papers` deliberately writes no AccessLog row, because a log
 * where every row is innocent is a log nobody audits. This one writes
 * one anyway, for one reason: it produces a **file**, and a file can be
 * forwarded, subpoenaed or handed to somebody else. Who produced it and
 * when is the first question anybody asks about it afterwards.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const me = caller.person.id

  const download = request.nextUrl.searchParams.get('download')
  if (download) {
    const row = await prisma.dataRequest.findUnique({
      where: { id: download },
      select: { id: true, subjectPersonId: true, document: true, kind: true, producedAt: true },
    })
    if (!row || row.subjectPersonId !== me) {
      logAccess({
        subjectId: me, actorPersonId: me, action: 'DATA_EXPORT', allowed: false,
        reason: 'Asked to download an export that is not theirs.',
      })
      return NextResponse.json(
        { error: 'That export is not yours. Your own exports are on this page.' },
        { status: 404 }
      )
    }
    if (!row.document) {
      return NextResponse.json(
        { error: 'This one is not ready yet. You will be emailed the moment it is.' },
        { status: 409 }
      )
    }
    await prisma.dataRequest.update({ where: { id: row.id }, data: { downloadedAt: new Date(), status: 'DONE', completedAt: new Date() } })
    logAccess({
      subjectId: me, actorPersonId: me, action: 'DATA_EXPORT',
      reason: 'Downloaded their own export.',
    })
    return NextResponse.json(row.document)
  }

  // Both, where somebody is both. A systems integrator's own W2 holds a
  // seat at his employer and is also the person the work is about, and
  // this used to answer "business" and stop — so the categories about
  // candidates, which are most of what is held about him, were on
  // nobody's page.
  const audiences = await audiencesOf(me)

  // Who gets written to if they ask to be forgotten, by name, read off
  // the same function the erasure itself uses. The page said "whoever
  // paid you" and "the client whose site you stood on", which is a
  // sentence for a contractor and nothing at all for a firm's own staff.
  const holders = await holdersOf(me)

  const requests = await prisma.dataRequest.findMany({
    where: { subjectPersonId: me },
    orderBy: { receivedAt: 'desc' },
    select: {
      id: true, kind: true, status: true, receivedAt: true, dueAt: true, dueBasis: true,
      keptBecause: true, refusedBecause: true, producedAt: true, completedAt: true,
    },
  })

  // `{ data: ... }`, the envelope `/api/me/papers` next door sends and
  // the one this page reads. The download above is deliberately not
  // wrapped: it is the file itself, and a person who opens it should
  // find their record rather than an envelope around it.
  return NextResponse.json({
    data: {
      held: heldCategories(),
      aboutYou: categoriesHeldAbout(audiences),
      youAre: audiences,
      whoWouldBeTold: holders.map((h) => ({ name: h.companyName, how: h.holding })),
      contactEmail: contactEmail(),
      requests: requests.map((r) => ({
        ...r,
        reference: reference(r.id),
        runsOn: r.kind === 'ERASURE' ? coolingEndsAtFor(r.receivedAt) : null,
        canWithdraw: r.status !== 'DONE' && r.status !== 'REFUSED',
        downloadUrl: r.kind === 'EXPORT' && r.producedAt ? `/api/me/data?download=${r.id}` : null,
      })),
    },
  })
}

/**
 * Ask for everything held about you, or ask to be forgotten.
 *
 * By the signed-in person, about themselves, and nobody else. A request
 * about somebody else goes through the compliance desk at a company that
 * actually holds them (`/api/data-requests`), which is the only place
 * identity can be established at all.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const me = caller.person.id

  const body = await request.json().catch(() => ({}))
  const kind = body.kind === 'ERASURE' ? 'ERASURE' : body.kind === 'EXPORT' ? 'EXPORT' : null
  if (!kind) {
    return NextResponse.json(
      { error: 'Say which you want: a copy of everything held about you, or to be forgotten.' },
      { status: 400 }
    )
  }

  const already = await prisma.dataRequest.findFirst({
    where: { subjectPersonId: me, kind, status: { in: ['RECEIVED', 'HELD', 'READY'] } },
    select: { id: true },
  })
  if (already) {
    return NextResponse.json(
      {
        error:
          kind === 'EXPORT'
            ? 'You already have a copy on the way. It is on this page, with the day it is due.'
            : 'You have already asked to be forgotten. It is on this page, with the day it runs and a way to stop it.',
        requestId: already.id,
      },
      { status: 409 }
    )
  }

  const raised = await raiseRequest({
    kind,
    subjectPersonId: me,
    requestedById: me,
    // No company: a person asking about themselves is asking as
    // themselves, whatever seat they happen to be sitting in.
    requestedByCompanyId: null,
  })

  // An export is produced now. There is nothing to wait for — the file
  // is built from rows that already exist — and a person who asked for
  // their data should not be told to come back in a month because a
  // statute allows it.
  if (kind === 'EXPORT') await produceExport(raised.id)

  return NextResponse.json({
    ok: true,
    id: raised.id,
    reference: reference(raised.id),
    dueAt: raised.dueAt,
    dueBasis: raised.dueBasis,
    runsOn: raised.runsOn,
    keptBecause: raised.keptBecause,
    says:
      kind === 'EXPORT'
        ? 'Your copy is ready. Everything held about you is in it, and every time it is opened a line is written saying who opened it.'
        : `Nothing has changed yet. It runs on ${raised.runsOn!.toISOString().slice(0, 10)}, and you can stop it any time before then.`,
  })
}
