import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CHANGES_A_PAPER_SET,
  mayChangePaperSet,
  paperSetHref,
  paperStanding,
  paperSetSays,
} from '@/lib/money/paper-set'

/**
 * A client reaches what its own order asks for on paper.
 *
 * Found by the screen walk of 2026-10-22: the set an order requires
 * (DocumentRequirement rows on the WorkOrder) had a screen and no way to
 * it — nothing on the purchase orders page or the contracts page opened
 * it. Now both show the set, read-only, and offer the change only to a
 * desk the document-set route would let change it.
 */

const CLIENT = 'co-northbend'
const SUPPLIER = 'co-techpeple'

describe('who may change what an order asks for on paper', () => {
  it('the buyer’s program manager or compliance officer may change what its order asks for', () => {
    expect(mayChangePaperSet({ viewerCompanyId: CLIENT, buyerCompanyId: CLIENT, permissions: ['governance.write'] })).toBe(true)
    expect(mayChangePaperSet({ viewerCompanyId: CLIENT, buyerCompanyId: CLIENT, permissions: ['privacy.manage'] })).toBe(true)
    expect(mayChangePaperSet({ viewerCompanyId: CLIENT, buyerCompanyId: CLIENT, permissions: ['*'] })).toBe(true)
  })

  it('a supplier reads what its customer’s order asks for and is never offered the change, whatever it holds at home', () => {
    expect(mayChangePaperSet({ viewerCompanyId: SUPPLIER, buyerCompanyId: CLIENT, permissions: ['*'] })).toBe(false)
  })

  it('a desk at the buyer without either permission reads the set and is not offered the change', () => {
    expect(mayChangePaperSet({ viewerCompanyId: CLIENT, buyerCompanyId: CLIENT, permissions: ['invoices.read', 'assignments.write'] })).toBe(false)
  })

  it('a program office in the client’s seat may change it only where the role the client gave it may', () => {
    const office = 'co-maren'
    expect(mayChangePaperSet({
      viewerCompanyId: office, buyerCompanyId: CLIENT, permissions: ['*'],
      seat: { clientId: CLIENT, permissions: ['governance.write'] },
    })).toBe(true)
    expect(mayChangePaperSet({
      viewerCompanyId: office, buyerCompanyId: CLIENT, permissions: ['*'],
      seat: { clientId: CLIENT, permissions: ['invoices.read'] },
    })).toBe(false)
    // A seat at a different client changes nothing here.
    expect(mayChangePaperSet({
      viewerCompanyId: office, buyerCompanyId: CLIENT, permissions: ['*'],
      seat: { clientId: 'co-cavanaugh', permissions: ['governance.write'] },
    })).toBe(false)
  })

  it('the desks offered the change are the same desks the document-set route lets through', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/documents/requirements/route.ts'), 'utf8')
    const m = /const MAY_CHANGE = \[([^\]]*)\]/.exec(route)
    expect(m, 'the route still names its desks in MAY_CHANGE').not.toBeNull()
    const theirs = m![1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean).sort()
    expect([...CHANGES_A_PAPER_SET].sort()).toEqual(theirs)
  })
})

describe('the set, said on the order and on the line', () => {
  it('opens the order’s own set, or one line’s, at the document-set page', () => {
    expect(paperSetHref({ workOrderId: 'wo 1' })).toBe('/dashboard/documents/requirements?workOrderId=wo%201')
    expect(paperSetHref({ sellContractId: 's1' })).toBe('/dashboard/documents/requirements?sellContractId=s1')
    expect(paperSetHref({ buyContractId: 'b1' })).toBe('/dashboard/documents/requirements?buyContractId=b1')
  })

  it('a waived item says waived, a document that stops work says so, and an optional one is never read as required', () => {
    expect(paperStanding({ waived: true, blocks: true, required: true, waiverRefused: false })).toBe('Waived')
    expect(paperStanding({ waived: true, blocks: true, required: true, waiverRefused: true })).toBe('Waiver refused')
    expect(paperStanding({ waived: false, blocks: true, required: true, waiverRefused: false })).toBe('Stops work')
    expect(paperStanding({ waived: false, blocks: false, required: true, waiverRefused: false })).toBe('Required')
    expect(paperStanding({ waived: false, blocks: false, required: false, waiverRefused: false })).toBe('Optional')
  })

  it('an order that asks for nothing of its own says its lines still carry their floor, rather than that nothing is required', () => {
    expect(paperSetSays({ count: 0, onOrder: true })).toMatch(/floor/)
    expect(paperSetSays({ count: 1, onOrder: true })).toBe('This order asks for 1 document of its own.')
    expect(paperSetSays({ count: 4, onOrder: false })).toBe('This line asks for 4 documents.')
  })
})

describe('the two pages that open it', () => {
  const po = readFileSync(join(process.cwd(), 'src/app/dashboard/purchase-orders/page.tsx'), 'utf8')
  const contracts = readFileSync(join(process.cwd(), 'src/app/dashboard/contracts/page.tsx'), 'utf8')
  const panel = readFileSync(join(process.cwd(), 'src/app/dashboard/purchase-orders/paper-set.tsx'), 'utf8')

  it('the purchase orders page shows each order’s paper set', () => {
    expect(po).toMatch(/<PaperSet/)
    expect(po).toMatch(/workOrderId/)
  })

  it('the contracts drawer shows the line’s set and the order’s', () => {
    expect(contracts).toMatch(/<PaperSet/)
    expect(contracts).toMatch(/workOrderId/)
  })

  it('the set is read-only on both pages: the only way to change it is a link offered to a desk that may', () => {
    expect(panel).not.toMatch(/method: 'POST'/)
    expect(panel).toMatch(/mayChange &&/)
  })
})
