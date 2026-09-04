import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { supplierCoverGate } from '@/lib/document-stages'
import { emit } from '@/lib/events'
import { notify, notifyBulk, type NotifyParams } from '@/lib/notify'
import { clientOf, maySubmit, askFor, takeHold } from '@/lib/holds'
import { missingNote } from '@/lib/resumes'
import { tellThem } from '@/lib/representation'
import { consentText, mayText } from '@/lib/texts'
import { send as sendText } from '@/lib/sms'

/**
 * POST /api/submissions
 *
 * BUILD.md: { requirementId, personIds[], rate }
 *   → batch, per item errors, kind computed server side
 *
 * CLAUDE.md invariants:
 *   - A Submission requires a live BenchListing granted by the consultant
 *   - Submission is unique on (requirementId, personId) — first submission wins
 *   - SubmissionKind is computed from ownership, never accepted from a client
 *   - Every read of another person's data writes an AccessLog row
 */
export async function POST(request: NextRequest) {
  const email = await getSessionEmail()

  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  // Who is submitting. Needed for the event log — "a submission happened"
  // without a name in it is not much of an audit record.
  const submitter = await prisma.person.findUnique({
    where: { primaryEmail: email },
    select: { id: true },
  })

  const body = await request.json()
  const { requirementId, personIds, rate, fromCompanyId } = body

  if (!requirementId || typeof requirementId !== 'string') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'requirementId is required', field: 'requirementId' } },
      { status: 422 }
    )
  }

  if (!Array.isArray(personIds) || personIds.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'personIds must be a non-empty array', field: 'personIds' } },
      { status: 422 }
    )
  }

  if (typeof rate !== 'number' || rate <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'rate must be a positive number', field: 'rate' } },
      { status: 422 }
    )
  }

  if (!fromCompanyId || typeof fromCompanyId !== 'string') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'fromCompanyId is required', field: 'fromCompanyId' } },
      { status: 422 }
    )
  }

  // Verify requirement exists and is open
  const requirement = await prisma.requirement.findUnique({
    where: { id: requirementId },
    select: {
      id: true, companyId: true, status: true, title: true,
      endClientCompanyId: true, payerCompanyId: true,
      // For the consent text: enough detail that somebody can answer
      // without a phone call.
      location: true, startDate: true,
      company: { select: { name: true } },
      endClientCompany: { select: { name: true } },
    },
  })

  if (!requirement) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Requirement not found' } },
      { status: 404 }
    )
  }

  if (requirement.status !== 'OPEN') {
    return NextResponse.json(
      { error: { code: 'NOT_OPEN', message: `Requirement is ${requirement.status}, not OPEN` } },
      { status: 409 }
    )
  }

  // Who the candidate is actually being submitted to.
  //
  // A client's own requisition: the client. A vendor's record of somebody
  // else's advert: the prime who posted it, or the client direct. Using the
  // company that wrote the role down meant a vendor submitted to
  // themselves, and everything downstream inherited a contract with no
  // counterparty.
  const toCompanyId = requirement.payerCompanyId ?? requirement.companyId

  if (toCompanyId === fromCompanyId) {
    return NextResponse.json(
      {
        error: {
          code: 'NO_RECIPIENT',
          message:
            'This role has nobody to submit to. Name the prime or the client it is worked through, then submit.',
        },
      },
      { status: 409 }
    )
  }

  // Who the hold is against. The end client where it is known, because an
  // MSP and a prime feeding the same site is exactly the case where one
  // person gets submitted twice and loses the role.
  const clientCompanyId = clientOf(requirement)
  const clientName = requirement.endClientCompany?.name ?? requirement.company.name

  // The submitting company, by name. Said to the consultant, never to
  // another vendor.
  const fromCompany = await prisma.company.findUnique({
    where: { id: fromCompanyId },
    select: { name: true },
  })
  const vendorName = fromCompany?.name ?? 'An agency'
  // The band this vendor was given, if any. Read once for the whole batch.
  //
  // Addendum E lists rate band under WARN, not BLOCK: "WARN, capture a
  // reason, proceed everywhere else — rate band, headcount plan, vendor
  // tier." A vendor who has the right person at the wrong price is having a
  // negotiation, not committing a violation, and a platform that refuses
  // the submission just sends that conversation back to email.
  const invitation = await prisma.requirementInvitation.findUnique({
    where: { requirementId_toCompanyId: { requirementId, toCompanyId: fromCompanyId } },
    select: { payMin: true, payMax: true },
  })

  function bandWarning(submittedRate: number): string | null {
    if (!invitation) return null
    if (invitation.payMax != null && submittedRate > invitation.payMax) {
      return `$${Math.round(submittedRate / 100)}/hr is above the $${Math.round(invitation.payMax / 100)}/hr ceiling you were given`
    }
    if (invitation.payMin != null && submittedRate < invitation.payMin) {
      return `$${Math.round(submittedRate / 100)}/hr is below the $${Math.round(invitation.payMin / 100)}/hr floor you were given`
    }
    return null
  }

  // ── Insurance, before anything goes in front of a client ──────────
  //
  // Addendum E: lapsed supplier insurance is a legally grounded BLOCK.
  // It was checked at award, which is one step too late — by then the
  // client has read a CV, run interviews and made an offer against a
  // supplier who could not lawfully put anybody on site. Once per batch:
  // nothing about a candidate is relevant when the supplier cannot
  // place anybody at all.
  const certRows = await prisma.verification.findMany({
    where: { companyId: fromCompanyId, personId: null },
    select: { type: true, status: true, issuedAt: true, expiresAt: true, verifiedAt: true },
  })

  const cover = supplierCoverGate({
    supplierName: vendorName,
    clientName,
    certificates: certRows.filter((v) => v.type.startsWith('INSURANCE_')),
    on: new Date(),
  })

  if (cover.outcome === 'BLOCK') {
    return NextResponse.json(
      { error: { code: 'COVER_LAPSED', message: cover.says, fix: cover.fix } },
      { status: 409 }
    )
  }

  const results: any[] = []

  for (const personId of personIds) {
    const item: any = { personId, status: 'pending' }

    try {
      // 1. Verify person exists
      const person = await prisma.person.findUnique({
        where: { id: personId },
        select: { id: true, name: true },
      })

      if (!person) {
        item.status = 'error'
        item.error = 'Person not found'
        results.push(item)
        continue
      }

      // 2. Check for live BenchListing from this company
      // CLAUDE.md: "A Submission requires a live BenchListing granted by the consultant"
      const consultant = await prisma.consultantProfile.findUnique({
        where: { personId },
        select: { id: true },
      })

      if (!consultant) {
        item.status = 'error'
        item.error = 'Person has no consultant profile'
        results.push(item)
        continue
      }

      const listing = await prisma.benchListing.findFirst({
        where: {
          consultantId: consultant.id,
          companyId: fromCompanyId,
          revokedAt: null,
        },
      })

      if (!listing) {
        item.status = 'error'
        item.error = 'No active bench listing from this company. The consultant must grant a listing first.'
        results.push(item)
        continue
      }

      // 2b. May this vendor put this person in front of this client at all?
      //
      // A listing is permission to market somebody. It is not permission to
      // send them anywhere, and the difference is what stops a consultant
      // being burned: two vendors submitting the same name to the same
      // client in the same week gets both rejected, and the person never
      // finds out why.
      //
      // The refusal never says who else is involved. A consultant is on ten
      // benches and that is nobody's business but theirs.
      const verdict = await maySubmit({
        personId,
        companyId: fromCompanyId,
        clientCompanyId,
      })

      if (!verdict.ok) {
        item.status = verdict.code === 'HELD_ELSEWHERE' ? 'held' : 'error'
        item.code = verdict.code
        item.error = verdict.message

        // Somebody who wants to be asked gets asked, here, once.
        if (verdict.code === 'ASK_FIRST') {
          const asked = await askFor({
            personId,
            companyId: fromCompanyId,
            clientCompanyId,
            requirementId,
          })
          if (asked) {
            void emit({
              type: 'representation.requested',
              companyId: fromCompanyId,
              subjectType: 'Representation',
              subjectId: asked.id,
              actorPersonId: submitter?.id ?? null,
              payload: { personId, clientCompanyId, requirementId },
            })
            void notify({
              personId,
              type: 'SUBMISSION',
              title: 'An agency wants to put you forward',
              body: `${vendorName} would like to submit you to ${clientName} for ${requirement.title}. They cannot until you say yes.`,
              entityId: asked.id,
              data: { representationId: asked.id, clientCompanyId, requirementId },
            })
          }
        }

        // A refused submission is still a read of somebody's data, and
        // CLAUDE.md says refusals are logged too.
        await prisma.accessLog.create({
          data: {
            subjectId: personId,
            actorCompanyId: fromCompanyId,
            action: 'SUBMIT',
            allowed: false,
            reason: verdict.message,
          },
        })

        results.push(item)
        continue
      }

      // 3. Check for duplicate — unique on (requirementId, personId)
      const existing = await prisma.submission.findUnique({
        where: {
          requirementId_personId: { requirementId, personId },
        },
      })

      if (existing) {
        item.status = 'duplicate'
        item.error = 'This person has already been submitted to this requirement. First submission wins.'
        item.existingSubmissionId = existing.id
        item.existingSubmittedAt = existing.submittedAt.toISOString()
        results.push(item)
        continue
      }

      // 4. Compute SubmissionKind from ownership (never accepted from client)
      let kind: 'INTERNAL' | 'BENCH' | 'NETWORK'
      if (fromCompanyId === toCompanyId) {
        kind = 'INTERNAL'
      } else if (listing.tier === 'RETAINED') {
        kind = 'BENCH'
      } else {
        kind = 'NETWORK'
      }

      // 5. Create the submission, with the CV that is current right now.
      //
      // The version, not a pointer to whatever they upload next month. A
      // client acted on the document they were sent, and it stops changing
      // the moment it leaves.
      const cv = await prisma.resume.findFirst({
        where: { personId, currentKey: personId, deletedAt: null },
        select: { id: true, label: true },
      })

      const submission = await prisma.submission.create({
        data: {
          requirementId,
          personId,
          fromCompanyId,
          toCompanyId,
          kind,
          rate,
          status: 'SUBMITTED',
          resumeId: cv?.id ?? null,
        },
      })

      // Not a refusal — a recruiter working a role at eight at night should
      // not be stopped by a missing file — but the client will ask for it.
      item.cv = cv ? cv.label : null
      if (!cv) item.note = missingNote(person.name)

      // 5b. Take the hold, now that there is something to hold for.
      //
      // After the submission rather than before: a hold taken for a
      // submission that then failed would keep somebody out of a client's
      // pipeline for a month for nothing.
      const held = await takeHold({
        personId,
        companyId: fromCompanyId,
        clientCompanyId,
        requirementId,
      })

      if (held) {
        item.heldUntil = held.expiresAt.toISOString().slice(0, 10)
        item.note = verdict.ok ? verdict.note : undefined

        void emit({
          type: 'representation.taken',
          companyId: fromCompanyId,
          subjectType: 'Representation',
          subjectId: held.id,
          actorPersonId: submitter?.id ?? null,
          payload: { personId, clientCompanyId, requirementId, expiresAt: held.expiresAt.toISOString() },
        })

        // Told, every time, with the client named. The vendor's
        // competitors are kept in the dark; the person never is. Being
        // marketed somewhere you did not know about is the complaint all
        // of this exists to answer.
        void notify({
          personId,
          type: 'SUBMISSION',
          title: `${vendorName} put you forward to ${clientName}`,
          body: tellThem({
            vendorName,
            clientName,
            roleTitle: requirement.title,
            hold: {
              companyId: fromCompanyId,
              clientCompanyId,
              state: 'HELD',
              takenAt: new Date(),
              expiresAt: held.expiresAt,
            },
            now: new Date(),
          }),
          entityId: submission.id,
          data: { submissionId: submission.id, clientCompanyId, requirementId },
        })
      }

      // ── Ask them ────────────────────────────────────────────────
      //
      // The most valuable message this product sends, and it solves three
      // things at once. Consultants get submitted blind constantly and it
      // burns them. When two vendors put the same person forward, the
      // client often rejects both — one text stops that at source, and
      // "no, someone already has me there" is the cheapest deduplication
      // anybody will ever build. And it leaves a timestamped consent trail
      // vendors need anyway.
      //
      // Not a gate. The submission stands and the ask goes out alongside
      // it, because a recruiter working a role at eight at night should
      // not be blocked waiting for a text — the check on the package says
      // loudly that nobody has agreed yet, which is the right place for it.
      if (held) {
        const profile = await prisma.consultantProfile.findFirst({
          where: { personId },
          select: { mobile: true, textsOffAt: true },
        })

        const canText = mayText({
          name: person.name,
          mobile: profile?.mobile ?? null,
          textsOffAt: profile?.textsOffAt ?? null,
          confirmedAt: null,
          askedAt: null,
          unanswered: 0,
          onBench: true,
        })

        if (canText.ok) {
          await prisma.representation.update({
            where: { id: held.id },
            data: { consentAskedAt: new Date() },
          })

          void sendText({
            companyId: fromCompanyId,
            personId,
            kind: 'CONSENT',
            to: profile!.mobile,
            body: consentText({
              personName: person.name,
              vendorName,
              clientLabel: clientName,
              title: requirement.title,
              location: requirement.location,
              rateCents: rate,
              startsOn: requirement.startDate,
            }),
            aboutType: 'SUBMISSION',
            aboutId: submission.id,
          })

          item.asked = true
        }
      }

      // The band is advisory, so the submission stands and the warning
      // travels with it — the client sees why it is off-band rather than
      // never seeing the candidate at all.
      const warning = bandWarning(rate)
      if (warning) {
        item.warning = warning
        await prisma.automationLog.create({
          data: {
            companyId: fromCompanyId,
            action: 'SUBMISSION_OFF_BAND',
            summary: `${person.name} submitted to "${requirement.title}" off band`,
            reason: warning,
            payload: { submissionId: submission.id, rate, requirementId },
            reversible: true,
          },
        })
      }

      // 6. Write AccessLog — submission is a read of person's data
      void emit({
        type: 'submission.created',
        companyId: fromCompanyId,
        subjectType: 'Submission',
        subjectId: submission.id,
        actorPersonId: submitter?.id ?? null,
        payload: {
          requirementId,
          personId: person.id,
          rateCents: rate,
          toCompanyId: requirement.companyId,
          offBand: Boolean(item.warning),
        },
      })

      // 6. Write AccessLog — submission is a read of person's data
      await prisma.accessLog.create({
        data: {
          subjectId: personId,
          actorCompanyId: fromCompanyId,
          action: 'SUBMIT',
          allowed: true,
          reason: `Submitted to "${requirement.title}"`,
        },
      })

      item.status = 'created'
      item.submissionId = submission.id
      item.kind = kind
      item.submittedAt = submission.submittedAt.toISOString()
    } catch (err: any) {
      // Handle race condition on duplicate
      if (err?.code === 'P2002') {
        item.status = 'duplicate'
        item.error = 'This person has already been submitted (concurrent submission)'
      } else {
        item.status = 'error'
        item.error = 'Submission failed'
        console.error(`Submission failed for person ${personId}:`, err)
      }
    }

    results.push(item)
  }

  const created = results.filter((r) => r.status === 'created')
  const errors = results.filter((r) => r.status === 'error')
  const duplicates = results.filter((r) => r.status === 'duplicate')
  // Stopped because another agency is already representing them there.
  // Counted apart from errors: nobody did anything wrong, and the vendor
  // may well want to wait for the hold to lapse.
  const held = results.filter((r) => r.status === 'held')

  // Notify the requirement owner about new submissions
  if (created.length > 0) {
    // Find admins at the requirement's company who should see submissions
    const recipientContexts = await prisma.context.findMany({
      where: {
        companyId: toCompanyId,
        role: { permissions: { hasSome: ['submissions.read'] } },
      },
      select: { personId: true },
      take: 5,
    })

    const notifications: NotifyParams[] = []
    for (const ctx of recipientContexts) {
      notifications.push({
        personId: ctx.personId,
        companyId: toCompanyId,
        type: 'SUBMISSION',
        title: created.length === 1
          ? `New submission for "${requirement.title}"`
          : `${created.length} new submissions for "${requirement.title}"`,
        body: created.length === 1
          ? `A candidate was submitted to your requirement "${requirement.title}"`
          : `${created.length} candidates were submitted to your requirement "${requirement.title}"`,
        entityId: requirementId,
        data: {
          requirementId,
          count: created.length,
          submissionIds: created.map((r: any) => r.submissionId),
        },
      })
    }

    if (notifications.length > 0) {
      notifyBulk(notifications)
    }
  }

  return NextResponse.json({
    data: {
      requirementId,
      results,
      summary: {
        submitted: created.length,
        duplicates: duplicates.length,
        heldElsewhere: held.length,
        errors: errors.length,
        total: personIds.length,
      },
      message: [
        `${created.length} submitted`,
        `${duplicates.length} duplicates`,
        held.length > 0 ? `${held.length} already represented elsewhere` : null,
        `${errors.length} errors`,
      ].filter(Boolean).join(', '),
    },
  })
}

/**
 * GET /api/submissions
 *
 * BUILD.md: direction=sent|received
 */
export async function GET(request: NextRequest) {
  const email = await getSessionEmail()

  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const url = request.nextUrl
  const direction = url.searchParams.get('direction') ?? 'sent'
  const companyId = url.searchParams.get('companyId')
  const filterPersonId = url.searchParams.get('personId')
  const filterRequirementId = url.searchParams.get('requirementId')
  const status = url.searchParams.get('status')
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)))

  // personId-only or requirementId-only queries skip the companyId requirement
  if (!companyId && !filterPersonId && !filterRequirementId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'companyId or personId is required', field: 'companyId' } },
      { status: 422 }
    )
  }

  const where: any = {}

  if (filterPersonId) {
    where.personId = filterPersonId
  } else if (direction === 'sent') {
    where.fromCompanyId = companyId
  } else {
    where.toCompanyId = companyId
  }

  if (filterRequirementId) {
    where.requirementId = filterRequirementId
  }

  if (status) {
    where.status = status.toUpperCase()
  }

  const [submissions, total] = await Promise.all([
    prisma.submission.findMany({
      where,
      include: {
        person: { select: { id: true, name: true } },
        requirement: { select: { id: true, title: true, skills: true } },
        fromCompany: { select: { id: true, name: true } },
        toCompany: { select: { id: true, name: true } },
      },
      orderBy: { submittedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.submission.count({ where }),
  ])

  return NextResponse.json({
    data: {
      submissions: submissions.map((s) => ({
        id: s.id,
        person: s.person,
        requirement: s.requirement,
        fromCompany: s.fromCompany,
        toCompany: s.toCompany,
        kind: s.kind,
        rate: s.rate,
        status: s.status,
        submittedAt: s.submittedAt.toISOString(),
        // Whether it has been sent on, so the list can offer the button
        // — and, once used, say plainly that it was used. The route was
        // built and nothing in the product could reach it.
        forwardedAt: s.forwardedAt?.toISOString() ?? null,
        forwardedVia: s.forwardedVia,
        forwardedToEmail: s.forwardedToEmail,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  })
}
