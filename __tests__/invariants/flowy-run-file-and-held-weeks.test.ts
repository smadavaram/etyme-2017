/**
 * Three dead ends found in a browser walk of the payment-run line file:
 * a total-only receipt with no next step, an assemble sentence that
 * contradicted an approved run beside it, and a held week's long
 * sentence breaking the payroll table.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const file = read('src/app/dashboard/ap/payment-run-file.tsx')
const ap = read('src/app/dashboard/ap/page.tsx')
const payroll = read('src/app/dashboard/payroll/page.tsx')

describe('a receipt recorded only as a total says what to do next', () => {
  it('the file screen adds the next step under the held sentence where it says there are no lines', () => {
    expect(file).toContain("said.includes('no lines')")
    expect(file).toContain('Lines cannot be added to an invoice receipt recorded as a total.')
    expect(file).toContain('Ask the supplier to send the bill from Etyme with its lines')
  })

  it('the next step links to the Invoice receipts tab the page already has', () => {
    expect(file).toContain('Open Invoice receipts')
    expect(ap).toContain("onOpenReceipts={() => setTab('receipts')}")
  })
})

describe('the assemble panel speaks only about assembling', () => {
  it('an empty proposal reads as nothing more to put in a new run, never as nothing to pay', () => {
    expect(ap).toContain('Nothing more to put in a new run on ')
    expect(ap).toContain('{assembleSays(proposed, payOn)}')
    expect(ap).not.toContain('{proposed.says}')
  })
})

describe('a held week on the payroll page is not drawn inside a table cell', () => {
  const hoursCell = payroll.slice(payroll.indexOf("key: 'hours'"), payroll.indexOf("key: 'grossPay'"))
  it('the hours cell holds none of the held-week sentences', () => {
    expect(hoursCell).not.toContain('row.exemptHeld')
    expect(hoursCell).not.toContain('row.windowHeld')
    expect(hoursCell).not.toContain('row.notAccepted')
  })

  it('each held week is a line under the table, with the person named and the act beside it', () => {
    const below = payroll.slice(payroll.indexOf('aria-label="Weeks held off this pay"'))
    expect(below).toContain('{row.person.name}')
    expect(below).toContain('<ExemptAnswer')
    expect(below).toContain('<WindowRepair')
    expect(below).toContain('{row.notAccepted}')
  })
})
