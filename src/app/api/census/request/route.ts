import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { staffAddresses } from '@/lib/alerts'
import {
  AGREEMENT_VERSION, assignStaff, assignedSaysToClient, assignmentSays, checkAsk,
  queuePosition, queueSays,
} from '@/lib/census'
import { censusArrivedStaffNotice, censusAskedNotice } from '@/lib/notify/census'
import {
  censusAgreementUrl, censusReviewUrl, sendCensusLetter, sendCensusStaffLetter,
} from '@/lib/data-request'

/**
 * POST /api/census/request — somebody at a client asks for a contractor
 * census, from a page with no login behind it.
 *
 * ── No account, and that is the point ────────────────────────────────
 *
 * The census is the first thing a client does with Etyme and it happens
 * before they are a customer. Making them sign up first would put the
 * thing they are least willing to do — create an account at a company
 * they had not heard of last week — in front of the thing they want.
 * So nothing here is authenticated, nothing is verified, and nothing
 * downstream may treat what is typed as though it were: the company
 * name does not match a `Company` and the address is not a `Person`.
 *
 * What *is* checked is that it is a work address. A census is a
 * company's own data about its own contractors, and the reply goes to a
 * desk. `lib/company-domains` already holds the list, so the same
 * answer decides this and decides who may found a company.
 *
 * ── Nothing automatic happens next ───────────────────────────────────
 *
 * This is not a form that opens a sequence. There is no list to be added
 * to; the named person at Etyme writes back by hand. That is a shipped
 * promise on the public ask form and the census keeps it
 * (`docs/census-brief.md`, correction 6).
 */

/** The four states where a census is still somebody's work. */
const OPEN = ['REQUESTED', 'AGREED', 'RECEIVED', 'IN_REVIEW']

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))

  const ask = checkAsk({
    companyName: body?.companyName,
    contactName: body?.contactName,
    workEmail: body?.workEmail,
    desk: body?.desk,
    supplierCount: typeof body?.supplierCount === 'number' ? body.supplierCount : null,
    option: body?.option,
  })
  if (!ask.ok || !ask.fields) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: ask.says } }, { status: 422 })
  }

  // Where they are in the line, at the moment they ask, counted once and
  // stored — so the number on their confirmation is the number they were
  // told rather than one that moves under them as others are finished.
  const open = await prisma.censusRequest.count({ where: { status: { in: OPEN } } })
  const position = queuePosition(open)

  // The named person. With `ETYME_STAFF_EMAILS` unset the row is still
  // written — a client who asked is a client who asked — and the review
  // screen says nobody is assigned rather than showing a name that is
  // not a person.
  const assigned = assignStaff(staffAddresses())

  const row = await prisma.censusRequest.create({
    data: {
      companyName: ask.fields.companyName,
      contactName: ask.fields.contactName,
      workEmail: ask.fields.workEmail,
      desk: ask.fields.desk,
      supplierCount: ask.fields.supplierCount,
      option: ask.fields.option,
      status: 'REQUESTED',
      queuePosition: position,
      assignedStaffEmail: assigned,
    },
    select: { id: true, companyName: true, contactName: true, workEmail: true, queuePosition: true },
  })

  // ── The automation row ─────────────────────────────────────────────
  //
  // `AutomationLog.companyId` was a required foreign key to `Company`
  // until 2026-09-20, and a census asked for by a firm that is not on
  // the platform has no company at all — the sandbox that will hold
  // their rows is created later, at import. Every way round it was
  // worse than the gap: creating a company from an unauthenticated form
  // fills the database with names somebody typed; attaching it to a
  // `Company` that happens to share the domain would put "somebody here
  // asked Etyme for a census" into a tenant's own log where anybody at
  // that firm reads it, and this is a private conversation with one
  // person until they decide otherwise.
  //
  // `companyId String?` landed, so the row is written against no
  // company — an act of the platform, before any tenant, which is what
  // a null company now means. Nothing about the client is in the
  // payload beyond what they typed on a form addressed to us.
  await prisma.automationLog.create({
    data: {
      companyId: null,
      action: 'CENSUS_REQUESTED',
      summary:
        `${row.contactName} at ${row.companyName} asked for a contractor census, ` +
        `${position === 1 ? 'first in the line' : `number ${position} in the line`}.`,
      reason:
        'Somebody at a client asked from a page with no login behind it. Nothing about them is ' +
        'verified at this point and nothing has been sent to us: the record exists because the ' +
        'census is a promise made in writing about a file they have not sent yet.',
      payload: {
        requestId: row.id,
        option: ask.fields.option,
        desk: ask.fields.desk,
        queuePosition: position,
        assignedStaffEmail: assigned,
      },
      // Nothing is held and nothing has been sent, so walking away costs
      // the client nothing — which is what reversible means here.
      reversible: true,
    },
  })

  // The person who will run it hears now, not when somebody next looks
  // at a screen. Both go out before the response: a census runs at a
  // handful a week, and an un-awaited promise in a serverless function
  // is a letter that may never leave.
  const staffLetter = censusArrivedStaffNotice({
    censusId: row.id,
    companyName: row.companyName,
    contact: { name: row.contactName, workEmail: row.workEmail },
    desk: ask.fields.desk,
    option: ask.fields.option,
    supplierCount: ask.fields.supplierCount,
    queuePosition: position,
    assignedTo: assigned,
    reviewUrl: censusReviewUrl(row.id),
  })
  // The staff sentence about an unassigned census names an environment
  // variable, which is ours to fix and not the client's to read. It goes
  // here and nowhere near the letter below.
  await sendCensusStaffLetter(
    {
      ...staffLetter,
      body: `${staffLetter.body}\n\n${assignmentSays(assigned)}`,
    },
    assigned
  )

  // The only thing the person who asked keeps. They close the tab and
  // the confirmation on the screen goes with it.
  const wrote = await sendCensusLetter(censusAskedNotice({
    contact: { name: row.contactName, workEmail: row.workEmail },
    companyName: row.companyName,
    assignedTo: assigned,
    option: ask.fields.option,
    queuePosition: position,
    agreementVersion: AGREEMENT_VERSION,
    agreementUrl: censusAgreementUrl(),
  }))

  return NextResponse.json({
    data: {
      id: row.id,
      queuePosition: position,
      queueSays: queueSays(position),
      assignedTo: assigned,
      // The client's sentence, never the staff one. `assignmentSays`
      // tells whoever can fix it to set ETYME_STAFF_EMAILS; a client
      // reading that learns about our configuration instead of about
      // the promise, and the page had to withhold the sentence
      // altogether to avoid it.
      assignedSays: assignedSaysToClient(assigned),
      agreement: { version: AGREEMENT_VERSION, href: '/legal/census-agreement' },
      // What was written to them, so the screen can say "we have emailed
      // dana@…" rather than leaving them to wonder.
      wrote: { to: wrote.to, subject: wrote.subject, sent: wrote.sent },
      says:
        `Asked for. ${queueSays(position)} ` +
        'Nothing moves until somebody at your company accepts the one-page census ' +
        'agreement by name — the link you send files through is created at that moment ' +
        'and not before.',
    },
  })
}
