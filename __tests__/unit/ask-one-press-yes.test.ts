import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { queueAct } from '@/app/api/conversations/twin/ask'


const src = (p: string) => {
  const f = join(process.cwd(), p)
  expect(existsSync(f)).toBe(true)
  return readFileSync(f, 'utf8')
}

describe('a card with a verdict route and no typed field is one press in Ask Etyme', () => {
  it('REQUISITION_APPROVAL is approved in one press through its own route and the record shows it', () => {
    const act = queueAct({ type: 'REQUISITION_APPROVAL', title: 'Approve job request — Java developer', entityId: 'rq-1' } as any)
    expect(act).toMatchObject({ url: '/api/requisitions/rq-1/approve', body: { action: 'approve' } })
    expect(act?.done).toBe('Approved, and recorded under your name.')
    const route = src('src/app/api/requisitions/[id]/approve/route.ts')
    expect(route).toContain("action === 'approve' ? 'APPROVED'")
    expect(route).toContain('REQUISITION_APPROVED')
  })

  it('SUPPLIER_REVIEW is approved in one press through its own route when every item for this role is verified, and the record shows it', () => {
    const act = queueAct({ type: 'SUPPLIER_REVIEW', title: 'Review supplier — Acme', entityId: 'sr-1', subtitle: 'Recommended by Dana · with Procurement: 3 of 3 verified' } as any)
    expect(act).toMatchObject({ url: '/api/supplier-requests/sr-1', method: 'PATCH', body: { action: 'approve' } })
    expect(act?.done).toBe('Approved, and recorded under your name.')
    const route = src('src/app/api/supplier-requests/[id]/route.ts')
    expect(route).toContain("outcome: 'APPROVED'")
  })

  it('SUPPLIER_REVIEW with no paperwork of its own to verify, the department lead, is approved in one press', () => {
    const act = queueAct({ type: 'SUPPLIER_REVIEW', title: 'Review supplier — Acme', entityId: 'sr-2', subtitle: 'Recommended by Dana · with the department lead: Java' } as any)
    expect(act?.body).toEqual({ action: 'approve' })
  })

  it('SUPPLIER_REVIEW with paper still to verify is never one press, the card opens the page', () => {
    expect(queueAct({ type: 'SUPPLIER_REVIEW', title: 'x', entityId: 'sr-3', subtitle: 'Recommended by Dana · with Procurement: 1 of 3 verified, 2 to verify' } as any)).toBeNull()
    expect(queueAct({ type: 'SUPPLIER_REVIEW', title: 'x', entityId: 'sr-4', subtitle: 'Recommended by Dana · with HR: 2 of 3 verified' } as any)).toBeNull()
  })

  it('a paper to check, a candidate, a roll-off, a placement to paper or start, and a receipt to pay stay open-the-page cards, never one press', () => {
    for (const type of ['PAPER_TO_CHECK', 'SUBMISSION_REVIEW', 'ROLLOFF_ACTION', 'CONTRACT_PAPERING', 'CONTRACT_START', 'INVOICE_RECEIPT_TO_PAY', 'INVOICE_RECEIPT_HELD', 'RATE_CONFIRMATION', 'BILL_DISPUTED', 'INVOICE_OVERDUE']) {
      expect(queueAct({ type, title: 't', entityId: 'e-1' } as any), type).toBeNull()
    }
  })

  it('a requisition approval never carries a reason or a supplier list, so the one press answers nothing the route would ask for', () => {
    const act = queueAct({ type: 'REQUISITION_APPROVAL', title: 't', entityId: 'rq-2' } as any)
    expect(Object.keys(act!.body)).toEqual(['action'])
  })
})
