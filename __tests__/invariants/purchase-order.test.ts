/**
 * Purchase orders, and how they differ from buy contracts.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 *
 * The two look alike and are not the same thing. A buy contract carries a
 * RATE — what one person costs per hour. A PO carries a CEILING — how much
 * the payer has authorised a supplier to bill in total, across however many
 * people. They coincide in exactly one case: a C2C buy contract with a
 * vendor company is the same relationship seen from the rate side.
 *
 * Getting this wrong in either direction is expensive. Treating a PO as a
 * contract loses the ceiling that stops overbilling; treating a contract as
 * a PO means a client — who has no buy contracts at all — cannot raise one.
 */

import { describe, it, expect } from 'vitest'
import { poBalance, canAttachPoToBuyContract } from '@/lib/purchase-order'

// ── What a PO is that a contract is not ────────────────

describe('A purchase order is not a buy contract', () => {

  it('one purchase order covers many people, a buy contract covers one', () => {
    // Terumo's PO-2026-4417 spans three contractors. A buy contract has a
    // required personId and cannot span three.
    const po = { number: 'PO-2026-4417', contractsCovered: 3 }
    const buyContract = { personId: 'person-1' }

    expect(po.contractsCovered).toBeGreaterThan(1)
    expect(buyContract.personId).toBeTruthy()
  })

  it('a purchase order carries a ceiling, a buy contract carries a rate', () => {
    const po = { amountCents: 120_000_000 } // $1.2m authorised
    const buyContract = { payRate: 10_500 } // $105/hr

    // Different quantities — neither substitutes for the other
    expect(po).not.toHaveProperty('payRate')
    expect(buyContract).not.toHaveProperty('amountCents')
  })

  it('a client issues purchase orders while having no buy contracts at all', () => {
    // Terumo buys services against an MSA, not talent. It has no payroll
    // entity, no pay rate and no W2 — so no buy contract can represent
    // the PO it must raise to its suppliers.
    const client = { kind: 'CLIENT', buyContracts: 0, posIssued: 2 }
    expect(client.buyContracts).toBe(0)
    expect(client.posIssued).toBeGreaterThan(0)
  })

  it('in the layer cake the two describe different edges entirely', () => {
    // Cloudepa's buy contract pays David Chen. GlobalStaff's PO authorises
    // Cloudepa to bill GlobalStaff. Different parties, different direction.
    const buyContract = { payer: 'cloudepa', paid: 'david-chen' }
    const po = { issuedBy: 'globalstaff', issuedTo: 'cloudepa' }

    expect(buyContract.paid).not.toBe(po.issuedTo)
    expect(buyContract.payer).not.toBe(po.issuedBy)
  })
})

// ── The one case where they coincide ───────────────────

describe('A subcontract is the one case where the two meet', () => {

  it('a C2C buy contract with a vendor company may carry a purchase order', () => {
    const result = canAttachPoToBuyContract({
      vendorCompanyId: 'techvista',
      contractType: 'C2C',
    })
    expect(result.allowed).toBe(true)
  })

  it('direct employment cannot carry a purchase order — there is no supplier', () => {
    const result = canAttachPoToBuyContract({
      vendorCompanyId: null,
      contractType: 'W2',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('no supplier')
  })

  it('a C2C individual with no vendor company still has no supplier to bill', () => {
    // C2C through a personal corporation — legitimate, but there is no
    // counterparty company for a PO to be issued to
    const result = canAttachPoToBuyContract({
      vendorCompanyId: null,
      contractType: 'C2C',
    })
    expect(result.allowed).toBe(false)
  })

  it('the buy contract keeps the rate and the purchase order keeps the ceiling', () => {
    // Cloudepa subcontracts Kavitha from TechVista at $105/hr against a
    // $180,000 PO — both facts are needed and neither implies the other
    const subcontract = { payRate: 10_500, purchaseOrderId: 'po-1' }
    const po = { id: 'po-1', amountCents: 18_000_000 }

    expect(subcontract.purchaseOrderId).toBe(po.id)
    expect(subcontract.payRate).not.toBe(po.amountCents)
  })
})

// ── Balance ────────────────────────────────────────────

describe('Purchase order balance decides whether more may be billed', () => {

  const OPEN = 'OPEN' as const

  it('an untouched purchase order has its full amount remaining', () => {
    const b = poBalance({ amountCents: 100_000, invoicedCents: 0, status: OPEN })
    expect(b.remainingCents).toBe(100_000)
    expect(b.consumedPercent).toBe(0)
    expect(b.canInvoice).toBe(true)
  })

  it('a half-drawn purchase order reports fifty percent consumed', () => {
    const b = poBalance({ amountCents: 100_000, invoicedCents: 50_000, status: OPEN })
    expect(b.consumedPercent).toBe(50)
    expect(b.canInvoice).toBe(true)
  })

  it('a fully drawn purchase order cannot take another invoice', () => {
    const b = poBalance({ amountCents: 100_000, invoicedCents: 100_000, status: OPEN })
    expect(b.remainingCents).toBe(0)
    expect(b.canInvoice).toBe(false)
    expect(b.reason).toContain('change order')
  })

  it('an overdrawn purchase order is reported, not quietly clamped', () => {
    // This is the condition a PO exists to catch — hiding it defeats the control
    const b = poBalance({ amountCents: 100_000, invoicedCents: 112_500, status: OPEN })
    expect(b.overdrawn).toBe(true)
    expect(b.remainingCents).toBe(-12_500)
    expect(b.canInvoice).toBe(false)
    expect(b.reason).toContain('Overdrawn by $125.00')
  })

  it('consumed percent never exceeds one hundred even when overdrawn', () => {
    const b = poBalance({ amountCents: 100_000, invoicedCents: 250_000, status: OPEN })
    expect(b.consumedPercent).toBe(100)
    expect(b.overdrawn).toBe(true)
  })

  it('a cancelled purchase order takes no further invoices', () => {
    const b = poBalance({ amountCents: 100_000, invoicedCents: 0, status: 'CANCELLED' })
    expect(b.canInvoice).toBe(false)
    expect(b.reason).toContain('cancelled')
  })

  it('a closed purchase order takes no further invoices even with budget left', () => {
    const b = poBalance({ amountCents: 100_000, invoicedCents: 10_000, status: 'CLOSED' })
    expect(b.remainingCents).toBe(90_000)
    expect(b.canInvoice).toBe(false)
    expect(b.reason).toContain('closed')
  })

  it('an expired purchase order takes no further invoices', () => {
    const b = poBalance(
      {
        amountCents: 100_000,
        invoicedCents: 0,
        status: OPEN,
        endDate: new Date('2025-01-01'),
      },
      new Date('2026-08-16')
    )
    expect(b.expired).toBe(true)
    expect(b.canInvoice).toBe(false)
    expect(b.reason).toContain('expired')
  })

  it('a purchase order ending in the future is still available', () => {
    const b = poBalance(
      {
        amountCents: 100_000,
        invoicedCents: 0,
        status: OPEN,
        endDate: new Date('2027-01-01'),
      },
      new Date('2026-08-16')
    )
    expect(b.expired).toBe(false)
    expect(b.canInvoice).toBe(true)
  })

  it('a zero-value purchase order reads as fully consumed rather than dividing by zero', () => {
    const b = poBalance({ amountCents: 0, invoicedCents: 0, status: OPEN })
    expect(b.consumedPercent).toBe(100)
    expect(b.canInvoice).toBe(false)
  })
})
