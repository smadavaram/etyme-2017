import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { reportError } from '@/lib/alerts'
import { respond } from './ask'
import { readersFor } from './read'

/**
 * POST /api/conversations/twin   { text, companyId? }
 *
 * The twin's conversation, Door 2: one message in, one answer out, for
 * the signed-in seat. Rules first — what needs me, why, approve, reject,
 * invoice variance by supplier — answered from the ledger by plain code
 * (`respond` in ./ask); anything else goes to the model over the ledger
 * lines the seat may read, and only where a key is configured.
 *
 * This route writes nothing. An approve or a reject comes back as a
 * confirm card, and the panel sends the person's yes or no to
 * POST /api/twin/approvals/:id, the one door the web and Teams share.
 *
 * `companyId` is the company whose twin is asked, the reader's own by
 * default; a supplier reads another company's twin only through the
 * ledger's own scope.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'The twin answers a company seat. Choose one first.' } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const text = typeof body.text === 'string' ? body.text.slice(0, 2000) : ''
  const companyId = typeof body.companyId === 'string' && body.companyId ? body.companyId : caller.company.id

  try {
    const answer = await respond(text, readersFor(caller, companyId), { env: process.env })
    return NextResponse.json({ data: { answer } })
  } catch (err) {
    await reportError('The twin’s conversation could not answer', err, { path: '/api/conversations/twin', personId: caller.person.id, companyId: caller.company.id })
    return NextResponse.json(
      { error: { code: 'NOT_ANSWERED', message: 'The twin could not read the ledger just now, so there is no answer. Staff have been told; try again in a minute.' } },
      { status: 500 }
    )
  }
}
