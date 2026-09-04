/**
 * Page framing per company type.
 *
 * CLAUDE.md, design system:
 *   "Eyebrow labels are company-type-specific... the eyebrow, nav section,
 *    and page subtitle must adapt to the viewer's company type — the
 *    underlying data and pages are shared, the framing is not."
 *
 * The same contracts table serves a vendor tracking what they bill and a
 * client reviewing who is on site. Only the words change. A client reading
 * "What you bill clients" on their own placements list is being shown
 * someone else's business.
 */

import { describe, it, expect } from 'vitest'
import { pageFraming, type PageKey } from '@/lib/page-framing'

const ALL_PAGES: PageKey[] = [
  'contracts.sell', 'contracts.buy', 'requirements', 'submissions',
  'rolloff', 'timesheets', 'invoices', 'expenses', 'consultants',
]

describe('A vendor sees supply-side framing', () => {

  it('sell contracts are framed as what the vendor bills', () => {
    const f = pageFraming('VENDOR', 'contracts.sell')
    expect(f.title).toBe('Sell Contracts')
    expect(f.eyebrow).toBe('Sell')
    expect(f.subtitle).toContain('bill clients')
  })

  it('requirements are open demand the vendor works', () => {
    expect(pageFraming('VENDOR', 'requirements').title).toBe('Requirements')
  })

  it('timesheets sit under Operate for a vendor', () => {
    expect(pageFraming('VENDOR', 'timesheets').eyebrow).toBe('Operate')
  })
})

describe('A client sees demand-side framing', () => {

  it('sell contracts are framed as placements at the client\'s sites', () => {
    const f = pageFraming('CLIENT', 'contracts.sell')
    expect(f.title).toBe('Placements')
    expect(f.eyebrow).toBe('Program')
  })

  it('a client is never told they bill their own contractors', () => {
    const f = pageFraming('CLIENT', 'contracts.sell')
    expect(f.subtitle).not.toContain('bill clients')
    expect(f.subtitle).not.toContain('Revenue')
  })

  it('requirements are the roles the client has opened', () => {
    expect(pageFraming('CLIENT', 'requirements').title).toBe('Open roles')
  })

  it('rolloff is framed as contractors ending soon, not bench exposure', () => {
    const f = pageFraming('CLIENT', 'rolloff')
    expect(f.title).toBe('Ending soon')
    expect(f.subtitle).not.toContain('bench')
  })

  it('timesheets sit under Governance for a client', () => {
    expect(pageFraming('CLIENT', 'timesheets').eyebrow).toBe('Governance')
  })

  it('invoices are what the client is billed, not what they bill', () => {
    const f = pageFraming('CLIENT', 'invoices')
    expect(f.subtitle).toContain('vendors have billed you')
  })

  it('the client eyebrow always matches a section in their nav', () => {
    // Client nav has exactly two sections: Program and Governance
    for (const page of ALL_PAGES) {
      const eyebrow = pageFraming('CLIENT', page).eyebrow
      expect(['Program', 'Governance']).toContain(eyebrow)
    }
  })
})

describe('Every page is framed for every company type', () => {

  it('nine shared pages carry framing for both sides', () => {
    expect(ALL_PAGES).toHaveLength(9)
  })

  it('no page is missing a title, eyebrow, or subtitle', () => {
    for (const kind of ['VENDOR', 'CLIENT', 'MSP', 'GSI'] as const) {
      for (const page of ALL_PAGES) {
        const f = pageFraming(kind, page)
        expect(f.eyebrow, `${kind}/${page} eyebrow`).toBeTruthy()
        expect(f.title, `${kind}/${page} title`).toBeTruthy()
        expect(f.subtitle, `${kind}/${page} subtitle`).toBeTruthy()
      }
    }
  })

  it('every client page reads differently from its vendor counterpart', () => {
    // If they were identical the helper would be pointless
    const differing = ALL_PAGES.filter(
      p => pageFraming('CLIENT', p).title !== pageFraming('VENDOR', p).title
    )
    expect(differing.length).toBeGreaterThan(0)
  })

  it('an MSP reads the vendor framing until its own is specified', () => {
    expect(pageFraming('MSP', 'contracts.sell')).toEqual(pageFraming('VENDOR', 'contracts.sell'))
  })

  it('a GSI reads the vendor framing until its own is specified', () => {
    expect(pageFraming('GSI', 'timesheets')).toEqual(pageFraming('VENDOR', 'timesheets'))
  })
})
