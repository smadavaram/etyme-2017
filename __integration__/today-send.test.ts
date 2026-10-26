import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as today } from '@/app/api/today/route'
import { POST as sendBill } from '@/app/api/invoices/[id]/submit/route'
import { runSupplierBills } from '@/lib/money/supplier-bills-run'

/**
 * Today's Send, on the seeded world (second production walk, 2026-10-26):
 * Brightmoor's Owner was offered Send on a bill Ask Etyme drafted on the
 * Owner's authority, while Accounts Receivable, Finance and Admin send
 * bills there. Today now draws Send from the send route's own verdict.
 */

const OWNER = 'world-brightmoor@demo.etyme.local'
const FINANCE = 'world-brightmoor-finance@demo.etyme.local'

const draftsOn = async (email: string) => {
  as(email)
  const out = await json((await today(req('GET', '/api/today')))!)
  expect(out.status, JSON.stringify(out.body)).toBe(200)
  return (out.body.data.signed?.byClient ?? []).flatMap((g: any) => g.drafts) as { invoiceId: string; send: boolean; refused: string | null }[]
}

describe('Send on Today, at Brightmoor', () => {
  beforeAll(async () => {
    await freshWorld()
    const brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' } })
    const northbend = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' } })
    await prisma.masterAgreement.updateMany({
      where: { vendorId: brightmoor.id, clientId: northbend.id },
      data: { billFrequency: 'MONTHLY', billAnchor: 'CALENDAR', billStraddle: 'END' },
    })
    const run = await runSupplierBills(brightmoor.id, { now: new Date(), surface: 'WEB' })
    expect(run.drafted, 'Ask Etyme drafted a bill on the Owner’s authority').toBeGreaterThanOrEqual(1)
  }, 600_000)

  it('Today offers Send on a bill only to a seat the send route would let send it', async () => {
    const owners = await draftsOn(OWNER)
    expect(owners.length, 'a drafted bill is on the Owner’s Today').toBeGreaterThan(0)
    for (const d of owners) {
      expect(d.send).toBe(false)
      expect(d.refused).toContain('sends this bill')
    }
    // And the route refuses the Owner in the sentence Today drew.
    as(OWNER)
    const refused = await json(await sendBill(req('POST', `/api/invoices/${owners[0].invoiceId}/submit`, {}), { params: Promise.resolve({ id: owners[0].invoiceId }) }))
    expect(refused.status).toBe(403)
    expect(refused.body.error.message).toBe(owners[0].refused)

    // Finance sends bills, so Finance reads Send on the same drafts.
    const finance = await draftsOn(FINANCE)
    expect(finance.map((d) => d.invoiceId).sort()).toEqual(owners.map((d) => d.invoiceId).sort())
    for (const d of finance) expect(d).toMatchObject({ send: true, refused: null })
  })
})
