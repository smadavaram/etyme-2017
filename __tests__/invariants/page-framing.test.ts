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
import { pageFraming, sectionFor, sectionOfHref, sectionForReader, notificationsFraming, conversationsFraming, headingEveryReaderSees, headingsOf, REGISTER_HEADINGS, type PageKey, type ReaderIdentity } from '@/lib/page-framing'
import { getNavForKind } from '@/lib/nav-table'
import type { CompanyKind } from '@/components/session-provider'

/**
 * The owner, who holds every desk: the reader whose trimmed menu is the
 * company's whole one. Passed wherever these sentences are about what a
 * company's menu heads a page with, because `pageFraming` called with no
 * reader at all now says only what every reader at the company would see
 * (sign-up walk, round seven, problem 3; asked below).
 */
const OWNER = { permissions: ['*'] as string[] }

const ALL_PAGES: PageKey[] = [
  'contracts.sell', 'contracts.buy', 'requirements', 'submissions',
  'rolloff', 'timesheets', 'invoices', 'expenses', 'consultants',
]

const ALL_KINDS: CompanyKind[] = ['VENDOR', 'CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP']

/**
 * The headings a party's own menu prints, read off it: every section, and
 * the two register sub-headings (Network, Compliance) that head the pages
 * listed under them — sign-up walk, round three, item 11.
 */
function sectionsOf(kind: CompanyKind): string[] {
  return headingsOf(getNavForKind(kind, false))
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
        const { eyebrow } = pageFraming(kind, page, null, OWNER)
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
        const { eyebrow } = pageFraming(kind, page, null, OWNER)
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
      expect(pageFraming('CONSULTANT_CORP', page, null, OWNER).eyebrow, page).toBe('')
    }
  })

  it('the pages a company of one does work in are headed by her own sections', () => {
    for (const page of ['contracts.sell', 'timesheets', 'invoices', 'expenses'] as PageKey[]) {
      expect(sectionsOf('CONSULTANT_CORP'), page)
        .toContain(pageFraming('CONSULTANT_CORP', page, null, OWNER).eyebrow)
    }
  })

  it('bench check-ins are headed by the reader\'s own section, never by Talent', () => {
    // The page typed "Talent" into its own header rather than asking the
    // framing, so it outlived the section by the same route.
    expect(sectionOfHref('VENDOR', '/dashboard/texts')).toBe('Procure')
    expect(sectionOfHref('GSI', '/dashboard/texts')).toBe('Supply')
    // A program office runs no bench, so it has no check-ins to head
    // (sign-up walk, round five, problem 21).
    expect(sectionOfHref('MSP', '/dashboard/texts')).toBeNull()
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
    expect(pageFraming('VENDOR', 'contracts.buy', null, OWNER).eyebrow).toBe('Operate')
  })

  it('sell contracts are headed the same section as buy contracts, because they are one table', () => {
    expect(pageFraming('VENDOR', 'contracts.sell', null, OWNER).eyebrow)
      .toBe(pageFraming('VENDOR', 'contracts.buy', null, OWNER).eyebrow)
  })

  it('timesheets sit under Operate for a vendor', () => {
    expect(pageFraming('VENDOR', 'timesheets', null, OWNER).eyebrow).toBe('Operate')
  })

  it('candidates are headed Procure, not Talent — the section that stopped existing', () => {
    expect(pageFraming('VENDOR', 'consultants', null, OWNER).eyebrow).toBe('Procure')
  })

  it('the roles a vendor is working are headed Sell', () => {
    expect(pageFraming('VENDOR', 'requirements', null, OWNER).eyebrow).toBe('Sell')
    expect(pageFraming('VENDOR', 'submissions', null, OWNER).eyebrow).toBe('Sell')
    expect(pageFraming('VENDOR', 'rolloff', null, OWNER).eyebrow).toBe('Sell')
  })

  it('sell contracts are still framed as what the vendor bills', () => {
    const f = pageFraming('VENDOR', 'contracts.sell', null, OWNER)
    expect(f.title).toBe('Sell Contracts')
    expect(f.subtitle).toContain('bill clients')
  })

  it('a supplier reads its open demand as job requests, the word its own menu uses', () => {
    expect(pageFraming('VENDOR', 'requirements', null, OWNER).title).toBe('Job requests')
    expect(pageFraming('VENDOR', 'requirements', null, OWNER).create).toBe('New job request')
  })
})

describe('an integrator and a program office are headed their own words, not a bench firm\'s', () => {

  it('an integrator reads Deliver where a staffing vendor reads Sell', () => {
    expect(pageFraming('GSI', 'submissions', null, OWNER).eyebrow).toBe('Deliver')
    expect(pageFraming('VENDOR', 'submissions', null, OWNER).eyebrow).toBe('Sell')
  })

  it('a program office reads Demand where a staffing vendor reads Sell', () => {
    expect(pageFraming('MSP', 'requirements', null, OWNER).eyebrow).toBe('Demand')
  })

  it('an integrator files its bench under Supply, and a program office, which places nobody, has no bench to file', () => {
    expect(pageFraming('GSI', 'consultants', null, OWNER).eyebrow).toBe('Supply')
    expect(pageFraming('MSP', 'consultants', null, OWNER).eyebrow).toBe('')
  })

  it('contracts, timesheets and the money are Operate for all three suppliers', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP'] as CompanyKind[]) {
      for (const page of ['contracts.sell', 'contracts.buy', 'timesheets', 'invoices', 'expenses'] as PageKey[]) {
        expect(pageFraming(kind, page, null, OWNER).eyebrow, `${kind}/${page}`).toBe('Operate')
      }
    }
  })

  it('a company of one reads the seller\'s framing, because it sells', () => {
    expect(pageFraming('CONSULTANT_CORP', 'contracts.sell', null, OWNER))
      .toEqual(pageFraming('VENDOR', 'contracts.sell', null, OWNER))
  })

  it('an integrator and a vendor read the same words under different sections', () => {
    const gsi = pageFraming('GSI', 'rolloff', null, OWNER)
    const vendor = pageFraming('VENDOR', 'rolloff', null, OWNER)
    expect(gsi.title).toBe(vendor.title)
    expect(gsi.eyebrow).not.toBe(vendor.eyebrow)
  })
})

describe('a client sees demand-side framing', () => {

  it('sell contracts are framed as contracts at the client\'s sites', () => {
    const f = pageFraming('CLIENT', 'contracts.sell', null, OWNER)
    expect(f.title).toBe('Contracts')
    expect(f.eyebrow).toBe('Workforce')
  })

  it('a client is never told they bill their own contractors', () => {
    const f = pageFraming('CLIENT', 'contracts.sell', null, OWNER)
    expect(f.subtitle).not.toContain('bill clients')
    expect(f.subtitle).not.toContain('Revenue')
  })

  it('a client reads its requirements as job requests, the word on its menu', () => {
    expect(pageFraming('CLIENT', 'requirements', null, OWNER).title).toBe('Job requests')
  })

  it('a client\'s roles are headed by the section that holds its own requirements screen', () => {
    // A client raises and releases roles at /dashboard/requisitions, not
    // at the supplier's /dashboard/requirements — so that is the menu
    // entry the section is read from.
    expect(pageFraming('CLIENT', 'requirements', null, OWNER).eyebrow).toBe('Workforce')
  })

  it('rolloff is framed as contractors ending soon, not bench exposure', () => {
    const f = pageFraming('CLIENT', 'rolloff', null, OWNER)
    expect(f.title).toBe('Ending soon')
    expect(f.subtitle).not.toContain('bench')
  })

  it('timesheets sit under Workforce for a client, where the nav puts them', () => {
    expect(pageFraming('CLIENT', 'timesheets', null, OWNER).eyebrow).toBe('Workforce')
    expect(pageFraming('CLIENT', 'invoices', null, OWNER).eyebrow).toBe('Workforce')
  })

  it('a client’s invoice receipts are what its suppliers sent it and what is still to pay, not what it bills', () => {
    const f = pageFraming('CLIENT', 'invoices', null, OWNER)
    expect(f.subtitle).toBe('What your suppliers sent you, and what is still to pay.')
  })

  it('nothing a client reads at the head of a page calls its suppliers vendors', () => {
    for (const page of ALL_PAGES) {
      const f = pageFraming('CLIENT', page, null, OWNER)
      expect(`${f.title} ${f.subtitle}`, page).not.toMatch(/\bvendors?\b/i)
    }
  })

  it('a supplier reads what it sends its client as bills, and the client reads them as its invoice receipts', () => {
    // The party who issues a document names it: the supplier bills, and
    // what arrives at the client is the supplier's invoice, received —
    // an invoice receipt.
    expect(pageFraming('VENDOR', 'invoices', null, OWNER).title).toBe('Bills')
    expect(pageFraming('CLIENT', 'invoices', null, OWNER).title).toBe('Invoice receipts')
  })
})

describe('every page is framed for every company type', () => {

  it('nine shared pages carry framing for both sides', () => {
    expect(ALL_PAGES).toHaveLength(9)
  })

  it('no page is missing a title, eyebrow, or subtitle', () => {
    for (const kind of ALL_KINDS) {
      for (const page of pagesOnTheMenu(kind)) {
        const f = pageFraming(kind, page, null, OWNER)
        expect(f.eyebrow, `${kind}/${page} eyebrow`).toBeTruthy()
        expect(f.title, `${kind}/${page} title`).toBeTruthy()
        expect(f.subtitle, `${kind}/${page} subtitle`).toBeTruthy()
      }
    }
  })

  it('every client page reads differently from its supplier counterpart', () => {
    const differing = ALL_PAGES.filter(
      p => pageFraming('CLIENT', p, null, OWNER).title !== pageFraming('VENDOR', p, null, OWNER).title
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
    const f = pageFraming('MSP', 'contracts.sell', AT_CAVANAUGH, OWNER)
    expect(f.title).toBe('Contracts')
    expect(f.subtitle).not.toContain('bill clients')
    expect(f.subtitle).not.toContain('Revenue')
  })

  it('the hours page stops calling a client\'s weeks billable hours against sell contracts', () => {
    const f = pageFraming('MSP', 'timesheets', AT_CAVANAUGH, OWNER)
    expect(f.subtitle).not.toContain('sell contracts')
    expect(f.subtitle).toContain('waiting for your approval')
  })

  it('the eyebrow follows the seat to Workforce, where the client\'s own menu files the page', () => {
    // The sidebar already moved (`seatedAtClient` in the shell). The
    // heading is read off the same menu, so the two cannot disagree.
    expect(pageFraming('MSP', 'contracts.sell', AT_CAVANAUGH, OWNER).eyebrow).toBe('Workforce')
    expect(pageFraming('MSP', 'timesheets', AT_CAVANAUGH, OWNER).eyebrow).toBe('Workforce')
    expect(pageFraming('MSP', 'contracts.sell', null, OWNER).eyebrow).toBe('Operate')
  })

  it('every shared page a seated office opens is worded exactly as the client\'s own desk words it', () => {
    for (const page of ALL_PAGES) {
      const seatedF = pageFraming('MSP', page, AT_CAVANAUGH, OWNER)
      const clientF = pageFraming('CLIENT', page, null, OWNER)
      expect(seatedF.title, page).toBe(clientF.title)
      expect(seatedF.eyebrow, page).toBe(clientF.eyebrow)
      expect(seatedF.create, page).toBe(clientF.create)
      expect(seatedF.subtitle, page).toContain(clientF.subtitle)
    }
  })

  it('the office is framed the same whether the route calls it a seat or a desk', () => {
    for (const page of ALL_PAGES) {
      expect(pageFraming('MSP', page, DESK_AT_CAVANAUGH, OWNER), page)
        .toEqual(pageFraming('MSP', page, AT_CAVANAUGH, OWNER))
    }
  })

  it('an integrator or a bench firm holding a seat is framed by the seat, not by its own kind', () => {
    // A seat is granted to whoever the client granted it to. Nothing
    // about this is an MSP's alone.
    for (const kind of ['VENDOR', 'GSI', 'MSP'] as CompanyKind[]) {
      expect(pageFraming(kind, 'invoices', AT_CAVANAUGH, OWNER).subtitle, kind)
        .toContain('suppliers sent you')
    }
  })

  it('a seated office is offered no button the client\'s own desk is not offered', () => {
    // The worker files their own week and nobody else may; a client
    // receives its suppliers' invoices rather than generating them. A
    // control the route would refuse is a control that lies, and sitting
    // in somebody's seat does not widen what the desk may do.
    expect(pageFraming('MSP', 'timesheets', AT_CAVANAUGH, OWNER).create).toBeNull()
    expect(pageFraming('MSP', 'invoices', AT_CAVANAUGH, OWNER).create).toBeNull()
    expect(pageFraming('MSP', 'timesheets', null, OWNER).create).toBe('New')
  })

  it('nobody records a contract by hand on a client\'s book — the award writes both sides', () => {
    // The contracts page hid this button from a client before the
    // framing existed ("A client does not raise contracts here — their
    // vendors do") and the framing came along offering "Record a
    // contractor", so for one commit the page and the words disagreed.
    // The page was right: station 4 of the client program is that the
    // award writes both contracts and their due dates.
    for (const page of ['contracts.sell', 'contracts.buy'] as PageKey[]) {
      expect(pageFraming('CLIENT', page, null, OWNER).create, page).toBeNull()
      expect(pageFraming('MSP', page, AT_CAVANAUGH, OWNER).create, page).toBeNull()
    }
    // And a supplier, which does record a placement it is already
    // running, still can.
    expect(pageFraming('VENDOR', 'contracts.sell', null, OWNER).create).toBe('Record a placement')
  })
})

describe('the framing names whose book it is when it is not the reader\'s own', () => {

  const AT_CAVANAUGH = { inASeat: true, company: 'Cavanaugh Glassworks' }

  it('one clause names the client and says where the right to read it came from', () => {
    const f = pageFraming('MSP', 'contracts.sell', AT_CAVANAUGH, OWNER)
    expect(f.whose).toBe("Cavanaugh Glassworks' contracts, read from the seat it granted.")
    expect(f.subtitle).toContain(f.whose!)
  })

  it('the clause names what is on the page, in the client\'s words', () => {
    expect(pageFraming('MSP', 'timesheets', AT_CAVANAUGH, OWNER).whose)
      .toBe("Cavanaugh Glassworks' hours, read from the seat it granted.")
    expect(pageFraming('MSP', 'rolloff', AT_CAVANAUGH, OWNER).whose)
      .toBe("Cavanaugh Glassworks' contractors ending soon, read from the seat it granted.")
  })

  it('a firm whose name ends in s is not given a second one', () => {
    expect(pageFraming('MSP', 'invoices', { inASeat: true, company: 'Talvern Medical Devices' }, OWNER).whose)
      .toBe("Talvern Medical Devices' invoice receipts, read from the seat it granted.")
  })

  it('a seated office reads the client\'s invoices as its invoice receipts, the word on the client\'s own page', () => {
    expect(pageFraming('MSP', 'invoices', AT_CAVANAUGH, OWNER).whose)
      .toBe("Cavanaugh Glassworks' invoice receipts, read from the seat it granted.")
  })

  it('nobody reading their own book is told whose it is', () => {
    for (const kind of ALL_KINDS) {
      for (const page of ALL_PAGES) {
        expect(pageFraming(kind, page, null, OWNER).whose, `${kind}/${page}`).toBeNull()
        expect(pageFraming(kind, page, { inASeat: false, company: 'Cavanaugh Glassworks' }, OWNER).whose)
          .toBeNull()
      }
    }
  })

  it('a seat whose client the route did not name says nothing rather than naming a guess', () => {
    // Two companies' money is on these pages. A plausible wrong name is
    // worse than a blank, so the words still change to the client's and
    // the clause is simply absent.
    const f = pageFraming('MSP', 'contracts.sell', { inASeat: true, company: null }, OWNER)
    expect(f.whose).toBeNull()
    expect(f.title).toBe('Contracts')
    expect(f.subtitle).toBe(pageFraming('CLIENT', 'contracts.sell', null, OWNER).subtitle)
  })
})

describe('a supplier reading its own book is framed exactly as before', () => {

  it('the two headings the walk called out are word for word what they were', () => {
    const contracts = pageFraming('VENDOR', 'contracts.sell', null, OWNER)
    expect(contracts.eyebrow).toBe('Operate')
    expect(contracts.title).toBe('Sell Contracts')
    expect(contracts.subtitle).toBe(
      'What you bill clients. Revenue side — track active engagements, pending verifications, and upcoming rolloffs.'
    )
    expect(pageFraming('VENDOR', 'timesheets', null, OWNER).subtitle).toBe(
      'Hours your people worked for your clients. Check them, approve them and bill them. Flagged weeks are shown first.'
    )
  })

  it('an absent seat, a null seat and an unseated seat all read the same as no argument at all', () => {
    for (const kind of ALL_KINDS) {
      for (const page of ALL_PAGES) {
        const plain = pageFraming(kind, page, null, OWNER)
        expect(pageFraming(kind, page, null, OWNER), `${kind}/${page}`).toEqual(plain)
        expect(pageFraming(kind, page, { seated: false }, OWNER), `${kind}/${page}`).toEqual(plain)
        expect(pageFraming(kind, page, { inASeat: false, company: 'Cavanaugh Glassworks' }, OWNER))
          .toEqual(plain)
      }
    }
  })

  it('no supplier subtitle carries a clause about somebody else\'s book', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CONSULTANT_CORP'] as CompanyKind[]) {
      for (const page of ALL_PAGES) {
        expect(pageFraming(kind, page, null, OWNER).subtitle, `${kind}/${page}`)
          .not.toContain('read from the seat')
      }
    }
  })

  it('every desk that reads the page can raise one, and every one of them is offered "New job request", the word on every menu', () => {
    // `POST /api/requirements` exists and works, and the button above
    // the list has never been gated on anything — a supplier, a client
    // and an office in a client's seat all raise jobs from this page.
    // The framing said null for a commit, which would have taken a
    // working control off the screen.
    for (const kind of ['VENDOR', 'GSI', 'MSP'] as CompanyKind[]) {
      expect(pageFraming(kind, 'requirements', null, OWNER).create, kind).toBe('New job request')
    }
    expect(pageFraming('CLIENT', 'requirements', null, OWNER).create).toBe('New job request')
    expect(pageFraming('MSP', 'requirements', { inASeat: true, company: 'Cavanaugh Glassworks' }, OWNER).create)
      .toBe('New job request')
  })

  it('the "+" on a supplier\'s page still offers what it offered', () => {
    expect(pageFraming('VENDOR', 'contracts.sell', null, OWNER).create).toBe('Record a placement')
    expect(pageFraming('VENDOR', 'timesheets', null, OWNER).create).toBe('New')
    expect(pageFraming('VENDOR', 'invoices', null, OWNER).create).toBe('Generate')
    expect(pageFraming('VENDOR', 'expenses', null, OWNER).create).toBe('New')
    expect(pageFraming('VENDOR', 'submissions', null, OWNER).create).toBe('Submit')
  })
})

describe('a supplier\'s eyebrows name a section that exists in its menu', () => {
  // Read off the source text of the navigation arrays, the way
  // sidebar-nav.test.ts reads them, rather than only through
  // getNavForKind — so a section renamed in the table and left behind
  // in a derived helper still fails here.
  const SIDEBAR = readFileSync(
    join(__dirname, '../../src/lib/nav-table.ts'),
    'utf8'
  )

  /** Every `label:` that heads a section in one of the nav arrays. */
  function sectionLabelsInSource(name: string): string[] {
    const decl = `const ${name}: NavSection[] = [`
    const start = SIDEBAR.indexOf(decl)
    expect(start, `${name} not found in lib/nav-table.ts`).toBeGreaterThan(-1)
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
        const { eyebrow } = pageFraming(kind, page, null, OWNER)
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
        expect(pageFraming(kind, page, null, OWNER).eyebrow, `${kind}/${page}`).not.toBe('Talent')
      }
    }
  })

  it('every eyebrow a supplier reads is a section printed in that supplier\'s own nav array', () => {
    for (const [kind, name] of MENUS) {
      const labels = sectionLabelsInSource(name)
      for (const page of ALL_PAGES) {
        const { eyebrow } = pageFraming(kind, page, null, OWNER)
        if (!eyebrow) continue
        expect(labels, `${kind} reads "${eyebrow}" over ${page}`).toContain(eyebrow)
      }
    }
  })

  it('a seated reader\'s eyebrow is a section printed in the client\'s nav array, or a register sub-heading printed in it', () => {
    const registers = [...REGISTER_HEADINGS].filter((g) => SIDEBAR.includes(`group: '${g}'`))
    const labels = [...sectionLabelsInSource('CLIENT_NAV'), ...registers]
    for (const page of ALL_PAGES) {
      const { eyebrow } = pageFraming('MSP', page, { inASeat: true, company: 'Cavanaugh Glassworks' }, OWNER)
      if (!eyebrow) continue
      expect(labels, `a seat reads "${eyebrow}" over ${page}`).toContain(eyebrow)
    }
  })
})

describe('Contacts is headed by the reader’s own menu, never by a word typed on the page', () => {
  it('a client reads Contacts under its own section, not under a supplier’s Operate', () => {
    expect(sectionOfHref('CLIENT', '/dashboard/contacts')).not.toBe('Operate')
    expect(sectionOfHref('CLIENT', '/dashboard/contacts')).toBeTruthy()
  })

  it('the Contacts page reads its eyebrow from the menu rather than typing one', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/dashboard/contacts/page.tsx'), 'utf8')
    expect(src).not.toContain('<p className="eyebrow">Operate</p>')
    // From the reader's own trimmed menu since round seven.
    expect(src).toContain("usePageSection('/dashboard/contacts')")
  })
})

/**
 * Sign-up walk, round three, item 11. The tester clicked Contacts under
 * "Network" and read OPERATE (a vendor) or WORKFORCE (a client) at the
 * top of the page; Paperwork, Screening packs and Check queue under
 * "Compliance" read OPERATE. The sub-heading the link is printed under is
 * what the reader saw last, and for these two registers it is the heading.
 */
describe('sign-up walk, round three: a page listed under Network or Compliance is headed by that word', () => {
  it('Companies and Contacts are headed Network for a staffing vendor, where its menu lists them', () => {
    expect(sectionOfHref('VENDOR', '/dashboard/companies')).toBe('Network')
    expect(sectionOfHref('VENDOR', '/dashboard/contacts')).toBe('Network')
  })

  it('a client’s Contacts is headed Network, not Workforce', () => {
    expect(sectionOfHref('CLIENT', '/dashboard/contacts')).toBe('Network')
  })

  it('a client’s contractors are headed Network, beside its contacts, because the menu lists them together', () => {
    expect(pageFraming('CLIENT', 'consultants', null, OWNER).eyebrow).toBe('Network')
  })

  it('Paperwork, Screening packs and Check queue are headed Compliance for a staffing vendor, never Operate', () => {
    for (const href of ['/dashboard/documents', '/dashboard/outbound-pack', '/dashboard/checks']) {
      expect(sectionOfHref('VENDOR', href), href).toBe('Compliance')
    }
  })

  it('every link under a Network or Compliance sub-heading, on every menu, heads its page with that sub-heading', () => {
    for (const kind of ALL_KINDS) {
      for (const section of getNavForKind(kind, false)) {
        for (const item of section.items) {
          if (!item.group || !REGISTER_HEADINGS.has(item.group)) continue
          // The first section that lists a link heads it; a link listed
          // twice is the duplicate class the sidebar test refuses.
          const first = getNavForKind(kind, false).find((s) =>
            s.items.some((i) => i.href.split('?')[0] === item.href.split('?')[0]))
          if (first !== section) continue
          expect(sectionOfHref(kind, item.href), `${kind} ${item.href}`).toBe(item.group)
        }
      }
    }
  })

  it('a step sub-heading does not head a page: a vendor’s timesheets read Operate and a client’s read Workforce', () => {
    expect(sectionOfHref('VENDOR', '/dashboard/timesheets')).toBe('Operate')
    expect(sectionOfHref('CLIENT', '/dashboard/timesheets')).toBe('Workforce')
    expect(sectionOfHref('CLIENT', '/dashboard/requisitions')).toBe('Workforce')
  })

  it('a reader whose company is not known yet is headed by nothing, never by a vendor’s section', () => {
    expect(sectionOfHref(null, '/dashboard/texts')).toBeNull()
    expect(sectionOfHref(undefined, '/dashboard/conversations')).toBeNull()
  })

  it('bench check-ins and conversations are headed off the reader’s own menu, never a guessed vendor’s', () => {
    for (const page of ['texts', 'conversations']) {
      const src = readFileSync(join(process.cwd(), `src/app/dashboard/${page}/page.tsx`), 'utf8')
      expect(src, page).not.toContain("?? 'VENDOR'")
      expect(src, page).toContain(`usePageSection('/dashboard/${page}')`)
      expect(src, page).not.toContain('<p className="eyebrow">Today</p>')
    }
  })

  it('a client’s Conversations is headed by its own menu’s section, not by a firm’s Today', () => {
    expect(sectionOfHref('CLIENT', '/dashboard/conversations')).toBe('Workforce')
    expect(sectionOfHref('VENDOR', '/dashboard/conversations')).toBe('Today')
  })
})

describe('the payables and orders pages', () => {
  it('show no eyebrow until the company is known, and never type a section by hand', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const ap = readFileSync(`${process.cwd()}/src/app/dashboard/ap/page.tsx`, 'utf8')
    const po = readFileSync(`${process.cwd()}/src/app/dashboard/purchase-orders/page.tsx`, 'utf8')
    expect(ap).not.toContain("company?.kind ?? 'VENDOR'")
    expect(po).not.toContain('<p className="eyebrow">Operate</p>')
    expect(po).toContain("usePageSection('/dashboard/purchase-orders')")
  })
})

/**
 * Sign-up walk, round one, item 27: a client opening its hours read
 * "logging hours against sell contracts". A client sells nothing.
 */
describe('the hours page says plain words to every reader', () => {
  it('a client reads hours worked at its sites, waiting for its approval', () => {
    expect(pageFraming('CLIENT', 'timesheets', null, OWNER).subtitle).toContain('Hours worked at your sites, waiting for your approval.')
  })

  it('no reader of the hours page is told about sell contracts', () => {
    for (const kind of ALL_KINDS) {
      expect(pageFraming(kind, 'timesheets', null, OWNER).subtitle, kind).not.toMatch(/sell contract/i)
    }
  })
})

describe('sign-up walk, round two', () => {

  it('page framing imports no client component, so a server route may read it', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/page-framing.ts'), 'utf8')
    const imports = [...src.matchAll(/^import\s+(type\s+)?[^'"]*from\s+'([^']+)'/gm)]
    const runtime = imports.filter((m) => !m[1]).map((m) => m[2])
    expect(runtime.filter((from) => from.startsWith('@/components/') || from.startsWith('@/app/'))).toEqual([])
    expect(runtime).toContain('@/lib/nav-table')
    expect(src).not.toMatch(/^'use client'/m)
  })

  it('while the reader\'s company is unknown, a page shows no subtitle rather than a supplier\'s', () => {
    for (const page of ALL_PAGES) {
      for (const unknown of [null, undefined]) {
        const f = pageFraming(unknown, page, null, OWNER)
        expect(f.subtitle, page).toBe('')
        expect(f.eyebrow, page).toBe('')
        expect(f.create, page).toBeNull()
        // A title only where both sides already use the same word.
        if (f.title) expect([pageFraming('VENDOR', page, null, OWNER).title, pageFraming('CLIENT', page, null, OWNER).title]).toEqual([f.title, f.title])
      }
    }
    expect(pageFraming(null, 'timesheets', null, OWNER).subtitle).not.toMatch(/bill them/)
    expect(pageFraming(null, 'contracts.sell', null, OWNER).title).not.toBe('Sell Contracts')
  })

  it('a worker\'s notifications are headed by her own menu and list only her own kinds of notice', () => {
    const f = notificationsFraming('VENDOR', true)
    expect(f.eyebrow).toBe('You')
    expect(f.eyebrow).not.toBe('Today')
    expect(f.subtitle).not.toMatch(/bill|invoice/i)
    const keys = f.kinds.map((k) => k.key)
    expect(keys).not.toContain('INVOICE')
    expect(keys).not.toContain('ROLLOFF')
    expect(keys).not.toContain('SYSTEM')
    expect(keys).toContain('INTERVIEW')
    expect(keys).toContain('TIMESHEET')
  })

  it('a firm\'s notifications are headed by the section its own menu files them under', () => {
    expect(notificationsFraming('VENDOR', false).eyebrow).toBe(sectionOfHref('VENDOR', '/dashboard/notifications') ?? '')
    expect(notificationsFraming('VENDOR', false).kinds.map((k) => k.key)).toContain('INVOICE')
  })

  it('a client\'s notifications call what its suppliers send invoice receipts, never bills', () => {
    const f = notificationsFraming('CLIENT', false)
    expect(f.subtitle).not.toMatch(/\bbills\b/i)
    expect(f.kinds.find((k) => k.key === 'INVOICE')?.label).toBe('Invoice receipts')
  })

  it('while the reader is unknown, notifications show their title and nothing else', () => {
    expect(notificationsFraming(null, false)).toEqual({ eyebrow: '', title: 'Notifications', subtitle: '', kinds: [] })
  })
})

describe('sign-up walk, round three: the do-not-return list is headed by the reader’s own menu', () => {
  it('a staffing vendor’s DNR list is headed Compliance, where its menu lists it, never Operate', () => {
    expect(sectionOfHref('VENDOR', '/dashboard/blacklist')).toBe('Compliance')
  })

  it('the DNR list reads its eyebrow through usePageSection and draws nothing while the reader is loading', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/dashboard/blacklist/page.tsx'), 'utf8')
    expect(src).not.toContain('<div className="eyebrow mb-2">Operate</div>')
    expect(src).toContain("usePageSection('/dashboard/blacklist')")
    expect(src).toContain('{section && <div className="eyebrow mb-2">{section}</div>}')
  })
})

/**
 * Sign-up walk, round six, problem 6 (2026-10-08). The heading over a
 * list page was read off the company's whole menu, while the sidebar on
 * the same screen is the menu this person is shown — trimmed to their
 * desks, cut to what is addressed to them where they hold none, with
 * "You" where the work is about them. So three readers opened pages and
 * read sections their own menu does not have. Each pair the walk names is
 * a sentence here, asked through the same facts the sidebar is drawn from.
 */
describe('sign-up walk, round six: a page is headed only by a section the reader’s own menu lists it under', () => {
  // Teleworld's own W2 engineer: an integrator seat holding only the two
  // reads of his own work, and the person the placement is about.
  const KARTHIK: ReaderIdentity = {
    companyKind: 'GSI', isConsultant: false, worker: true,
    permissions: ['assignments.read', 'timesheets.read'],
  }
  // A colleague seated at Northbend Athletic as Member: no permission at all.
  const MO: ReaderIdentity = { companyKind: 'CLIENT', isConsultant: false, worker: false, permissions: [] }
  // A candidate who signed up on her own: no company, the consultant menu.
  const NINA: ReaderIdentity = { companyKind: null, isConsultant: true, worker: false, permissions: [] }

  function onMenu(r: ReaderIdentity, href: string): boolean {
    const menu = getNavForKind(r.companyKind, Boolean(r.isConsultant), { worker: r.worker, permissions: r.permissions })
    return menu.some((s) => s.items.some((i) => i.href.split('?')[0] === href))
  }

  it('Karthik’s Contracts and Timesheets are headed by nothing, not Operate, because his menu lists neither', () => {
    for (const href of ['/dashboard/contracts', '/dashboard/timesheets']) {
      expect(onMenu(KARTHIK, href), href).toBe(false)
      expect(sectionForReader(KARTHIK, href), href).toBeNull()
    }
  })

  it('Karthik’s Submissions is headed by nothing, not Deliver, and his Reports by nothing, not Grow', () => {
    expect(sectionForReader(KARTHIK, '/dashboard/submissions')).toBeNull()
    expect(sectionForReader(KARTHIK, '/dashboard/reports')).toBeNull()
  })

  it('the firm’s bench pages are headed by nothing for Karthik, never Supply', () => {
    for (const href of ['/dashboard/bench', '/dashboard/settings/bench-pay', '/dashboard/texts']) {
      expect(sectionForReader(KARTHIK, href), href).toBeNull()
    }
  })

  it('Leads, the compliance register and Governance pages are headed by nothing for Karthik', () => {
    for (const href of [
      '/dashboard/leads', '/dashboard/blacklist', '/dashboard/checks', '/dashboard/documents',
      '/dashboard/outbound-pack', '/dashboard/compliance', '/dashboard/tenure', '/dashboard/privacy',
      '/dashboard/governance', '/dashboard/onboarding', '/dashboard/contacts',
    ]) {
      expect(sectionForReader(KARTHIK, href), href).toBeNull()
    }
  })

  it('Karthik’s own work is headed You, the section his menu lists it under', () => {
    expect(sectionForReader(KARTHIK, '/dashboard/my-work')).toBe('You')
  })

  it('what is addressed to Karthik keeps the heading his menu prints over it', () => {
    expect(onMenu(KARTHIK, '/dashboard/conversations')).toBe(true)
    expect(sectionForReader(KARTHIK, '/dashboard/conversations')).toBe(sectionOfHref('GSI', '/dashboard/conversations'))
  })

  it('a Member at a client reads no Governance over Compliance, Tenure, Duplicate check, Supplier scorecards, Data requests or What is coming', () => {
    for (const href of [
      '/dashboard/compliance', '/dashboard/tenure', '/dashboard/identity', '/dashboard/scorecards',
      '/dashboard/privacy', '/dashboard/governance',
    ]) {
      expect(onMenu(MO, href), href).toBe(false)
      expect(sectionForReader(MO, href), href).toBeNull()
    }
  })

  it('a Member at a client reads no Today over Needs attention, no Network over Contacts and no Sell over Leads', () => {
    for (const href of ['/dashboard/decisions', '/dashboard/contacts', '/dashboard/leads']) {
      expect(sectionForReader(MO, href), href).toBeNull()
    }
  })

  it('a candidate with no company reads no Governance over Compliance, Tenure, What is coming or Data requests, and no Sell over Leads', () => {
    for (const href of ['/dashboard/compliance', '/dashboard/tenure', '/dashboard/governance', '/dashboard/privacy', '/dashboard/leads']) {
      expect(sectionForReader(NINA, href), href).toBeNull()
    }
  })

  it('a candidate’s own pages are headed You, because a known absence of a company is not a loading session', () => {
    expect(sectionForReader(NINA, '/dashboard/my-work')).toBe('You')
  })

  it('a consultant on a firm’s bench is headed by her own menu, never by the firm’s Supply or Sell', () => {
    const omar: ReaderIdentity = { companyKind: 'VENDOR', isConsultant: true, worker: false, permissions: [] }
    expect(sectionForReader(omar, '/dashboard/bench')).toBeNull()
    expect(sectionForReader(omar, '/dashboard/my-work')).toBe('You')
  })

  it('every heading any of the three readers is given names a section of the menu they are actually shown', () => {
    const hrefs = new Set<string>()
    for (const kind of ALL_KINDS) for (const s of getNavForKind(kind, false)) for (const i of s.items) hrefs.add(i.href.split('?')[0])
    for (const r of [KARTHIK, MO, NINA]) {
      const shown = headingsOf(getNavForKind(r.companyKind, Boolean(r.isConsultant), { worker: r.worker, permissions: r.permissions }))
      for (const href of hrefs) {
        const h = sectionForReader(r, href)
        if (h === null) continue
        expect(onMenu(r, href), `${href} is headed ${h} but is not on the menu`).toBe(true)
        expect(shown, href).toContain(h)
      }
    }
  })

  it('a shared page framed for Karthik carries no eyebrow, while its words are unchanged', () => {
    const f = pageFraming('GSI', 'timesheets', null, KARTHIK)
    expect(f.eyebrow).toBe('')
    expect(f.title).toBe(pageFraming('GSI', 'timesheets', null, OWNER).title)
  })

  it('an owner who holds every desk is headed exactly as the company’s whole menu heads the page', () => {
    const owner: ReaderIdentity = { companyKind: 'VENDOR', isConsultant: false, worker: false, permissions: ['*'] }
    for (const href of ['/dashboard/timesheets', '/dashboard/contacts', '/dashboard/bench', '/dashboard/blacklist']) {
      expect(sectionForReader(owner, href), href).toBe(sectionOfHref('VENDOR', href))
    }
  })

  it('a reader whose permissions are not known yet is headed as the sidebar draws them meanwhile, unfiltered', () => {
    const loading: ReaderIdentity = { companyKind: 'VENDOR', isConsultant: false, worker: false, permissions: undefined }
    expect(sectionForReader(loading, '/dashboard/timesheets')).toBe('Operate')
  })

  it('a session that is still loading is headed by nothing', () => {
    expect(sectionForReader({ companyKind: 'VENDOR', pending: true }, '/dashboard/timesheets')).toBeNull()
    expect(sectionForReader(null, '/dashboard/timesheets')).toBeNull()
  })

  it('a program office in a client’s seat is headed by the client’s menu, trimmed to the seat it was granted', () => {
    const seated: ReaderIdentity = { companyKind: 'MSP', seatedAtClient: 'Cavanaugh Glassworks', permissions: ['*'] }
    expect(sectionForReader(seated, '/dashboard/timesheets')).toBe('Workforce')
  })
})

/**
 * The other half of problem 6: pages that print a section name as a typed
 * word rather than asking the menu. Each reads its section to every
 * reader, including readers whose menu has no such section ("You", over a
 * reader's own pages, is the one word that is always the menu's). They belong to
 * other domains and are reported to their owners; this list names them so
 * it can only shrink, the way the refusal list in access-lifecycle-log does.
 */
describe('sign-up walk, round six: pages that type a section name over themselves', () => {
  const STILL_TYPED = new Set<string>([
  ])

  function typedNow(): string[] {
    const { readdirSync, statSync } = require('fs') as typeof import('fs')
    const names = new Set<string>()
    for (const kind of ALL_KINDS) for (const h of headingsOf(getNavForKind(kind, false))) names.add(h)
    // "You" is left out: a reader's own pages sit under You on every
    // menu that offers them, so the typed word is the menu's word.
    names.delete('You')
    const alt = [...names].join('|')
    const label = new RegExp(
      `(className="(?:eyebrow|lbl)[^"]*"|<Lbl|className="[^"]*uppercase tracking[^"]*")>\\s*(${alt})\\s*<`)
    const out: string[] = []
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (f.endsWith('.tsx') && label.test(readFileSync(p, 'utf8'))) out.push(p.slice(process.cwd().length + 1))
      }
    }
    walk(join(process.cwd(), 'src/app/dashboard'))
    return out
  }

  it('no page types a section name over itself that is not already on the list to be fixed', () => {
    const extra = typedNow().filter((p) => !STILL_TYPED.has(p))
    expect(extra, 'read the section with usePageSection or sectionForReader instead').toEqual([])
  })

  it('a page taken off the list stays off it, so the list only shrinks', () => {
    const now = new Set(typedNow())
    const fixed = [...STILL_TYPED].filter((p) => !now.has(p))
    expect(fixed, 'remove these from STILL_TYPED').toEqual([])
  })
})

/**
 * Sign-up walk, round seven, problem 3. Nine pages headed themselves with
 * the company kind alone, so the eyebrow was read off the company's whole
 * menu: Karthik Menon (Today, You) read "Operate" over Contracts and
 * "Deliver" over Submissions and Interviews, and Sam, a Member at
 * Brightmoor with no desk, read "Sell", "Procure" and "Compliance". The
 * framing is now safe on its own: without the reader it says only a word
 * every reader at the company would see.
 */
describe('sign-up walk, round seven: a page framed without its reader names no section a desk-less seat lacks', () => {
  const SAM: ReaderIdentity = { companyKind: 'VENDOR', isConsultant: false, worker: false, permissions: [] }
  const KARTHIK: ReaderIdentity = {
    companyKind: 'GSI', isConsultant: false, worker: true,
    permissions: ['assignments.read', 'timesheets.read'],
  }
  const SHARED: PageKey[] = [
    'contracts.sell', 'contracts.buy', 'requirements', 'submissions', 'interviews',
    'rolloff', 'timesheets', 'invoices', 'expenses', 'consultants',
  ]

  function shownTo(r: ReaderIdentity): string[] {
    return headingsOf(getNavForKind(r.companyKind, Boolean(r.isConsultant), { worker: r.worker, permissions: r.permissions }))
  }

  it('a shared page framed with no reader is headed by nothing a seat with no desk at that company cannot see', () => {
    for (const kind of ALL_KINDS) {
      const deskless = headingsOf(getNavForKind(kind, false, { permissions: [] }))
      for (const page of SHARED) {
        const { eyebrow } = pageFraming(kind, page)
        if (eyebrow === '') continue
        expect(deskless, `${kind}/${page} reads "${eyebrow}" with no reader`).toContain(eyebrow)
      }
    }
  })

  it('Sam, a Member at a staffing firm, reads no Sell, Operate or Procure over the shared pages when the page omits its reader', () => {
    for (const page of SHARED) {
      const { eyebrow } = pageFraming('VENDOR', page)
      expect(['Sell', 'Operate', 'Procure', 'Compliance'], page).not.toContain(eyebrow)
      if (eyebrow) expect(shownTo(SAM), page).toContain(eyebrow)
    }
  })

  it('Karthik reads no Operate, Deliver or Supply over Contracts, Timesheets, Submissions and Interviews when the page omits its reader', () => {
    for (const page of ['contracts.sell', 'timesheets', 'submissions', 'interviews'] as PageKey[]) {
      expect(pageFraming('GSI', page).eyebrow, page).toBe('')
    }
  })

  it('a page that passes its reader is headed off that reader’s own trimmed menu, and an owner still reads the whole menu’s section', () => {
    expect(pageFraming('GSI', 'interviews', null, KARTHIK).eyebrow).toBe('')
    expect(pageFraming('VENDOR', 'submissions', null, SAM).eyebrow).toBe('')
    expect(pageFraming('VENDOR', 'submissions', null, OWNER).eyebrow).toBe('Sell')
    expect(pageFraming('GSI', 'interviews', null, OWNER).eyebrow).toBe('Deliver')
  })

  it('the words under the heading do not change when the reader is omitted, only the section over them', () => {
    for (const kind of ALL_KINDS) {
      for (const page of SHARED) {
        const bare = pageFraming(kind, page)
        const owned = pageFraming(kind, page, null, OWNER)
        expect({ ...bare, eyebrow: '' }, `${kind}/${page}`).toEqual({ ...owned, eyebrow: '' })
      }
    }
  })

  it('a page every reader at the company reaches the same way keeps its heading with no reader: a firm’s Conversations read Today', () => {
    expect(headingEveryReaderSees('VENDOR', '/dashboard/conversations')).toBe('Today')
    expect(headingEveryReaderSees('VENDOR', '/dashboard/conversations'))
      .toBe(sectionForReader(SAM, '/dashboard/conversations'))
  })

  it('a reader seated at a client is framed in the client’s words and menu when it passes only its identity', () => {
    const seated = { permissions: ['*'], seatedAtClient: 'Cavanaugh Glassworks' }
    const f = pageFraming('MSP', 'timesheets', null, seated)
    expect(f.eyebrow).toBe('Workforce')
    expect(f.whose).toContain('Cavanaugh Glassworks')
  })

  it('Interviews passes the reader the sidebar is drawn for, and Bench check-ins and Conversations read their heading off the same menu', () => {
    const interviews = readFileSync(join(process.cwd(), 'src/app/dashboard/interviews/page.tsx'), 'utf8')
    expect(interviews).toContain("pageFraming(company.kind, 'interviews', null, sidebarPropsFrom(session))")
    for (const page of ['texts', 'conversations']) {
      const src = readFileSync(join(process.cwd(), `src/app/dashboard/${page}/page.tsx`), 'utf8')
      expect(src, page).not.toContain('sectionOfHref(')
    }
  })

  /**
   * The pages still heading themselves with the company kind and no
   * reader. Each is in another domain's files and has been reported to its
   * owner; `pageFraming` is safe for the ones on it, and `sectionOfHref`
   * with no reader is the company's whole menu, which is the bug for the
   * rest. A page may come off it and none may go on. There is no "stays
   * off" sentence yet because four domains are taking pages off in the
   * same wave, each in its own commit; once they land the stale entries
   * are pruned and that sentence is added, as round six's list has it.
   */
  const STILL_WITHOUT_READER = new Set<string>([
  ])

  function headedWithoutReader(): string[] {
    const { readdirSync, statSync } = require('fs') as typeof import('fs')
    const out: string[] = []
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) { walk(p); continue }
        if (!f.endsWith('.tsx')) continue
        const src = readFileSync(p, 'utf8')
        // A call that heads a page with the kind alone: sectionOfHref with
        // two or three arguments, or pageFraming with no fourth.
        const calls = [...src.matchAll(/(sectionOfHref|pageFraming)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)]
        const bare = calls.some((m) => {
          let depth = 0, parts = 1
          for (const ch of m[2]) {
            if ('{[('.includes(ch)) depth++
            else if ('}])'.includes(ch)) depth--
            else if (ch === ',' && depth === 0) parts++
          }
          if (m[2].trim().endsWith(',')) parts--
          return parts < 4
        })
        if (bare) out.push(p.slice(process.cwd().length + 1))
      }
    }
    walk(join(process.cwd(), 'src/app/dashboard'))
    return out.sort()
  }

  it('no page heads itself with the company kind alone that is not already on the list to be fixed', () => {
    const extra = headedWithoutReader().filter((p) => !STILL_WITHOUT_READER.has(p))
    expect(extra, 'pass sidebarPropsFrom(session) as the reader, or use usePageSection(href)').toEqual([])
  })
})

/**
 * Sign-up walk, round seven, problem 11. Nina signed up as a candidate
 * with no company. Conversations opened by address and told her "A client
 * writes to you from their job or your candidate … Notes among your own
 * people start with + New", under a "+ New" the route refuses her.
 */
describe('sign-up walk, round seven: a reader at no company is not a session still loading', () => {
  it('a candidate at no company is headed You over her own pages once the session has answered', () => {
    // Nina as `sidebarPropsFrom` describes her: no company, no bench seat,
    // and the session answered (no `pending`).
    const nina: ReaderIdentity = { companyKind: null, isConsultant: false, worker: false, permissions: [] }
    expect(sectionForReader(nina, '/dashboard/my-data')).toBe('You')
    expect(sectionForReader(nina, '/dashboard/my-work')).toBe('You')
    expect(sectionForReader({ ...nina, pending: true }, '/dashboard/my-data')).toBeNull()
  })

  it('a candidate at no company is still headed by nothing over a firm’s pages', () => {
    const nina: ReaderIdentity = { companyKind: null, isConsultant: false, worker: false, permissions: [] }
    for (const href of ['/dashboard/contracts', '/dashboard/compliance', '/dashboard/leads', '/dashboard/bench']) {
      expect(sectionForReader(nina, href), href).toBeNull()
    }
  })
})

describe('sign-up walk, round seven: Conversations speaks to whoever opened it', () => {
  it('somebody with no company is told only what was written to them, with no candidate and no people of their own', () => {
    const f = conversationsFraming(null, true)
    for (const line of [f.subtitle, f.empty]) {
      expect(line).not.toMatch(/your candidate|your own people|job requests, contracts and submissions/i)
    }
    expect(f.empty).toBe('Nothing has been written to you yet. When a firm writes to you, it appears here.')
  })

  it('somebody with no company is offered no + New and no topic tabs, because a conversation belongs to a company', () => {
    const f = conversationsFraming(undefined, false)
    expect(f.mayStart).toBe(false)
    expect(f.topics).toBe(false)
  })

  it('somebody on a firm’s bench reads about their own work with that firm, never about candidates', () => {
    const f = conversationsFraming('VENDOR', true, 'Pellwright Validation Partners')
    expect(f.subtitle).toBe('Messages about your own work, with Pellwright Validation Partners.')
    expect(f.empty).not.toMatch(/candidate|your own people/i)
    expect(f.topics).toBe(false)
  })

  it('a firm’s desk keeps the firm’s words, and a client is told to write from a job or a candidate', () => {
    expect(conversationsFraming('VENDOR', false).empty).toContain('your candidate')
    expect(conversationsFraming('CLIENT', false).empty)
      .toBe('Write to a supplier from a job or a candidate, or start a note among your own people.')
    expect(conversationsFraming('CLIENT', false).mayStart).toBe(true)
  })

  it('the Conversations page draws its sentences, its + New and its tabs from that framing', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/dashboard/conversations/page.tsx'), 'utf8')
    expect(src).toContain('conversationsFraming(')
    expect(src).toContain('words.mayStart')
    expect(src).toContain('words.topics')
    expect(src).not.toContain('it appears here. Notes among your own people start with + New.')
  })
})

/**
 * Sign-up walk, round seven, problem 6, the conversation half. Bench
 * check-ins and Interviews drew their heading and their own prose — one of
 * them a "$78" line — above the refusal, to readers who may not open them.
 */
describe('sign-up walk, round seven: a refused Bench check-ins or Interviews is its sentence alone', () => {
  for (const [page, says] of [['texts', 'Bench check-ins'], ['interviews', 'Interviews']] as const) {
    it(`${says} returns the refusal sentence before drawing any heading or prose`, () => {
      const src = readFileSync(join(process.cwd(), `src/app/dashboard/${page}/page.tsx`), 'utf8')
      const refusal = src.indexOf('if (refused) return <RefusedState says={refused} />')
      expect(refusal, page).toBeGreaterThan(-1)
      expect(refusal, page).toBeLessThan(src.indexOf('<PageHead'))
      expect(src, page).toContain('status === 403')
    })

    it(`${says} shows Loading alone until the first read says the page may be read`, () => {
      const src = readFileSync(join(process.cwd(), `src/app/dashboard/${page}/page.tsx`), 'utf8')
      const loading = src.search(/if \((!read && )?loading\) return <LoadingState says="[^"]*…" \/>/)
      expect(loading, page).toBeGreaterThan(-1)
      expect(loading, page).toBeLessThan(src.indexOf('<PageHead'))
    })
  }

  it('the $78 line on Bench check-ins is drawn only once the check-ins have been read', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/dashboard/texts/page.tsx'), 'utf8')
    const line = src.indexOf('somebody is free at $78')
    expect(src.lastIndexOf('{f && (', line)).toBeGreaterThan(src.indexOf('<PageHead'))
  })
})
