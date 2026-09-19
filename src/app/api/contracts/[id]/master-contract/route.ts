import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { mayTag, type MasterContractRef } from '@/lib/money/master-contract'
import { MASTER_CONTRACT_WORD } from '@/lib/order-naming'

/**
 * POST /api/contracts/:id/master-contract
 *
 * Move a line onto a master contract, or off one.
 *
 * `{ "masterContractId": "prj-7" }` tags it; `{ "masterContractId": null }`
 * takes it off and lets it group with its engagement again, which is
 * what `orderFor` does for every untagged line.
 *
 * The id may be a sell line or a buy line — both carry `projectOrderId`
 * and both post into the roll-up, which is the whole point of it: the
 * deal's margin is the sell side less the buy side.
 *
 * ── What this does not do ────────────────────────────────────────────
 *
 * It does not move what has already posted. Every `OrderPosting` carries
 * its own `projectOrderId` and the rate it was converted at, and moving
 * those would restate a period somebody has already reported. The reply
 * says so in a sentence rather than leaving a person to find out from a
 * total that did not change.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, `${MASTER_CONTRACT_WORD.Noun}s`)
  if (notStaff) return notStaff

  if (!caller.company) {
    return NextResponse.json(
      {
        error: {
          code: 'NO_COMPANY',
          message: `A ${MASTER_CONTRACT_WORD.noun} groups one company's own lines, and your seat is not at one.`,
        },
      },
      { status: 403 }
    )
  }

  if (!hasPermission(caller.permissions, 'assignments.write')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            `Moving a line onto a ${MASTER_CONTRACT_WORD.noun} needs the assignments.write ` +
            `permission. Ask whoever runs your company's access.`,
        },
      },
      { status: 403 }
    )
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}) as Record<string, unknown>)
  const wanted =
    typeof body.masterContractId === 'string' && body.masterContractId.trim()
      ? body.masterContractId.trim()
      : null

  const companyId = caller.company.id

  // Either side of the trade. A sell line first because that is what a
  // placement is, then the buy line that funds it.
  const sell = await prisma.sellContract.findUnique({
    where: { id },
    select: {
      id: true, companyId: true, billCurrency: true, projectOrderId: true,
      person: { select: { name: true } },
      engagement: { select: { title: true } },
    },
  })
  const buy = sell
    ? null
    : await prisma.buyContract.findUnique({
        where: { id },
        select: {
          id: true, companyId: true, payCurrency: true, projectOrderId: true,
          candidates: { select: { person: { select: { name: true } } }, take: 1 },
        },
      })

  const line = sell
    ? { id: sell.id, companyId: sell.companyId, currency: sell.billCurrency, projectOrderId: sell.projectOrderId }
    : buy
      ? { id: buy.id, companyId: buy.companyId, currency: buy.payCurrency, projectOrderId: buy.projectOrderId }
      : null

  const master = wanted
    ? await prisma.projectOrder.findUnique({
        where: { id: wanted },
        select: { id: true, code: true, name: true, status: true, currency: true, companyId: true },
      })
    : null

  const verdict = mayTag({
    by: { companyId },
    line,
    master: master as MasterContractRef | null,
    masterMissing: Boolean(wanted) && master == null,
  })

  if (!verdict.ok) {
    const status =
      verdict.code === 'NO_SUCH_LINE' || verdict.code === 'NO_SUCH_MASTER'
        ? 404
        : verdict.code === 'MASTER_CLOSED'
          ? 409
          : 403
    return NextResponse.json(
      { error: { code: verdict.code, message: verdict.says } },
      { status }
    )
  }

  const personName = sell?.person.name ?? buy?.candidates[0]?.person.name ?? 'This line'

  if (sell) {
    await prisma.sellContract.update({
      where: { id: sell.id },
      data: { projectOrderId: master?.id ?? null },
    })
  } else {
    await prisma.buyContract.update({
      where: { id: buy!.id },
      data: { projectOrderId: master?.id ?? null },
    })
  }

  // ── Not logged yet, and said out loud rather than left to be found ──
  //
  // A tag is a person's own bookkeeping choice about their own line, and
  // the row it deserves is an ATTRIBUTED one — `MASTER_CONTRACT_TAGGED`
  // and `MASTER_CONTRACT_UNTAGGED`, basis RULE. Every action written to
  // `AutomationLog` must have a place in `lib/autonomy.ts`, which is the
  // architect's file, and a domain does not add a name to it any more
  // than it adds a column to the schema. Requested; until it lands, the
  // trail is the postings themselves, each of which says which roll-up
  // it settled into and when, and the line's own `updatedAt`. What is
  // missing is WHO moved it.

  return NextResponse.json({
    data: {
      masterContract: master
        ? { id: master.id, code: master.code, name: master.name, currency: master.currency }
        : null,
      /** Whose line moved, for the sentence on the screen. */
      line: { id: line!.id, side: sell ? 'SELL' : 'BUY', personName },
      message: `${personName}: ${verdict.says.charAt(0).toLowerCase()}${verdict.says.slice(1)}`,
      note: verdict.note,
    },
  })
}
