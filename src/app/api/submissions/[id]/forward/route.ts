import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { notify } from '@/lib/notify'
import { mayForward, onwardRate, mirrorRole, type Via } from '@/lib/forwarding'
import { clientOf, takeHold } from '@/lib/holds'

/**
 * POST /api/submissions/:id/forward
 *
 * Send a candidate onward to the client, or to the next party up the
 * chain.
 *
 * This is the state 2017 called client_submission and this build was
 * missing entirely. Without it nobody can answer the question every
 * consultant asks — have they actually submitted me, or am I sitting in a
 * spreadsheet — and the sub-vendor who put them forward cannot tell
 * whether the prime forwarded them or sat on them.
 *
 * Three ways, exactly as 2017 had them:
 *
 *   ONWARD  the next party is on Etyme, so the hop becomes a real
 *           submission with its own rate and its own decision
 *   EMAIL   they are not, so it is recorded as emailed, to whom and when
 *   neither refused loudly — "No valid client email found" — because a
 *           candidate lost in a queue nobody is watching is worse than an
 *           error somebody has to read
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const via: Via = body.via === 'EMAIL' ? 'EMAIL' : 'ONWARD'

  const submission = await prisma.submission.findUnique({
    where: { id },
    select: {
      id: true, fromCompanyId: true, toCompanyId: true, status: true,
      rate: true, forwardedAt: true, personId: true, requirementId: true,
      kind: true, contractType: true,
      person: { select: { name: true } },
      fromCompany: { select: { name: true } },
      requirement: {
        select: {
          id: true, title: true, companyId: true, endClientCompanyId: true,
          openingId: true, skills: true, location: true,
        },
      },
    },
  })

  if (!submission) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No submission by that id.' } },
      { status: 404 }
    )
  }

  const verdict = mayForward(
    { companyId: caller.company?.id, permissions: caller.permissions },
    {
      id: submission.id,
      fromCompanyId: submission.fromCompanyId,
      toCompanyId: submission.toCompanyId,
      status: submission.status,
      rateCents: submission.rate,
      forwardedAt: submission.forwardedAt,
    },
    { via, companyId: body.toCompanyId ?? null, email: body.email ?? null, rateCents: body.rate ?? null }
  )

  if (!verdict.ok) {
    return NextResponse.json(
      { error: { code: verdict.code, message: verdict.message } },
      { status: verdict.code === 'NO_PERMISSION' || verdict.code === 'NOT_YOURS' ? 403 : 409 }
    )
  }

  const rate = onwardRate(
    { ...submission, rateCents: submission.rate } as never,
    { via, rateCents: body.rate ?? null }
  )
  const now = new Date()
  let childId: string | null = null
  let toName = body.email as string | null

  if (via === 'ONWARD') {
    const destination = await prisma.company.findUnique({
      where: { id: body.toCompanyId },
      select: { id: true, name: true },
    })
    if (!destination) {
      return NextResponse.json(
        { error: { code: 'NOWHERE_TO_SEND', message: 'No company by that id.' } },
        { status: 404 }
      )
    }
    toName = destination.name

    // The destination's own record of the role.
    //
    // A submission is unique on (requirement, person) — the rule that stops
    // one name reaching a client twice — so the hop cannot reuse the
    // sender's row. 2017 called these sub-jobs and pointed them at a
    // parent; this mirrors the role onto the destination's books and
    // remembers where it came from.
    const mirrored = mirrorRole(
      {
        id: submission.requirement.id,
        title: submission.requirement.title,
        skills: submission.requirement.skills,
        location: submission.requirement.location,
      },
      destination.id
    )

    const role =
      (await prisma.requirement.findFirst({
        where: { companyId: destination.id, mirroredFromId: submission.requirementId },
        select: { id: true },
      })) ??
      (await prisma.requirement.create({
        data: {
          companyId: mirrored.companyId,
          title: mirrored.title,
          skills: mirrored.skills,
          location: mirrored.location,
          status: 'OPEN',
          source: 'NETWORK',
          mirroredFromId: mirrored.mirroredFromRequirementId,
          openingId: submission.requirement.openingId,
        },
        select: { id: true },
      }))

    // The hop is a submission of its own. Same person, a new sender, a new
    // rate, the destination's role — and a link back, so the chain can be
    // read from either end.
    const child = await prisma.submission.create({
      data: {
        requirementId: role.id,
        personId: submission.personId,
        fromCompanyId: caller.company!.id,
        toCompanyId: destination.id,
        kind: submission.kind,
        rate,
        contractType: submission.contractType,
        status: 'SUBMITTED',
        parentSubmissionId: submission.id,
      },
      select: { id: true },
    })
    childId = child.id

    // Whoever now holds it should hear about it the way they hear about
    // anything else arriving.
    const receivers = await prisma.context.findMany({
      where: {
        companyId: destination.id,
        revokedAt: null,
        role: { permissions: { hasSome: ['submissions.read'] } },
      },
      select: { personId: true },
      take: 5,
    })
    for (const r of receivers) {
      void notify({
        personId: r.personId,
        companyId: destination.id,
        type: 'SUBMISSION',
        title: `${submission.person.name} for ${submission.requirement.title}`,
        body: `${caller.company!.name} put ${submission.person.name} forward for ${submission.requirement.title}.`,
        entityId: child.id,
      })
    }
  }

  await prisma.submission.update({
    where: { id: submission.id },
    data: {
      forwardedAt: now,
      forwardedVia: via,
      forwardedToEmail: via === 'EMAIL' ? body.email : null,
      forwardedById: caller.person.id,
    },
  })

  // The hold was taken when the candidate was first submitted, on the
  // strength of it reaching a client. This is the moment it actually did,
  // so a seat with no hold yet gets one now.
  if (submission.requirement.openingId || submission.requirement.companyId) {
    await takeHold({
      personId: submission.personId,
      companyId: submission.fromCompanyId,
      clientCompanyId: clientOf(submission.requirement),
      requirementId: submission.requirementId,
    }).catch(() => null)
  }

  void emit({
    type: 'submission.forwarded',
    companyId: caller.company!.id,
    subjectType: 'Submission',
    subjectId: submission.id,
    actorPersonId: caller.person.id,
    payload: { via, toCompanyId: body.toCompanyId ?? null, childId, rateCents: rate },
  })

  // The person it is about, told plainly. This is the answer to the
  // question they have been asking their agency for a fortnight.
  void notify({
    personId: submission.personId,
    type: 'SUBMISSION',
    title: `You were sent on to ${toName ?? 'the client'}`,
    body: `${caller.company!.name} sent you on to ${toName ?? 'the client'} for ${submission.requirement.title}. ${submission.fromCompany.name} put you forward to them originally.`,
    entityId: submission.id,
  })

  // And the sub-vendor who submitted them, who is owed the fact and not
  // the price.
  const senders = await prisma.context.findMany({
    where: {
      companyId: submission.fromCompanyId,
      revokedAt: null,
      role: { permissions: { hasSome: ['submissions.read'] } },
    },
    select: { personId: true },
    take: 5,
  })
  for (const s of senders) {
    void notify({
      personId: s.personId,
      companyId: submission.fromCompanyId,
      type: 'SUBMISSION',
      title: `${submission.person.name} went on to ${toName ?? 'the client'}`,
      body: `${caller.company!.name} sent ${submission.person.name} on for ${submission.requirement.title}. What they are charging is theirs, and is not shown here.`,
      entityId: submission.id,
    })
  }

  return NextResponse.json({
    data: {
      id: submission.id,
      forwardedAt: now.toISOString(),
      via,
      to: toName,
      childSubmissionId: childId,
      warning: verdict.warning,
      message: verdict.note,
    },
  })
}
