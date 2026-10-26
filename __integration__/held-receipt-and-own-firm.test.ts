import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as readInvoice } from '@/app/api/invoices/[id]/route'
import { POST as pay } from '@/app/api/invoices/[id]/payments/route'
import { firmsAcceptingOnlyFor } from '@/lib/money/own-firm-acceptance'
import { maySendBill } from '@/lib/money/bill-send'
import { billsDueAt } from '@/lib/money/supplier-bills'
import { runSupplierBills } from '@/lib/money/supplier-bills-run'
import { supplierAuthorityAt } from '@/lib/twin/run'

/**
 * Two faults from the second production walk, 2026-10-26, as sentences
 * on the seeded world.
 */

const AP = 'world-nike-ap@demo.etyme.local'
const withId = (id: string) => ({ params: Promise.resolve({ id }) })
const s: Record<string, string> = {}

beforeAll(async () => {
  await freshWorld()
  const [held, clean] = await Promise.all([
    prisma.invoice.findFirstOrThrow({ where: { number: 'PR-2026-0442' }, select: { id: true } }),
    prisma.invoice.findFirstOrThrow({ where: { number: 'PR-2026-0441' }, select: { id: true } }),
  ])
  s.held = held.id
  s.clean = clean.id
}, 240_000)

describe('the held receipt’s own page offers no Pay', () => {
  it('PR-2026-0442 reads held on its own page for the AP clerk, with 41.5 hours billed against 40 signed and the way forward, and offers no Pay', async () => {
    as(AP)
    const r = await json(await readInvoice(req('GET', `/api/invoices/${s.held}`), withId(s.held)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const p = r.body.data.payPanel
    expect(p.kind).toBe('HELD')
    expect(p.headline).toBe('Held: hours don’t match')
    expect(p.hours.map((h: any) => h.says).join(' ')).toContain('41.5 hours billed, 40 signed')
    expect(p.wayForward.join(' ')).toContain('record an exception with a reason')
    expect(p.wayForward.join(' ')).toMatch(/Ask .+ to correct it/)
  })

  it('the payment route refuses the same receipt its page offers no Pay on', async () => {
    as(AP)
    const r = await json(await pay(req('POST', `/api/invoices/${s.held}/payments`, { amount: 1, method: 'ACH', reference: 'T-1' }), withId(s.held)))
    expect(r.status).toBe(409)
  })

  it('the clean receipt beside it, PR-2026-0441, is offered Pay', async () => {
    as(AP)
    const r = await json(await readInvoice(req('GET', `/api/invoices/${s.clean}`), withId(s.clean)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.payPanel.kind).toBe('PAY')
  })
})

describe('a one-person firm is never asked to accept its own week', () => {
  it('a one-person firm is never asked to accept its own week: Byrne Critical Care LLC accepts only for Colleen Byrne, and Halcyon Talent is still asked', async () => {
    const colleen = await prisma.person.findFirstOrThrow({ where: { name: 'Colleen Byrne' }, select: { id: true } })
    const firms = await prisma.company.findMany({
      where: { name: { in: ['Byrne Critical Care LLC', 'Halcyon Talent'] } },
      select: { id: true, name: true },
    })
    const byName = new Map(firms.map((f) => [f.name, f.id]))
    const only = await firmsAcceptingOnlyFor(colleen.id, firms.map((f) => f.id))
    expect(only.has(byName.get('Byrne Critical Care LLC')!)).toBe(true)
    expect(only.has(byName.get('Halcyon Talent')!)).toBe(false)
  })
})

describe('who sends a bill Ask Etyme drafted, on the seeded world', () => {
  it('where only the Owner holds invoices.issue the Owner sends: Halcyon Talent’s Owner may send the draft Ask Etyme wrote on their authority', async () => {
    const halcyon = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-halcyon' } })).id
    const ahead = await billsDueAt(halcyon, new Date(Date.now() + 70 * 86_400_000))
    const first = ahead.length ? Math.min(...ahead.map((d) => d.billingDate.getTime())) : Date.now()
    const now = new Date(Math.max(first, Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())))
    await runSupplierBills(halcyon, { surface: 'CRON', now })
    const drafted = await prisma.twinAction.findFirstOrThrow({
      where: { companyId: halcyon, action: 'bill.draft', outcome: 'PERFORMED' },
      select: { authorityPersonId: true, payload: true },
    })
    const invoiceId = ((drafted.payload as any).result as any).invoiceId as string
    const owner = (await supplierAuthorityAt(halcyon)).personId!
    expect(drafted.authorityPersonId).toBe(owner)
    const v = await maySendBill({ personId: owner, companyId: halcyon, permissions: ['*'] }, { id: invoiceId })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.ownerException).toMatch(/Nobody else at the firm sends bills/)
  })

  it('a bill a person drafted is sent by any seat holding invoices.issue, the Owner included', async () => {
    const bill = await prisma.invoice.findFirstOrThrow({
      // Any bill Brightmoor raised by hand: the rule asks who drafted it, not its state.
      where: { invoiceLines: { some: { sellContract: { company: { slug: 'world-brightmoor' } } } } },
      select: { id: true, invoiceLines: { take: 1, select: { sellContract: { select: { companyId: true } } } } },
    })
    const companyId = bill.invoiceLines[0].sellContract!.companyId
    const seats = await prisma.context.findMany({
      where: { companyId, revokedAt: null, role: { permissions: { hasSome: ['invoices.issue', '*'] } } },
      select: { personId: true },
    })
    expect(seats.length).toBeGreaterThan(1)
    for (const s of seats) {
      expect((await maySendBill({ personId: s.personId, companyId, permissions: ['invoices.issue'] }, { id: bill.id })).ok).toBe(true)
    }
  })
})
