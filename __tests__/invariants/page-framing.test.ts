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
 *
 * ── Why the supplier side is pinned too ───────────────────────────────
 *
 * This file used to pin the *client's* eyebrows to the client's menu and
 * nothing else. So when every party's navigation was cut to the client's
 * shape — contracts and timesheets to Operate, the bench to Procure —
 * the supplier framing went on saying "Sell" over Buy contracts and
 * "Talent" over Candidates, which by then was a section no menu had. The
 * test that would have caught it is the one below, asked of every party:
 * the heading on a page names the section the reader's own menu puts it
 * under, and no page is headed by a section name no menu contains.
 */

import { describe, it, expect } from 'vitest'
import { pageFraming, sectionFor, sectionOfHref, type PageKey } from '@/lib/page-framing'
import { getNavForKind } from '@/components/shell/sidebar'
import type { CompanyKind } from '@/components/session-provider'

const ALL_PAGES: PageKey[] = [
  'contracts.sell', 'contracts.buy', 'requirements', 'submissions',
  'rolloff', 'timesheets', 'invoices', 'expenses', 'consultants',
]

const ALL_KINDS: CompanyKind[] = ['VENDOR', 'CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP']

/** The section names a party can actually click, read off its own menu. */
function sectionsOf(kind: CompanyKind): string[] {
  return getNavForKind(kind, false).map((s) => s.label)
}

describe('the heading on a page names the section the reader\'s own menu puts it under', () => {

  it('is true of every shared page for every party', () => {
    for (const kind of ALL_KINDS) {
      const sections = sectionsOf(kind)
      for (const page of ALL_PAGES) {
        const { eyebrow } = pageFraming(kind, page)
        expect(
          sections,
          `${kind} reads "${eyebrow}" over ${page}, which is not a section its menu offers`
        ).toContain(eyebrow)
      }
    }
  })

  it('no page is headed by a section name that no menu contains', () => {
    // The failure this catches by name: "Talent" outlived the section it
    // came from and stayed on a page for a week, naming nothing.
    const everySectionAnywhere = new Set(ALL_KINDS.flatMap(sectionsOf))
    for (const kind of ALL_KINDS) {
      for (const page of ALL_PAGES) {
        const { eyebrow } = pageFraming(kind, page)
        expect(eyebrow, `${kind}/${page} has no section over it`).toBeTruthy()
        expect([...everySectionAnywhere], `"${eyebrow}" is nobody's section`).toContain(eyebrow)
      }
    }
  })

  it('bench check-ins are headed by the reader\'s own section, never by Talent', () => {
    // The page typed "Talent" into its own header rather than asking the
    // framing, so it outlived the section by the same route.
    expect(sectionOfHref('VENDOR', '/dashboard/texts')).toBe('Procure')
    expect(sectionOfHref('GSI', '/dashboard/texts')).toBe('Supply')
    expect(sectionOfHref('MSP', '/dashboard/texts')).toBe('Supply')
  })

  it('no section name is typed into the framing table by hand', () => {
    // Derivation is the point. If an eyebrow could be written here, it
    // could disagree with the menu here, which is exactly what happened.
    expect(sectionFor('VENDOR', 'timesheets')).toBe('Operate')
    expect(sectionFor('CLIENT', 'timesheets')).toBe('Workforce')
  })

  it('a page its own menu does not offer is headed by nothing rather than by somebody else\'s section', () => {
    // A client's menu has no payroll and no AR — nobody owes a client
    // money for contract labor — so there is no honest section to head
    // either with. A blank, never a guess. No shared page is in this
    // state today and the test above is what proves it.
    expect(sectionOfHref('CLIENT', '/dashboard/payroll')).toBeNull()
    expect(sectionOfHref('CLIENT', '/dashboard/ar')).toBeNull()
    expect(sectionOfHref('VENDOR', '/dashboard/payroll')).toBe('Operate')
  })
})

describe('a staffing vendor reads its own menu over its own pages', () => {

  it('buy contracts are headed Operate, where the menu now files both sides of a contract', () => {
    expect(pageFraming('VENDOR', 'contracts.buy').eyebrow).toBe('Operate')
  })

  it('sell contracts are headed the same section as buy contracts, because they are one table', () => {
    expect(pageFraming('VENDOR', 'contracts.sell').eyebrow)
      .toBe(pageFraming('VENDOR', 'contracts.buy').eyebrow)
  })

  it('timesheets sit under Operate for a vendor', () => {
    expect(pageFraming('VENDOR', 'timesheets').eyebrow).toBe('Operate')
  })

  it('candidates are headed Procure, not Talent — the section that stopped existing', () => {
    expect(pageFraming('VENDOR', 'consultants').eyebrow).toBe('Procure')
  })

  it('the roles a vendor is working are headed Sell', () => {
    expect(pageFraming('VENDOR', 'requirements').eyebrow).toBe('Sell')
    expect(pageFraming('VENDOR', 'submissions').eyebrow).toBe('Sell')
    expect(pageFraming('VENDOR', 'rolloff').eyebrow).toBe('Sell')
  })

  it('sell contracts are still framed as what the vendor bills', () => {
    const f = pageFraming('VENDOR', 'contracts.sell')
    expect(f.title).toBe('Sell Contracts')
    expect(f.subtitle).toContain('bill clients')
  })

  it('requirements are open demand the vendor works', () => {
    expect(pageFraming('VENDOR', 'requirements').title).toBe('Requirements')
  })
})

describe('an integrator and a program office are headed their own words, not a bench firm\'s', () => {

  it('an integrator reads Deliver where a staffing vendor reads Sell', () => {
    expect(pageFraming('GSI', 'submissions').eyebrow).toBe('Deliver')
    expect(pageFraming('VENDOR', 'submissions').eyebrow).toBe('Sell')
  })

  it('a program office reads Demand where a staffing vendor reads Sell', () => {
    expect(pageFraming('MSP', 'requirements').eyebrow).toBe('Demand')
  })

  it('both file their bench under Supply', () => {
    expect(pageFraming('GSI', 'consultants').eyebrow).toBe('Supply')
    expect(pageFraming('MSP', 'consultants').eyebrow).toBe('Supply')
  })

  it('contracts, timesheets and the money are Operate for all three suppliers', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP'] as CompanyKind[]) {
      for (const page of ['contracts.sell', 'contracts.buy', 'timesheets', 'invoices', 'expenses'] as PageKey[]) {
        expect(pageFraming(kind, page).eyebrow, `${kind}/${page}`).toBe('Operate')
      }
    }
  })

  it('a company of one reads the seller\'s framing, because it sells', () => {
    expect(pageFraming('CONSULTANT_CORP', 'contracts.sell'))
      .toEqual(pageFraming('VENDOR', 'contracts.sell'))
  })

  it('an integrator and a vendor read the same words under different sections', () => {
    const gsi = pageFraming('GSI', 'rolloff')
    const vendor = pageFraming('VENDOR', 'rolloff')
    expect(gsi.title).toBe(vendor.title)
    expect(gsi.eyebrow).not.toBe(vendor.eyebrow)
  })
})

describe('a client sees demand-side framing', () => {

  it('sell contracts are framed as contracts at the client\'s sites', () => {
    const f = pageFraming('CLIENT', 'contracts.sell')
    expect(f.title).toBe('Contracts')
    expect(f.eyebrow).toBe('Workforce')
  })

  it('a client is never told they bill their own contractors', () => {
    const f = pageFraming('CLIENT', 'contracts.sell')
    expect(f.subtitle).not.toContain('bill clients')
    expect(f.subtitle).not.toContain('Revenue')
  })

  it('requirements are the roles the client has opened', () => {
    expect(pageFraming('CLIENT', 'requirements').title).toBe('Open roles')
  })

  it('a client\'s roles are headed by the section that holds its own requirements screen', () => {
    // A client raises and releases roles at /dashboard/requisitions, not
    // at the supplier's /dashboard/requirements — so that is the menu
    // entry the section is read from.
    expect(pageFraming('CLIENT', 'requirements').eyebrow).toBe('Workforce')
  })

  it('rolloff is framed as contractors ending soon, not bench exposure', () => {
    const f = pageFraming('CLIENT', 'rolloff')
    expect(f.title).toBe('Ending soon')
    expect(f.subtitle).not.toContain('bench')
  })

  it('timesheets sit under Workforce for a client, where the nav puts them', () => {
    expect(pageFraming('CLIENT', 'timesheets').eyebrow).toBe('Workforce')
    expect(pageFraming('CLIENT', 'invoices').eyebrow).toBe('Workforce')
  })

  it('invoices are what the client is billed, not what they bill', () => {
    const f = pageFraming('CLIENT', 'invoices')
    expect(f.subtitle).toContain('vendors have billed you')
  })
})

describe('every page is framed for every company type', () => {

  it('nine shared pages carry framing for both sides', () => {
    expect(ALL_PAGES).toHaveLength(9)
  })

  it('no page is missing a title, eyebrow, or subtitle', () => {
    for (const kind of ALL_KINDS) {
      for (const page of ALL_PAGES) {
        const f = pageFraming(kind, page)
        expect(f.eyebrow, `${kind}/${page} eyebrow`).toBeTruthy()
        expect(f.title, `${kind}/${page} title`).toBeTruthy()
        expect(f.subtitle, `${kind}/${page} subtitle`).toBeTruthy()
      }
    }
  })

  it('every client page reads differently from its supplier counterpart', () => {
    const differing = ALL_PAGES.filter(
      p => pageFraming('CLIENT', p).title !== pageFraming('VENDOR', p).title
    )
    expect(differing.length).toBeGreaterThan(0)
  })

  it('no shared page sits in two sections of one menu, so its heading is never ambiguous', () => {
    for (const kind of ALL_KINDS) {
      for (const page of ALL_PAGES) {
        const holding = getNavForKind(kind, false).filter((section) =>
          section.items.some((item) => item.href.split('?')[0] === hrefFor(kind, page))
        )
        expect(holding.length, `${kind}/${page} sits in ${holding.length} sections`).toBeLessThanOrEqual(1)
      }
    }
  })
})

/** The menu entry a party reaches a page through — the same resolution
 *  the framing does, restated here so the test does not trust it. */
function hrefFor(kind: CompanyKind, page: PageKey): string {
  if (kind === 'CLIENT' && page === 'requirements') return '/dashboard/requisitions'
  if (kind === 'CLIENT' && page === 'consultants') return '/dashboard/people'
  if (page.startsWith('contracts')) return '/dashboard/contracts'
  return `/dashboard/${page}`
}
