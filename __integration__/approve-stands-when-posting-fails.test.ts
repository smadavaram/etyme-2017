import { describe, it, expect, beforeAll, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * The books refusing a posting does not undo an approval.
 *
 * By the time the approve route posts to the books, the signature is
 * written. A posting can fail on a settled project order or a missing
 * exchange rate; the approval stands, the person is told in one sentence,
 * and staff are told through an incident.
 */

vi.mock('@/lib/order-postings', async (orig) => ({
  ...(await orig<typeof import('@/lib/order-postings')>()),
  postAssertion: vi.fn(async () => {
    throw new Error('That project order is settled. Post the correction to an open order instead of changing a period that has already been reported.')
  }),
}))

import { POST as approve } from '@/app/api/timesheets/[id]/approve/route'

const NIKE = 'world-nike-hiring@demo.etyme.local'
const s: Record<string, string> = {}

describe('an approval whose posting to the books fails', () => {
  beforeAll(async () => {
    await freshWorld()
    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
    const week = await prisma.timesheet.findFirstOrThrow({
      where: { personId: helena.id, status: 'SUBMITTED', clientApprovedAt: null },
      orderBy: { periodStart: 'desc' },
    })
    s.week = week.id
  }, 240_000)

  it('an approval stands and is reported to staff when its posting to the books fails', async () => {
    as(NIKE)
    const before = await prisma.incident.count()
    const r = await json(await approve(req('POST', `/api/timesheets/${s.week}/approve`, {}), { params: Promise.resolve({ id: s.week }) }))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.postingSays).toBe('Your approval is saved. It could not be added to the books yet, and our staff have been told.')

    const week = await prisma.timesheet.findUniqueOrThrow({ where: { id: s.week } })
    expect(week.clientApprovedAt).not.toBeNull()
    expect(await prisma.workAssertion.count({ where: { timesheetId: s.week, role: 'CLIENT_APPROVAL', state: 'LIVE' } })).toBe(1)

    // reportError is fire-and-forget; give it its turn.
    await vi.waitFor(async () => expect(await prisma.incident.count()).toBeGreaterThan(before))
  })
})
