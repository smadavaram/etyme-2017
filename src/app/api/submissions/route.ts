import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getSessionEmail, getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { supplierCoverGate } from '@/lib/document-stages'
import { emit } from '@/lib/events'
import { notify, notifyBulk, type NotifyParams } from '@/lib/notify'
import { clientOf, maySubmit, askFor, takeHold } from '@/lib/holds'
import { missingNote } from '@/lib/resumes'
import { tellThem } from '@/lib/representation'
import { consentText, mayMessage } from '@/lib/texts'
import { mayMarket, type State } from '@/lib/bench-consent'
import { send as sendMessage } from '@/lib/messages'
import { submissionScope } from '@/lib/resolve-client-company'
import { isConsultantSeat } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { submissionKind, tellEmployee, blockedSays } from './kind'

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
  // Who is asking, and for which firm.
  //
  // This route authenticated by email alone and then took
  // `fromCompanyId` from the body on trust. Anybody signed in could
  // therefore put a candidate in front of a client *as somebody else's
  // firm* — a client employee, a consultant, a competitor — as long as
  // that firm held a granted bench listing on the person. The
  // submission, the rate and the representation notice all went out in
  // the other firm's name.
  //
  // Nothing in the vendor's own walk found it, because a vendor always
  // passes its own id. It was found by asking the same station of all
  // eight positions in `__integration__/party-uniform.test.ts`.
  const { caller, error: callerError } = await getCallerContext(request)
  if (callerError) return callerError

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

  // A consultant's seat is not the firm's seat.
  //
  // Somebody on a bench holds a CONSULTANT context at the firm that
  // benches them, so "the caller's company" is that firm — which let
  // them submit themselves, and anybody else on that bench, in the
  // firm's name. A seat on a bench is a seat to file hours and answer
  // for yourself, never to sell.
  if (isConsultantSeat(caller)) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_YOUR_FIRM',
          message:
            'A consultant is put forward by the firm that holds their consent, not from ' +
            'their own seat. Ask your agency to submit you.',
        },
      },
      { status: 403 }
    )
  }

  // A firm is put forward by its own people. Never by anybody else's.
  if (fromCompanyId && caller.company && fromCompanyId !== caller.company.id) {
    const other = await prisma.company.findUnique({
      where: { id: fromCompanyId },
      select: { name: true },
    })
    return NextResponse.json(
      {
        error: {
          code: 'NOT_YOUR_FIRM',
          message:
            `Only ${other?.name ?? 'that firm'}’s own people can put somebody forward in ` +
            `its name. You are signed in at ${caller.company.name}.`,
        },
      },
      { status: 403 }
    )
  }
  if (fromCompanyId && !caller.company) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_YOUR_FIRM',
          message:
            'A consultant is put forward by a firm that holds their consent, not by ' +
            'themselves. Ask the firm you are on the bench of to submit you.',
        },
      },
      { status: 403 }
    )
  }

  // The firm's own people, and within the firm the desk whose job this is.
  //
  // Everything above asks *which company* is submitting. Nothing asked
  // *which desk*, so every seat at a supplier could put a name in front
  // of a client: the HR partner who keeps the firm's own paperwork, the
  // compliance officer who reads it, the accounts receivable clerk who
  // bills for it. Selling somebody is the recruiting desk's job and the
  // role table has said so since it was written — SEND_SUPPLY goes to
  // the recruiter, the resource manager and the account manager, and to
  // nobody else (`lib/company-defaults`). The route did not ask.
  //
  // Same permission, same question, as sending a candidate onward from
  // one rung to the next (`mayForward` in `lib/forwarding`). Submitting
  // and forwarding are one act seen from two rungs of a chain, and a
  // firm that may do one may do the other.
  if (!hasPermission(caller.permissions, 'submissions.create')) {
    return NextResponse.json(
      {
        error: {
          code: 'NO_PERMISSION',
          message:
            `Putting somebody in front of a client is a recruiting desk's job at ` +
            `${caller.company?.name ?? 'your firm'} — a recruiter, a resource manager or the ` +
            `account manager. Ask one of them to submit this candidate.`,
        },
      },
      { status: 403 }
    )
  }

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
      id: true, companyId: true, status: true, approvalState: true, title: true,
      endClientCompanyId: true, payerCompanyId: true, openToNetwork: true,
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

  // Published, but paused. A change to the money on a published role sends
  // it back through approval and leaves the status OPEN so the invitations
  // and the submissions already in stay where they are — but nothing new
  // comes in until the client has said yes again. The suppliers were told
  // it was paused; this is the same sentence at the door.
  if (requirement.approvalState === 'PENDING_APPROVAL') {
    return NextResponse.json(
      {
        error: {
          code: 'PAUSED',
          message:
            `${requirement.title} is paused while ${requirement.company.name} re-approves the money. ` +
            'You will be told when it is open again.',
        },
      },
      { status: 409 }
    )
  }

  // A role the buyer released to named suppliers is answered by those
  // suppliers.
  //
  // The program office choosing who sees a role is the client's control
  // over its own supply base, and it was enforced at the release door
  // and nowhere else: any firm with the id could answer a role it was
  // never shown. A firm's own record of somebody else's advert carries
  // a payer and has no invitation, so this asks only about a buyer's
  // own requisition — and never about one deliberately opened to the
  // network.
  if (requirement.payerCompanyId === null && !requirement.openToNetwork) {
    const invited = await prisma.requirementInvitation.findUnique({
      where: { requirementId_toCompanyId: { requirementId, toCompanyId: fromCompanyId } },
      select: { status: true },
    })
    if (!invited) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_INVITED',
            message:
              `${requirement.company.name} chose which suppliers see “${requirement.title}”, ` +
              `and ${caller.company?.name ?? 'your firm'} is not among them. Ask their program ` +
              'office to send it to you, and it will be on your Requirements page.',
          },
        },
        { status: 403 }
      )
    }
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
    // `validFrom` is here, in etyme-demand's file, by etyme-regulatory on
    // 2026-09-17, and it is the only line changed: what the gate reads is
    // a compliance question, and without the column selected the floor
    // added on 2026-09-16 reads undefined and silently passes. A policy
    // that begins next month would have blocked this supplier at
    // activation and waved it through here.
    select: { type: true, status: true, issuedAt: true, validFrom: true, expiresAt: true, verifiedAt: true },
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
        // The address is here because the consent ask goes by email, and
        // asking before submitting is the whole point of the message.
        select: { id: true, name: true, primaryEmail: true },
      })

      if (!person) {
        item.status = 'error'
        item.error = 'Person not found'
        results.push(item)
        continue
      }

      // ── Ours, or somebody else's? ──────────────────────────────
      //
      // Asked before the bench walls, because for our own W2 employee
      // there is no bench and there was never going to be one.
      //
      // A prime, a GSI and an MSP all sell to a client and buy either
      // from a sub-vendor or from their own payroll. A delivery manager
      // moving somebody off a winding-down project onto a new client, or
      // HR placing an employee sitting between assignments, is the
      // ordinary way those firms staff work — and this route refused all
      // of it, because it demanded a `ConsultantProfile` and a bench
      // listing the employee had granted to the firm that already
      // employs them. The employment contract is that consent: nobody
      // asks an employee's permission to be staffed on a project.
      //
      // So the carve-out is narrow and it is exactly three things. The
      // listing is skipped. The employee is told rather than asked. The
      // read is logged like every other. A firm putting forward somebody
      // it does not employ walks the same walls it always did.
      //
      // Live means live: revoked, suspended and expired seats are all
      // people this firm no longer employs, and a lapsed seat falls back
      // to the listing path rather than opening the door wider.
      const employment = await prisma.context.findFirst({
        where: {
          personId,
          companyId: fromCompanyId,
          type: 'EMPLOYEE',
          revokedAt: null,
          suspendedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { id: true },
      })
      const employedByUs = employment !== null

      // The bench listing this firm holds, where it needs one. Null for
      // an employee, which is what makes the submission INTERNAL.
      let listing: { tier: string | null } | null = null
      // What `maySubmit` said when it ran — "you already represent this
      // person here for another 12 days", and the like. There is no such
      // sentence for an employee, because none of it applies.
      let representationNote: string | undefined

      if (employedByUs) {
        // An employer may skip the listing. It may not skip a block.
        //
        // A client off somebody's list is off it however they are
        // engaged, and being on the submitting firm's payroll does not
        // override a decision that was never the firm's to make.
        // `maySubmit` bundles this check with the listing checks and so
        // does not run here; `lib/holds` belongs to etyme-regulatory and
        // exports nothing that answers this on its own, so the query is
        // here, deliberately reading the same row `maySubmit` reads.
        const blocked = await prisma.doNotSubmit.findUnique({
          where: { personId_companyId: { personId, companyId: clientCompanyId } },
          select: { id: true },
        })

        if (blocked) {
          item.status = 'error'
          item.code = 'BLOCKED'
          item.error = blockedSays()

          await prisma.accessLog.create({
            data: {
              subjectId: personId,
              actorCompanyId: fromCompanyId,
              action: 'SUBMIT',
              allowed: false,
              reason: item.error,
            },
          })

          results.push(item)
          continue
        }
      } else {
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

        const benchListing = await prisma.benchListing.findFirst({
          where: {
            consultantId: consultant.id,
            companyId: fromCompanyId,
            revokedAt: null,
          },
        })

        if (!benchListing) {
          item.status = 'error'
          item.error = 'No active bench listing from this company. The consultant must grant a listing first.'
          results.push(item)
          continue
        }

        // And has the consultant actually agreed to it.
        //
        // The listing existing was never the point. `grantedAt` used to be
        // stamped the moment a vendor created the row, so this check
        // passed on a listing nobody had ever been asked about — which
        // made CLAUDE.md's firmest invariant true in letter and empty in
        // substance. A listing now starts INVITED and only the consultant
        // moves it.
        const consented = mayMarket({ state: benchListing.state as State, revokedAt: benchListing.revokedAt })
        if (!consented.ok) {
          item.status = 'error'
          item.error = consented.reason
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

        listing = benchListing
        representationNote = verdict.note
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
      //
      // This used to read `fromCompanyId === toCompanyId` for INTERNAL,
      // which is unreachable — NO_RECIPIENT refuses a submission to
      // yourself several screens above — and meant the wrong thing
      // besides. INTERNAL is about the person, not the recipient. See
      // `./kind`.
      const kind = submissionKind({ employedByUs, listingTier: listing?.tier ?? null })

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

      // Putting somebody forward is the answer to the invitation. The
      // single-candidate route said so; this one did not, and the client's
      // page went on counting a supplier that had submitted as silent.
      await prisma.requirementInvitation.updateMany({
        where: { requirementId, toCompanyId: fromCompanyId, status: 'SENT' },
        data: { status: 'ACCEPTED' },
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
      //
      // Not taken for our own employee. A hold is one agency warning
      // another off a name it is working; the employment already says
      // who this person answers to, and writing a representation row
      // against a firm's own payroll would put a marketplace claim on an
      // employee who is not on the market.
      const held = employedByUs
        ? null
        : await takeHold({
            personId,
            companyId: fromCompanyId,
            clientCompanyId,
            requirementId,
          })

      if (held) {
        item.heldUntil = held.expiresAt.toISOString().slice(0, 10)
        item.note = representationNote

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
          select: { textsOffAt: true },
        })

        const canWrite = mayMessage({
          name: person.name,
          email: person.primaryEmail ?? null,
          textsOffAt: profile?.textsOffAt ?? null,
          confirmedAt: null,
          askedAt: null,
          unanswered: 0,
          onBench: true,
        })

        if (canWrite.ok) {
          await prisma.representation.update({
            where: { id: held.id },
            data: { consentAskedAt: new Date() },
          })

          const message = consentText({
            personName: person.name,
            vendorName,
            clientLabel: clientName,
            title: requirement.title,
            location: requirement.location,
            rateCents: rate,
            startsOn: requirement.startDate,
          })

          void sendMessage({
            companyId: fromCompanyId,
            personId,
            kind: 'CONSENT',
            to: person.primaryEmail,
            subject: message.subject,
            body: message.body,
            aboutType: 'SUBMISSION',
            aboutId: submission.id,
          })

          item.asked = true
        }
      }

      // ── The employee is told ────────────────────────────────────
      //
      // The whole carve-out rests on this message, so it is awaited
      // rather than fired and forgotten. A submission that went ahead
      // without asking the person and then silently failed to tell them
      // is the thing CLAUDE.md's listing invariant exists to prevent,
      // and "the notification was best effort" is not an answer anybody
      // wants to give afterwards.
      //
      // One message, no button. A consultant on a bench gets a consent
      // ask alongside theirs; this deliberately has none, because there
      // is nothing for an employee to accept and offering a choice whose
      // answer is thrown away is worse than offering none.
      if (employedByUs) {
        await notify({
          personId,
          companyId: fromCompanyId,
          type: 'SUBMISSION',
          title: `${vendorName} put you forward to ${clientName}`,
          body: tellEmployee({
            employerName: vendorName,
            clientName,
            roleTitle: requirement.title,
          }),
          entityId: submission.id,
          data: { submissionId: submission.id, clientCompanyId, requirementId, kind },
        })
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
        reportError(`Submission failed for person ${personId}:`, err)
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
  // Was `getSessionEmail` alone, which answers "is somebody signed in"
  // and nothing else. The seat is what says which submissions are theirs.
  const { caller, error } = await getCallerContext(request)
  if (error) return error

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

  // Every filter below comes from the query string, and until now the
  // whole WHERE did: `?personId=` returned one person's entire history
  // across every firm in the market with rates attached, and `?companyId=`
  // returned a competitor's outbound pipeline. The caller was
  // authenticated and never authorized.
  //
  // Prisma ANDs top-level keys, so the scope's OR binds the caller into
  // every query below rather than replacing what was asked for.
  const scope = submissionScope(caller)
  if (!scope) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'No company context' } },
      { status: 403 }
    )
  }

  const where: any = { ...scope }

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
        // companyId and the panel come back so the client's own side of
        // this list can open an interview form with the room already in
        // it. Neither is sent to a supplier — see the mapping below.
        requirement: { select: { id: true, title: true, skills: true, companyId: true, interviewers: true } },
        fromCompany: { select: { id: true, name: true } },
        toCompany: { select: { id: true, name: true } },
        // Where each candidate has got to, so a row can say it without a
        // second call per row. Four fields — no feedback, no panel, no
        // notes: this list is read by both sides of the trade, and what
        // an interviewer wrote is the client's alone.
        interviews: {
          select: { id: true, round: true, state: true, outcome: true, scheduledAt: true },
          orderBy: { round: 'asc' },
        },
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
        requirement: {
          id: s.requirement.id,
          title: s.requirement.title,
          skills: s.requirement.skills,
          // The hiring panel is the client's own list of names, and the
          // same reasoning that keeps interview feedback off this list
          // keeps the panel off it: a supplier learns who is in the room
          // when a round is proposed to it, not before.
          interviewers:
            s.requirement.companyId === caller.company?.id ? s.requirement.interviewers : null,
        },
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
        // Rounds so far, oldest first. Empty for the great majority —
        // most submissions never reach an interview at all.
        interviews: s.interviews.map((i) => ({
          id: i.id,
          round: i.round,
          state: i.state,
          outcome: i.outcome,
          scheduledAt: i.scheduledAt?.toISOString() ?? null,
        })),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  })
}
