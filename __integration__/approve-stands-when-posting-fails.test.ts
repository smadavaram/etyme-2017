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

const SETTLED = 'That project order is settled. Post the correction to an open order instead of changing a period that has already been reported.'

// The approve route posts every signature one press wrote through one
// `postAssertions` call (8b4839d2). A signature that cannot post comes
// back in `failed`; a read that breaks throws. Both are faked here, one
// test each, and neither may undo the approval.
const fake = vi.hoisted(() => ({ mode: 'failed' as 'failed' | 'throws' }))
vi.mock('@/lib/order-postings', async (orig) => ({
  ...(await orig<typeof import('@/lib/order-postings')>()),
  postAssertions: vi.fn(async (ids: readonly string[]) => {
    if (fake.mode === 'throws') throw new Error(SETTLED)
    return { rows: [], found: [...ids], failed: ids.map((assertionId) => ({ assertionId, error: new Error(SETTLED) })) }
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
      include: { sellContract: { select: { clientCompanyId: true, endClientCompanyId: true } } },
    })
    s.week = week.id
    // A second week the same hiring manager signs: another person's, on
    // the same client's work. In the seeded world it is Omar Haddad's 45
    // hours, so it is signed the way a person signs it: with the reason,
    // and the overtime answered.
    const client = week.sellContract.endClientCompanyId ?? week.sellContract.clientCompanyId
    const other = await prisma.timesheet.findFirst({
      where: {
        id: { not: week.id }, status: 'SUBMITTED', clientApprovedAt: null,
        sellContract: { OR: [{ endClientCompanyId: client }, { endClientCompanyId: null, clientCompanyId: client }] },
      },
      orderBy: { periodStart: 'desc' },
    })
    s.other = other?.id ?? ''
  }, 240_000)

  it('an approval stands and is reported to staff when its posting to the books fails', async () => {
    as(NIKE)
    fake.mode = 'failed'
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

  it('an approval stands and is reported to staff when reading the week for the books breaks', async () => {
    expect(s.other, 'the client has a second week waiting to be approved').not.toBe('')
    as(NIKE)
    fake.mode = 'throws'
    const before = await prisma.incident.count()
    const press = async (body: Record<string, unknown>) =>
      json(await approve(req('POST', `/api/timesheets/${s.other}/approve`, body), { params: Promise.resolve({ id: s.other }) }))
    const note = 'Release weekend, agreed with the team.'
    let r = await press({ note })
    if (r.body?.error?.code === 'OVERTIME_UNDECIDED') {
      r = await press({ note, overtime: (r.body.error.weeks as { weekOf: string }[]).map((w) => ({ weekOf: w.weekOf, treatment: 'PREMIUM' })) })
    }
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.postingSays).toBe('Your approval is saved. It could not be added to the books yet, and our staff have been told.')
    expect((await prisma.timesheet.findUniqueOrThrow({ where: { id: s.other } })).clientApprovedAt).not.toBeNull()
    await vi.waitFor(async () => expect(await prisma.incident.count()).toBeGreaterThan(before))
  })
})
