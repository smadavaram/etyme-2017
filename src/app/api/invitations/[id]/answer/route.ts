import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { readCv, cvSentence } from '@/lib/cv-reader'
import { holdExpiry } from '@/lib/representation'

/**
 * POST /api/invitations/:id/answer — answer a role by pasting one CV
 *
 * The end of the invitation loop, and the part that was missing. A client
 * lists twelve suppliers and sends them a role. The supplier signs in,
 * sees the role — and was then asked to build a bench before they could
 * answer it, which is exactly the friction the invitation existed to
 * skip.
 *
 * So this does the whole thing in one call: the person, their profile,
 * the bench listing that makes them submittable, the CV as a real resume
 * version, the right to represent, and the submission. A bench is what
 * accumulates from doing this — not a thing you assemble before you are
 * allowed to start.
 *
 * ── The two invariants it must not shortcut ──────────────────────────
 *
 * A submission requires a live bench listing granted by the consultant.
 * One is created here, tier MARKETING, because the vendor is asserting
 * they may market this person — which is exactly what a marketing tier
 * means and is weaker than a retained one.
 *
 * The right to represent is recorded as an assertion by the vendor, not
 * as a consent the consultant gave us. `consentVia: 'VENDOR_ASSERTED'`
 * says who is standing behind it. Writing it as though the person had
 * replied to a text would make the consent ledger a liar, and that
 * ledger is the thing that makes a duplicate submission arguable.
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Answering a role')
  if (notStaff) return notStaff

  const { id } = await params
  const companyId = caller.company!.id
  const now = new Date()

  const invitation = await prisma.requirementInvitation.findFirst({
    where: { id, toCompanyId: companyId },
    include: {
      requirement: {
        select: {
          id: true, title: true, companyId: true, payerCompanyId: true,
          status: true, skills: true, location: true, startDate: true,
        },
      },
    },
  })

  // 404 rather than 403: confirming an invitation exists at another
  // supplier is itself a leak.
  if (!invitation) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No invitation by that id.' } },
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

  const body = await request.json().catch(() => ({}))
  const cvText = String(body?.cv ?? '').trim()

  if (cvText.length < 60) {
    return NextResponse.json(
      { error: { code: 'NO_CV', message: 'Paste the CV — the client reads it, not the row.' } },
      { status: 422 }
    )
  }

  const read = readCv(cvText)

  // What the recruiter typed wins over what the reader guessed. The
  // reading is a first draft on a screen they are looking at.
  const name = String(body?.name ?? read.name ?? '').trim()
  const email = String(body?.email ?? read.email ?? '').trim().toLowerCase()
  const rate = Number.isFinite(Number(body?.rateCents)) ? Number(body.rateCents) : null
  const workAuth = body?.workAuth ? String(body.workAuth) : null
  const availableFrom = body?.availableFrom ? new Date(String(body.availableFrom)) : null
  const skills: string[] = Array.isArray(body?.skills) ? body.skills : read.skills

  if (!name) {
    return NextResponse.json(
      { error: { code: 'NO_NAME', message: 'The CV did not give a name. Type it in.', field: 'name' } },
      { status: 422 }
    )
  }

  // A submission with no rate is one the client will not read, and the
  // column is not nullable for exactly that reason.
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

  // ── The person ──────────────────────────────────────────────────────
  //
  // Matched on the address where there is one. Two vendors pasting the
  // same consultant must reach the same Person, or the duplicate check
  // on the client's side has nothing to find.
  const person = email
    ? ((await prisma.person.findUnique({ where: { primaryEmail: email }, select: { id: true, name: true } })) ??
      (await prisma.person.create({ data: { name, primaryEmail: email } })))
    : await prisma.person.create({
        data: { name, primaryEmail: `${slugOf(name)}.${Date.now().toString(36)}@no-email.local` },
      })

  const profile =
    (await prisma.consultantProfile.findFirst({
      where: { personId: person.id },
      select: { id: true },
    })) ??
    (await prisma.consultantProfile.create({
      data: {
        personId: person.id,
        headline: read.headline,
        skills,
        location: read.location,
        workAuth,
        rateFloor: rate,
        availableFrom,
        // Not on the open feed. A consultant pasted in to answer one
        // role has not agreed to be marketed to everybody.
        visibility: 'INTERNAL',
      },
      select: { id: true },
    }))

  // Fill the gaps on a profile somebody else created, without
  // overwriting what they knew. A second vendor's paste is new evidence,
  // not a correction.
  await prisma.consultantProfile.update({
    where: { id: profile.id },
    data: {
      ...(workAuth ? { workAuth } : {}),
      ...(availableFrom ? { availableFrom } : {}),
      ...(skills.length ? { skills: { set: skills } } : {}),
    },
  })

  // ── The listing that makes them submittable ─────────────────────────
  await prisma.benchListing.upsert({
    where: { consultantId_companyId: { consultantId: profile.id, companyId } },
    create: {
      consultantId: profile.id,
      companyId,
      tier: 'MARKETING',
      rateMin: rate,
      rateMax: rate,
    },
    update: { revokedAt: null, ...(rate ? { rateMin: rate, rateMax: rate } : {}) },
  })

  // ── The CV, as a real version ───────────────────────────────────────
  //
  // Point in time, and attached to the submission — so what the client
  // read is still readable in six months when somebody argues about it.
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
      uploadedById: caller.person.id,
      uploadedByCompanyId: companyId,
    },
    select: { id: true },
  })

  // ── The right to represent, recorded as what it is ──────────────────
  const clientId = invitation.requirement.payerCompanyId ?? invitation.requirement.companyId

  await prisma.representation.upsert({
    where: { personId_holdKey: { personId: person.id, holdKey: `${companyId}:${invitation.requirementId}` } },
    create: {
      personId: person.id,
      companyId,
      clientCompanyId: clientId,
      requirementId: invitation.requirementId,
      state: 'HELD',
      consentedAt: now,
      // Never dressed up as the consultant having replied. The vendor is
      // standing behind this one, and the ledger says so.
      consentVia: 'VENDOR_ASSERTED',
      expiresAt: holdExpiry(now),
      holdKey: `${companyId}:${invitation.requirementId}`,
    },
    update: { consentedAt: now, consentVia: 'VENDOR_ASSERTED', state: 'HELD' },
  })

  // ── The submission ──────────────────────────────────────────────────
  //
  // Unique on (requirement, person), so a second vendor sending the same
  // consultant is refused here rather than duplicated. That refusal is
  // the deduplication working; it is reported as news, not as an error.
  const already = await prisma.submission.findFirst({
    where: { requirementId: invitation.requirementId, personId: person.id },
    select: { id: true, fromCompanyId: true, submittedAt: true },
  })

  if (already) {
    return NextResponse.json(
      {
        error: {
          code: 'ALREADY_SUBMITTED',
          message:
            already.fromCompanyId === companyId
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
      fromCompanyId: companyId,
      toCompanyId: clientId,
      // Computed from ownership, never chosen. A consultant on our own
      // marketing tier is a bench submission.
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
      personId: person.id,
      name,
      read: cvSentence(read),
      onBench: true,
      says: `${name} is with ${invitation.requirement.title}. They are on your bench now — you did not have to build one first.`,
    },
  })
}

function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'consultant'
}
