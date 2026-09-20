import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { staffAddresses, tellStaff } from '@/lib/alerts'
import {
  AGREEMENT_VERSION, assignStaff, assignmentSays, checkAsk, queuePosition, queueSays,
} from '@/lib/census'

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

  // ── The automation row this act is owed, and does not get ──────────
  //
  // Every other act in this product writes an `AutomationLog` row. This
  // one cannot: `AutomationLog.companyId` is a required foreign key to
  // `Company`, and a census asked for by a firm that is not on the
  // platform has no company at all — the sandbox that will hold their
  // rows is created later, at import.
  //
  // The three ways out were each worse than the gap. Creating a company
  // from an unauthenticated form is a way to fill the database with
  // names somebody typed. Attaching it to a `Company` that happens to
  // share the domain would put "somebody here asked Etyme for a census"
  // into a tenant's own automation log, where anybody at that firm reads
  // it — and this is a private conversation with one person until they
  // decide otherwise. Writing it against a platform company would invent
  // a tenant that does not exist.
  //
  // So the record of this act is the `CensusRequest` row, which holds
  // everything the log row would have said — who asked, when, their
  // place in the line, who it was assigned to — and `CENSUS_REQUESTED`
  // stays in `PLANNED` in `lib/autonomy` rather than being claimed. The
  // fix is one word with etyme-architect: `companyId String?`.

  // The person who will run it hears now, not when somebody next looks
  // at a screen. `tellStaff` is a no-op on a deployment with no sender
  // configured and says which variable is missing.
  void tellStaff(
    `Census asked for: ${row.companyName}`,
    [
      `${row.contactName} (${row.workEmail}) at ${row.companyName} has asked for a contractor census.`,
      `Desk: ${ask.fields.desk}. Sending: ${ask.fields.option === 'TEMPLATE' ? 'the template' : 'their own files'}.` +
        (ask.fields.supplierCount != null ? ` They think they buy from ${ask.fields.supplierCount} suppliers.` : ''),
      `Place in the line: ${position}.`,
      assignmentSays(assigned),
      'Nothing has been sent yet. Their legal accepts the one-page agreement first, and the upload link is created at that moment.',
    ].join('\n\n')
  )

  return NextResponse.json({
    data: {
      id: row.id,
      queuePosition: position,
      queueSays: queueSays(position),
      assignedTo: assigned,
      assignedSays: assignmentSays(assigned),
      agreement: { version: AGREEMENT_VERSION, href: '/legal/census-agreement' },
      says:
        `Asked for. ${queueSays(position)} ` +
        'Nothing moves until somebody at your company accepts the one-page census ' +
        'agreement by name — the link you send files through is created at that moment ' +
        'and not before.',
    },
  })
}
