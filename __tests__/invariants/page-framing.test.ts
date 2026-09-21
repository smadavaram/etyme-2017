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
import { readFileSync } from 'fs'
import { join } from 'path'
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

/**
 * The shared pages this party's own menu actually names.
 *
 * Every party used to reach all nine, because a CONSULTANT_CORP read the
 * vendor's menu. It reads its own since 2026-09-21 — a company of one
 * has no requirements to raise, nobody to submit, no bench to roll off
 * and no consultants but herself — so four of the nine are pages she
 * cannot click. `page-framing` already says what to do there: "Null
 * rather than a guess: a heading that names a section the reader has no
 * way to click is what this file is here to stop, and a blank is honest
 * where a word would not be." So the invariant is asked of the pages a
 * reader can reach, and the blank is asserted for the rest, below.
 */
function pagesOnTheMenu(kind: CompanyKind): PageKey[] {
  return ALL_PAGES.filter((page) => sectionFor(kind, page) !== null)
}

describe('the heading on a page names the section the reader\'s own menu puts it under', () => {

  it('is true of every shared page for every party', () => {
    for (const kind of ALL_KINDS) {
      const sections = sectionsOf(kind)
      for (const page of pagesOnTheMenu(kind)) {
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
      for (const page of pagesOnTheMenu(kind)) {
        const { eyebrow } = pageFraming(kind, page)
        expect(eyebrow, `${kind}/${page} has no section over it`).toBeTruthy()
        expect([...everySectionAnywhere], `"${eyebrow}" is nobody's section`).toContain(eyebrow)
      }
    }
  })

  it('a page a company of one cannot reach is headed by no section, rather than by a staffing agency\'s', () => {
    // She is one nurse and her own LLC. Requirements, submissions, the
    // rolloff queue and a consultant list are four pages her menu does
    // not name, and heading them "Sell" — the vendor menu she used to
    // fall through to — would name a section she has no way to click.
    for (const page of ['requirements', 'submissions', 'rolloff', 'consultants'] as PageKey[]) {
      expect(pageFraming('CONSULTANT_CORP', page).eyebrow, page).toBe('')
    }
  })

  it('the pages a company of one does work in are headed by her own sections', () => {
    for (const page of ['contracts.sell', 'timesheets', 'invoices', 'expenses'] as PageKey[]) {
      expect(sectionsOf('CONSULTANT_CORP'), page)
        .toContain(pageFraming('CONSULTANT_CORP', page).eyebrow)
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
      for (const page of pagesOnTheMenu(kind)) {
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

/**
 * ── The seat, 2026-09-21 ──────────────────────────────────────────────
 *
 * Aptiva Workforce is a program office sitting at Cavanaugh Glassworks'
 * Program Manager desk (`POST /api/demo {"as":"world-aptiva"}`). Every
 * route serves it Cavanaugh's book; the words over that book were still
 * read off Aptiva's own company kind, so seven of Cavanaugh's buy-side
 * lines were headed "Sell · Sell Contracts — What you bill clients" and
 * its hours read "Billable hours against sell contracts". Cavanaugh
 * bills nobody. Its own program manager, on the identical rows, reads
 * "Workforce · Contracts".
 */
describe('a program office reading a client\'s book is framed in the client\'s words, not the supplier\'s', () => {

  /** What the money routes hand the page: `reading: { company, inASeat, says }`. */
  const AT_CAVANAUGH = { inASeat: true, company: 'Cavanaugh Glassworks', says: null }
  /** What demand hands the page: `desk: { companyName, seated, says }`. */
  const DESK_AT_CAVANAUGH = { seated: true, companyName: 'Cavanaugh Glassworks', says: null }

  it('the contracts page reads the client\'s title, never "Sell Contracts"', () => {
    const f = pageFraming('MSP', 'contracts.sell', AT_CAVANAUGH)
    expect(f.title).toBe('Contracts')
    expect(f.subtitle).not.toContain('bill clients')
    expect(f.subtitle).not.toContain('Revenue')
  })

  it('the hours page stops calling a client\'s weeks billable hours against sell contracts', () => {
    const f = pageFraming('MSP', 'timesheets', AT_CAVANAUGH)
    expect(f.subtitle).not.toContain('sell contracts')
    expect(f.subtitle).toContain('awaiting your approval')
  })

  it('the eyebrow follows the seat to Workforce, where the client\'s own menu files the page', () => {
    // The sidebar already moved (`seatedAtClient` in the shell). The
    // heading is read off the same menu, so the two cannot disagree.
    expect(pageFraming('MSP', 'contracts.sell', AT_CAVANAUGH).eyebrow).toBe('Workforce')
    expect(pageFraming('MSP', 'timesheets', AT_CAVANAUGH).eyebrow).toBe('Workforce')
    expect(pageFraming('MSP', 'contracts.sell').eyebrow).toBe('Operate')
  })

  it('every shared page a seated office opens is worded exactly as the client\'s own desk words it', () => {
    for (const page of ALL_PAGES) {
      const seatedF = pageFraming('MSP', page, AT_CAVANAUGH)
      const clientF = pageFraming('CLIENT', page)
      expect(seatedF.title, page).toBe(clientF.title)
      expect(seatedF.eyebrow, page).toBe(clientF.eyebrow)
      expect(seatedF.create, page).toBe(clientF.create)
      expect(seatedF.subtitle, page).toContain(clientF.subtitle)
    }
  })

  it('the office is framed the same whether the route calls it a seat or a desk', () => {
    for (const page of ALL_PAGES) {
      expect(pageFraming('MSP', page, DESK_AT_CAVANAUGH), page)
        .toEqual(pageFraming('MSP', page, AT_CAVANAUGH))
    }
  })

  it('an integrator or a bench firm holding a seat is framed by the seat, not by its own kind', () => {
    // A seat is granted to whoever the client granted it to. Nothing
    // about this is an MSP's alone.
    for (const kind of ['VENDOR', 'GSI', 'MSP'] as CompanyKind[]) {
      expect(pageFraming(kind, 'invoices', AT_CAVANAUGH).subtitle, kind)
        .toContain('vendors have billed you')
    }
  })

  it('a seated office is offered no button the client\'s own desk is not offered', () => {
    // The worker files their own week and nobody else may; a client
    // receives its suppliers' invoices rather than generating them. A
    // control the route would refuse is a control that lies, and sitting
    // in somebody's seat does not widen what the desk may do.
    expect(pageFraming('MSP', 'timesheets', AT_CAVANAUGH).create).toBeNull()
    expect(pageFraming('MSP', 'invoices', AT_CAVANAUGH).create).toBeNull()
    expect(pageFraming('MSP', 'timesheets').create).toBe('New')
  })

  it('nobody records a contract by hand on a client\'s book — the award writes both sides', () => {
    // The contracts page hid this button from a client before the
    // framing existed ("A client does not raise contracts here — their
    // vendors do") and the framing came along offering "Record a
    // contractor", so for one commit the page and the words disagreed.
    // The page was right: station 4 of the client program is that the
    // award writes both contracts and their due dates.
    for (const page of ['contracts.sell', 'contracts.buy'] as PageKey[]) {
      expect(pageFraming('CLIENT', page).create, page).toBeNull()
      expect(pageFraming('MSP', page, AT_CAVANAUGH).create, page).toBeNull()
    }
    // And a supplier, which does record a placement it is already
    // running, still can.
    expect(pageFraming('VENDOR', 'contracts.sell').create).toBe('Record a placement')
  })
})

describe('the framing names whose book it is when it is not the reader\'s own', () => {

  const AT_CAVANAUGH = { inASeat: true, company: 'Cavanaugh Glassworks' }

  it('one clause names the client and says where the right to read it came from', () => {
    const f = pageFraming('MSP', 'contracts.sell', AT_CAVANAUGH)
    expect(f.whose).toBe("Cavanaugh Glassworks' contracts, read from the seat it granted.")
    expect(f.subtitle).toContain(f.whose!)
  })

  it('the clause names what is on the page, in the client\'s words', () => {
    expect(pageFraming('MSP', 'timesheets', AT_CAVANAUGH).whose)
      .toBe("Cavanaugh Glassworks' hours, read from the seat it granted.")
    expect(pageFraming('MSP', 'rolloff', AT_CAVANAUGH).whose)
      .toBe("Cavanaugh Glassworks' contractors ending soon, read from the seat it granted.")
  })

  it('a firm whose name ends in s is not given a second one', () => {
    expect(pageFraming('MSP', 'invoices', { inASeat: true, company: 'Talvern Medical Devices' }).whose)
      .toBe("Talvern Medical Devices' invoices, read from the seat it granted.")
  })

  it('nobody reading their own book is told whose it is', () => {
    for (const kind of ALL_KINDS) {
      for (const page of ALL_PAGES) {
        expect(pageFraming(kind, page).whose, `${kind}/${page}`).toBeNull()
        expect(pageFraming(kind, page, { inASeat: false, company: 'Cavanaugh Glassworks' }).whose)
          .toBeNull()
      }
    }
  })

  it('a seat whose client the route did not name says nothing rather than naming a guess', () => {
    // Two companies' money is on these pages. A plausible wrong name is
    // worse than a blank, so the words still change to the client's and
    // the clause is simply absent.
    const f = pageFraming('MSP', 'contracts.sell', { inASeat: true, company: null })
    expect(f.whose).toBeNull()
    expect(f.title).toBe('Contracts')
    expect(f.subtitle).toBe(pageFraming('CLIENT', 'contracts.sell').subtitle)
  })
})

describe('a supplier reading its own book is framed exactly as before', () => {

  it('the two headings the walk called out are word for word what they were', () => {
    const contracts = pageFraming('VENDOR', 'contracts.sell')
    expect(contracts.eyebrow).toBe('Operate')
    expect(contracts.title).toBe('Sell Contracts')
    expect(contracts.subtitle).toBe(
      'What you bill clients. Revenue side — track active engagements, pending verifications, and upcoming rolloffs.'
    )
    expect(pageFraming('VENDOR', 'timesheets').subtitle).toBe(
      'Billable hours against sell contracts. Submit, review, and approve — with anomaly detection for flagged entries.'
    )
  })

  it('an absent seat, a null seat and an unseated seat all read the same as no argument at all', () => {
    for (const kind of ALL_KINDS) {
      for (const page of ALL_PAGES) {
        const plain = pageFraming(kind, page)
        expect(pageFraming(kind, page, null), `${kind}/${page}`).toEqual(plain)
        expect(pageFraming(kind, page, { seated: false }), `${kind}/${page}`).toEqual(plain)
        expect(pageFraming(kind, page, { inASeat: false, company: 'Cavanaugh Glassworks' }))
          .toEqual(plain)
      }
    }
  })

  it('no supplier subtitle carries a clause about somebody else\'s book', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CONSULTANT_CORP'] as CompanyKind[]) {
      for (const page of ALL_PAGES) {
        expect(pageFraming(kind, page).subtitle, `${kind}/${page}`)
          .not.toContain('read from the seat')
      }
    }
  })

  it('a requirement can be raised from every desk that reads the page, and the button says so', () => {
    // `POST /api/requirements` exists and works, and the button above
    // the list has never been gated on anything — a supplier, a client
    // and an office in a client's seat all raise roles from this page.
    // The framing said null for a commit, which would have taken a
    // working control off the screen.
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT'] as CompanyKind[]) {
      expect(pageFraming(kind, 'requirements').create, kind).toBe('New requirement')
    }
    expect(pageFraming('MSP', 'requirements', { inASeat: true, company: 'Cavanaugh Glassworks' }).create)
      .toBe('New requirement')
  })

  it('the "+" on a supplier\'s page still offers what it offered', () => {
    expect(pageFraming('VENDOR', 'contracts.sell').create).toBe('Record a placement')
    expect(pageFraming('VENDOR', 'timesheets').create).toBe('New')
    expect(pageFraming('VENDOR', 'invoices').create).toBe('Generate')
    expect(pageFraming('VENDOR', 'expenses').create).toBe('New')
    expect(pageFraming('VENDOR', 'submissions').create).toBe('Submit')
  })
})

describe('a supplier\'s eyebrows name a section that exists in its menu', () => {
  // Read off the source text of the navigation arrays, the way
  // sidebar-nav.test.ts reads them, rather than only through
  // getNavForKind — so a section renamed in the table and left behind
  // in a derived helper still fails here.
  const SIDEBAR = readFileSync(
    join(__dirname, '../../src/components/shell/sidebar.tsx'),
    'utf8'
  )

  /** Every `label:` that heads a section in one of the nav arrays. */
  function sectionLabelsInSource(name: string): string[] {
    const decl = `const ${name}: NavSection[] = [`
    const start = SIDEBAR.indexOf(decl)
    expect(start, `${name} not found in sidebar.tsx`).toBeGreaterThan(-1)
    let depth = 0
    let i = start + decl.length - 1
    const open = i
    for (; i < SIDEBAR.length; i++) {
      if (SIDEBAR[i] === '[') depth++
      if (SIDEBAR[i] === ']') {
        depth--
        if (depth === 0) break
      }
    }
    const body = SIDEBAR.slice(open, i + 1)
    // A section's own label is the one that opens an object holding
    // `items:`; an item's label is not.
    const written = [...body.matchAll(/label:\s*'([^']+)',\s*items:/g)].map((m) => m[1])
    // Two sections are built by a helper rather than written out —
    // `operateSection(...)` and `governanceSection()` — because Operate
    // and Governance are the same job for every party and were four
    // copies until they were not. Their labels live in the helper, so
    // that is where they are read from.
    const built = [...body.matchAll(/(\w+Section)\(/g)].map((m) => {
      const fn = SIDEBAR.slice(SIDEBAR.indexOf(`function ${m[1]}(`))
      const label = /label:\s*'([^']+)'/.exec(fn)
      expect(label, `${m[1]} builds a section with no label`).toBeTruthy()
      return label![1]
    })
    return [...written, ...built]
  }

  const MENUS: [CompanyKind, string][] = [
    ['VENDOR', 'VENDOR_NAV'],
    ['GSI', 'GSI_NAV'],
    ['MSP', 'MSP_NAV'],
    ['CONSULTANT_CORP', 'SOLO_NAV'],
  ]

  it('every supplier menu in the file has its sections found by name', () => {
    for (const [, name] of MENUS) {
      expect(sectionLabelsInSource(name).length, name).toBeGreaterThan(1)
    }
  })

  it('no supplier page is headed by Sell where its menu files the page under Operate', () => {
    // CLAUDE.md's standing note: the framing "still frames a supplier's
    // contracts page under Sell and Procure and its consultants page
    // under Talent, which are no longer sections of anybody's menu."
    // Both sides of a contract and the hours under them are Operate's,
    // for every party.
    for (const [kind] of MENUS) {
      for (const page of ['contracts.sell', 'contracts.buy', 'timesheets'] as PageKey[]) {
        const { eyebrow } = pageFraming(kind, page)
        if (!eyebrow) continue
        expect(eyebrow, `${kind}/${page}`).toBe('Operate')
      }
    }
  })

  it('"Talent" heads nothing, because no menu has held a section by that name since it was cut', () => {
    for (const [, name] of MENUS) {
      expect(sectionLabelsInSource(name), name).not.toContain('Talent')
    }
    for (const [kind] of MENUS) {
      for (const page of ALL_PAGES) {
        expect(pageFraming(kind, page).eyebrow, `${kind}/${page}`).not.toBe('Talent')
      }
    }
  })

  it('every eyebrow a supplier reads is a section printed in that supplier\'s own nav array', () => {
    for (const [kind, name] of MENUS) {
      const labels = sectionLabelsInSource(name)
      for (const page of ALL_PAGES) {
        const { eyebrow } = pageFraming(kind, page)
        if (!eyebrow) continue
        expect(labels, `${kind} reads "${eyebrow}" over ${page}`).toContain(eyebrow)
      }
    }
  })

  it('a seated reader\'s eyebrow is a section printed in the client\'s nav array', () => {
    const labels = sectionLabelsInSource('CLIENT_NAV')
    for (const page of ALL_PAGES) {
      const { eyebrow } = pageFraming('MSP', page, { inASeat: true, company: 'Cavanaugh Glassworks' })
      if (!eyebrow) continue
      expect(labels, `a seat reads "${eyebrow}" over ${page}`).toContain(eyebrow)
    }
  })
})
