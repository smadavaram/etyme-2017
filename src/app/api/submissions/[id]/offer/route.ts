import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { actingDesk } from '@/lib/program-seat'
import { roleWords } from '@/lib/access-grant'
import { recordAccess, recordRefusal } from '@/lib/access-log'
import { writeRecordAction, LedgerRefusal } from '@/lib/record-ledger'
import { AWARDABLE_FROM } from '@/lib/award'
import { acceptedOfferFor } from './read'
import {
  OFFER_DECLINE_REASONS, OFFER_WORDS, isDeclineReason, liveForOf, mayTake, moveOffer, readOffer,
  type OfferAction, type OfferState, type Side,
} from './rules'

/**
 * GET   /api/submissions/:id/offer  the offers on this submission, newest first, and what this reader may do
 * POST  /api/submissions/:id/offer  { rate, currency?, startDate?, terms?, propose?, actingEntityId? } make an offer
 * PATCH /api/submissions/:id/offer  { offerId, action: PROPOSE | ACCEPT | DECLINE | WITHDRAW, reasonCode?, rate?, ... }
 *
 * Record 112, chain 2. The offer is a person's act end to end: no agent
 * writes here. Every act is a row on the record ledger under the person's
 * own name and role. A decline carries a reason code from a closed list
 * (`OFFER_DECLINE_REASONS`), written into the ledger's action word as
 * OFFER_DECLINED:<CODE> until the offer has a column of its own for it.
 */

/**
 * The ledger names an offer's acts on the person the offer is to, the one
 * record kind the record view opens that an offer can be tied to before a
 * placement exists. The record view has no `Offer` kind yet (the queue's
 * `RecordType` and `records/lookup` are the architect's); once it has, this
 * is the two lines to change (the ledger writes below).
 */
const NOT_HERE = { error: { code: 'NOT_FOUND', message: 'There is no such submission on your side of the deal.' } }

async function open(request: NextRequest, id: string) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { error }
  if (!caller.company) return { error: NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Offers are made and answered by a firm’s seat.' } }, { status: 403 }) }
  const desk = await actingDesk(caller)
  const submission = await prisma.submission.findUnique({
    where: { id },
    select: {
      id: true, status: true, personId: true, fromCompanyId: true, toCompanyId: true, requirementId: true, rate: true,
      person: { select: { name: true } },
      requirement: { select: { title: true, startDate: true } },
      toCompany: { select: { homeCurrency: true } },
    },
  })
  const companyId = desk?.companyId ?? caller.company.id
  const side: Side = submission ? (submission.toCompanyId === companyId ? 'BUYER' : submission.fromCompanyId === companyId ? 'SUPPLIER' : null) : null
  if (!submission || !side) {
    if (submission) {
      await recordRefusal([{ companyId: submission.toCompanyId }], {
        actorPersonId: caller.person.id, actorCompanyId: companyId, action: 'CONTRACT_VIEW',
        reason: 'Refused an offer on a submission this firm is not a party to.',
      })
    }
    return { error: NextResponse.json(NOT_HERE, { status: 404 }) }
  }
  const permissions = desk?.permissions ?? caller.permissions
  const mays = { mayHire: hasPermission(permissions, 'requirements.write'), maySubmit: hasPermission(permissions, 'submissions.create') }
  const role = caller.context.roleId ? await prisma.role.findUnique({ where: { id: caller.context.roleId }, select: { name: true } }) : null
  const entities = await prisma.legalEntity.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
  return { caller, companyId, submission, side, mays, heldAs: roleWords(role?.name ?? null), entities, error: null as null }
}

const refuse = (status: number, message: string, field?: string) =>
  NextResponse.json({ error: { code: status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : 'VALIDATION', message, ...(field ? { field } : {}) } }, { status })

/** The legal entity the act is for: the firm's only one, the one named, or a sentence asking which. */
function entityFor(entities: { id: string }[], named: unknown): { ok: true; id: string | null } | { ok: false; says: string } {
  if (entities.length === 0) return { ok: true, id: null }
  if (typeof named === 'string' && entities.some((e) => e.id === named)) return { ok: true, id: named }
  if (entities.length === 1) return { ok: true, id: entities[0].id }
  return { ok: false, says: 'Your firm has more than one legal entity. Say which one this offer is made for.' }
}

const shape = (o: { id: string; state: string; rate: { toString(): string }; currency: string; startDate: Date | null; terms: string | null; decidedAt: Date | null; createdAt: Date }) => ({
  id: o.id, state: o.state, stateWords: OFFER_WORDS[o.state as OfferState] ?? o.state,
  rate: Number(o.rate.toString()), currency: o.currency, startDate: o.startDate ? o.startDate.toISOString().slice(0, 10) : null,
  terms: o.terms, decidedAt: o.decidedAt ? o.decidedAt.toISOString() : null, createdAt: o.createdAt.toISOString(),
})

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await open(request, id)
  if (r.error) return r.error
  const { caller, companyId, submission, side, mays, entities } = r
  const offers = await prisma.offer.findMany({ where: { submissionId: id }, orderBy: { createdAt: 'desc' } })
  await recordAccess([submission.personId], {
    actorPersonId: caller.person.id, actorCompanyId: companyId, action: 'CONTRACT_VIEW',
    reason: `Read the offer on the submission for "${submission.requirement.title}"`,
  })
  const award = await acceptedOfferFor(id, submission.toCompany.homeCurrency)
  return NextResponse.json({
    data: {
      submissionId: id, candidate: submission.person.name, side,
      offers: offers.map(shape),
      declineReasons: Object.entries(OFFER_DECLINE_REASONS).map(([code, words]) => ({ code, words })),
      mayMake: submission.status !== undefined && AWARDABLE_FROM.includes(submission.status) && mayTake('DRAFT', side, mays) === null,
      mayRecordAnswer: mayTake('ACCEPT', side, mays) === null,
      award,
      entities: entities.length > 1 ? entities : [],
    },
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await open(request, id)
  if (r.error) return r.error
  const { caller, companyId, submission, side, mays, heldAs, entities } = r
  const body = await request.json().catch(() => ({}))

  const no = mayTake('DRAFT', side, mays)
  if (no) return refuse(403, no)
  if (!AWARDABLE_FROM.includes(submission.status)) return refuse(409, `${submission.person.name} is no longer in the running for this job, so an offer cannot be made.`)
  const read = readOffer(body)
  if (!read.ok) return refuse(422, read.says, read.field)
  const entity = entityFor(entities, body.actingEntityId)
  if (!entity.ok) return refuse(422, entity.says, 'actingEntityId')
  const propose = body.propose === true
  const state: OfferState = propose ? 'PROPOSED' : 'DRAFT'

  const live = await prisma.offer.findFirst({ where: { submissionId: id, liveFor: id }, select: { id: true, state: true } })
  if (live) return refuse(409, `There is already an offer on this submission (${OFFER_WORDS[live.state as OfferState].toLowerCase()}). Change it or withdraw it first.`)

  try {
    const offer = await prisma.$transaction(async (tx) => {
      const o = await tx.offer.create({
        data: {
          companyId, submissionId: id, rate: read.offer.rate, currency: read.offer.currency,
          startDate: read.offer.startDate ? new Date(`${read.offer.startDate}T00:00:00Z`) : null,
          terms: read.offer.terms, state, liveFor: liveForOf(state, id), createdById: caller.person.id,
        },
      })
      await writeRecordAction(tx, {
        companyId, recordType: 'Offer', recordId: o.id, action: propose ? 'OFFER_PROPOSED' : 'OFFER_DRAFTED',
        summary: `${propose ? 'Offered' : 'Drafted an offer to'} ${submission.person.name} for ${submission.requirement.title}: ${read.offer.rate.toFixed(2)} ${read.offer.currency} an hour${read.offer.startDate ? `, starting ${read.offer.startDate}` : ''}.`,
        personId: caller.person.id, heldAs, actingEntityId: entity.id,
      })
      return o
    })
    return NextResponse.json({ data: shape(offer) }, { status: 201 })
  } catch (e) {
    if (e instanceof LedgerRefusal) return refuse(422, e.message)
    // The unique column: somebody made one at the same moment.
    if ((e as { code?: string })?.code === 'P2002') return refuse(409, 'There is already an offer on this submission. Reload to see it.')
    throw e
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await open(request, id)
  if (r.error) return r.error
  const { caller, companyId, submission, side, mays, heldAs, entities } = r
  const body = await request.json().catch(() => ({}))
  const action = body.action as OfferAction
  if (!['PROPOSE', 'ACCEPT', 'DECLINE', 'WITHDRAW'].includes(action)) return refuse(422, 'Say what to do with the offer: offer it, record it accepted, record it declined or withdraw it.', 'action')

  const no = mayTake(action, side, mays)
  if (no) return refuse(403, no)
  const offer = typeof body.offerId === 'string' ? await prisma.offer.findFirst({ where: { id: body.offerId, submissionId: id } }) : await prisma.offer.findFirst({ where: { submissionId: id, liveFor: id } })
  if (!offer) return refuse(404, 'There is no offer on this submission to act on.')
  const move = moveOffer(offer.state as OfferState, action)
  if (!move.ok) return refuse(409, move.says)
  if (action === 'DECLINE' && !isDeclineReason(body.reasonCode)) return refuse(422, 'Choose why it was declined from the list.', 'reasonCode')
  const entity = entityFor(entities, body.actingEntityId)
  if (!entity.ok) return refuse(422, entity.says, 'actingEntityId')
  // An accepted offer that already became a placement is the placement's now.
  if (action === 'WITHDRAW' && offer.state === 'ACCEPTED') {
    const placed = await prisma.sellContract.count({ where: { requirementId: submission.requirementId, personId: submission.personId } })
    if (placed > 0) return refuse(409, `${submission.person.name} is already placed from this offer, so it cannot be withdrawn. End the placement instead.`)
  }

  const to = move.to
  const code = action === 'DECLINE' ? (body.reasonCode as string) : null
  const said: Record<OfferAction, string> = {
    PROPOSE: `Offered ${submission.person.name} the job.`,
    ACCEPT: `Recorded that ${submission.person.name} accepted the offer.`,
    DECLINE: `Recorded that ${submission.person.name} declined the offer: ${OFFER_DECLINE_REASONS[code as keyof typeof OFFER_DECLINE_REASONS]}.`,
    WITHDRAW: `Withdrew the offer to ${submission.person.name}.`,
  }
  try {
    const moved = await prisma.$transaction(async (tx) => {
      const n = await tx.offer.updateMany({
        where: { id: offer.id, state: offer.state },
        data: { state: to, liveFor: liveForOf(to, id), ...(to === 'ACCEPTED' || to === 'DECLINED' ? { decidedById: caller.person.id, decidedAt: new Date() } : {}) },
      })
      if (n.count !== 1) return null
      await writeRecordAction(tx, {
        companyId, recordType: 'Offer', recordId: offer.id,
        action: action === 'DECLINE' ? `OFFER_DECLINED:${code}` : `OFFER_${to}`,
        summary: said[action], personId: caller.person.id, heldAs, actingEntityId: entity.id,
      })
      return tx.offer.findUniqueOrThrow({ where: { id: offer.id } })
    })
    if (!moved) return refuse(409, 'Somebody else just changed this offer. Reload to see where it stands.')
    return NextResponse.json({ data: shape(moved), says: said[action] })
  } catch (e) {
    if (e instanceof LedgerRefusal) return refuse(422, e.message)
    throw e
  }
}
