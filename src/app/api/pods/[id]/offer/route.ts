import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { pluginGate } from '@/lib/plugin-gate'
import { podWriteRefusal, podStaffOnly } from '@/lib/pods/caller'
import { readPods, soldTo } from '@/lib/pods/read'
import { offerRule, soldTeamSays } from '@/lib/pods'
import { raisePodSaleCard, holdsSeatAt, tellCardAcceptor, type PodSaleCardInput } from '@/lib/twin/pod-sale-card'
import { dealingsWithSides } from '@/app/api/companies/dealings'

type Ctx = { params: Promise<{ id: string }> }

const fail = (status: number, code: string, message: string, field?: string) =>
  NextResponse.json({ error: { code, message, ...(field ? { field } : {}) } }, { status })

/**
 * POST /api/pods/[id]/offer
 *   { clientCompanyId, acceptorEmail, kind, priceCents, currency, projectName, onSite?, deliverables?: [{ name, amountCents, dueOn? }] }
 *
 * The supplier's proposal (record 120). It raises one card at the client,
 * for the one person named, and writes nothing else on the client's side:
 * no project, no order, no line. Her yes makes the sale (`sellPod`, called
 * from the one approval route). The client must be a firm this one works
 * with, and the acceptor is found by her work address among the people
 * seated at that client; where nobody is, the answer says so and names
 * nobody, because a typed address is never a way to learn who works there.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = podStaffOnly(caller)
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'PODS')
  if (off) return off
  const refused = await podWriteRefusal(caller, request.nextUrl.pathname)
  if (refused) return refused

  const seller = caller.company!
  const { id } = await params
  const [team] = await readPods(seller.id, id)
  if (!team) return fail(404, 'NOT_FOUND', 'That team is not one of yours.')

  const read = offerRule(await request.json().catch(() => ({})))
  if (!read.ok) return fail(422, 'VALIDATION', read.says, read.field)
  const { offer } = read

  if (team.archivedAt) return fail(409, 'ARCHIVED', `${team.name} is archived. Restore it before it is offered.`)
  if (team.filled === 0) return fail(409, 'EMPTY', `${team.name} has nobody on it, so there is no team to offer. Add its people first.`)
  if (offer.currency !== team.currency) return fail(422, 'VALIDATION', `${team.name} is priced in ${team.currency}, and the offer is in ${offer.currency}. Two currencies are never mixed on one project.`, 'currency')
  const sold = await soldTo(id)
  if (sold) return fail(409, 'SOLD', soldTeamSays(team.name, sold.clientName))

  // Only a firm this one works with: an offer is never the first thing a stranger hears.
  const { ids, ownSideOnly } = await dealingsWithSides(caller, false)
  if (!ids.has(offer.clientCompanyId) || ownSideOnly.has(offer.clientCompanyId) || offer.clientCompanyId === seller.id) {
    return fail(403, 'NOT_A_CLIENT', 'That is not a firm you work with yet. Link with it first, then offer the team.', 'clientCompanyId')
  }
  const client = await prisma.company.findUnique({ where: { id: offer.clientCompanyId }, select: { id: true, name: true } })
  if (!client) return fail(403, 'NOT_A_CLIENT', 'That is not a firm you work with yet. Link with it first, then offer the team.', 'clientCompanyId')

  // The acceptor, by address, among the people seated at the client. Nobody found says nothing about anybody.
  const named = await prisma.person.findMany({ where: { primaryEmail: { equals: offer.acceptorEmail, mode: 'insensitive' } }, select: { id: true }, take: 5 })
  let acceptorId: string | null = null
  for (const p of named) if (await holdsSeatAt(prisma, p.id, client.id)) { acceptorId = p.id; break }
  if (!acceptorId) return fail(422, 'NO_SEAT', `Nobody at ${client.name} holds that address as a seat. Ask them for the work address of the person who will accept the work.`, 'acceptorEmail')

  // `onSite` is the supplier's mark, "the team works on your site"; the card carries it to the client's yes.
  const cardInput: PodSaleCardInput & { onSite: boolean } = {
    podId: id,
    sellerCompanyId: seller.id,
    clientCompanyId: client.id,
    acceptorPersonId: acceptorId!,
    proposedByPersonId: caller.person.id,
    projectName: offer.projectName,
    sellerName: seller.name,
    kind: offer.kind,
    priceCents: offer.priceCents,
    currency: offer.currency,
    deliverables: offer.deliverables,
    roles: team.roles.map((r) => ({ title: r.title, headcount: r.headcount })),
    onSite: offer.onSite,
  }
  const card = await prisma.$transaction((tx) => raisePodSaleCard(tx, cardInput))
  if (!card.ok) return fail(card.field === 'podId' ? 409 : 422, 'REFUSED', card.says, card.field ?? undefined)
  // The card is committed; only now is the named acceptor told it is waiting.
  await tellCardAcceptor(card)
  return NextResponse.json({ data: { approvalId: card.approvalId, says: `${team.name} is offered to ${client.name}. Nothing is sold until the person you named says yes.` } }, { status: 201 })
}
