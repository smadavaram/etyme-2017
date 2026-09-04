import { describe, it, expect } from 'vitest'
import { gates, maySign, acceptWith, signBoth, type Sheet } from '@/lib/timesheet-signatures'

/**
 * The client approves a fact: this work happened. The employer accepts a
 * basis: this is what I will pay for. They look like the same act and
 * they are not — and in a forwarding chain they are almost never the
 * same company. The end client signs, the prime bills, the sub pays.
 *
 * One field for both meant a sub-vendor paying on a signature it never
 * collected. On a direct placement the two parties are the same company,
 * which is why that fault stayed invisible.
 */

const NOW = new Date('2026-08-29T10:00:00Z')
const NAMES = { client: 'Calder Manufacturing', employer: 'Cloudepa Systems' }

function sheet(over: Partial<Sheet> = {}): Sheet {
  return {
    totalHours: 40,
    clientApproved: null,
    employerAccepted: null,
    acceptedHours: null,
    acceptedNote: null,
    direct: false,
    ...over,
  }
}

describe('what each signature unlocks', () => {
  it('lets nobody bill or pay before either has signed', () => {
    const g = gates(sheet(), NAMES)
    expect(g.mayInvoice).toBe(false)
    expect(g.mayPay).toBe(false)
    expect(g.says).toBe(
      '40 hours submitted. Waiting on Calder Manufacturing to approve and Cloudepa Systems to accept.'
    )
  })

  it('lets the prime invoice once the client has approved, before anybody is paid', () => {
    const g = gates(sheet({ clientApproved: { at: NOW, byId: 'dana' } }), NAMES)
    expect(g.mayInvoice).toBe(true)
    expect(g.mayPay).toBe(false)
    expect(g.billableHours).toBe(40)
    expect(g.says).toMatch(/Cannot pay until Cloudepa Systems accepts/)
  })

  it('lets the employer pay before the client has approved', () => {
    // Independent on purpose. Somebody being paid late because a client's
    // approval queue is slow is a fault with nothing to do with them.
    const g = gates(sheet({ employerAccepted: { at: NOW, byId: 'meena' } }), NAMES)
    expect(g.mayPay).toBe(true)
    expect(g.mayInvoice).toBe(false)
    expect(g.payableHours).toBe(40)
    expect(g.says).toMatch(/Cannot invoice until Calder Manufacturing approves/)
  })

  it('bills nothing on an unapproved sheet, rather than billing the submitted number', () => {
    expect(gates(sheet(), NAMES).billableHours).toBe(0)
  })
})

describe('when the two numbers disagree', () => {
  const both = sheet({
    clientApproved: { at: NOW, byId: 'dana' },
    employerAccepted: { at: NOW, byId: 'meena' },
    acceptedHours: 38,
    acceptedNote: 'Two hours of travel nobody agreed to bill.',
  })

  it('bills what the client approved and pays what the employer accepted', () => {
    const g = gates(both, NAMES)
    expect(g.billableHours).toBe(40)
    expect(g.payableHours).toBe(38)
  })

  it('says both numbers out loud, with the reason', () => {
    expect(gates(both, NAMES).says).toBe(
      'Billing 40 hours, paying 38. Two hours of travel nobody agreed to bill.'
    )
  })

  it('pays the submitted hours when the employer accepted them as they were', () => {
    const g = gates(
      sheet({
        clientApproved: { at: NOW, byId: 'dana' },
        employerAccepted: { at: NOW, byId: 'meena' },
      }),
      NAMES
    )
    expect(g.payableHours).toBe(40)
    expect(g.says).toBe('40 hours, approved and accepted. Ready to invoice and to pay.')
  })
})

describe('who may sign what', () => {
  it('refuses a supplier trying to approve on the client’s behalf', () => {
    // The whole value of two signatures is that two different companies
    // made them.
    const v = maySign('CLIENT', sheet(), false, true)
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('Only the company the work was done for can approve these hours.')
  })

  it('refuses a client trying to accept on the employer’s behalf', () => {
    const v = maySign('EMPLOYER', sheet(), true, false)
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('Only the company that pays this person can accept these hours.')
  })

  it('lets the employer accept before the client has approved, and says so', () => {
    const v = maySign('EMPLOYER', sheet(), false, true)
    expect(v.ok).toBe(true)
    expect(v.reason).toMatch(/The client has not approved them for billing yet/)
  })

  it('does not let the same signature be made twice', () => {
    const done = sheet({ clientApproved: { at: NOW, byId: 'dana' } })
    expect(maySign('CLIENT', done, true, false).reason).toBe('Already approved.')
  })
})

describe('accepting a different number', () => {
  it('needs a reason, because a payslip is a bad way to find out', () => {
    const v = acceptWith(40, 38, null)
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/how you lose a good contractor/)
  })

  it('takes the change once there is one', () => {
    const v = acceptWith(40, 38, 'Two hours of unbilled travel.')
    expect(v.ok).toBe(true)
    expect(v.hours).toBe(38)
    expect(v.reason).toBe('Accepting 38 of 40 submitted. Two hours of unbilled travel.')
  })

  it('handles accepting more than was submitted, which happens', () => {
    const v = acceptWith(38, 40, 'Two hours logged on the wrong week.')
    expect(v.reason).toMatch(/^Accepting 40, more than the 38 submitted/)
  })

  it('stores nothing when the numbers agree', () => {
    const v = acceptWith(40, 40, null)
    expect(v.hours).toBeNull()
    expect(v.reason).toBe('Accepted as submitted.')
  })

  it('refuses negative hours', () => {
    expect(acceptWith(40, -1, 'x').ok).toBe(false)
  })
})

describe('a direct placement', () => {
  it('signs both in one press, and still records two signatures', () => {
    // The common case must not feel like two jobs — and the invoice
    // engine should not be able to tell a direct sheet from one approved
    // three companies away.
    const s = sheet({ direct: true, ...signBoth('owner', NOW) })
    const g = gates(s, { client: 'Northwind', employer: 'Northwind' })
    expect(g.mayInvoice).toBe(true)
    expect(g.mayPay).toBe(true)
    expect(s.clientApproved!.byId).toBe('owner')
    expect(s.employerAccepted!.byId).toBe('owner')
  })

  it('does not name two companies at a direct client', () => {
    const g = gates(sheet({ direct: true }), { client: 'Northwind', employer: 'Northwind' })
    expect(g.says).toBe('40 hours submitted. Nobody has approved them yet.')
  })
})
