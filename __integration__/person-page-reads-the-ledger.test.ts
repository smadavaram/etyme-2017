import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as person } from '@/app/api/people/[id]/route'
import { GET as ledger } from '@/app/api/tenure/route'

/**
 * One person's page and the tenure ledger give one answer. The page kept
 * its own copy of the old status logic and read somebody past the limit
 * with no break rule as ELIGIBLE (supply's report, 2026-10-06); it now
 * reads `standingAgainstLimit` and `ledgerStatus`, as the ledger does.
 *
 * Kwame Mensah is seeded at Northbend Athletic past the 18-month limit
 * and inside its 90-day break.
 */

const DESK = 'world-nike-programme@demo.etyme.local'
let kwame = ''

beforeAll(async () => {
  await freshWorld()
  kwame = (await prisma.person.findFirstOrThrow({ where: { name: 'Kwame Mensah' }, select: { id: true } })).id
}, 300_000)

describe('one person’s page and the ledger agree', () => {
  it('one person’s page reads the ledger’s status and eligibility date for Kwame Mensah', async () => {
    as(DESK)
    const book = await json(await ledger(req('GET', '/api/tenure')))
    expect(book.status, JSON.stringify(book.body)).toBe(200)
    const row = book.body.data.people.find((p: any) => p.personId === kwame)
    expect(row).toBeTruthy()

    const page = await json(await person(req('GET', `/api/people/${kwame}`), { params: Promise.resolve({ id: kwame }) }))
    expect(page.status, JSON.stringify(page.body)).toBe(200)
    expect(page.body.data.tenure.status).toBe(row.status)
    expect(page.body.data.tenure.eligibleDate).toBe(row.eligibleDate)
    expect(row.status).toBe('IN_BREAK')
    expect(page.body.data.says).toContain('is in a break in service and can come back on')
  })

  it('with no break rule, a person past the limit is not eligible on their page, and the page says there is no day they may come back', async () => {
    const nike = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    await prisma.governanceRule.updateMany({
      where: { policy: { companyId: nike.id }, ruleType: 'BREAK_IN_SERVICE' },
      data: { isActive: false },
    })
    as(DESK)
    const page = await json(await person(req('GET', `/api/people/${kwame}`), { params: Promise.resolve({ id: kwame }) }))
    expect(page.body.data.tenure.status).toBe('BREAK_REQUIRED')
    expect(page.body.data.tenure.eligibleDate).toBeNull()
    expect(page.body.data.says).toContain('has no break rule that would reset it, so there is no day on which they may come back')
    const book = await json(await ledger(req('GET', '/api/tenure')))
    expect(book.body.data.people.find((p: any) => p.personId === kwame).status).toBe('BREAK_REQUIRED')
  })
})
