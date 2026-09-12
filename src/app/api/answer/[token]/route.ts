import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { readCv, cvSentence } from '@/lib/cv-reader'
import { holdExpiry } from '@/lib/representation'

/**
 * GET  /api/answer/:token — the role, for somebody with no account
 * POST /api/answer/:token — send a CV back, still with no account
 *
 * The single most important thing about a network product: it has to be
 * worth something when only one party has joined.
 *
 * A client lists twelve suppliers. Eleven of them will never create an
 * account, and until now that meant eleven of them could not answer a
 * role — so the client's screening surfaces sat in front of an empty
 * pile and the product they were sold did not exist.
 *
 * This is the same pattern as `/packet/:token`, which already lets a
 * consultant supply documents without signing up. Moved one surface
 * across: the supplier gets an email, clicks, pastes a CV, and is done.
 * They can take the account later, or never.
 *
 * ── What the token is and is not ─────────────────────────────────────
 *
 * It is the supplier's invitation token — the same one that claims the
 * company. It proves the client sent them something. It does not prove
 * who is holding it, so this surface may only ever do the one thing a
 * forwarded link should be able to do: put a candidate forward.
 *
 * It cannot read the pile, see another supplier, see a rate band it was
 * not given, or learn anything about the client beyond the role itself.
 */

const DAY = 86_400_000

async function invited(token: string) {
  return prisma.supplierInvite.findUnique({
    where: { token },
    include: {
      company: { select: { id: true, name: true, claimedAt: true } },
      by: { select: { id: true, name: true } },
    },
  })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const invite = await invited(token)

  if (!invite || invite.state === 'REVOKED') {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'That link is not valid any more.' } },
      { status: 404 }
    )
  }

  // Roles this supplier may answer, with the band they personally were
  // given. Never another supplier's band — that is the one number on
  // this screen that would do real damage if it leaked.
  const invitations = await prisma.requirementInvitation.findMany({
    where: {
      toCompanyId: invite.companyId,
      status: { in: ['SENT', 'ACCEPTED'] },
      requirement: { status: 'OPEN' },
    },
    select: {
      id: true, payMin: true, payMax: true, message: true, expiresAt: true,
      requirement: {
        select: {
          id: true, title: true, skills: true, location: true,
          startDate: true, months: true, workAuthRequired: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // What they have already sent, so a second visit does not read as if
  // nothing happened.
  const sent = await prisma.submission.groupBy({
    by: ['requirementId'],
    where: { fromCompanyId: invite.companyId },
    _count: { _all: true },
  })
  const sentFor = new Map(sent.map((s) => [s.requirementId, s._count._all]))

  return NextResponse.json({
    data: {
      supplier: invite.company.name,
      client: invite.by.name,
      contactName: invite.contactName,
      claimed: invite.company.claimedAt != null,
      roles: invitations.map((i) => ({
        invitationId: i.id,
        title: i.requirement.title,
        skills: i.requirement.skills,
        location: i.requirement.location,
        startDate: i.requirement.startDate,
        months: i.requirement.months,
        workAuthRequired: i.requirement.workAuthRequired,
        // Their own band, and only theirs.
        band: { min: i.payMin, max: i.payMax },
        message: i.message,
        closesAt: i.expiresAt,
        alreadySent: sentFor.get(i.requirement.id) ?? 0,
      })),
      says:
        invitations.length === 0
          ? `${invite.by.name} has not sent ${invite.company.name} a role yet.`
          : invitations.length === 1
            ? `${invite.by.name} sent you one role.`
            : `${invite.by.name} sent you ${invitations.length} roles.`,
    },
  })
}

/**
 * POST — one CV, no account.
 *
 * Does everything the signed-in route does: the person, the profile, the
 * bench listing that makes them submittable, the CV as a real resume
 * version, the right to represent, and the submission. The only
 * difference is who is asking, and that difference is recorded rather
 * than hidden.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const now = new Date()
  const invite = await invited(token)

  if (!invite || invite.state === 'REVOKED') {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'That link is not valid any more.' } },
      { status: 404 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const invitationId = String(body?.invitationId ?? '')

  // Scoped to invitations addressed to this supplier. A token holder
  // guessing another company's invitation id gets nothing.
  const invitation = await prisma.requirementInvitation.findFirst({
    where: { id: invitationId, toCompanyId: invite.companyId },
    include: {
      requirement: {
        select: {
          id: true, title: true, status: true,
          companyId: true, payerCompanyId: true,
        },
      },
    },
  })

  if (!invitation) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No role by that id was sent to you.' } },
      { status: 404 }
    )
  }

  if (invitation.requirement.status !== 'OPEN') {
    return NextResponse.json(
      {
        error: {
          code: 'CLOSED',
          message: 'That role is closed. Nothing sent now would be read.',
        },
      },
      { status: 409 }
    )
  }

  const cvText = String(body?.cv ?? '').trim()
  if (cvText.length < 60) {
    return NextResponse.json(
      { error: { code: 'NO_CV', message: 'Paste the CV — the client reads it, not the row.' } },
      { status: 422 }
    )
  }

  const read = readCv(cvText)
  const name = String(body?.name ?? read.name ?? '').trim()
  const email = String(body?.email ?? read.email ?? '').trim().toLowerCase()
  const rate = Number.isFinite(Number(body?.rateCents)) ? Number(body.rateCents) : null
  const workAuth = body?.workAuth ? String(body.workAuth) : null
  const skills: string[] = Array.isArray(body?.skills) ? body.skills : read.skills

  if (!name) {
    return NextResponse.json(
      { error: { code: 'NO_NAME', message: 'The CV did not give a name. Type it in.', field: 'name' } },
      { status: 422 }
    )
  }

  if (rate == null || rate <= 0) {
    return NextResponse.json(
      {
        error: {
          code: 'NO_RATE',
          message: 'Say what you are asking per hour. A submission with no rate does not get read.',
          field: 'rateCents',
        },
      },
      { status: 422 }
    )
  }

  if (!body?.mayRepresent) {
    return NextResponse.json(
      {
        error: {
          code: 'NO_RIGHT_TO_REPRESENT',
          message:
            'Confirm you have this person’s permission to put them forward. ' +
            'Being submitted blind is what makes consultants stop answering.',
          field: 'mayRepresent',
        },
      },
      { status: 422 }
    )
  }

  const person = email
    ? ((await prisma.person.findUnique({ where: { primaryEmail: email }, select: { id: true, name: true } })) ??
      (await prisma.person.create({ data: { name, primaryEmail: email } })))
    : await prisma.person.create({
        data: { name, primaryEmail: `${slugOf(name)}.${Date.now().toString(36)}@no-email.local` },
      })

  const profile =
    (await prisma.consultantProfile.findFirst({ where: { personId: person.id }, select: { id: true } })) ??
    (await prisma.consultantProfile.create({
      data: {
        personId: person.id,
        headline: read.headline,
        skills,
        location: read.location,
        workAuth,
        rateFloor: rate,
        visibility: 'INTERNAL',
      },
      select: { id: true },
    }))

  await prisma.benchListing.upsert({
    where: { consultantId_companyId: { consultantId: profile.id, companyId: invite.companyId } },
    create: {
      consultantId: profile.id,
      companyId: invite.companyId,
      tier: 'MARKETING',
      rateMin: rate,
      rateMax: rate,
    },
    update: { revokedAt: null },
  })

  const resume = await prisma.resume.create({
    data: {
      personId: person.id,
      label: `Pasted ${now.toISOString().slice(0, 10)}`,
      fileName: `${slugOf(name)}.txt`,
      contentType: 'text/plain',
      sizeBytes: Buffer.byteLength(cvText, 'utf8'),
      storage: 'DB',
      bytes: Buffer.from(cvText, 'utf8'),
      textExtract: cvText,
      uploadedByCompanyId: invite.companyId,
    },
    select: { id: true },
  })

  const clientId = invitation.requirement.payerCompanyId ?? invitation.requirement.companyId

  await prisma.representation.upsert({
    where: {
      personId_holdKey: {
        personId: person.id,
        holdKey: `${invite.companyId}:${invitation.requirementId}`,
      },
    },
    create: {
      personId: person.id,
      companyId: invite.companyId,
      clientCompanyId: clientId,
      requirementId: invitation.requirementId,
      state: 'HELD',
      consentedAt: now,
      // Asserted by a supplier answering from a link, which is weaker
      // than a supplier answering from an account and weaker still than
      // the consultant replying. Recorded as what it is.
      consentVia: 'VENDOR_ASSERTED_BY_LINK',
      expiresAt: holdExpiry(now),
      holdKey: `${invite.companyId}:${invitation.requirementId}`,
    },
    update: { consentedAt: now, state: 'HELD' },
  })

  const already = await prisma.submission.findFirst({
    where: { requirementId: invitation.requirementId, personId: person.id },
    select: { id: true, fromCompanyId: true },
  })

  if (already) {
    return NextResponse.json(
      {
        error: {
          code: 'ALREADY_SUBMITTED',
          message:
            already.fromCompanyId === invite.companyId
              ? `You already put ${name} forward for this one.`
              : `${name} has already been put forward for this role by somebody else. First in wins.`,
        },
      },
      { status: 409 }
    )
  }

  const submission = await prisma.submission.create({
    data: {
      requirementId: invitation.requirementId,
      personId: person.id,
      fromCompanyId: invite.companyId,
      toCompanyId: clientId,
      kind: 'BENCH',
      rate,
      resumeId: resume.id,
      status: 'SUBMITTED',
      submittedAt: now,
      checkState: 'DRAFT',
    },
    select: { id: true },
  })

  if (invitation.status === 'SENT') {
    await prisma.requirementInvitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED' },
    })
  }

  return NextResponse.json({
    data: {
      submissionId: submission.id,
      name,
      read: cvSentence(read),
      says:
        `${name} is with ${invitation.requirement.title}. ` +
        `${invite.by.name} will see them in their next screening.`,
      // The nudge that is worth making now and never before: they have
      // done the work, so an account is a smaller ask than it was.
      takeAccount: invite.company.claimedAt == null,
    },
  })
}

function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'consultant'
}
