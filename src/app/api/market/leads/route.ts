import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionEmail } from '@/lib/api-context'
import {
  problems,
  looksScripted,
  secondAsk,
  normalEmail,
  tidy,
  isSource,
  mayReadTheList,
  stillWaiting,
  conversion,
  ASK_COPY,
  type OnFile,
} from '@/lib/public-site/leads'

/**
 * Who wrote to us, and what they asked for.
 *
 * ── POST is open, and that is the point ──────────────────────────────
 *
 * A landing page that asks somebody to create an account before they can
 * ask a question is a landing page that never hears the question. So the
 * POST takes no authentication and the guard is shaped rather than
 * counted: a field only a script can see, and a clock that says whether
 * the form was ever on screen.
 *
 * Not a rate limit keyed on an IP address. An office of forty shares
 * one, so refusing it refuses thirty-nine people who did nothing, and
 * anybody scripting this at volume has a proxy pool. The unique index on
 * email does the rest of the work: a burst carrying one address updates
 * one row.
 *
 * ── The reply says the same thing either way ─────────────────────────
 *
 * Whether or not the address is already on file, the answer is the same
 * sentence. Saying "you have written before" turns this into a way to
 * find out who has been talking to us, one address at a time.
 *
 * ── GET is ours ──────────────────────────────────────────────────────
 *
 * Every other list in this product belongs to the company reading it.
 * This one belongs to Etyme, so it is gated on being us — not on a
 * permission, because no tenant role should ever be able to grant it.
 */

/** Us. Anybody else gets a refusal with the reason. */
function staff() {
  return {
    domains: ['etyme.com'],
    emails: (process.env.ETYME_STAFF_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { error: { code: 'BAD_BODY', message: 'Nothing readable arrived.' } },
      { status: 400 }
    )
  }

  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '')

  // ── A script, before anything is validated ────────────────────────
  //
  // Checked first so a bot never learns which fields the form cares
  // about from the shape of the error it gets back.
  const scripted = looksScripted({
    honeypot: str('company_website'),
    filledInMs: typeof body.filledInMs === 'number' ? body.filledInMs : null,
  })
  if (scripted.scripted) {
    return NextResponse.json(
      { error: { code: 'SCRIPTED', message: scripted.says } },
      { status: 400 }
    )
  }

  const source = str('source') || 'HOME_PAGE'
  const input = {
    email: str('email'),
    name: tidy(str('name')),
    companyName: tidy(str('companyName')),
    source,
    asked: tidy(str('asked')),
  }

  // A source we do not recognise is refused rather than filed as other.
  // There is no value in the enum for a list somebody bought, and this
  // endpoint is the obvious place somebody would try to put one.
  const found = problems(input)
  if (found.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'ASK_NOT_SENT',
          message: found[0].says,
          fields: found.map((p) => ({ field: p.field, says: p.says })),
        },
      },
      { status: 400 }
    )
  }

  const email = normalEmail(input.email)!
  const now = new Date()

  const existing = await prisma.marketingLead.findUnique({
    where: { email },
    select: { id: true, email: true, asked: true, consentAt: true, convertedAt: true },
  })

  const verdict = secondAsk(input, existing as OnFile | null, now)

  await prisma.marketingLead.upsert({
    where: { email },
    create: {
      email,
      name: input.name,
      companyName: input.companyName,
      source: isSource(source) ? source : 'HOME_PAGE',
      asked: verdict.asked,
      consentAt: verdict.consentAt,
    },
    update: {
      // What they typed this time wins where they typed something, and
      // an empty box never wipes what was already there.
      name: input.name ?? undefined,
      companyName: input.companyName ?? undefined,
      asked: verdict.asked,
    },
  })

  return NextResponse.json({ data: { says: ASK_COPY.thanks } })
}

/**
 * They became a customer — stop courting them.
 *
 * PATCH { email, companyId } marks the lead converted. Staff only, same
 * gate as the read.
 *
 * This is the manual half. The automatic half — marking the lead the
 * moment their company is created — belongs in the company-creation
 * route, which is the platform's file and not this domain's. Until
 * somebody makes that call, `convertedCompanyId` is only ever written
 * from here, and that is worth saying out loud rather than reporting
 * conversion as done.
 */
export async function PATCH(request: NextRequest) {
  const sessionEmail = await getSessionEmail()
  const allowed = mayReadTheList(sessionEmail, staff())
  if (!allowed.ok) {
    return NextResponse.json(
      { error: { code: sessionEmail ? 'NOT_YOURS' : 'UNAUTHORIZED', message: allowed.says } },
      { status: sessionEmail ? 403 : 401 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { error: { code: 'BAD_BODY', message: 'Nothing readable arrived.' } },
      { status: 400 }
    )
  }

  const email = normalEmail(typeof body.email === 'string' ? body.email : '')
  const companyId = typeof body.companyId === 'string' ? body.companyId.trim() : ''

  if (!email || !companyId) {
    return NextResponse.json(
      {
        error: {
          code: 'NEEDS_BOTH',
          message: 'Which lead, and which company they became. Both, or the row says nothing.',
        },
      },
      { status: 400 }
    )
  }

  const lead = await prisma.marketingLead.findUnique({
    where: { email },
    select: { id: true, email: true, consentAt: true, convertedAt: true, convertedCompanyId: true },
  })

  if (!lead) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Nobody on file at ${email}.` } },
      { status: 404 }
    )
  }

  const verdict = conversion(lead as OnFile, companyId, new Date())

  if (verdict.update) {
    await prisma.marketingLead.update({ where: { email }, data: verdict.update })
  }

  return NextResponse.json({ data: { says: verdict.says, changed: verdict.update !== null } })
}

export async function GET() {
  const email = await getSessionEmail()
  const verdict = mayReadTheList(email, staff())

  if (!verdict.ok) {
    return NextResponse.json(
      { error: { code: email ? 'NOT_YOURS' : 'UNAUTHORIZED', message: verdict.says } },
      { status: email ? 403 : 401 }
    )
  }

  const rows = await prisma.marketingLead.findMany({
    select: {
      id: true, email: true, name: true, companyName: true, source: true,
      asked: true, consentAt: true, convertedCompanyId: true, convertedAt: true,
    },
    orderBy: { consentAt: 'desc' },
    take: 500,
  })

  const waiting = stillWaiting(rows as OnFile[])

  return NextResponse.json({
    data: {
      // Everybody, newest first, for reading.
      leads: rows,
      // And the queue that matters: who asked, has not become a
      // customer, longest wait first. A list sorted by arrival buries
      // the person who has been waiting three weeks.
      waiting: waiting.map((l) => ({
        id: l.id,
        email: l.email,
        name: l.name ?? null,
        companyName: l.companyName ?? null,
        asked: l.asked ?? null,
        consentAt: l.consentAt,
      })),
      counts: { total: rows.length, waiting: waiting.length },
    },
  })
}
