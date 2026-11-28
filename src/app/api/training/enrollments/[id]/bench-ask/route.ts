import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { pluginGate } from '@/lib/plugin-gate'
import { notify } from '@/lib/notify'
import { askMethod, mayAskOntoBench } from '@/lib/training'
import { ALREADY_ON_BENCH } from '@/lib/training/proof'
import { invitation } from '@/lib/bench-consent'
import { inviteUrl, inviteText } from '@/lib/bench-invite'
import { askByEmail } from '@/app/api/consultants/ask-by-email'
import { askedOntoBenchSays, INVITE_LINK_KEPT_SAYS } from '@/lib/bench-filter'
import { hasOwnAccount } from '@/lib/consultant-portfolio/firm-view'
import { firmReadsAt, nameAskedUnder } from '@/lib/consultant-portfolio/before-her-yes'

/**
 * POST /api/training/enrollments/:id/bench-ask
 *
 * "Ask her onto the bench", once her own course is finished (not the
 * cohort's). The same ask as Add to bench, never a second consent path:
 *
 *  - her ONE listing at this firm is created or re-asked as INVITED, with
 *    the cohort she came from; this route never writes GRANTED;
 *  - only her own yes (`/api/me/benches/:id/respond` or her invitation)
 *    makes it live, and fills the answer on the BenchAsk row;
 *  - a firm's own W-2 employee is told, not asked (kind INTERNAL): no
 *    listing, a BenchAsk row with the method EMPLOYEE_TOLD.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Training')
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'TRAIN_TO_BENCH')
  if (off) return off
  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: `Asking somebody onto the bench is for whoever develops the bench at ${caller.company!.name}.` } },
      { status: 403 }
    )
  }
  const companyId = caller.company!.id
  const { id } = await params

  const row = await prisma.enrollment.findFirst({
    where: { id, course: { companyId } },
    select: { id: true, status: true, personId: true, cohortId: true, person: { select: { name: true, primaryEmail: true } }, course: { select: { title: true } } },
  })
  if (!row) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That enrollment is not on your books.' } }, { status: 404 })

  const may = mayAskOntoBench({ enrollmentStatus: row.status, personName: row.person.name })
  if (!may.ok) return NextResponse.json({ error: { code: 'NOT_FINISHED', message: may.message } }, { status: 409 })

  const profile = await prisma.consultantProfile.findUnique({
    where: { personId: row.personId },
    select: {
      id: true, personId: true,
      person: { select: { name: true, primaryEmail: true, passwordHash: true, _count: { select: { credentials: true, contexts: { where: { type: 'CONSULTANT', companyId: null } } } } } },
    },
  })
  if (!profile) {
    return NextResponse.json(
      { error: { code: 'NO_PROFILE', message: `${row.person.name} has no consultant record yet. Add her as a consultant first, then ask her onto the bench.` } },
      { status: 409 }
    )
  }

  const [employedSeat, listing] = await Promise.all([
    prisma.context.findFirst({ where: { personId: row.personId, companyId, type: 'EMPLOYEE', revokedAt: null }, select: { id: true } }),
    prisma.benchListing.findUnique({ where: { consultantId_companyId: { consultantId: profile.id, companyId } } }),
  ])
  const method = askMethod({
    employed: employedSeat != null,
    hasOwnAccount: hasOwnAccount({ passwordSet: Boolean(profile.person.passwordHash), signIns: profile.person._count.credentials, ownSeats: profile.person._count.contexts }),
  })
  const now = new Date()

  // A firm's own employee is told, not asked: the employment is the consent.
  if (method === 'EMPLOYEE_TOLD') {
    const ask = await prisma.benchAsk.create({
      data: { companyId, enrollmentId: id, benchListingId: listing?.id ?? null, askedByPersonId: caller.person.id, method },
      select: { id: true },
    })
    await prisma.automationLog.create({
      data: {
        companyId, action: 'BENCH_ASK_EMPLOYEE_TOLD',
        summary: `${row.person.name} finished ${row.course.title} and was told she is on ${caller.company!.name}’s bench as its own employee.`,
        reason: 'A firm’s own employee is told, not asked.',
        payload: { benchAskId: ask.id, enrollmentId: id, personId: row.personId, cohortId: row.cohortId },
        reversible: false,
      },
    })
    void notify({
      personId: row.personId, companyId, type: 'SYSTEM', channel: 'IN_APP',
      title: `${caller.company!.name} will put you forward for jobs`,
      body: `You finished ${row.course.title}. As its employee, you are on its bench; you are told, not asked.`,
      entityId: id,
    })
    return NextResponse.json(
      { data: { askId: ask.id, method, listingId: listing?.id ?? null, says: `${row.person.name} works for ${caller.company!.name}, so she is told, not asked.` } },
      { status: 201 }
    )
  }

  // Her ONE listing here. Live, pending or declined: never a second.
  if (listing && !listing.revokedAt) {
    if (listing.state === 'GRANTED') {
      // Already on the bench: her yes was given before this ask. Say so on
      // the ask, honestly, so the proof shows. The date is the listing's.
      if (row.cohortId) {
        await prisma.benchListing.update({ where: { id: listing.id }, data: { sourceCohortId: row.cohortId } })
      }
      const done = await prisma.benchAsk.findFirst({ where: { enrollmentId: id, benchListingId: listing.id }, select: { id: true } })
      if (!done) {
        await prisma.benchAsk.create({
          data: { companyId, enrollmentId: id, benchListingId: listing.id, askedByPersonId: caller.person.id, method, answer: 'YES', answeredAt: listing.respondedAt ?? listing.grantedAt ?? now, answeredVia: ALREADY_ON_BENCH },
        })
      }
      return NextResponse.json({ data: { askId: null, method: null, listingId: listing.id, says: `${row.person.name} is already on your bench. Nothing to ask; her course now shows on her row.` } })
    }
    if (listing.state === 'INVITED') {
      const open = await prisma.benchAsk.findFirst({ where: { enrollmentId: id, benchListingId: listing.id, answer: null }, select: { id: true } })
      if (open) {
        return NextResponse.json(
          { error: { code: 'ALREADY_ASKED', message: `${row.person.name} was already asked and has not answered. Wait for her yes.` } },
          { status: 409 }
        )
      }
      // Asked when she was added as a consultant: the same listing, now
      // carrying the cohort, asked again through the same letter. Never GRANTED here.
      const attached = await prisma.$transaction(async (tx) => {
        await tx.benchListing.update({ where: { id: listing.id }, data: { sourceCohortId: row.cohortId } })
        const ask = await tx.benchAsk.create({
          data: { companyId, enrollmentId: id, benchListingId: listing.id, askedByPersonId: caller.person.id, method },
          select: { id: true },
        })
        await tx.automationLog.create({
          data: {
            companyId, action: 'BENCH_LISTING_REQUESTED',
            summary: `Asked ${row.person.name} again onto the bench after ${row.course.title}. Waiting on her yes.`,
            reason: 'The firm asked a finished trainee onto its bench; her listing from when she was added carries the cohort.',
            payload: { listingId: listing.id, consultantId: profile.id, personId: profile.personId, requestedBy: caller.person.id, benchAskId: ask.id, enrollmentId: id, cohortId: row.cohortId, method },
            reversible: true,
          },
        })
        return ask
      })
      const url = inviteUrl(listing.id)
      const msg = inviteText({ personName: profile.person.name, vendorName: caller.company!.name, url, terms: null })
      const mail = await askByEmail({ companyId, personId: profile.personId, to: profile.person.primaryEmail, url, subject: msg.subject, body: msg.body, listingId: listing.id })
      return NextResponse.json(
        { data: { askId: attached.id, method, listingId: listing.id, mail, says: askedOntoBenchSays(profile.person.name) + (mail === 'KEPT' ? ` ${INVITE_LINK_KEPT_SAYS}` : '') } },
        { status: 201 }
      )
    }
    return NextResponse.json(
      { error: { code: 'DECLINED', message: `${row.person.name} said no. Asking again is a conversation, not a button.` } },
      { status: 409 }
    )
  }

  const asked = nameAskedUnder({ existing: listing, email: profile.person.primaryEmail, shownName: profile.person.name })
  const tier = listing?.tier ?? 'MARKETING'
  const made = await prisma.$transaction(async (tx) => {
    const l = listing
      ? await tx.benchListing.update({
          where: { id: listing.id },
          data: { ...invitation(now), revokedAt: null, declinedNote: null, firmName: asked.firmName, sourceCohortId: row.cohortId },
        })
      : await tx.benchListing.create({
          data: { consultantId: profile.id, companyId, tier, ...invitation(now), firmName: asked.firmName, sourceCohortId: row.cohortId },
        })
    const ask = await tx.benchAsk.create({
      data: { companyId, enrollmentId: id, benchListingId: l.id, askedByPersonId: caller.person.id, method },
      select: { id: true },
    })
    await tx.automationLog.create({
      data: {
        companyId, action: 'BENCH_LISTING_REQUESTED',
        summary: `Asked "${asked.says}" onto the bench after ${row.course.title}. Waiting on her yes.`,
        reason: 'The firm asked a finished trainee onto its bench.',
        payload: { listingId: l.id, consultantId: profile.id, personId: profile.personId, requestedBy: caller.person.id, benchAskId: ask.id, enrollmentId: id, cohortId: row.cohortId, method },
        reversible: true,
      },
    })
    return { listing: l, askId: ask.id }
  })

  // The letter, the same one Add to bench sends, outside the transaction.
  const url = inviteUrl(made.listing.id)
  const msg = inviteText({ personName: profile.person.name, vendorName: caller.company!.name, url, terms: null })
  const mail = await askByEmail({
    companyId, personId: profile.personId, to: profile.person.primaryEmail, url,
    subject: msg.subject, body: msg.body, listingId: made.listing.id,
  })
  const typed = (await firmReadsAt({ companyId, callerPersonId: caller.person.id, consultantIds: [profile.id] })).get(profile.id)?.typed ?? null
  return NextResponse.json(
    {
      data: {
        askId: made.askId, method, listingId: made.listing.id, mail,
        says: askedOntoBenchSays(typed ? typed.name : asked.says) + (mail === 'KEPT' ? ` ${INVITE_LINK_KEPT_SAYS}` : ''),
      },
    },
    { status: 201 }
  )
}
