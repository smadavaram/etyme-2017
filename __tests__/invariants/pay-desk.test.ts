import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { payDesk, desksThatPay, payDeskPermissions, runDesk } from '@/lib/money/pay-desk'
import { rolesFor } from '@/lib/company-defaults'

/**
 * An outside review, 2026-10-05: a client's Program Manager was offered
 * "Pay" on an invoice receipt, pressed it, and the server refused —
 * the role does not hold `payments.record`, and every payment route
 * gates on it. A button the route will refuse is a button that lies.
 *
 * So Pay, the pay form and the payment-run buttons are drawn only for
 * a seat that may pay, judged the way the route judges it: the client's
 * own role where a program office sits at a client's desk, the reader's
 * own role everywhere else. Whoever may not pay reads what is owed and
 * who pays it, in a sentence.
 */

const perms = (kind: 'CLIENT' | 'VENDOR' | 'MSP', name: string) =>
  rolesFor(kind).find((r) => r.name === name)!.permissions as readonly string[]

const ROOT = join(__dirname, '..', '..', 'src')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const LIST = read('app/dashboard/invoices/page.tsx')
const DETAIL = read('app/dashboard/invoices/[id]/page.tsx')
const MONEY = read('app/dashboard/invoices/invoice-money.tsx')
const AP = read('app/dashboard/ap/page.tsx')

describe('who is offered Pay', () => {
  it('a program manager reads what is owed and who pays it, and is never offered Pay', () => {
    const d = payDesk({
      permissions: perms('CLIENT', 'Program Manager'),
      companyKind: 'CLIENT',
      companyName: 'Northbend Athletic',
      side: 'PAYABLE',
    })
    expect(d.mayPay).toBe(false)
    expect(d.says).toMatch(/AP Clerk/)
    expect(d.says).toMatch(/Northbend Athletic/)
    expect(d.says).not.toMatch(/payments\.record/)
  })

  it('a client’s AP clerk is offered Pay', () => {
    expect(payDesk({ permissions: perms('CLIENT', 'AP Clerk'), companyKind: 'CLIENT', side: 'PAYABLE' }).mayPay).toBe(true)
  })

  it('an owner, whose role holds everything, is offered Pay', () => {
    expect(payDesk({ permissions: ['*'], companyKind: 'CLIENT', side: 'PAYABLE' }).mayPay).toBe(true)
  })

  it('a hiring manager, who approves hours and holds no money desk, is never offered Pay', () => {
    expect(payDesk({ permissions: perms('CLIENT', 'Hiring Manager'), companyKind: 'CLIENT', side: 'PAYABLE' }).mayPay).toBe(false)
  })

  it('a supplier’s account manager is not offered the form that records what a client paid, and is told which desk records it', () => {
    const d = payDesk({ permissions: perms('VENDOR', 'Account Manager'), companyKind: 'VENDOR', side: 'RECEIVABLE' })
    expect(d.mayPay).toBe(false)
    expect(d.says).toMatch(/Accounts Receivable/)
    expect(d.says).toMatch(/records what came in|record/i)
  })

  it('a seat whose permissions are not known yet is offered neither a button nor a sentence', () => {
    const d = payDesk({ permissions: null, companyKind: 'CLIENT', side: 'PAYABLE' })
    expect(d.mayPay).toBe(false)
    expect(d.says).toBeNull()
  })
})

describe('a program office in a client’s seat is judged by the seat', () => {
  const seat = { clientName: 'Cavanaugh Glassworks', roleName: 'Program Manager', permissions: perms('CLIENT', 'Program Manager') }

  it('an office that pays its own suppliers at home is not offered Pay at a client desk that does not pay', () => {
    const permissions = payDeskPermissions({ own: ['*'], seat, readingInASeat: true })
    const d = payDesk({ permissions, companyKind: 'CLIENT', seat, side: 'PAYABLE' })
    expect(d.mayPay).toBe(false)
    expect(d.says).toMatch(/Cavanaugh Glassworks/)
    expect(d.says).toMatch(/Program Manager desk/)
    expect(d.says).toMatch(/AP Clerk/)
  })

  it('an office seated at the client’s AP clerk desk is offered Pay on the client’s book', () => {
    const apSeat = { ...seat, roleName: 'AP Clerk', permissions: perms('CLIENT', 'AP Clerk') }
    const permissions = payDeskPermissions({ own: [], seat: apSeat, readingInASeat: true })
    expect(payDesk({ permissions, companyKind: 'CLIENT', seat: apSeat, side: 'PAYABLE' }).mayPay).toBe(true)
  })

  it('an office reading its own books is judged by its own role, not the seat', () => {
    expect(payDeskPermissions({ own: ['payments.record'], seat, readingInASeat: false })).toEqual(['payments.record'])
  })

  it('a page that says it reads a client’s book with no seat in the session offers nothing rather than guessing', () => {
    expect(payDeskPermissions({ own: ['*'], seat: null, readingInASeat: true })).toBeNull()
  })
})

describe('the desks named as the ones that pay come from the roles, not a hand-kept list', () => {
  it('a client is told its AP clerk pays, never its owner or its program manager', () => {
    expect(desksThatPay('CLIENT')).toEqual(['AP Clerk'])
  })

  it('a supplier is told Accounts Receivable, AP & Payroll or Finance — never Admin, whose desk is everything', () => {
    const names = desksThatPay('VENDOR')
    expect(names).toContain('Accounts Receivable')
    expect(names).toContain('AP & Payroll')
    expect(names).toContain('Finance')
    expect(names).not.toContain('Admin')
    expect(names).not.toContain('Owner')
  })
})

describe('a payment run is offered only to the desk that pays', () => {
  it('a seat without the paying desk reads who runs payments, and is offered no run to assemble, approve or release', () => {
    const d = runDesk({ permissions: perms('VENDOR', 'Contract Manager'), companyKind: 'VENDOR', inASeat: null })
    expect(d.mayRun).toBe(false)
    expect(d.says).toMatch(/AP & Payroll/)
  })

  it('a desk that pays is offered the run buttons', () => {
    expect(runDesk({ permissions: perms('VENDOR', 'AP & Payroll'), companyKind: 'VENDOR', inASeat: null }).mayRun).toBe(true)
  })

  it('a program office reading a client’s payables is told runs are drawn from its own book, and is offered no run under the client’s name', () => {
    const d = runDesk({ permissions: ['*'], companyKind: 'MSP', inASeat: { clientName: 'Talvern Medical' } })
    expect(d.mayRun).toBe(false)
    expect(d.says).toMatch(/Talvern Medical/)
    expect(d.says).toMatch(/own/)
    expect(d.readsRuns).toBe(false)
  })
})

describe('the screens draw Pay from the desk, never from the check alone', () => {
  it('the invoice list draws Pay only where the reader’s desk pays', () => {
    expect(LIST).toContain("from '@/lib/money/pay-desk'")
    expect(LIST).toMatch(/payable && mayPay/)
  })

  it('the invoice page hands the pay form the desk’s verdict', () => {
    expect(DETAIL).toContain("from '@/lib/money/pay-desk'")
    expect(DETAIL).toMatch(/desk=\{/)
  })

  it('the pay form is drawn only where the desk pays, and the sentence stands in its place otherwise', () => {
    expect(MONEY).toMatch(/desk\.mayPay/)
    expect(MONEY).toMatch(/desk\.says/)
  })

  it('accounts payable draws the payment-run buttons only for the desk that runs them', () => {
    expect(AP).toContain("from '@/lib/money/pay-desk'")
    expect(AP).toMatch(/desk\.mayRun/)
  })
})

describe('a receipt nobody placed is placed only by the desk that records payments', () => {
  const AR = read('app/dashboard/ar/page.tsx')

  it('accounts receivable offers "Place it" only where the desk records what came in', () => {
    expect(AR).toContain("from '@/lib/money/pay-desk'")
    expect(AR).toMatch(/desk\.mayPay && \(\s*<button/)
    expect(AR).toMatch(/desk\.mayPay && openId === r\.id/)
  })
})
