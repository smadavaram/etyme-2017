/**
 * The one list (GET /api/decisions) counts the decision items a seat
 * owes, on the seeded world plus one opened item (record 107, the walk
 * of Flow A): the number on Ask Etyme, the greeting, Today and Needs
 * attention read that list, so they cannot disagree with the queue.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, freshWorld, as, req, json } from './harness'
import * as decisions from '@/app/api/decisions/route'
import { openDecision } from '@/lib/decision-items'

const s: Record<string, any> = {}

beforeAll(async () => {
  await freshWorld()
  // An Owner at a supplier who holds no other seat, so the list is hers alone.
  const seats = await prisma.context.findMany({
    where: { revokedAt: null, suspendedAt: null, type: { not: 'CONSULTANT' }, company: { kind: 'VENDOR' }, role: { name: 'Owner' } },
    select: { companyId: true, personId: true, person: { select: { primaryEmail: true } } },
    orderBy: [{ grantedAt: 'asc' }, { id: 'asc' }],
  })
  for (const seat of seats) {
    if (!seat.person.primaryEmail || !seat.companyId) continue
    if ((await prisma.context.count({ where: { personId: seat.personId, revokedAt: null } })) !== 1) continue
    if ((await prisma.legalEntity.count({ where: { companyId: seat.companyId } })) > 0) continue
    s.seat = seat
    break
  }
  if (!s.seat) throw new Error('The seeded world holds no lone Owner at a supplier with no legal entity.')
}, 600_000)

describe('the one list of what needs a seat', () => {
  it('an open decision this seat owes is one card in the one list, linking to its page, with no Yes or Not now of its own', async () => {
    as(s.seat.person.primaryEmail)
    const before = await json(await decisions.GET(req('GET', '/api/decisions')))
    const item = await openDecision({
      companyId: s.seat.companyId, personId: s.seat.personId, heldAs: 'Owner',
      question: 'Renew the client agreement for another year?', ownerPersonId: s.seat.personId,
      openedOn: new Date('2026-10-01'), proof: 'The renewal letter, by email.',
    })
    const after = await json(await decisions.GET(req('GET', '/api/decisions')))
    expect(after.body.data.total).toBe(before.body.data.total + 1)
    const card = after.body.data.decisions.find((d: any) => d.entityId === item.id)
    expect([card.type, card.actionUrl, card.answerUrl, card.acts]).toEqual(['DECISION_ITEM', `/dashboard/decisions/${item.id}`, undefined, undefined])
    expect(after.body.data.counts.DECISION_ITEM).toBe(1)
  })
})
