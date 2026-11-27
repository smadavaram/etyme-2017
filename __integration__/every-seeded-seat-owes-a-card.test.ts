import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as decisions } from '@/app/api/decisions/route'
import { GET as oneCard } from '@/app/api/conversations/one-card/route'
import { WORLD_CLIENTS } from '@/lib/seed-world'

/**
 * A list that is empty on the seeded world is a bug (CLAUDE.md). The photo
 * walk of 2026-11-26 read "Nothing needs you today" on three seats the seed
 * seats and gives no work: the Approver and the Compliance Officer at
 * Cavanaugh Glassworks, and the owner of Colleen Byrne's one-person firm.
 */
const D = '@demo.etyme.local'
const APPROVER = `world-cavanaugh-vp${D}`
const COMPLIANCE = `world-cavanaugh-compliance${D}`

let byrneOwner = { email: '', seat: '' }

async function queue(email: string, headers: Record<string, string> = {}) {
  as(email)
  const res = await json(await decisions(req('GET', '/api/decisions', undefined, headers)))
  expect(res.status).toBe(200)
  return (res.body?.data?.decisions ?? []) as { type: string; title: string }[]
}

beforeAll(async () => {
  await freshWorld()
  const seat = await prisma.context.findFirstOrThrow({
    where: { company: { slug: 'world-byrne-critical-care' }, type: 'EMPLOYEE', revokedAt: null },
    select: { id: true, person: { select: { primaryEmail: true } } },
  })
  byrneOwner = { email: seat.person.primaryEmail, seat: seat.id }
}, 600_000)

describe('every seeded seat owes a card', () => {
  it('the client Approver, the client Compliance Officer and the one-person firm each owe their own card on the seeded world', async () => {
    const approver = await queue(APPROVER)
    const compliance = await queue(COMPLIANCE)
    const owner = await queue(byrneOwner.email, { 'x-context-id': byrneOwner.seat })
    expect(approver.length).toBeGreaterThan(0)
    expect(compliance.length).toBeGreaterThan(0)
    expect(owner.length).toBeGreaterThan(0)
  })

  it('the Approver’s card is a job request only an approver signs', async () => {
    const types = (await queue(APPROVER)).map((d) => d.type)
    expect(types).toContain('REQUISITION_APPROVAL')
  })

  it('the Compliance Officer’s card is a paper to check', async () => {
    const types = (await queue(COMPLIANCE)).map((d) => d.type)
    expect(types).toContain('PAPER_TO_CHECK')
  })

  it('the one-person firm’s card is a job request its prime sent the company to answer', async () => {
    const types = (await queue(byrneOwner.email, { 'x-context-id': byrneOwner.seat })).map((d) => d.type)
    expect(types).toContain('JOB_REQUEST_ANSWER')
  })

  it('the one-person firm’s owner is shown a card on the one-card screen too', async () => {
    as(byrneOwner.email)
    const res = await json(await oneCard(req('GET', '/api/conversations/one-card', undefined, { 'x-context-id': byrneOwner.seat })))
    expect(((res.body?.data?.cards ?? []) as unknown[]).length).toBeGreaterThan(0)
  })

  // The photo walk of 2026-11-26 read "Nothing needs you today" on the other
  // clients' Approvers too: their routed job request waits on HR first.
  for (const c of WORLD_CLIENTS.filter((x) => x.vp)) {
    it(`the Approver at ${c.name} owes a job request only an approver signs`, async () => {
      const types = (await queue(`world-${c.slug}-vp${D}`)).map((d) => d.type)
      expect(types).toContain('REQUISITION_APPROVAL')
    })
  }

  it('every client the world seeds has an Approver in this list, so none is missed', () => {
    expect(WORLD_CLIENTS.filter((x) => x.vp).map((x) => x.slug)).toEqual(
      expect.arrayContaining(['northbend', 'cavanaugh', 'talvern'])
    )
    expect(WORLD_CLIENTS.every((x) => x.vp)).toBe(true)
  })
})
