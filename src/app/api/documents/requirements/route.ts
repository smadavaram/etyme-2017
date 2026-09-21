import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, type CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { seatFor, seatTrail, type LiveSeat } from '@/lib/program-seat'
import {
  requirementsFor,
  mayWaive,
  CANNOT_BE_WAIVED,
  type OwedBy,
} from '@/lib/document-requirements'
import { labelFor } from '@/lib/document-type'

/**
 * What this order asks for on paper, and who may change it.
 *
 * "Ensure the loop of documents never cracks between parties."
 * — the founder, 2026-09-21.
 *
 * The set a line requires now lives on the record rather than in three
 * desks' hardcoded lists, and this is the door a person changes it
 * through: a client adds the induction its own plant needs, marks a
 * document optional, or waives one on a single line with a reason in
 * their own words.
 *
 * ── Whose set it is ──────────────────────────────────────────────────
 *
 * The buyer's. An order carries the rules of whoever raised it, so the
 * client that issued the purchase order is the party that may change
 * what it asks for — or a program office sitting in a desk that client
 * granted, acting under the client's own rules with the read logged.
 * A supplier may not edit what its customer requires of it, and the
 * refusal says so in those words rather than as a code.
 *
 * ── What may never be waived ─────────────────────────────────────────
 *
 * Work authorization. Addendum E: BLOCK where legally grounded, WARN and
 * capture a reason everywhere else. A waiver against an I-9 is refused
 * here rather than written and quietly ignored — a row that records a
 * decision nobody honors is worse than the refusal, because somebody
 * reads it as permission.
 */

// ── Who may act ───────────────────────────────────────────────────────

/**
 * The desks that may change what an order asks for.
 *
 * `governance.write` is the program manager's, and it is the right
 * permission — this is the client's own rulebook. `privacy.manage` is
 * here because at a client it names exactly one desk, the compliance
 * officer, and the founder named that desk beside the program manager.
 * A permission of its own for the document set would be cleaner and is
 * `etyme-architect`'s to add; naming two that already exist is honest
 * about which desks hold it today.
 */
const MAY_CHANGE = ['governance.write', 'privacy.manage'] as const

interface Target {
  kind: 'ORDER' | 'SELL' | 'BUY'
  id: string
  /** The firm whose rules these are — the buyer on this document. */
  buyerCompanyId: string
  buyerName: string
  /** How the thing being changed is named in a sentence. */
  says: string
}

async function targetOf(body: {
  workOrderId?: string
  sellContractId?: string
  buyContractId?: string
}): Promise<Target | null> {
  if (body.workOrderId) {
    const order = await prisma.workOrder.findUnique({
      where: { id: body.workOrderId },
      select: { id: true, number: true, issuedById: true, issuedBy: { select: { name: true } } },
    })
    if (!order) return null
    return {
      kind: 'ORDER',
      id: order.id,
      buyerCompanyId: order.issuedById,
      buyerName: order.issuedBy.name,
      says: `${order.issuedBy.name}’s order ${order.number}`,
    }
  }
  if (body.sellContractId) {
    const line = await prisma.sellContract.findUnique({
      where: { id: body.sellContractId },
      select: {
        id: true,
        clientCompanyId: true,
        clientCompany: { select: { name: true } },
        person: { select: { name: true } },
      },
    })
    if (!line || !line.clientCompanyId) return null
    return {
      kind: 'SELL',
      id: line.id,
      buyerCompanyId: line.clientCompanyId,
      buyerName: line.clientCompany?.name ?? 'the client',
      says: `the line for ${line.person?.name ?? 'this placement'}`,
    }
  }
  if (body.buyContractId) {
    const line = await prisma.buyContract.findUnique({
      where: { id: body.buyContractId },
      select: {
        id: true,
        companyId: true,
        company: { select: { name: true } },
        vendorCompany: { select: { name: true } },
      },
    })
    if (!line) return null
    return {
      kind: 'BUY',
      id: line.id,
      buyerCompanyId: line.companyId,
      buyerName: line.company?.name ?? 'the buyer',
      says: `the line paying ${line.vendorCompany?.name ?? 'this party'}`,
    }
  }
  return null
}

type Standing =
  | { ok: true; seat: LiveSeat | null }
  | { ok: false; response: NextResponse }

function refuse(message: string, status = 403, code = 'FORBIDDEN'): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status })
}

/**
 * Whether this caller may change this document's set, and what to say
 * where they may not.
 *
 * Two legitimate callers and no third: the buyer itself, and a program
 * office in a seat that buyer granted. A supplier reading this route
 * about its own customer's order is told whose rules these are rather
 * than given a code.
 */
async function standingOn(caller: CallerContext, target: Target, write: boolean): Promise<Standing> {
  const mine = caller.company?.id === target.buyerCompanyId
  if (mine) {
    if (!write) return { ok: true, seat: null }
    const may = MAY_CHANGE.some((p) => hasPermission(caller.permissions ?? [], p))
    if (!may) {
      return {
        ok: false,
        response: refuse(
          `Changing what ${target.says} asks for is the program manager’s or the compliance officer’s to do here. ` +
            `Ask one of them, or have an owner widen your desk.`
        ),
      }
    }
    return { ok: true, seat: null }
  }

  const seat = await seatFor(caller, target.buyerCompanyId)
  if (!seat) {
    return {
      ok: false,
      response: refuse(
        `What ${target.says} asks for is ${target.buyerName}’s own rulebook, and this is not ${target.buyerName}. ` +
          `A firm supplying against an order cannot change what that order requires of it. ` +
          `If you run this program for ${target.buyerName}, ask them for a seat at the desk that does.`
      ),
    }
  }
  const may = MAY_CHANGE.some((p) => hasPermission(seat.role.permissions, p))
  if (write && !may) {
    return {
      ok: false,
      response: refuse(
        `${target.buyerName} seated ${seat.officeCompany.name} at its ${seat.role.name} desk, and that desk does not ` +
          `change what an order asks for. What a program office may do is exactly what the desk it was given may do.`
      ),
    }
  }
  return { ok: true, seat }
}

// ── Reading the set ───────────────────────────────────────────────────

/**
 * GET /api/documents/requirements?sellContractId=… | buyContractId=…
 *
 * Every item this line requires, where each came from, who owes it, and
 * what any waiver on it said. The same answer the refusal at activation
 * is built from — one door, so a screen and a gate cannot disagree.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const q = request.nextUrl.searchParams
  const sellContractId = q.get('sellContractId') ?? undefined
  const buyContractId = q.get('buyContractId') ?? undefined
  if (!sellContractId && !buyContractId) {
    return refuse(
      'Name the line whose paperwork you are asking about — a sell line or a buy line, not both.',
      400,
      'NO_LINE'
    )
  }

  const target = await targetOf({ sellContractId, buyContractId })
  if (!target) return refuse('There is no line with that id.', 404, 'NOT_FOUND')

  // A supplier reads what its customer requires of it — it has to, or it
  // cannot comply. Only changing it is the buyer's.
  const isParty = await partyTo(caller, target)
  if (!isParty.ok) return isParty.response

  const set = await requirementsFor(
    sellContractId ? { sellContractId } : { buyContractId: buyContractId! }
  )
  if (!set) return refuse('There is no line with that id.', 404, 'NOT_FOUND')

  return NextResponse.json({ data: set })
}

/** Reading is wider than writing: both sides of a line may read its set. */
async function partyTo(caller: CallerContext, target: Target): Promise<Standing> {
  const standing = await standingOn(caller, target, false)
  if (standing.ok) return standing

  const companyId = caller.company?.id
  if (!companyId) return standing

  const onIt =
    target.kind === 'SELL'
      ? await prisma.sellContract.count({ where: { id: target.id, companyId } })
      : target.kind === 'BUY'
        ? await prisma.buyContract.count({ where: { id: target.id, vendorCompanyId: companyId } })
        : await prisma.workOrder.count({ where: { id: target.id, issuedToId: companyId } })
  if (onIt > 0) return { ok: true, seat: null }
  return standing
}

// ── Writing the set ───────────────────────────────────────────────────

interface WriteBody {
  workOrderId?: string
  sellContractId?: string
  buyContractId?: string
  documentTypeKey?: string
  required?: boolean
  owedBy?: string
  blocks?: boolean | null
  note?: string | null
  /** Set to waive the item, in the words of whoever decided it. */
  waivedReason?: string | null
  /** Set to take the item off this line entirely. */
  remove?: boolean
}

/**
 * POST /api/documents/requirements — ask for one more document, or stop
 * asking for one.
 *
 * Idempotent on the pair: one row per type per owner, so asking twice
 * changes the same row rather than writing two answers to one question.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const body = (await request.json().catch(() => ({}))) as WriteBody

  const target = await targetOf(body)
  if (!target) {
    return refuse(
      'Name what this applies to: an order, or one line on it. An item belongs to exactly one of them.',
      400,
      'NO_TARGET'
    )
  }

  const key = (body.documentTypeKey ?? '').trim()
  if (!key) {
    return refuse('Say which document. Every item on a set names a type.', 400, 'NO_TYPE')
  }

  const standing = await standingOn(caller, target, true)
  if (!standing.ok) return standing.response

  const label = labelFor(key, await dictionary(target.buyerCompanyId))
  const where =
    target.kind === 'ORDER'
      ? { workOrderId_documentTypeKey: { workOrderId: target.id, documentTypeKey: key } }
      : target.kind === 'SELL'
        ? { sellContractId_documentTypeKey: { sellContractId: target.id, documentTypeKey: key } }
        : { buyContractId_documentTypeKey: { buyContractId: target.id, documentTypeKey: key } }
  const owner =
    target.kind === 'ORDER'
      ? { workOrderId: target.id }
      : target.kind === 'SELL'
        ? { sellContractId: target.id }
        : { buyContractId: target.id }

  // ── Taking it off ──
  if (body.remove) {
    if (CANNOT_BE_WAIVED.includes(key)) {
      return refuse(
        `${label} cannot be taken off a line. Nobody may agree to work without authorization, however ` +
          `urgent the start is. Get it on file, then activate.`,
        422,
        'CANNOT_BE_WAIVED'
      )
    }
    const reason = (body.waivedReason ?? body.note ?? '').trim()
    if (!reason) {
      return refuse(
        `Say why ${target.says} no longer needs ${label}. The reason goes on the record with your name, ` +
          `and whoever audits this will read it.`,
        422,
        'NO_REASON'
      )
    }
    const existing = await prisma.documentRequirement.findUnique({ where: where as never, select: { id: true } })
    if (existing) await prisma.documentRequirement.delete({ where: { id: existing.id } })
    await record(true, {
      caller,
      target,
      seat: standing.seat,
      summary: `${label} is no longer asked for on ${target.says}`,
      reason,
      key,
    })
    return NextResponse.json({
      data: {
        removed: true,
        says: `${label} is no longer asked for on ${target.says}. Your reason is on the record with your name.`,
      },
    })
  }

  // ── Waiving it ──
  const waiving = typeof body.waivedReason === 'string' && body.waivedReason.trim().length > 0
  if (waiving) {
    const verdict = mayWaive(key, body.waivedReason!, (k) => labelFor(k))
    if (!verdict.ok) return refuse(verdict.says, 422, 'CANNOT_BE_WAIVED')
  }

  const owedBy = (body.owedBy && ['WORKER', 'SUPPLIER', 'CUSTOMER', 'US'].includes(body.owedBy)
    ? body.owedBy
    : await inferOwedBy(target, key)) as OwedBy

  const row = await prisma.documentRequirement.upsert({
    where: where as never,
    create: {
      ...owner,
      documentTypeKey: key,
      required: body.required ?? true,
      owedBy,
      blocks: body.blocks ?? null,
      note: body.note ?? null,
      ...(waiving
        ? { waivedReason: body.waivedReason!.trim(), waivedById: caller.person.id, waivedAt: new Date() }
        : {}),
    },
    update: {
      ...(body.required === undefined ? {} : { required: body.required }),
      ...(body.blocks === undefined ? {} : { blocks: body.blocks }),
      ...(body.note === undefined ? {} : { note: body.note }),
      ...(body.owedBy ? { owedBy } : {}),
      ...(waiving
        ? { waivedReason: body.waivedReason!.trim(), waivedById: caller.person.id, waivedAt: new Date() }
        : {}),
    },
    select: { id: true },
  })

  await record(waiving, {
    caller,
    target,
    seat: standing.seat,
    summary: waiving
      ? `${label} waived on ${target.says}`
      : `${target.says} asks for ${label}`,
    reason: waiving
      ? body.waivedReason!.trim()
      : (body.note?.trim() ||
        `${target.buyerName} decided ${target.says} needs ${label}. Every start under it asks for it from now on.`),
    key,
    requirementId: row.id,
  })

  return NextResponse.json({
    data: {
      id: row.id,
      says: waiving
        ? `${label} is waived on ${target.says}, with your reason and your name on the record. It stays on the ` +
          `checklist, marked waived, rather than disappearing from it.`
        : `${target.says} now asks for ${label}. The next start under it asks for it.`,
    },
  })
}

/** PATCH is POST: one row per type per owner, changed in place. */
export const PATCH = POST

// ── Bookkeeping ───────────────────────────────────────────────────────

async function dictionary(companyId: string) {
  return prisma.documentType
    .findMany({ where: { companyId } })
    .catch(() => [])
}

/**
 * Which party owes a document nobody said anything about.
 *
 * Read off the line's own effective set where it already names one —
 * `lib/document-requirements` decides this from the type's `suppliedBy`
 * and the shape of the line, and guessing differently here would give
 * one document two owners.
 */
async function inferOwedBy(target: Target, key: string): Promise<OwedBy> {
  if (target.kind === 'ORDER') {
    // An order has no shape of its own. The dictionary's answer is the
    // honest one, and the caller may say otherwise.
    const set = await prisma.sellContract.findFirst({
      where: { workOrderId: target.id },
      select: { id: true },
    })
    if (set) {
      const items = await requirementsFor({ sellContractId: set.id })
      const found = items?.items.find((i) => i.key === key)
      if (found) return found.owedBy
    }
    return 'SUPPLIER'
  }
  const items = await requirementsFor(
    target.kind === 'SELL' ? { sellContractId: target.id } : { buyContractId: target.id }
  )
  return items?.items.find((i) => i.key === key)?.owedBy ?? 'SUPPLIER'
}

/**
 * Every change to a set is on the record, with a name and a reason.
 *
 * Under a seat the row says which firm acted, at which of the client's
 * desks, so "the program office waived it" is answerable rather than
 * anonymous.
 */
async function record(
  /** True where somebody decided this line does not need the document. */
  waived: boolean,
  input: {
    caller: CallerContext
    target: Target
    seat: LiveSeat | null
    summary: string
    reason: string
    key: string
    requirementId?: string
  }
): Promise<void> {
  await prisma.automationLog.create({
    data: {
      companyId: input.target.buyerCompanyId,
      // Written as the two names rather than as a variable, so the ladder's
      // own reader in `lib/autonomy` can see what this route writes. An
      // act the inventory cannot see is an act nobody has levelled.
      action: waived ? 'DOCUMENT_REQUIREMENT_WAIVED' : 'DOCUMENT_REQUIREMENT_SET',
      summary: input.summary,
      reason: input.seat ? seatTrail(input.seat, input.reason) : input.reason,
      payload: {
        documentTypeKey: input.key,
        requirementId: input.requirementId ?? null,
        [input.target.kind === 'ORDER'
          ? 'workOrderId'
          : input.target.kind === 'SELL'
            ? 'sellContractId'
            : 'buyContractId']: input.target.id,
        byPersonId: input.caller.person.id,
        bySeat: input.seat ? input.seat.officeCompany.name : null,
      },
      // Nothing is lost: the item goes back by asking for it again, and
      // a waiver is lifted the same way.
      reversible: true,
    },
  })

  // No `AccessLog` row: nobody's personal data was read here. A set is a
  // fact about a document, and logging it beside the reads that are
  // about a person would bury the ones that matter.
}
