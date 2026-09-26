import { describe, it, expect } from 'vitest'
import {
  whoseBooks, seatMayPay, seatedRefusal, moneyTrailFor,
  type SeatFacts,
} from '@/lib/money/seated-books'
import { invoiceBetween } from '@/lib/money/invoice-parties'

/**
 * Whose books a money page is reading, and who may move the money on it.
 *
 * The arithmetic of the seat, with no database in it. A program office
 * that runs a client's program has no contract with that client and
 * never will, so every money route in this domain scoped itself to
 * `caller.company.id` and served the office its own books while it sat
 * at the client's desk. These are the sentences that decide which book
 * a reader is on.
 */

const APTIVA = { id: 'office', name: 'Aptiva Workforce', kind: 'MSP' }
const BRIGHTMOOR = { id: 'supplier', name: 'Brightmoor Staffing', kind: 'VENDOR' }

function seat(over: Partial<SeatFacts> = {}): SeatFacts {
  return {
    id: 'seat-1',
    clientCompany: { id: 'client', name: 'Cavanaugh Glassworks', slug: 'cav', kind: 'CLIENT' },
    officeCompany: { id: 'office', name: 'Aptiva Workforce' },
    role: { id: 'role-1', name: 'Program Manager', permissions: ['invoices.read'] },
    orgUnitId: null,
    ...over,
  }
}

describe('whose books a money page is reading', () => {
  it('a company with no seat anywhere reads its own books, exactly as before', () => {
    const d = whoseBooks({ own: BRIGHTMOOR, seat: null, askedForOwn: false })
    expect(d.seated).toBe(false)
    expect(d.companyId).toBe('supplier')
    expect(d.says).toBeNull()
  })

  it('a program office sitting in a seat reads the client that seated it, not itself', () => {
    const d = whoseBooks({ own: APTIVA, seat: seat(), askedForOwn: false })
    expect(d.seated).toBe(true)
    expect(d.companyId).toBe('client')
    expect(d.companyName).toBe('Cavanaugh Glassworks')
  })

  it('a program office is told whose books it is on, in a sentence and not a code', () => {
    const d = whoseBooks({ own: APTIVA, seat: seat(), askedForOwn: false })
    expect(d.says).toContain('Cavanaugh Glassworks')
    expect(d.says).toContain('Program Manager')
    expect(d.says).toContain('Aptiva Workforce')
    expect(d.says).toContain('logged')
    // The way back to its own book is a button on the screen. A query
    // parameter in front of a person is a code.
    expect(d.says).not.toContain('books=own')
    expect(d.says).not.toContain('?')
  })

  it('a program office asking for its own books gets its own books and no seat', () => {
    const d = whoseBooks({ own: APTIVA, seat: seat(), askedForOwn: true })
    expect(d.seated).toBe(false)
    expect(d.companyId).toBe('office')
  })

  it('a seated office reads the client contracts the client pays, and nothing below that rung', () => {
    const d = whoseBooks({ own: APTIVA, seat: seat(), askedForOwn: false })
    // The same scope a client's own desk gets: the line it pays. A
    // sub-vendor's line below names the prime as its customer and is
    // therefore not in it.
    expect(d.sellContractWhere).toEqual({ clientCompanyId: 'client' })
  })

  it('a seat scoped to one business unit reads that unit and no other', () => {
    const d = whoseBooks({
      own: APTIVA,
      seat: seat({ orgUnitId: 'unit-plant' }),
      askedForOwn: false,
      unitsInSeat: ['unit-plant', 'unit-line-a'],
    })
    expect(d.sellContractWhere).toEqual({
      clientCompanyId: 'client',
      OR: [{ orgUnitId: { in: ['unit-plant', 'unit-line-a'] } }, { orgUnitId: null }],
    })
  })

  it('a firm reading its own books is scoped by the same helper as before, untouched', () => {
    // The unseated branch is `payerScope` and stays `payerScope`. Two
    // answers to one question is how a narrow scope gets replaced by a
    // broad one, which is the shape of every rate leak in this codebase.
    const d = whoseBooks({
      own: BRIGHTMOOR,
      ownSellWhere: { companyId: 'supplier' },
      ownBuyWhere: { companyId: 'supplier' },
      seat: null,
      askedForOwn: false,
    })
    expect(d.sellContractWhere).toEqual({ companyId: 'supplier' })
    expect(d.buyContractWhere).toEqual({ companyId: 'supplier' })
  })

  it('the invoices in scope are the same cascade every other reader gets, on the client’s id', () => {
    // One answer to "which invoices are ours": the agreement, then the
    // order, then the lines billed. A seat changes whose id it is asked
    // about and nothing else.
    const seated = whoseBooks({ own: APTIVA, seat: seat(), askedForOwn: false })
    expect(seated.invoiceWhere).toEqual(invoiceBetween('client'))

    const own = whoseBooks({ own: APTIVA, seat: null, askedForOwn: false })
    expect(own.invoiceWhere).toEqual(invoiceBetween('office'))
  })

  it('a seated office reads the buy side of the client and never its own payroll', () => {
    const d = whoseBooks({ own: APTIVA, seat: seat(), askedForOwn: false })
    expect(d.buyContractWhere).toEqual({ companyId: 'client' })
  })
})

describe('what a seated desk may do with money', () => {
  it('a seated AP clerk may record a payment where the client’s own desk records payments', () => {
    const verdict = seatMayPay(seat({
      role: { id: 'r', name: 'AP Clerk', permissions: ['invoices.read', 'payments.record'] },
    }))
    expect(verdict.ok).toBe(true)
  })

  it('a seat at a desk that does not pay is refused, in a sentence naming the client’s rule', () => {
    const verdict = seatMayPay(seat())
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.says).toContain('Cavanaugh Glassworks')
    expect(verdict.says).toContain('Program Manager')
    // Never a permission code in front of a person.
    expect(verdict.says).not.toContain('payments.record')
  })

  it('a seated desk refused a read is told the client decides what the desk may do', () => {
    const says = seatedRefusal(seat(), 'Accounts payable')
    expect(says).toContain('Cavanaugh Glassworks')
    expect(says).toContain('Accounts payable')
    expect(says).toContain('Aptiva Workforce')
  })

  it('the trail on a seated act names the office, the desk and the client that granted it', () => {
    const trail = moneyTrailFor(seat(), 'Payment recorded')
    expect(trail).toContain('Payment recorded')
    expect(trail).toContain('Aptiva Workforce')
    expect(trail).toContain('Program Manager')
    expect(trail).toContain('Cavanaugh Glassworks')
    expect(trail).toContain('seat-1')
  })

  it('a firm acting on its own books writes no seat into the trail', () => {
    expect(moneyTrailFor(null, 'Payment recorded')).toBeNull()
  })
})
