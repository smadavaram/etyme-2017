import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { supplierLineSays } from '@/lib/money/bill-feed'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const at = (iso: string) => new Date(iso)
const base = { clientName: 'Northwind Foods' }
const m = (state: string, extra: Record<string, unknown> = {}) =>
  ({ state, direction: state === 'SENT' ? 'OUT' : 'IN', createdAt: at('2026-03-04T12:00:00Z'), ...extra }) as never

describe('the supplier reads each line of its bill in its own words', () => {
  it('a line never sent reads Not sent yet', () => {
    expect(supplierLineSays({ stands: null, sentAt: null, ...base })).toEqual({ says: 'Not sent yet', next: null })
  })
  it('a line whose send failed on the client’s side still reads Not sent yet', () => {
    expect(supplierLineSays({ stands: m('FAILED', { reason: 'timeout' }), sentAt: null, ...base }).says).toBe('Not sent yet')
  })
  it('a sent line names the client’s system and the day', () => {
    const w = supplierLineSays({ stands: m('SENT'), sentAt: at('2026-03-04T12:00:00Z'), ...base }).says
    expect(w).toMatch(/^Sent to Northwind Foods’s system on /)
  })
  it('an accepted line reads Accepted by the client’s system', () => {
    expect(supplierLineSays({ stands: m('ACCEPTED'), sentAt: null, ...base }).says).toBe('Accepted by Northwind Foods’s system')
  })
  it('a paid line reads the day and the client’s reference', () => {
    const w = supplierLineSays({ stands: m('PAID', { answeredAt: at('2026-03-10T12:00:00Z'), externalRef: 'BANK-9' }), sentAt: null, ...base }).says
    expect(w).toMatch(/^Paid on .+, ref BANK-9$/)
  })
  it('the supplier reads why its client’s system rejected a line, and the next step is the client’s AP, never sending the bill again', () => {
    const w = supplierLineSays({ stands: m('REJECTED', { reason: 'Wrong GL account' }), sentAt: null, ...base })
    expect(w.says).toBe('Rejected by Northwind Foods’s system: Wrong GL account')
    expect(w.next).toContain('Ask Northwind Foods’s AP')
    expect(w.next).not.toMatch(/send the bill again/i)
  })
  it('a rejection with no reason says so rather than leaving a blank', () => {
    expect(supplierLineSays({ stands: m('REJECTED', { reason: ' ' }), sentAt: null, ...base }).says).toContain('no reason was given')
  })
})

describe('the supplier’s bill page draws the states only where the state route answers', () => {
  const page = read('src/app/dashboard/invoices/[id]/page.tsx')
  const screen = read('src/app/dashboard/invoices/bill-line-states.tsx')
  const route = read('src/app/api/ap/receipts-file/state/route.ts')
  it('the states are drawn for the sender of a sent bill at its own books, the same reader the route answers', () => {
    const i = page.indexOf('<BillLineStates')
    expect(page.slice(i - 140, i)).toContain("inv.direction === 'RECEIVABLE' && inv.status !== 'DRAFT' && !readingInASeat")
    expect(screen).toContain('/api/ap/receipts-file/state?invoice=')
    expect(route).toContain("searchParams.get('invoice')")
  })
  it('a refused read draws nothing and the screen holds no client code', () => {
    expect(screen).toContain('if (!r.ok) return null')
    expect(screen).not.toMatch(/glAccount|costCenter|profitCenter|companyCode/)
  })
})

describe('a seat in the client’s program pays by the client’s role, as the payments route does', () => {
  it('the confirmation no longer refuses a seat, and names the client as the payer', () => {
    expect(read('src/lib/money/feed-answer-read.ts')).not.toContain('not from a seat in its program')
    expect(read('src/lib/money/run-confirm-door.ts')).toContain('const seated = caller.company!.id !== companyId')
  })
  it('the answer route still asks the client’s role for payments.record before anything is read', () => {
    const r = read('src/app/api/ap/receipts-file/answer/route.ts')
    expect(r.indexOf("hasPermission(permissions, 'payments.record')")).toBeGreaterThan(0)
    expect(r.indexOf('takeAnswer(')).toBeGreaterThan(r.indexOf("hasPermission(permissions, 'payments.record')"))
  })
})
