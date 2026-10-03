import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { POST as generate } from '@/app/api/invoices/generate/route'

/**
 * A refused bill names the week, the person and who must sign first.
 *
 * A client tester, 2026-10-03, as Brightmoor Staffing's accounts
 * receivable desk: "Generate bill" over the week of Omar Haddad's 45
 * hours was refused with "No approved timesheets left to bill for this
 * engagement and period." True, and it did not say why — the week was
 * with Northbend Athletic, unsigned, because five hours over the line
 * were still undecided. On the seeded world, the sentence now says so.
 */

const OWNER = 'world-brightmoor@demo.etyme.local'

let engagementId = ''
let week: { periodStart: Date; periodEnd: Date } | null = null

describe('a refused bill names the week, the person and who must sign first', () => {
  beforeAll(async () => {
    await freshWorld()
    const brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' } })
    // Omar Haddad's week nobody at Northbend has signed yet.
    const ts = await prisma.timesheet.findFirstOrThrow({
      where: {
        person: { name: 'Omar Haddad' },
        status: 'SUBMITTED',
        sellContract: { companyId: brightmoor.id },
        assertions: { none: { role: 'CLIENT_APPROVAL', state: 'LIVE' } },
      },
      select: { periodStart: true, periodEnd: true, sellContract: { select: { engagementId: true } } },
      orderBy: { periodStart: 'desc' },
    })
    engagementId = ts.sellContract.engagementId!
    week = { periodStart: ts.periodStart, periodEnd: ts.periodEnd }
  }, 600_000)

  it('a supplier refused a bill for Omar Haddad’s unsigned week is told it is waiting for Northbend Athletic to sign it', async () => {
    as(OWNER)
    const day = (d: Date) => d.toISOString().slice(0, 10)
    const out = await json(await generate(req('POST', '/api/invoices/generate', {
      engagementId,
      periodStart: day(week!.periodStart),
      periodEnd: day(week!.periodEnd),
    })))
    expect(out.status).toBe(422)
    const says: string = out.body.error.message
    const weekOf = week!.periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    expect(says).toContain(`Omar Haddad’s week of ${weekOf} is waiting for Northbend Athletic to sign it.`)
    expect(says).not.toContain('No approved timesheets')
  })
})
