import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { whoHasMe, endHold } from '@/lib/holds'
import { clientLabel } from '@/lib/openings'
import { notify } from '@/lib/notify'
import { emit } from '@/lib/events'

/**
 * GET   /api/me/benches — who has me, what have they done with me
 * PATCH /api/me/benches — my terms: ask first, do not send me there, let go
 *
 * The view that does not exist anywhere in this industry.
 *
 * A consultant is on ten benches. They currently have no way to know how
 * many times they have been submitted, to whom, or by which agency. They
 * find out when a client's recruiter says "we already have your CV from
 * somebody else" — by which point the role is gone and nobody will say
 * why.
 *
 * Authenticated by session rather than by company context, deliberately.
 * This is the one read in the system that is not filtered by a company,
 * because it is the person's own data and every agency in it is a
 * counterparty rather than an owner.
 */

async function me() {
  const email = await getSessionEmail()
  if (!email) return null
  return prisma.person.findUnique({
    where: { primaryEmail: email },
    select: { id: true, name: true },
  })
}

const unauthenticated = NextResponse.json(
  { error: { code: 'UNAUTHORIZED', message: 'Not signed in' } },
  { status: 401 }
)

export async function GET(_request: NextRequest) {
  const person = await me()
  if (!person) return unauthenticated

  const data = await whoHasMe(person.id)

  return NextResponse.json({
    data: {
      ...data,
      note:
        data.benches.length === 0
          ? 'No agency is marketing you. A bench listing is your permission, and it is yours to give and to take back.'
          : `${data.benches.length} ${data.benches.length === 1 ? 'agency markets' : 'agencies market'} you. They cannot see each other, and none of them can see this page.`,
    },
  })
}

export async function PATCH(request: NextRequest) {
  const person = await me()
  if (!person) return unauthenticated

  const body = await request.json().catch(() => ({}))

  // ── Ask me before you send me anywhere new ─────────────────────────
  if (typeof body.listingId === 'string' && typeof body.askFirst === 'boolean') {
    const listing = await prisma.benchListing.findFirst({
      where: { id: body.listingId, consultant: { personId: person.id }, revokedAt: null },
      select: { id: true, company: { select: { name: true } } },
    })
    if (!listing) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'That is not one of your listings.' } },
        { status: 404 }
      )
    }

    await prisma.benchListing.update({
      where: { id: listing.id },
      data: { askFirst: body.askFirst },
    })

    return NextResponse.json({
      data: {
        listingId: listing.id,
        askFirst: body.askFirst,
        message: body.askFirst
          ? `${listing.company.name} must now ask you before putting you in front of a client they have not sent you to before.`
          : `${listing.company.name} can put you forward without asking. You are still told every time.`,
      },
    })
  }

  // ── Do not send me there ───────────────────────────────────────────
  if (typeof body.doNotSubmitTo === 'string') {
    const company = await prisma.company.findUnique({
      where: { id: body.doNotSubmitTo },
      select: { id: true, name: true },
    })
    if (!company) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No company by that id.' } },
        { status: 404 }
      )
    }

    await prisma.doNotSubmit.upsert({
      where: { personId_companyId: { personId: person.id, companyId: company.id } },
      create: {
        personId: person.id,
        companyId: company.id,
        note: typeof body.note === 'string' ? body.note.slice(0, 500) : null,
      },
      update: { note: typeof body.note === 'string' ? body.note.slice(0, 500) : null },
    })

    return NextResponse.json({
      data: {
        message: `No agency can submit you to ${company.name}. None of them is told why, or by whom.`,
      },
    })
  }

  if (typeof body.allowAgain === 'string') {
    const removed = await prisma.doNotSubmit.deleteMany({
      where: { id: body.allowAgain, personId: person.id },
    })
    if (removed.count === 0) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Not on your list.' } },
        { status: 404 }
      )
    }
    return NextResponse.json({ data: { message: 'Taken off your list.' } })
  }

  // ── Let go of a hold somebody is sitting on ────────────────────────
  if (typeof body.releaseHold === 'string') {
    const hold = await prisma.representation.findFirst({
      where: { id: body.releaseHold, personId: person.id, state: 'HELD' },
      select: {
        id: true,
        companyId: true,
        company: { select: { name: true } },
        clientCompany: { select: { name: true } },
        opening: { select: { inferredClient: true } },
      },
    })
    if (!hold) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No live hold of yours by that id.' } },
        { status: 404 }
      )
    }

    // Their career, so no cool-off and no permission needed. A vendor who
    // submitted somebody a month ago and has said nothing since does not
    // get to keep them off the market at that client.
    // Most demand is blind, so the client often has no name to print.
    const heldAt = clientLabel({
      clientName: hold.clientCompany?.name,
      inferredClient: hold.opening?.inferredClient,
    })

    await endHold(hold.id, 'They asked for it back.', 'PERSON')

    void emit({
      type: 'representation.released',
      companyId: hold.companyId,
      subjectType: 'Representation',
      subjectId: hold.id,
      actorPersonId: person.id,
      payload: { personId: person.id, by: 'PERSON' },
    })

    // The vendor is told plainly, and not told why. They need to stop
    // chasing; they do not need an argument with the person about it.
    const recruiters = await prisma.context.findMany({
      where: {
        companyId: hold.companyId,
        revokedAt: null,
        role: { permissions: { hasSome: ['submissions.create'] } },
      },
      select: { personId: true },
      take: 5,
    })

    for (const r of recruiters) {
      void notify({
        personId: r.personId,
        companyId: hold.companyId,
        type: 'SUBMISSION',
        title: `${person.name} is no longer held at ${heldAt}`,
        body: `${person.name} took back your representation at ${heldAt}. Another agency can put them forward there now.`,
        entityId: hold.id,
      })
    }

    return NextResponse.json({
      data: {
        message: `${hold.company.name} no longer represents you at ${heldAt}. They have been told, without a reason.`,
      },
    })
  }

  // ── Answer somebody who asked ──────────────────────────────────────
  if (typeof body.answer === 'string' && (body.yes === true || body.yes === false)) {
    const asked = await prisma.representation.findFirst({
      where: { id: body.answer, personId: person.id, state: 'REQUESTED' },
      select: {
        id: true, companyId: true, clientCompanyId: true,
        company: { select: { name: true } },
        clientCompany: { select: { name: true } },
        opening: { select: { inferredClient: true } },
      },
    })
    if (!asked) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Nobody is waiting on that answer.' } },
        { status: 404 }
      )
    }

    const askedAbout = clientLabel({
      clientName: asked.clientCompany?.name,
      inferredClient: asked.opening?.inferredClient,
    })

    if (!body.yes) {
      await prisma.representation.update({
        where: { id: asked.id },
        data: {
          state: 'DECLINED',
          endedAt: new Date(),
          endedBy: 'PERSON',
          endedReason: 'They said no.',
          holdKey: null,
        },
      })
    } else {
      // Saying yes is what turns the question into a hold, and it is the
      // person who takes it rather than the vendor.
      await prisma.representation.update({
        where: { id: asked.id },
        data: { state: 'HELD', takenAt: new Date(), holdKey: asked.clientCompanyId },
      })
    }

    const recruiters = await prisma.context.findMany({
      where: {
        companyId: asked.companyId,
        revokedAt: null,
        role: { permissions: { hasSome: ['submissions.create'] } },
      },
      select: { personId: true },
      take: 5,
    })

    for (const r of recruiters) {
      void notify({
        personId: r.personId,
        companyId: asked.companyId,
        type: 'SUBMISSION',
        title: body.yes
          ? `${person.name} said yes to ${askedAbout}`
          : `${person.name} said no to ${askedAbout}`,
        body: body.yes
          ? `You can submit ${person.name} to ${askedAbout} now. You represent them there for the next 30 days.`
          : `${person.name} does not want to be put forward to ${askedAbout}.`,
        entityId: asked.id,
      })
    }

    return NextResponse.json({
      data: {
        message: body.yes
          ? `${asked.company.name} can put you forward to ${askedAbout}.`
          : `${asked.company.name} has been told no. No reason was given.`,
      },
    })
  }

  // ── Take a bench listing back ──────────────────────────────────────
  if (typeof body.revokeListing === 'string') {
    const listing = await prisma.benchListing.findFirst({
      where: { id: body.revokeListing, consultant: { personId: person.id }, revokedAt: null },
      select: { id: true, companyId: true, company: { select: { name: true } } },
    })
    if (!listing) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'That is not one of your listings.' } },
        { status: 404 }
      )
    }

    await prisma.benchListing.update({
      where: { id: listing.id },
      data: { revokedAt: new Date() },
    })

    // Holds go with it. A revoked listing that left live holds standing
    // would let an agency they have just left keep them out of clients.
    const holds = await prisma.representation.findMany({
      where: { personId: person.id, companyId: listing.companyId, state: 'HELD' },
      select: { id: true },
    })
    for (const h of holds) {
      await endHold(h.id, 'The listing behind it was taken back.', 'PERSON')
    }

    return NextResponse.json({
      data: {
        message: `${listing.company.name} can no longer market you.${holds.length > 0 ? ` ${holds.length} ${holds.length === 1 ? 'hold' : 'holds'} went back with it.` : ''}`,
      },
    })
  }

  return NextResponse.json(
    { error: { code: 'VALIDATION', message: 'Nothing to change' } },
    { status: 422 }
  )
}
