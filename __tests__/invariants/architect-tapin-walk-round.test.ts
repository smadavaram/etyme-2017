import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { describeLine, lineDoes, pairLine, paidBy } from '@/lib/order-naming'
import { relationshipForKind } from '@/lib/counterparty'
import { nameFromLink } from '@/lib/password'
import { seatedWhoMay, whoMaySays, notYourButton } from '@/lib/refusal-words'
import { claimsNoStake } from '@/lib/positioning'
import * as seats from '@/app/demo/seats'

/** The Tapin walks of 2026-11-14, the faults in the architect's files. */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('a person the firm does not employ is never said to be paid by payroll', () => {
  const buy = (contractType: string | null) => ({ side: 'BUY' as const, personName: 'Cara Lindqvist', contractType })

  it('a 1099 buy line says she is paid on her own invoice and is not your employee', () => {
    const says = lineDoes(buy('IND_1099'), 'BYSTANDER')
    expect(says).toBe('You pay from this line — their own invoice, as an independent contractor. They are not your employee.')
    expect(says).not.toMatch(/payroll|you employ/i)
  })

  it('a line paid through her own company says her company invoices and she is not your employee', () => {
    expect(lineDoes(buy('C2C'), 'BYSTANDER')).toBe('You pay from this line — their own company’s invoice. They are not your employee.')
  })

  it('a 1099 line with no order never says payroll pays it', () => {
    const d = describeLine({ order: null, companyId: 'c1', line: buy('IND_1099') })
    expect(d.heading).toBe('Not yet on an order.')
    expect(d.says).toBe('Not yet on an order. They are paid on their own invoice, as an independent contractor, not by payroll. They are not your employee.')
    expect(paidBy(buy('IND_1099'))).toBe('INVOICE_RECEIPT')
  })

  it('the sell line paired with a 1099 says what you pay her, never payroll', () => {
    const s = pairLine({ side: 'SELL', counterpartName: null, contractType: 'IND_1099' })
    expect(s).toBe('Paired with what you pay them on their own invoice, as an independent contractor. They are not your employee.')
    expect(pairLine({ side: 'BUY', counterpartName: 'Lakeshore Mills', contractType: 'C2C' }))
      .toBe('Funds the line you bill Lakeshore Mills from, and is paid on their own company’s invoice.')
  })

  it('a W2 employee still reads payroll, because the firm employs her', () => {
    expect(lineDoes(buy('W2'), 'BYSTANDER')).toBe('You pay from this line — payroll, because you employ them.')
    expect(pairLine({ side: 'SELL', counterpartName: null, contractType: 'W2' })).toBe('Paired with payroll, because you employ them.')
    expect(describeLine({ order: null, companyId: 'c1', line: buy('W2') }).says).toMatch(/Payroll pays this line\.$/)
    expect(paidBy(buy('W2'))).toBe('PAYROLL')
  })

  it('a firm named below the line is still paid on that firm’s invoice, whatever the type', () => {
    expect(lineDoes({ ...buy('IND_1099'), paidToName: 'Northgate Talent' }, 'BYSTANDER'))
      .toBe("You pay from this line — Northgate Talent's invoice, received and matched.")
  })
})

describe('the sentence names only the roles this company has seated', () => {
  const mayActivate = ['Resource Manager', 'Contract Manager']

  it('where none of the roles that activate is seated, the sentence names the Owner or an Admin', () => {
    const tapin = ['Owner', 'HR', 'Account Manager', 'AP & Payroll', 'Admin']
    const names = seatedWhoMay(mayActivate, tapin)
    expect(names).toEqual(['Owner', 'Admin'])
    expect(whoMaySays(names)).toBe('the Owner or an Admin')
  })

  it('where one of them is seated, only that role is named', () => {
    const names = seatedWhoMay(mayActivate, ['Owner', 'HR', 'Contract Manager'])
    expect(names).toEqual(['Contract Manager'])
    expect(whoMaySays(names)).toBe('the Contract Manager')
  })

  it('a seat with no button reads one sentence saying who can', () => {
    expect(notYourButton('recording a placement', ['Owner', 'Admin']))
      .toBe('Recording a placement is for the Owner or an Admin here. Ask one of them.')
    expect(notYourButton('recording a placement', ['Contract Manager']))
      .toBe('Recording a placement is for the Contract Manager here. Ask them.')
  })
})

describe('add company starts the second answer from the Kind', () => {
  it('a company of Kind Client starts as a client who buys from us', () => {
    expect(relationshipForKind('CLIENT')).toBe('CLIENT')
  })

  it('an MSP starts as an MSP and a vendor still starts as a supplier', () => {
    expect(relationshipForKind('MSP')).toBe('MSP')
    expect(relationshipForKind('VENDOR')).toBe('SUPPLIER')
  })

  it('choosing the Kind sets the answer, and the answer stays its own box to change', () => {
    const page = src('src/app/dashboard/companies/page.tsx')
    expect(page).toContain('relationship: relationshipForKind(e.target.value)')
    expect(page).toContain('onChange={(e) => setForm({ ...form, relationship: e.target.value })}')
  })
})

describe('a candidate who said yes to a bench is not asked her name twice', () => {
  it('the name the firm gave is carried into the sign-up form, still editable', () => {
    expect(nameFromLink('  Marisol   Quintero ')).toBe('Marisol Quintero')
    const page = src('src/app/(auth)/signup/page.tsx')
    expect(page).toContain('nameFromLink(searchParams?.name)')
    expect(page).toContain('initialName={name}')
    expect(src('src/app/(auth)/signup/form.tsx')).toContain('useState(initialName)')
  })

  it('anything in the link that does not read as a name is dropped, never shown', () => {
    expect(nameFromLink('<script>')).toBe('')
    expect(nameFromLink('https://example.invalid/x')).toBe('')
    expect(nameFromLink('a')).toBe('')
    expect(nameFromLink(undefined)).toBe('')
  })
})

describe('the demo never says Etyme places nobody', () => {
  it('no demo seat says Etyme runs no bench or places nobody, and the worker still reads that nothing happens until she acts', () => {
    const all = JSON.stringify(seats)
    const strings = [...all.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`) as string)
    expect(strings.flatMap((s) => claimsNoStake(s))).toEqual([])
    expect(all).toContain('Nothing happens until you act.')
  })
})
