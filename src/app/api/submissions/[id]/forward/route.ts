import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { notify } from '@/lib/notify'
import { mayForward, onwardRate, mirrorRole, type Via } from '@/lib/forwarding'
import { clientOf, takeHold } from '@/lib/holds'
import { whyNotOpen } from '../../words'
import { landingFor } from './landing'

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
          openingId: true, skills: true, location: true, mirroredFromId: true,
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

    // ── Which of the destination's roles it lands on ──────────────────
    //
    // The role the destination actually sent this firm, where there is
    // one — the requisition it raised, had approved and released to us.
    // It used to be a fresh copy of our own record written onto the
    // destination's books every time, so a prime's candidate never
    // reached the client's requisition: it sat on a role the client had
    // not raised, beside the one it had. `landing.ts` says why, in order.
    const ancestors: Array<{ id: string; companyId: string }> = []
    let up = submission.requirement.mirroredFromId
    for (let hop = 0; up && hop < 5; hop++) {
      const r = await prisma.requirement.findUnique({
        where: { id: up },
        select: { id: true, companyId: true, mirroredFromId: true },
      })
      if (!r) break
      ancestors.push({ id: r.id, companyId: r.companyId })
      up = r.mirroredFromId
    }
    // Every role the destination sent us that we have not turned down.
    // A closed or expired invitation still names the role — landing there
    // and being told it is filled beats a copy nobody will ever read.
    const sent = await prisma.requirementInvitation.findMany({
      where: {
        toCompanyId: caller.company!.id,
        status: { not: 'DECLINED' },
        requirement: { companyId: destination.id },
      },
      select: { requirementId: true, requirement: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
    })
    const landing = landingFor({
      destinationName: destination.name,
      destinationId: destination.id,
      source: { id: submission.requirement.id, title: submission.requirement.title },
      ancestors,
      sent: sent.map((i) => ({ requirementId: i.requirementId, title: i.requirement.title })),
      requested: typeof body.requirementId === 'string' ? body.requirementId : null,
    })
    if (landing.kind === 'REFUSE') {
      return NextResponse.json(
        { error: { code: 'NOT_SENT_TO_YOU', message: landing.says } },
        { status: 403 }
      )
    }
    if (landing.kind === 'CHOOSE') {
      return NextResponse.json(
        {
          error: {
            code: 'WHICH_ROLE',
            message: landing.says,
            field: 'requirementId',
            options: landing.options,
          },
        },
        { status: 409 }
      )
    }

    let role: { id: string }
    if (landing.kind === 'REQUISITION') {
      // The destination's own requisition, so its own door applies: open,
      // not paused, and one name once. The same words POST
      // /api/submissions uses, because it is the same door reached from
      // one rung down.
      const target = await prisma.requirement.findUniqueOrThrow({
        where: { id: landing.requirementId },
        select: {
          id: true, title: true, status: true, approvalState: true, cancelReason: true,
          company: { select: { name: true } },
        },
      })
      const shut = whyNotOpen({
        title: target.title,
        status: target.status,
        approvalState: target.approvalState,
        buyerName: target.company.name,
        cancelReason: target.cancelReason,
      })
      if (shut) return NextResponse.json({ error: shut }, { status: 409 })
      if (target.approvalState === 'PENDING_APPROVAL') {
        return NextResponse.json(
          {
            error: {
              code: 'PAUSED',
              message:
                `${target.title} is paused while ${target.company.name} re-approves the money. ` +
                'You will be told when it is open again.',
            },
          },
          { status: 409 }
        )
      }
      // First in wins, and it is news rather than a fault: the same person
      // already reached this role, from us or from somebody else.
      const already = await prisma.submission.findFirst({
        where: { requirementId: target.id, personId: submission.personId },
        select: { fromCompanyId: true },
      })
      if (already) {
        return NextResponse.json(
          {
            error: {
              code: 'ALREADY_SUBMITTED',
              message:
                already.fromCompanyId === caller.company!.id
                  ? `You already put ${submission.person.name} forward for ${target.title}.`
                  : `${submission.person.name} has already been put forward for ${target.title} by another firm. First in wins.`,
            },
          },
          { status: 409 }
        )
      }
      role = { id: target.id }
      // Answering a role accepts the invitation, as submitting does.
      await prisma.requirementInvitation.updateMany({
        where: { requirementId: target.id, toCompanyId: caller.company!.id, status: 'SENT' },
        data: { status: 'ACCEPTED' },
      })
    } else {
      // Nothing on the destination's books was ever sent to us, so the
      // role is written there as a copy of ours — the case the copy was
      // built for. The end client travels with it: it was read and then
      // not passed, so every copy said "direct placement".
      const mirrored = mirrorRole(
        {
          id: submission.requirement.id,
          title: submission.requirement.title,
          skills: submission.requirement.skills,
          location: submission.requirement.location,
          endClientCompanyId: submission.requirement.endClientCompanyId,
          companyId: submission.requirement.companyId,
        },
        destination.id
      )

      role =
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
            // Carried, not inferred. Dropping it here made every forwarded
            // role look like a direct placement one hop down, and tenure
            // then aggregated against the prime instead of the client.
            endClientCompanyId: mirrored.endClientCompanyId,
            status: 'OPEN',
            // Nobody approves a role that arrives from a supplier — the
            // budget was signed off wherever the demand started, not here.
            //
            // Left at the default of DRAFT, which is what happened, the
            // award route's own approval gate then refused every single
            // forwarded candidate with "Requisition is draft — nobody can
            // be placed against it yet". So a chain could be built all the
            // way to the client and then never closed. The manual
            // requirement path already sets this and says why; the
            // forwarding path is the same case and was missed.
            approvalState: 'AUTO_APPROVED',
            source: 'NETWORK',
            mirroredFromId: mirrored.mirroredFromRequirementId,
            openingId: submission.requirement.openingId,
          },
          select: { id: true },
        }))
    }

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
