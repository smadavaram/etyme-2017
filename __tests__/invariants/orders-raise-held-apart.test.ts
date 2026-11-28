import { describe, it, expect } from 'vitest'
import { HELD_APART, PERMISSIONS, PERMISSION_WORDS, heldTogether, inWords } from '@/lib/permissions'

/**
 * The second Tapin walk, 2026-10-30: Accounts Receivable raised a
 * purchase order, because the order route asked for invoices.issue. An
 * order is the ceiling a supplier bills against; the Contract Manager
 * role exists to keep raising it apart from awarding and from billing.
 */

describe('raising an order is its own permission, held apart from billing and awarding', () => {
  it('raising an order is a permission of its own, said in words', () => {
    expect(PERMISSIONS).toContain('orders.raise')
    expect(PERMISSION_WORDS['orders.raise']).toBe('raise an order to a supplier, setting the most it may bill')
    expect(inWords(['orders.raise'])).toBe('raise an order to a supplier, setting the most it may bill')
  })

  it('the seat that raises an order is not the seat that bills on it or awards against it', () => {
    const pairs = HELD_APART.filter((p) => p.a === 'orders.raise').map((p) => p.b)
    expect(pairs).toEqual(['invoices.issue', 'requirements.write'])
    for (const p of HELD_APART) expect(p.because).toMatch(/^The seat that raises an order is not the seat that/)
  })

  it('a role that raises orders and bills on them is named, with the reason', () => {
    const found = heldTogether({ name: 'Accounts Receivable', permissions: ['invoices.read', 'invoices.issue', 'orders.raise'] })
    expect(found).toHaveLength(1)
    expect(found[0].because).toContain('writes the limit and the claim against it')
  })

  it('a role that raises orders and awards against them is named, with the reason', () => {
    const found = heldTogether({ name: 'Hiring Manager', permissions: ['requirements.write', 'orders.raise'] })
    expect(found.map((p) => p.b)).toEqual(['requirements.write'])
  })

  it('a Contract Manager who raises orders and neither bills nor awards holds nothing together', () => {
    expect(heldTogether({ name: 'Contract Manager', permissions: ['assignments.write', 'rates.write', 'orders.raise'] })).toEqual([])
  })

  it('the owner and the admin hold everything by construction, so they are never named', () => {
    expect(heldTogether({ name: 'Owner', permissions: [...PERMISSIONS] })).toEqual([])
    expect(heldTogether({ name: 'Admin', permissions: [...PERMISSIONS] })).toEqual([])
    expect(heldTogether({ name: 'Anybody', permissions: ['*'] })).toEqual([])
  })
})
