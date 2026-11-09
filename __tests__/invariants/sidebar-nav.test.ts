import { ENDING_SOON_READERS, CHECK_IN_READERS } from '@/lib/releasing-soon'
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { globSync } from 'fs'
import { getNavForKind, mayOpen, openBecause, OPEN_TO_EVERY_SEAT } from '@/components/shell/sidebar'
import { plusMenuFor } from '@/components/shell/header'
import { RECEIVABLE, PAYABLE } from '@/lib/money/desks'
import { MAY_READ } from '@/app/api/blacklist/desks'
import { TWIN_FEED_READERS } from '@/lib/twin/readers'
import { IMPORT_PERMISSIONS } from '@/lib/importable'
import { SETS_UP_A_PARTY } from '@/lib/party-onboarding'
import { sidebarPropsFrom } from '@/components/shell/sidebar-props'
import { ownPage } from '@/lib/consultant-portfolio'
import { PERMISSIONS } from '@/lib/permissions'
import { rolesFor } from '@/lib/company-defaults'
import { BENCH_PROFIT_DESKS } from '@/lib/bench-profit'
import { BENCH_PAY_DESKS } from '@/lib/bench-holiday-switch'
import { pinnedOn, activeHref, linksOf, tabsFor, menuFor, menuOf, menuLinks, viewOf, firstTabFor, readTab, tabKey, ASK_ETYME_HREF, ETYME_MARK_ICON, type NavSection, type MenuGroup } from '@/lib/nav-table'
import { groupRow } from '@/components/shell/section-pills'
import { owedFrom, owedBadge, owedLabel, mayRefresh, OWED_REFRESH_MS } from '@/lib/owed-count'

/**
 * The founder's own words: "apps on client side seems to be duplicating
 * candidates and people and too many organized links."
 *
 * Two real bugs, traced to this one file. This pins the fix so neither
 * comes back the next time somebody adds a nav item without reading the
 * section it lands in.
 */

const SOURCE = readFileSync(
  join(__dirname, '../../src/lib/nav-table.ts'),
  'utf8'
)

describe('a client viewing People never sees the same human twice under two different names', () => {
  const client = getNavForKind('CLIENT', false)
  const hrefs = client.flatMap((s) => s.items.map((i) => i.href))

  it('reads the people it keeps as Candidates, one row per human, what its suppliers sent as Submissions, and the placed lines as Contracts', () => {
    // The raw feed put every supplier's submission of the same person on
    // its own row. It is the client's Submissions now (founder,
    // 2026-11-03: "hiring managers also see submissions as submissions
    // or applications") and the people register is Candidates, "a memory
    // of candidates they would like to reach out to".
    expect(client.find((s) => s.label === 'Network')!.items[0]).toMatchObject({ label: 'Candidates', href: '/dashboard/people', group: 'Candidates' })
    expect(client.find((s) => s.label === 'Submissions')!.items[0].href).toBe('/dashboard/submissions')
    expect(client.find((s) => s.label === 'Contracts')!.items[0].href).toBe('/dashboard/contracts')
    const labels = client.flatMap((s) => s.items.map((i) => i.label))
    expect(labels).not.toContain('People')
    expect(labels).not.toContain('Contractors')
  })

  it('offers exactly one entry point for people, and it is the merged register', () => {
    expect(hrefs.filter((h) => h === '/dashboard/people').length).toBe(1)
  })
})

describe('a candidate never lands on the vendor staff\'s own screens', () => {
  // Found by the functional-walkthrough agent (scripts/walkthrough.mjs)
  // clicking through as a real candidate: "Your profile" pointed at
  // /dashboard/consultants — the vendor's bench-management list, gated
  // on consultants.read — and rendered a red "You need consultants.read
  // permission" where a candidate's own profile should have been.
  // "Training" pointed at the vendor's company-wide skill-gap analysis,
  // which showed every number at zero because none of it was about the
  // person looking at it.
  //
  // Read off the navigation rather than off the source text of one
  // array: the three pages that belong to a person moved into a `YOURS`
  // constant when a GSI's own W2 started getting them alongside his
  // employer's menu, and a test that greps a declaration would have gone
  // green on a menu that had lost them.
  const consultantHrefs = getNavForKind(null, true).flatMap((s) => s.items.map((i) => i.href))

  it('has no link into the vendor staff\'s consultant list', () => {
    expect(consultantHrefs).not.toContain('/dashboard/consultants')
  })

  it('has no link into the vendor\'s bench-wide training analytics', () => {
    expect(consultantHrefs).not.toContain('/dashboard/training')
  })

  it('gives a candidate exactly one place to edit their own profile', () => {
    expect(consultantHrefs.filter((h) => h === '/dashboard/my-page').length).toBe(1)
  })
})

describe('a menu is eleven links at most, and every other page is a tab of one of them', () => {
  // The founder, 2026-10-19: "left navigation is also exhaustive … [it]
  // will scare anyone from our app." The table carried 133 labels and a
  // supplier's owner read about forty. Nine links then; ten for a day
  // once Contracts became a link of its own (2026-11-03); nine again
  // since the two lists a firm keeps folded under Network; eleven at a
  // supplier since the money became three links in the founder's process
  // order, Bills, Invoice receipts and Payroll (2026-11-04).
  for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT', 'CONSULTANT_CORP'] as const) {
    it(`gives ${kind} at most eleven links, each one noun whose other pages are its tabs`, () => {
      const nav = getNavForKind(kind, false, { permissions: ['*'] })
      expect(nav.length, kind).toBeLessThanOrEqual(11)
      for (const s of nav) expect(s.tabbed, `${kind} ${s.label}`).toBe(true)
      expect(nav.flatMap(linksOf).map((l) => l.label)).toEqual(nav.map((s) => s.label))
    })
  }

  it('opens each noun on its own page first, and draws its tabs in the order the table holds them', () => {
    const vendor = getNavForKind('VENDOR', false)
    expect(tabsFor(vendor, '/dashboard/interviews')).toEqual({ label: 'Submissions', tabs: vendor.find((s) => s.label === 'Submissions')!.items })
    expect(tabsFor(vendor, '/dashboard/interviews')!.tabs.map((t) => t.label)).toEqual(['Submissions', 'Interviews'])
    expect(tabsFor(vendor, '/dashboard/purchase-orders')!.tabs.map((t) => t.label)).toEqual(
      ['Sell contracts', 'Buy contracts', 'POs', 'Paperwork', 'Missing paperwork', 'Document requests', 'Screening packs', 'Compliance', 'Check queue']
    )
    expect(tabsFor(vendor, '/dashboard/payroll')!.tabs.map((t) => t.label)).toEqual(['Payroll', 'Commissions'])
    expect(tabsFor(vendor, '/dashboard/ar')!.tabs.map((t) => t.label)).toEqual(['Bills', 'AR'])
  })

  it('draws no tab row on a noun with one page, nor on Ask Etyme, which draws its own column of threads', () => {
    const client = getNavForKind('CLIENT', false)
    expect(tabsFor(client, '/dashboard/requisitions')).toBeNull()
    expect(tabsFor(client, ASK_ETYME_HREF)).toBeNull()
    expect(tabsFor(client, '/dashboard/conversations')).toBeNull()
  })

  it('opens a noun on the first of its pages the seat may open, so the link never lies', () => {
    // The finance desk reads bench profit and no people: Network opens Bench for it.
    const finance = getNavForKind('VENDOR', false, { permissions: ['pnl.read', 'invoices.read'] })
    const network = finance.find((s) => s.label === 'Network')!
    expect(linksOf(network)[0]).toMatchObject({ label: 'Network', href: '/dashboard/bench' })
  })

  it('groups tabs only under Network and Contracts: every other page that was a neighbor is a plain tab', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT', 'CONSULTANT_CORP'] as const) {
      for (const worker of [false, true]) {
        const items = getNavForKind(kind, false, { worker }).flatMap((s) => s.label === 'Network' || s.label === 'Contracts' ? [] : s.items)
        expect(items.filter((i) => i.group).map((i) => i.label), kind).toEqual([])
      }
    }
  })
})

describe('a client\'s nav reads as the nouns on its own desk, not a wall of links', () => {
  // Founder report, verbatim: "so many duplicates in left navigation
  // like candidates and people, almost missing is contacts and the
  // interface is not user friendly. You mixed admin setup to daily
  // operational activity like timesheets approve."
  const client = getNavForKind('CLIENT', false)
  const labels = client.flatMap((s) => s.items.map((i) => i.label))
  const nounOf = (href: string) => client.find((s) => s.items.some((i) => i.href === href))?.label

  it('has Contacts — the rolodex — beside the suppliers they work at', () => {
    expect(nounOf('/dashboard/contacts')).toBe('Network')
    const network = client.find((s) => s.label === 'Network')!
    expect(network.items.find((i) => i.href === '/dashboard/contacts')!.group).toBe('Suppliers')
  })

  it('offers one way into a job, not two that read as rivals', () => {
    // Raised twice by the founder: "Requisitions" and "Open roles" were
    // the same Requirement row before approval and after release. One
    // entry; the stage is a filter on the screen.
    expect(client.find((s) => s.label === 'Jobs')!.items.map((i) => i.href)).toEqual(['/dashboard/requisitions'])
    for (const retired of ['Requirements', 'Open roles', 'Requisitions']) expect(labels).not.toContain(retired)
  })

  it('keeps Timesheets and Invoice receipts apart from Settings and access', () => {
    expect(nounOf('/dashboard/timesheets')).toBe('Timesheets')
    expect(nounOf('/dashboard/invoices')).toBe('Invoice receipts')
    expect(nounOf('/dashboard/settings')).toBe('Settings')
    expect(nounOf('/dashboard/access')).toBe('Settings')
  })
})

describe('an integrator gets the links a supplier gets, its own people under Network, in Candidates', () => {
  const gsi = getNavForKind('GSI', false)
  const hrefs = gsi.flatMap((s) => s.items.map((i) => i.href))

  it('reads the supplier’s eleven, with no Leads, because its demand arrives through the client it already has', () => {
    expect(gsi.map((s) => s.label)).toEqual(
      ['Ask Etyme', 'Today', 'Network', 'Jobs', 'Submissions', 'Contracts', 'Timesheets', 'Bills', 'Invoice receipts', 'Payroll', 'Settings']
    )
    expect(hrefs).not.toContain('/dashboard/leads')
  })

  it('routes a GSI company to its own menu rather than falling back to the vendor one', () => {
    expect(SOURCE).toMatch(/case 'GSI': return GSI_NAV/)
  })

  it('does not send an integrator onto a client-only or consultant-only screen', () => {
    for (const href of ['/dashboard/program', '/dashboard/requisitions', '/dashboard/my-work', '/dashboard/my-page']) {
      expect(hrefs, href).not.toContain(href)
    }
  })

  it('checks an integrator\'s own bench before a role reaches a sub-vendor, same as any vendor', () => {
    // The requirement page's own-bench check lives behind "Requirements",
    // reused rather than rebuilt — see match-engine.ts for the scope fix
    // that makes "own bench" actually mean this company's own bench.
    expect(hrefs).toContain('/dashboard/requirements')
    expect(hrefs).toContain('/dashboard/bench')
  })

  it('lets an integrator reach the sub-vendors it buys from, which it could not before', () => {
    expect(hrefs).toContain('/dashboard/suppliers')
  })
})

describe('a nav label names a thing, in the words the trade uses', () => {
  // Founder report, verbatim: "the left navigation menu literally is out
  // of context for Indian English speakers — by people do you mean
  // candidates or business contacts — everything is off."
  //
  // The labels had drifted into descriptions: "Money owed to us", "Who is
  // financing whom", "Keeping the bench honest", "Same person, twice?".
  // Each reads pleasantly and none is what a bench sales recruiter would
  // ever say, so the product read as a toy to the people being sold it.
  //
  // A label is a noun phrase. Three words is plenty for one, and a
  // question mark means a sentence got in.
  // Both nav surfaces, not just the sidebar.
  //
  // The header carries its own list — the ⌘K destinations and the + New
  // menu — and scanning only the sidebar is exactly how it kept saying
  // "Candidates" and "Who can do what" after the sidebar stopped. A
  // guard that covers one of two doors is not a guard.
  const HEADER = readFileSync(
    join(process.cwd(), 'src/components/shell/header.tsx'),
    'utf8'
  )
  const LABELS = [...(SOURCE + HEADER).matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1])

  it('has labels, and they are short enough to be names', () => {
    expect(LABELS.length).toBeGreaterThan(30)
    const wordy = LABELS.filter((l) => l.split(/\s+/).length > 3)
    expect(wordy, `these read as descriptions rather than names: ${wordy.join(' · ')}`).toEqual([])
  })

  it('never asks the reader a question', () => {
    const asking = LABELS.filter((l) => l.includes('?'))
    expect(asking, `a nav item is not a question: ${asking.join(' · ')}`).toEqual([])
  })

  it('never offers anybody "People" or "Contractors", and one word means one thing on every menu', () => {
    // The founder's first report named this pair, and on 2026-11-03:
    // "People = candidates. And Candidates = submissions." Candidates is
    // the people a firm keeps, Submissions is who was put forward to a
    // job, Contracts is the line from the award on.
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT', 'CONSULTANT_CORP'] as const) {
      const labels = getNavForKind(kind, false).flatMap((s) => [s.label, ...s.items.map((i) => i.label)])
      expect(labels, kind).not.toContain('People')
      expect(labels, kind).not.toContain('Contractors')
    }
    const vendor = getNavForKind('VENDOR', false)
    expect(vendor.find((s) => s.label === 'Network')!.items[0]).toMatchObject({ label: 'Candidates', href: '/dashboard/consultants' })
    expect(vendor.find((s) => s.label === 'Submissions')!.items[0].href).toBe('/dashboard/submissions')
    const client = getNavForKind('CLIENT', false)
    expect(client.find((s) => s.label === 'Submissions')!.items[0].href).toBe('/dashboard/submissions')
  })

  it('a supplier and an integrator read eleven links in the founder’s process order, Network first, then the work, then the money', () => {
    for (const kind of ['VENDOR', 'GSI'] as const) {
      expect(getNavForKind(kind, false).map((s) => s.label), kind).toEqual(
        ['Ask Etyme', 'Today', 'Network', 'Jobs', 'Submissions', 'Contracts', 'Timesheets', 'Bills', 'Invoice receipts', 'Payroll', 'Settings']
      )
    }
  })

  it('a client reads nine, with no Bills and no Payroll, because it sells nothing and employs no contractor', () => {
    expect(getNavForKind('CLIENT', false).map((s) => s.label)).toEqual(
      ['Ask Etyme', 'Today', 'Network', 'Jobs', 'Submissions', 'Contracts', 'Timesheets', 'Invoice receipts', 'Settings']
    )
  })

  it('an MSP reads ten, with no Payroll, because it places nobody and pays nobody', () => {
    expect(getNavForKind('MSP', false).map((s) => s.label)).toEqual(
      ['Ask Etyme', 'Today', 'Network', 'Jobs', 'Submissions', 'Contracts', 'Timesheets', 'Bills', 'Invoice receipts', 'Settings']
    )
  })
})

describe('a retired name is retired everywhere, not just in the menu', () => {
  // Renaming the sidebar and stopping there left twelve screens whose own
  // heading still said the old thing: the menu offered "AR" and the page
  // it opened was headed "Money owed to us". One screen — loose-ends —
  // answered to three different names at once.
  //
  // A menu entry and the heading of the page it opens are the same
  // promise made twice. The heading may spell out what the menu
  // abbreviates; it may never say something else.
  const RETIRED = [
    'Money owed to us', 'Who is financing whom', 'Keeping the bench honest',
    'Check the checker', 'Being screened', 'Documents asked for',
    'Who we work with', 'Your books, their books', 'Load a spreadsheet',
    'Getting set up', 'What we made', 'How clients see you',
    'Same person, twice?', 'Who can do what', 'Loose ends', 'Open items',
    'Data gaps', 'Open roles',
    // Third time this class has reached a founder: the requisitions page
    // was still headed "Requisitions" under an eyebrow saying "Program",
    // while the menu that opens it said Requirements under Workforce.
    'Requisitions',
  ]

  /** Every UI file — the screens and the shell, not the libraries. */
  const files = globSync('src/{app/dashboard,components/shell}/**/*.tsx')

  it('has no screen still headed by a name the menu has dropped', () => {
    const offenders: string[] = []
    for (const file of files) {
      // JSX comments explain why a name was retired and would otherwise
      // report themselves. Blanked rather than deleted so line numbers
      // still point where a reader can look.
      const src = readFileSync(file, 'utf8').replace(
        /\{\/\*[\s\S]*?\*\/\}/g,
        (m) => m.replace(/[^\n]/g, ' ')
      )
      src.split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '')
        if (/^\s*\*/.test(line)) return // a docblock may recount the history
        for (const name of RETIRED) {
          // Word boundaries, so an identifier is not a label:
          // `RequisitionsPage` is a function name and nobody reads it.
          const shows = new RegExp(`(^|[^A-Za-z0-9_])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_]|$)`)
          if (shows.test(code)) offenders.push(`${file}:${i + 1} — ${name}`)
        }
      })
    }
    expect(
      offenders,
      `these still show a retired name:\n  ${offenders.join('\n  ')}`
    ).toEqual([])
  })
})


/**
 * ── The scheme, pinned ───────────────────────────────────────────────
 *
 * Founder report, verbatim: "System integrator is all over the place.
 * Network on left navigation is missing, contracts are all over the
 * place... contracts buy sell timesheets should be under operate —
 * overall make all level 1 navigation as organized as client party is."
 *
 * Every rule below is one of those sentences, read off the navigation
 * itself rather than off the source text, so a party added later is held
 * to the same shape as the four that exist.
 */

/** Every menu in the product, by the name a person would call the reader. */
const MENUS = {
  'a staffing vendor': getNavForKind('VENDOR', false),
  'an integrator': getNavForKind('GSI', false),
  'an MSP': getNavForKind('MSP', false),
  'a client': getNavForKind('CLIENT', false),
  'a one-person corporation': getNavForKind('CONSULTANT_CORP', false),
  'a consultant': getNavForKind(null, true),
} as const

/** The firms that trade with somebody. A consultant is a person. */
const TRADING = ['a staffing vendor', 'an integrator', 'an MSP', 'a client'] as const

function itemsOf(sections: ReturnType<typeof getNavForKind>) {
  return sections.flatMap((s) => s.items)
}

/** The page a link opens, without the tab it opens it on. */
function pathOf(href: string) {
  return href.split('?')[0]
}

/** What a menu prints: one link per noun, and each page of a list section ("You"). */
function entriesOf(sections: readonly NavSection[]): string[] {
  return sections.flatMap((s) => s.tabbed ? [s.label] : s.items.map((i) => i.label))
}

/**
 * What the Dashboard column prints, in CLAUDE.md's words: a link alone, or
 * a heading and its links ("Network: Candidates, Companies").
 */
function printed(groups: readonly MenuGroup[]): string[] {
  return groups.flatMap((g) => g.heading ? [`${g.heading}: ${g.links.map((l) => l.label).join(', ')}`] : g.links.map((l) => l.label))
}

describe('every party reads the menu CLAUDE.md says it reads', () => {
  // The code and the table had drifted once already: the table said
  // Procure and the build shipped "Talent". A table in a document cannot
  // notice; this does.
  const doc = readFileSync(join(process.cwd(), 'CLAUDE.md'), 'utf8')
  const table = doc.slice(
    doc.indexOf('### Navigation per company type'),
    doc.indexOf('**Eyebrow labels are company-type-specific.**')
  )

  const documented = new Map<string, { links: string[]; folded: string }>()
  for (const line of table.split('\n')) {
    const row = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|$/)
    if (!row || row[1] === 'Party' || row[1].startsWith('---')) continue
    documented.set(row[1], { links: row[2].split('·').map((x) => x.trim()), folded: row[3] })
  }

  const KIND: Record<string, Parameters<typeof getNavForKind>[0]> = {
    Client: 'CLIENT', Supplier: 'VENDOR', Integrator: 'GSI', MSP: 'MSP', 'One-person firm': 'CONSULTANT_CORP', Worker: null,
  }
  const sectionsOf = (party: string) => getNavForKind(KIND[party], KIND[party] == null)
  const columnOf = (party: string) => menuFor(KIND[party], KIND[party] == null)

  it('names all six parties in the table, and nobody else', () => {
    expect([...documented.keys()].sort()).toEqual(
      ['Client', 'Integrator', 'MSP', 'One-person firm', 'Supplier', 'Worker']
    )
  })

  for (const party of ['Client', 'Supplier', 'Integrator', 'MSP', 'One-person firm', 'Worker']) {
    it(`shows ${party} exactly the links and headings the table names, in that order`, () => {
      expect(printed(columnOf(party))).toEqual(documented.get(party)!.links)
    })

    it(`files every page the table folds for ${party} under the link it names`, () => {
      const links = menuLinks(columnOf(party))
      const sections = sectionsOf(party)
      const wrong: string[] = []
      for (const sentence of documented.get(party)!.folded.split(/\.\s*/)) {
        const [pages, noun] = sentence.split('→').map((x) => x?.trim())
        if (!noun) continue
        // A link on the column, or Ask Etyme, which is the switch above it.
        const covers = links.find((l) => l.label === noun)?.covers ?? sections.find((s) => s.label === noun)?.items
        for (const page of pages.split(',').map((x) => x.trim())) {
          if (!covers?.some((i) => i.label === page)) wrong.push(`${page} → ${noun}`)
        }
      }
      expect(wrong, `the table folds these and the menu does not`).toEqual([])
    })
  }

  it('states the rule for a person who is also a worker, in the same place as the table', () => {
    // The table is per company type and a worker's two hats are not a
    // row, so the rule is the sentence under the table.
    expect(
      table,
      'CLAUDE.md no longer states what a menu does for somebody who is also a worker'
    ).toContain('A person who is also a worker wears two hats, one at a time.')
  })

  for (const party of ['Client', 'Supplier', 'Integrator', 'MSP'] as const) {
    it(`gives ${party} its own links and nothing else in the firm hat, and only "You" in the worker's own hat`, () => {
      const firm = menuFor(KIND[party], false, { worker: true, hat: 'firm' })
      expect(printed(firm)).toEqual(documented.get(party)!.links)
      const own = getNavForKind(KIND[party], false, { worker: true, hat: 'you' })
      expect(own.map((s) => s.label)).toEqual(['Ask Etyme', 'You'])
    })
  }

  it('a one-person firm reads her own pages inside her seven from her first day, with no "You" appended', () => {
    expect(printed(menuFor('CONSULTANT_CORP', false))).toEqual(documented.get('One-person firm')!.links)
    expect(printed(menuFor('CONSULTANT_CORP', false, { worker: true }))).toEqual(documented.get('One-person firm')!.links)
    const hrefs = getNavForKind('CONSULTANT_CORP', false).flatMap((s) => s.items.map((i) => i.href))
    for (const own of ['/dashboard/my-work', '/dashboard/my-page', '/dashboard/my-benches', '/dashboard/my-data', '/dashboard/my-work/paperwork']) {
      expect(hrefs, own).toContain(own)
    }
  })

  it('changes nothing for somebody whose seat already is the consultant seat', () => {
    expect(printed(menuFor(null, true, { worker: true })))
      .toEqual(documented.get('Worker')!.links)
  })
})

describe('no menu offers a wall of links', () => {
  it('never prints more than eleven links to any party, for any seat', () => {
    for (const [party, sections] of Object.entries(MENUS)) {
      expect(entriesOf(sections).length, party).toBeLessThanOrEqual(11)
    }
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT'] as const) {
      const worker = getNavForKind(kind, false, { worker: true })
      // The firm's eleven at most; the worker's own five are the You hat.
      expect(worker.filter((s) => s.tabbed).length, kind).toBeLessThanOrEqual(11)
    }
  })
})

describe('both lines of a contract are one noun’s tabs, side by side, and the hours are a noun of their own', () => {
  // "contracts buy sell timesheets should be under operate" (founder,
  // 2026-09-13) still holds in its spirit: the two sides of one contract
  // are never reached from two unrelated places. Since 2026-11-03 that
  // place is Contracts, a link of its own on every firm's menu.
  for (const party of TRADING) {
    const sections = MENUS[party]
    const contractLinks = itemsOf(sections).filter((i) => pathOf(i.href) === '/dashboard/contracts')

    it(`files every contract page ${party} has under one noun, adjacent`, () => {
      expect(contractLinks.length, 'no contracts page at all').toBeGreaterThan(0)
      const homes = new Set(contractLinks.map((l) => sections.find((s) => s.items.includes(l))!.label))
      expect([...homes], `${party} files contracts under ${[...homes].join(' and ')}`).toEqual(['Contracts'])
      const home = sections.find((s) => s.items.includes(contractLinks[0]))!
      const at = contractLinks.map((l) => home.items.indexOf(l))
      expect(at[at.length - 1] - at[0], 'the two sides are not side by side').toBe(contractLinks.length - 1)
    })

    it(`gives ${party} Timesheets as a link of its own`, () => {
      expect(sections.find((s) => s.label === 'Timesheets')!.items[0].href).toBe('/dashboard/timesheets')
    })
  }
})

describe('a firm that has counterparties can see them', () => {
  // "Network on left navigation is missing." The firms a party trades
  // with, and the people at them, are one noun now.
  for (const party of TRADING) {
    it(`gives ${party} the firms it trades with and the people at them under one link`, () => {
      const group = party === 'a client' ? 'Suppliers' : 'Companies'
      const hrefs = MENUS[party].find((s) => s.label === 'Network')!.items.filter((i) => i.group === group).map((i) => i.href)
      expect(hrefs).toContain('/dashboard/suppliers')
      expect(hrefs).toContain('/dashboard/contacts')
    })
  }

  it('leaves a consultant without one, because a person has no counterparties to keep', () => {
    const hrefs = itemsOf(MENUS['a consultant']).map((i) => i.href)
    expect(hrefs).not.toContain('/dashboard/companies')
    expect(hrefs).not.toContain('/dashboard/contacts')
  })

  for (const party of TRADING) {
    it(`reaches ${party}'s suppliers from one place in the menu, not two`, () => {
      const suppliers = itemsOf(MENUS[party]).filter((i) => pathOf(i.href) === '/dashboard/suppliers')
      expect(suppliers.length, `${suppliers.length} ways in`).toBe(1)
    })
  }
})

describe('no menu offers the same page twice under two names', () => {
  // The founder has reported this class three times — candidates and
  // people, requisitions and open roles. Two entries onto one page is
  // a question the reader has to answer before they can click.
  for (const [party, sections] of Object.entries(MENUS)) {
    it(`opens each page from one entry for ${party}`, () => {
      const seen = new Map<string, string>()
      const twice: string[] = []
      for (const item of itemsOf(sections)) {
        const already = seen.get(item.href)
        if (already) twice.push(`${item.href} — "${already}" and "${item.label}"`)
        else seen.set(item.href, item.label)
      }
      expect(twice, `two doors onto one page:\n  ${twice.join('\n  ')}`).toEqual([])
    })
  }
})

describe('every entry in every menu opens a page that exists', () => {
  // A menu entry pointing at a route nobody built is a 404 with good
  // manners, and it is how a nav item survives the page it named.
  for (const [party, sections] of Object.entries(MENUS)) {
    it(`sends ${party} nowhere that is not built`, () => {
      const missing: string[] = []
      for (const item of itemsOf(sections)) {
        const page = join(process.cwd(), 'src/app', pathOf(item.href), 'page.tsx')
        if (!existsSync(page)) missing.push(`${item.label} → ${item.href}`)
      }
      expect(missing, `these open nothing:\n  ${missing.join('\n  ')}`).toEqual([])
    })
  }
})

describe('a program office reads its own menu, not a bench firm’s', () => {
  // An MSP fell through to the vendor nav under a comment saying
  // CLAUDE.md named no MSP. Then a seat appeared on /demo that sells to
  // its client and buys below it, and it was reading "Leads" and had no
  // way to reach the supplier base it manages for somebody else.
  const msp = getNavForKind('MSP', false)

  it('is not the vendor menu under another name', () => {
    expect(msp).not.toEqual(getNavForKind('VENDOR', false))
  })

  it('puts the supplier base it manages on the menu, because that is the job', () => {
    const network = msp.find((s) => s.label === 'Network')!
    expect([...new Set(network.items.map((i) => i.group))]).toEqual(['Companies'])
    const hrefs = network.items.map((i) => i.href)
    expect(hrefs).toContain('/dashboard/suppliers')
    expect(hrefs).toContain('/dashboard/scorecards')
  })

  it('does not offer a program office the client screens it has no seat for', () => {
    // An MSP acts inside a client's program office through a seat the
    // client grants it, and that seat is Phase 2. Until it exists, the
    // menu may not imply it.
    const hrefs = itemsOf(msp).map((i) => i.href)
    for (const clientOnly of ['/dashboard/program', '/dashboard/requisitions', '/dashboard/tenure']) {
      expect(hrefs, clientOnly).not.toContain(clientOnly)
    }
  })

  it('leaves a recruiter commission off a menu with no commission run behind it', () => {
    const hrefs = itemsOf(msp).map((i) => i.href)
    expect(hrefs).not.toContain('/dashboard/payroll/commissions')
  })
})

describe('the + button and the search box, in the header from md up, say what the menu beside them says', () => {
  // Both are doors into the same product and both had their own
  // hand-kept list. The client's + menu was still headed "Program", a
  // section the client's menu stopped having; the search offered every
  // party the vendor's pages, and offered a client no contracts at all.
  const HEADER_SRC = readFileSync(join(process.cwd(), 'src/components/shell/header.tsx'), 'utf8')

  it('heads the + menu with words that reader’s own menu uses', () => {
    const sectionsFor = (kind: 'VENDOR' | 'GSI' | 'MSP' | 'CLIENT') =>
      new Set(getNavForKind(kind, false).map((s) => s.label))

    // Since round seven (problem 1) every heading on the + menu is read
    // off the reader's own menu, for every seat, so the check is of what
    // the function returns rather than of a table in the source.
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT'] as const) {
      for (const s of plusMenuFor(kind, false, ['*'], false)) {
        expect(sectionsFor(kind), `${kind}'s + menu says "${s.label}"`).toContain(s.label)
      }
    }
    expect(HEADER_SRC).not.toContain('const PLUS_SECTIONS')
  })

  it('offers a consultant no + menu of somebody else’s actions', () => {
    // Submit a consultant, add one to a bench, generate an invoice —
    // every item on the supplier menu is an action taken about a
    // consultant, not by one.
    expect(HEADER_SRC).toContain('if (isConsultant || !kind) return []')
    expect(HEADER_SRC).toContain('{plusMenu.length > 0 && (')
  })

  it('searches the pages the reader’s own menu offers, and no others', () => {
    // Read off the navigation rather than kept beside it: the two lists
    // cannot disagree if there is only one.
    expect(HEADER_SRC).toContain('getNavForKind(kind, isConsultant, seat)')
    expect(HEADER_SRC).not.toContain('CLIENT_SEARCH_LABELS')
  })

  it('on a phone the + button and the search box are gone from the header and found in the lists, each with its own search and add', () => {
    // Founder, 2026-10-13, the phone header cut: no words in the header.
    expect(HEADER_SRC).toContain('className="hidden md:block md:relative" ref={plusRef}')
    expect(HEADER_SRC).toMatch(/className="relative hidden md:block" ref=\{searchRef\}/)
    expect(HEADER_SRC).not.toContain('mobileSearch')
    const LIST_SRC = readFileSync(join(process.cwd(), 'src/components/list-surface.tsx'), 'utf8')
    expect(LIST_SRC).toContain('searchable = true')
  })
})

/**
 * ── A person who is also a worker ────────────────────────────────────
 *
 * Founder report, 2026-09-17, opening the Karthik Menon door on /demo:
 * "Candidate Karthik is all buggy."
 *
 * He is a systems integrator's own W2 — the case CLAUDE.md added the
 * same day under "Who sells and who buys" — so his only context is
 * EMPLOYEE at Teleworld Solutions. The shell read identity off the
 * seat's type (`contextType === 'CONSULTANT'`) and therefore served him
 * Teleworld's whole integrator menu, while the four pages that are
 * actually his appeared nowhere at all. The demo door drops him on
 * /dashboard/my-work and nothing in his own navigation pointed back.
 *
 * The same class of bug supply had just fixed on his page: identity read
 * from the seat instead of from the work.
 */
describe('somebody a firm employs and the work is about reads both menus', () => {
  const GSI_PERMS = ['assignments.read', 'timesheets.read'] as const
  const engineer = getNavForKind('GSI', false, { worker: true, permissions: GSI_PERMS })

  it('a GSI\'s own engineer can reach their own work from their own menu', () => {
    const you = engineer.find((s) => s.label === 'You')
    expect(you, 'no "You" section at all').toBeTruthy()
    expect(you!.items.map((i) => i.href)).toEqual([
      '/dashboard/my-work', '/dashboard/my-page', '/dashboard/my-benches',
      // What is held about him and the two things he can ask for. The
      // page existed for a week with nothing anywhere pointing at it,
      // which is a right nobody can find.
      '/dashboard/my-data',
      // And what is still being asked of him. Every chase letter names
      // this page; until it was on a menu the letter was the only way
      // back to it.
      '/dashboard/my-work/paperwork',
    ])
  })

  it('and still sees what his firm addresses to him, but not the firm’s book, because his seat holds no desk', () => {
    // Not the consultant menu instead. He holds a real seat at
    // Teleworld, and what the firm sends him lands under its Today.
    // Sign-up walk, round five: his two reads are of his own work, not a
    // desk, so the firm's Deliver, Operate, Grow and Governance — every
    // submission with its rate, the counterparties, the contacts — are
    // not his reading, on the menu or by URL.
    // He opens in his own hat (2026-11-03), because his seat holds no desk.
    expect(engineer.map((s) => s.label)).toEqual(['Ask Etyme', 'You'])
    // Needs attention went on 2026-10-12: Ask Etyme's greeting is that list.
    // Notifications went on 2026-10-13: the mark carries the number instead.
    // Conversations folded into Ask Etyme on 2026-10-19; what is addressed
    // to him is his in either hat.
    expect(engineer[0].items.map((i) => i.label)).toEqual(['Ask Etyme', 'Conversations'])
    const firm = getNavForKind('GSI', false, { worker: true, permissions: GSI_PERMS, hat: 'firm' })
    expect(firm.map((s) => s.label)).toEqual(['Ask Etyme'])
    expect(pinnedOn(engineer).map((i) => i.label)).toEqual(['Ask Etyme'])
  })

  it('a worker who holds a desk at the firm reads the firm’s menu in the firm hat and their own pages in the You hat, never both', () => {
    const perms = [...GSI_PERMS, 'requirements.read', 'consultants.read']
    const lead = getNavForKind('GSI', false, { worker: true, permissions: perms })
    expect(lead.map((s) => s.label)).toContain('Jobs')
    expect(lead.map((s) => s.label)).not.toContain('You')
    const own = getNavForKind('GSI', false, { worker: true, permissions: perms, hat: 'you' })
    expect(own.map((s) => s.label)).toEqual(['Ask Etyme', 'You'])
  })

  it('reads their own work last, after the firm\'s, not instead of it', () => {
    expect(engineer[engineer.length - 1].label).toBe('You')
  })

  it('is told they are staff of the firm, not that they are a consultant', () => {
    const props = sidebarPropsFrom({
      company: { id: 't', name: 'Teleworld Solutions', slug: 'teleworld', kind: 'GSI' },
      contextType: 'EMPLOYEE',
      isWorker: true,
      permissions: GSI_PERMS,
      loading: false,
    })
    expect(props).toMatchObject({
      companyKind: 'GSI', isConsultant: false, worker: true,
      // The label is a word, not an acronym off the register: the same
      // table in lib/parties that stopped Settings printing
      // CONSULTANT_CORP at a nurse's own corporation.
      // The kind of firm, then the role the seat actually holds, or
      // Member where it holds none: never "Integrator · Delivery", a
      // tagline that read as a role he does not hold (walk 4, A3).
      companyName: 'Teleworld Solutions', companyLabel: 'Integrator · Member',
    })
  })

  it('the foot of the menu names the role the person actually holds at the firm, or Member where the seat holds none, never a role the seat does not hold', () => {
    const seat = (roleName: string | null) => sidebarPropsFrom({
      company: { id: 't', name: 'Teleworld Solutions', slug: 'teleworld', kind: 'GSI' },
      contextType: 'EMPLOYEE', isWorker: true, permissions: GSI_PERMS, loading: false, roleName,
    })
    expect(seat(null).companyLabel).toBe('Integrator · Member')
    expect(seat('Delivery Manager').companyLabel).toBe('Integrator · Delivery Manager')
    expect(seat(null).companyLabel).not.toMatch(/Delivery/)
  })

  it('a client\'s bookkeeper is not offered a worker\'s menu', () => {
    // Every staffer of every firm holds an EMPLOYEE context, so
    // employment cannot be the test. `ownPage` asks the work instead —
    // a placement, a submission, a contract that pays them — and an
    // accounts payable clerk has none of the three.
    const clerk = ownPage({
      benches: [], employers: ['Northbend Athletic'],
      placements: 0, submissions: 0, paidEngagements: 0, hasProfile: false,
    })
    expect(clerk.ok).toBe(false)
    expect(clerk.because).toBe('NOBODY')

    const menu = getNavForKind('CLIENT', false, { worker: clerk.ok })
    expect(menu.map((s) => s.label)).not.toContain('You')
  })

  it('reads the same answer the engineer\'s own page reads, rather than a second one', () => {
    // Karthik's working life on the seeded world: employed by Teleworld,
    // one finished placement, no bench listing anywhere.
    const karthik = ownPage({
      benches: [], employers: ['Teleworld Solutions'],
      placements: 1, submissions: 0, paidEngagements: 1, hasProfile: false,
    })
    expect(karthik.ok).toBe(true)
    expect(karthik.because).toBe('EMPLOYED')
    expect(getNavForKind('GSI', false, { worker: karthik.ok, hat: 'you' }).map((s) => s.label))
      .toContain('You')
  })

  it('never gives somebody on a bench the section twice', () => {
    // A consultant seat already reads CONSULTANT_NAV, which carries
    // these pages. sidebarPropsFrom refuses to call them a worker as
    // well, so "You" cannot be appended to a menu that is already it.
    const onABench = sidebarPropsFrom({
      company: { id: 'v', name: 'Brightmoor', slug: 'brightmoor', kind: 'VENDOR' },
      contextType: 'CONSULTANT', isWorker: true, permissions: [], loading: false,
    })
    expect(onABench).toMatchObject({ isConsultant: true, worker: false })
    expect(getNavForKind(null, true, { worker: false }).map((s) => s.label)).toEqual(['Ask Etyme', 'You'])
  })

  it('offers no notifications page at all, because the Ask Etyme mark carries the number', () => {
    const hrefs = engineer.flatMap((s) => s.items.map((i) => i.href))
    expect(hrefs).not.toContain('/dashboard/notifications')
  })
})

/**
 * ── A menu entry the route will refuse is a menu entry that lies ─────
 *
 * The second half of the same report. A "Validation Engineer" holds
 * assignments.read and timesheets.read and was shown forty-three links
 * of his employer's administration, fifteen of which answered him with
 * a red permission error he could not have predicted from the menu.
 *
 * CLAUDE.md, commit 47bd0d03: "A button that the route will refuse is a
 * button that lies." A menu entry makes the same promise a button does.
 */
describe('a menu offers only what this seat can actually open', () => {
  const API = join(process.cwd(), 'src/app/api')

  /** Every annotated item in the product, by the page it opens. */
  const annotated = [...new Set(
    (['VENDOR', 'GSI', 'MSP', 'CLIENT'] as const)
      .flatMap((k) => itemsOf(getNavForKind(k, false)))
      .filter((i) => i.needs)
      .map((i) => JSON.stringify({ href: pathOf(i.href), needs: i.needs, api: i.api ?? null }))
  )].map((j) => JSON.parse(j) as { href: string; needs: string[]; api: string | string[] | null })

  /**
   * A route may name its gate rather than spell it, and most of them
   * that have two gates do: `const TO_READ = 'governance.read'` above a
   * handler that reads it. Resolving the name against its own
   * declaration keeps the check reading the route rather than being
   * defeated by a constant.
   */
  function literalOf(src: string, token: string): string {
    if (token.startsWith("'")) return token.slice(1, -1)
    const decl = src.match(new RegExp(`const ${token}(?::[^=]+)? = '([^']+)'`))
    return decl ? decl[1] : `${token} (no such constant in that route)`
  }

  it('names a real permission on every link that names one', () => {
    expect(annotated.length).toBeGreaterThan(5)
    const unknown = annotated.flatMap((a) => a.needs.filter((p) => !PERMISSIONS.includes(p as any)))
    expect(unknown, `no such permission: ${unknown.join(', ')}`).toEqual([])
  })

  /**
   * A gate that is a named list rather than a spelled one. Each value is
   * imported from the module the route itself imports it from, so this
   * is the route's own list, not a copy of it.
   */
  const NAMED_GATES: Record<string, readonly string[]> = {
    'mayOpen:RECEIVABLE': RECEIVABLE.opensFor,
    'mayOpen:PAYABLE': PAYABLE.opensFor,
    'mayRead:': MAY_READ,
    'hasAnyPermission:IMPORT_PERMISSIONS': IMPORT_PERMISSIONS,
    'hasAnyPermission:SETS_UP_A_PARTY': SETS_UP_A_PARTY,
    'hasAnyPermission:ENDING_SOON_READERS': ENDING_SOON_READERS,
    'hasAnyPermission:CHECK_IN_READERS': CHECK_IN_READERS,
    'hasAnyPermission:TWIN_FEED_READERS': TWIN_FEED_READERS,
  }

  /**
   * A route that decides by the desk's name rather than by a permission,
   * and the permission the menu offers it by. Not taken on trust: the
   * test below checks that, among the shipped roles, the permission is
   * held by those desks and by nobody else that is not Owner or Admin.
   */
  const DESK_GATES: Record<string, { stands: string[]; desks: readonly string[] }> = {
    'bench/profit': { stands: ['pnl.read'], desks: BENCH_PROFIT_DESKS },
    'settings/bench': { stands: ['settings.manage', 'pnl.read'], desks: BENCH_PAY_DESKS },
  }

  it('a page gated by the desk\'s name is offered by a permission only that desk holds', () => {
    const wrong: string[] = []
    for (const [route, gate] of Object.entries(DESK_GATES)) {
      for (const kind of ['VENDOR', 'GSI', 'MSP'] as const) {
        for (const r of rolesFor(kind)) {
          const perms = r.permissions as readonly string[]
          const holds = perms.includes('*') || gate.stands.some((p) => perms.includes(p))
          if (holds && !gate.desks.includes(r.name)) wrong.push(`${kind} ${r.name} holds ${gate.stands.join(', ')} but is refused ${route}`)
        }
      }
    }
    expect(wrong).toEqual([])
  })

  /**
   * A refusal on a grant's reach: `const r = … reachFor(…, 'p')` or
   * `permissionScope(…, 'p')`, then `if (!r.has)`. The permission and where
   * the refusal sits, or null where the handler has none.
   */
  function gateByReach(body: string): { permission: string; at: number } | null {
    const made = /const (\w+) =(?:(?!\bconst \w+ =)[\s\S])*?\b(?:reachFor|permissionScope)\([^,()]+,\s*'([^']+)'\)/.exec(body)
    if (!made) return null
    const refused = new RegExp(`if \\(\\s*!${made[1]}\\.has\\b`).exec(body)
    if (!refused || refused.index < made.index) return null
    return { permission: made[2], at: refused.index }
  }

  /** What the GET handler at this route asks for, or null where there is no route. */
  function gateOf(routeDir: string): string[] | null {
    if (DESK_GATES[routeDir]) return DESK_GATES[routeDir].stands
    const route = join(API, routeDir, 'route.ts')
    if (!existsSync(route)) return null
    const src = readFileSync(route, 'utf8')
    const start = src.indexOf('export async function GET')
    if (start < 0) return null
    const after = src.indexOf('export async function', start + 10)
    const body = src.slice(start, after < 0 ? src.length : after)
    const first = body.match(/if \(\s*!(hasPermission|hasAnyPermission|mayOpen|mayRead)\(/)
    // The Owner's grant at its reach (2026-11-09, demand's 37c14618b): a
    // route that refuses on `!<reach>.has`, where <reach> is
    // `permissionScope(caller, '<p>')` or demand's `reachFor(caller, '<p>')`
    // (app/api/requisitions/grant-reach), asks for <p>, because the reach is
    // the permission held at some scope. Read only where that refusal comes
    // before any other gate, so it never stands in for one.
    const reach = gateByReach(body)
    if (reach && (!first || reach.at < first.index!)) return [reach.permission]
    if (!first) return []
    if (first[1] === 'hasPermission') {
      const guard = body.slice(first.index).match(/if \(\s*!hasPermission\((?:[^{])*/)?.[0] ?? ''
      return [...guard.matchAll(/hasPermission\([^,]+,\s*('[^']+'|[A-Za-z_$][\w$]*)/g)]
        .map((m) => literalOf(src, m[1]))
    }
    const args = body.slice(first.index! + first[0].length).match(/^[^,)]+(?:,\s*([A-Za-z_$][\w$]*))?/)
    const key = `${first[1]}:${args?.[1] ?? ''}`
    return [...(NAMED_GATES[key] ?? [`${key} (a gate this test cannot read — add it to NAMED_GATES)`])]
  }

  it('asks for exactly what the route behind it asks for, read off that route', () => {
    // Not a second hand-kept table. The permission on a nav item is read
    // back out of the GET handler it points at, so a gate that changes
    // in one place and not the other breaks the build.
    const wrong: string[] = []
    for (const { href, needs, api } of annotated) {
      // A page usually sits at the route it is named after. Where it
      // does not — the compliance desk at /dashboard/privacy reads
      // /api/data-requests — the link says so itself.
      const dirs = api == null ? [href.replace('/dashboard/', '')] : Array.isArray(api) ? api : [api]
      const gates = dirs.map(gateOf)
      const dir = dirs.join(' and ')
      const asked = gates.some((g) => g == null) ? null : gates.flatMap((g) => g!)
      if (asked == null) {
        wrong.push(`${href} — no route at src/app/api/${dir} to check the claim against`)
        continue
      }
      if (asked.join('|') !== needs.join('|')) {
        wrong.push(`${href} — menu says ${needs.join(', ') || '(nothing)'}; the route asks ${asked.join(', ') || '(nothing)'}`)
      }
    }
    expect(wrong, `these promise something the route does not:\n  ${wrong.join('\n  ')}`).toEqual([])
  })

  it('what a page says it calls beyond its gate is a route that exists, and is never read as the gate', () => {
    // Sign-up walk, round five: the bench's own people were refused as
    // "What you opened". `pageCalls` names the page in a refusal and
    // nothing else; the check above reads `api` alone.
    const missing: string[] = []
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT', 'CONSULTANT_CORP'] as const) {
      for (const i of itemsOf(getNavForKind(kind, false))) {
        for (const r of i.pageCalls ?? []) {
          const dir = join(API, r.replace(/\/\*\*$/, '').replace(/\*/g, '[id]'))
          if (!existsSync(dir)) missing.push(`${kind} ${i.label}: ${r}`)
        }
      }
    }
    expect(missing).toEqual([])
    const bench = itemsOf(getNavForKind('VENDOR', false)).find((i) => i.label === 'Bench')!
    expect(bench.api).toEqual(['bench', 'bench/profit'])
    expect(bench.pageCalls).toContain('bench/**')
  })

  it('every link names the permission its page asks for, or says why it needs none', () => {
    const silent = new Set<string>()
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT', 'CONSULTANT_CORP'] as const) {
      for (const worker of [false, true]) {
        for (const i of itemsOf(getNavForKind(kind, false, { worker }))) {
          if (!i.needs && !openBecause(i.href)) silent.add(`${kind}: ${i.label} (${i.href})`)
        }
      }
    }
    for (const i of itemsOf(getNavForKind('VENDOR', true))) {
      if (!i.needs && !openBecause(i.href)) silent.add(`consultant: ${i.label} (${i.href})`)
    }
    expect([...silent], 'a link that neither names a permission nor says why it needs none').toEqual([])
  })

  it('a route whose permission check is written across two lines is still read as asking for those permissions', () => {
    // The Program team route opens its check with "if (" and the first
    // hasPermission on the next line. The reader looked only for "if (!"
    // on one line, read that route as asking nothing, and the menu
    // offered the HR partner a page that refused her (2026-10-05).
    expect(gateOf('program/team')).toEqual(['requirements.write', 'settings.manage', 'team.manage'])
  })

  it('an HR partner at a client is not offered Program team, because its page refuses her', () => {
    const hr = rolesFor('CLIENT').find((r) => r.name === 'HR Partner')!
    const labels = itemsOf(getNavForKind('CLIENT', false, { permissions: hr.permissions })).map((i) => i.label)
    expect(labels).not.toContain('Program team')
    const pm = rolesFor('CLIENT').find((r) => r.name === 'Program Manager')!
    expect(itemsOf(getNavForKind('CLIENT', false, { permissions: pm.permissions })).map((i) => i.label)).toContain('Program team')
  })

  it('a link said to need no permission opens a route that still asks for none', () => {
    // The reason is a claim about a route, and a claim goes stale the day
    // the route grows a gate. Then the link names the gate instead.
    const stale: string[] = []
    for (const href of Object.keys(OPEN_TO_EVERY_SEAT)) {
      const asked = gateOf(pathOf(href).replace(/^\/dashboard\/?/, '') || 'dashboard')
      if (asked && asked.length > 0) stale.push(`${href} — its route now asks ${asked.join(', ')}`)
    }
    expect(stale).toEqual([])
  })

  it('a worker\u2019s seat is not shown a link its route refuses: Training is drawn from the bench and the open jobs, and his seat reads neither', () => {
    const karthik = ['assignments.read', 'timesheets.read']
    const labels = itemsOf(getNavForKind('GSI', false, { worker: true, permissions: karthik })).map((i) => i.label)
    expect(labels).not.toContain('Training')
    // A desk that reads the bench still has it.
    const resourcing = rolesFor('GSI').find((r) => (r.permissions as readonly string[]).includes('consultants.read') && !(r.permissions as readonly string[]).includes('*'))!
    expect(itemsOf(getNavForKind('GSI', false, { permissions: resourcing.permissions })).map((i) => i.label)).toContain('Training')
  })

  it('a worker\u2019s seat is not shown Paperwork, whose one action asks somebody on the books and his seat reads nobody there', () => {
    const karthik = ['assignments.read', 'timesheets.read']
    const labels = itemsOf(getNavForKind('GSI', false, { worker: true, permissions: karthik })).map((i) => i.label)
    expect(labels).not.toContain('Paperwork')
    // His own papers are still one tap away, under You.
    expect(labels).toContain('Your paperwork')
    const hr = rolesFor('GSI').find((r) => r.name === 'HR')!
    expect(itemsOf(getNavForKind('GSI', false, { permissions: hr.permissions })).map((i) => i.label)).toContain('Paperwork')
  })

  it('a worker whose seat reads only their own work is not shown the firm\u2019s Today beside Your work, because both open the same page', () => {
    const labels = itemsOf(getNavForKind('GSI', false, { worker: true, permissions: ['assignments.read', 'timesheets.read'] })).map((i) => i.label)
    expect(labels).not.toContain('Today')
    expect(labels).toContain('Your work')
    // Somebody at the firm who is also a worker and holds a role there keeps it.
    const owner = itemsOf(getNavForKind('GSI', false, { worker: true, permissions: ['*'] })).map((i) => i.label)
    expect(owner).toContain('Today')
  })

  it('a worker who is also staff is offered a way to their own pages from the top of the menu', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/shell/sidebar.tsx'), 'utf8')
    expect(src).toMatch(/Your own pages (\u2193|↓)/)
    expect(src).toContain("groups.findIndex((g) => g.heading === 'You') > 0")
    expect(src).toContain('data-section={group.heading ?? group.links[0]?.label}')
  })

  it('the firm\u2019s scorecard reads as the firm\u2019s on a worker\u2019s menu, never as his own, and a worker with no desk is not shown it', () => {
    const labels = itemsOf(getNavForKind('GSI', false, { worker: true, permissions: ['assignments.read', 'timesheets.read'] })).map((i) => i.label)
    expect(labels).not.toContain('Your scorecard')
    expect(labels).not.toContain('Our scorecard')
    const withADesk = itemsOf(getNavForKind('GSI', false, { worker: true, permissions: ['*'] })).map((i) => i.label)
    expect(withADesk).not.toContain('Your scorecard')
    expect(withADesk).toContain('Our scorecard')
  })

  it('a delivery engineer who sees no money is shown no money or firm-admin links', () => {
    // Karthik Menon, a Teleworld delivery engineer: he staffs nobody,
    // sells nobody and sees no money.
    const labels = itemsOf(getNavForKind('GSI', false, {
      worker: true, permissions: ['assignments.read', 'timesheets.read'],
    })).map((i) => i.label)
    for (const refused of ['AR', 'AP', 'DNR list', 'Automation', 'Integrations', 'Import', 'Setup', 'Settings', 'Users & permissions', 'Suppliers', 'Check queue', 'Compliance']) {
      expect(labels, `${refused} would answer him with a refusal`).not.toContain(refused)
    }
    // His own weeks are on Your work; the firm's Timesheets is a desk's list.
    expect(labels).not.toContain('Timesheets')
    expect(labels).toContain('Your work')
  })

  it('a delivery engineer is not shown who else is rolling off or the bench check-ins, which are read by the desks that staff the work', () => {
    const labels = itemsOf(getNavForKind('GSI', false, {
      worker: true, permissions: ['assignments.read', 'timesheets.read'],
    })).map((i) => i.label)
    expect(labels).not.toContain('Rolloff')
    expect(labels).not.toContain('Bench check-ins')
  })

  it('a client desk that reads its job requests is still shown who is ending soon', () => {
    const labels = itemsOf(getNavForKind('CLIENT', false, { permissions: ['requirements.read'] })).map((i) => i.label)
    expect(labels).toContain('Ending soon')
  })

  it('the desks named after AR and AP are shown the pages named after them', () => {
    for (const [desk, page] of [['Accounts Receivable', 'AR'], ['AP & Payroll', 'AP'], ['Finance', 'AR'], ['Finance', 'AP']] as const) {
      const role = rolesFor('VENDOR').find((r) => r.name === desk)!
      const labels = itemsOf(getNavForKind('VENDOR', false, { permissions: role.permissions })).map((i) => i.label)
      expect(labels, `${desk} lost ${page}`).toContain(page)
    }
  })

  it('shows a delivery engineer no payroll, no bills and no profit, and his own week and line on Your work instead of the firm’s lists', () => {
    const labels = itemsOf(getNavForKind('GSI', false, {
      worker: true, permissions: ['assignments.read', 'timesheets.read'],
    })).map((i) => i.label)
    for (const refused of ['Payroll', 'Commissions', 'Bills', 'Profitability', 'POs', 'Expenses', 'Bench', 'Consultants']) {
      expect(labels, `${refused} would answer him with a permission error`).not.toContain(refused)
    }
    // He keeps the week he files and the line he is on, on his own page.
    expect(labels).not.toContain('Timesheets')
    expect(labels).not.toContain('Sell contracts')
    expect(labels).toContain('Your work')
  })

  it('shortens nobody\'s menu who holds the whole company', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT'] as const) {
      const owner = rolesFor(kind === 'CLIENT' ? 'CLIENT' : kind).find((r) => r.isOwner)!
      expect(
        itemsOf(getNavForKind(kind, false, { permissions: owner.permissions })).length,
        `${kind}'s owner lost a link`
      ).toBe(itemsOf(getNavForKind(kind, false)).length)
    }
  })

  it('leaves every seeded desk a menu it can work from', () => {
    // A filter that empties somebody's navigation is worse than the
    // refusals it removes.
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT'] as const) {
      for (const role of rolesFor(kind)) {
        const nav = getNavForKind(kind, false, { permissions: role.permissions })
        expect(nav.length, `${kind} / ${role.name} has no sections left`).toBeGreaterThan(0)
        // Member is not a desk: it is the seat a colleague holds until
        // somebody gives them one, and it reads its own work and what is
        // addressed to it. Its menu is held by the next test instead.
        if (role.name === 'Member') continue
        expect(
          itemsOf(nav).length,
          `${kind} / ${role.name} keeps too little to work from`
        ).toBeGreaterThan(15)
      }
    }
  })

  it('offers no shortcut to create a thing the seat cannot create', () => {
    // The + button opens the same pages the menu does. "Add consultant"
    // goes to /dashboard/consultants?new=1, which refuses anybody
    // without consultants.read one screen later.
    expect(mayOpen('/dashboard/consultants?new=1', ['assignments.read'])).toBe(false)
    expect(mayOpen('/dashboard/invoices?new=1', ['assignments.read'])).toBe(false)
    expect(mayOpen('/dashboard/consultants?new=1', ['consultants.read'])).toBe(true)
  })

  it('still offers a client the two things a client creates', () => {
    // Keyed on what the page asks for, not on whether the page is on
    // this reader's own menu. A client raises a role through
    // /dashboard/requirements?new=1 while its own menu reaches the same
    // roles through /dashboard/requisitions, and reads its approvals on
    // a page no client menu names — and neither refuses anybody. Asking
    // the menu instead of the gate emptied the client's + button
    // entirely, for every role including the owner.
    const hiringManager = rolesFor('CLIENT').find((r) => r.name === 'Hiring Manager')!
    for (const href of ['/dashboard/requirements?new=1', '/dashboard/conversations?new=1', '/dashboard/decisions']) {
      expect(mayOpen(href, hiringManager.permissions), href).toBe(true)
    }
    const owner = rolesFor('CLIENT').find((r) => r.isOwner)!
    for (const href of ['/dashboard/requirements?new=1', '/dashboard/conversations?new=1', '/dashboard/decisions']) {
      expect(mayOpen(href, owner.permissions), href).toBe(true)
    }
  })

  it('reads the + button and the search box off the same answer as the menu', () => {
    const HEADER_SRC = readFileSync(join(process.cwd(), 'src/components/shell/header.tsx'), 'utf8')
    expect(HEADER_SRC).toContain('mayOpen(i.href, permissions)')
    // Both read the desk through `deskOf`, the helper the sidebar reads,
    // so a program office at a client's desk is filtered by the seat.
    expect(HEADER_SRC).toContain('deskOf(session)')
    expect(HEADER_SRC).toContain('{ worker: desk.worker, permissions, seatedAtClient: desk.seatedAtClient, hat: desk.hat }')
  })

  it('does not filter a menu at all until it knows what the seat holds', () => {
    // The moment before /api/me answers. A menu that shortens itself a
    // beat after it draws is a menu that flickers.
    expect(itemsOf(getNavForKind('GSI', false, { permissions: null })).length)
      .toBe(itemsOf(getNavForKind('GSI', false)).length)
  })
})

/**
 * ── What is held about a person, from every desk ─────────────────────
 *
 * The founder, on the retention, export, erasure and breach work:
 * "Implement it across the app and not for client."
 *
 * Two doors were missing. The compliance desk at /dashboard/privacy was
 * in nobody's menu at all — not a vendor's, not a client's — so a page
 * built, tested and deployed could be reached only by typing its
 * address, which is the same bug as a column nothing writes to. And
 * "Your data" was in the consultant's own section and nowhere else,
 * while every signed-in person has data held about them: a client's AP
 * clerk is a "Business user" in lib/legal's own HELD table.
 */
describe('the compliance desk and a person’s own record have a door in every menu', () => {
  const PRIVACY_DESK = '/dashboard/privacy'
  const OWN_DATA = '/dashboard/my-data'

  const officerOf = (kind: 'VENDOR' | 'GSI' | 'MSP' | 'CLIENT') =>
    rolesFor(kind).find((r) => r.name === 'Compliance Officer')!

  for (const [party, kind] of [
    ['a supplier', 'VENDOR'], ['an integrator', 'GSI'], ['an MSP', 'MSP'], ['a client', 'CLIENT'],
  ] as const) {
    it(`${party}'s compliance officer finds Data requests as a tab of Settings`, () => {
      const nav = getNavForKind(kind, false, { permissions: officerOf(kind).permissions })
      const settings = nav.find((s) => s.label === 'Settings')
      expect(settings, `${party} has no Settings`).toBeTruthy()
      const desk = settings!.items.find((i) => pathOf(i.href) === PRIVACY_DESK)
      expect(desk, `${party}'s compliance officer cannot reach ${PRIVACY_DESK}`).toBeTruthy()
      expect(desk!.label).toBe('Data requests')
    })
  }

  it('a hiring manager without the governance read is not shown a door the route would refuse', () => {
    // /api/data-requests, /api/legal-holds and /api/breaches all gate
    // their GET on governance.read, which a hiring manager does not
    // hold. A link that opens a red refusal is a link that lies.
    const manager = rolesFor('CLIENT').find((r) => r.name === 'Hiring Manager')!
    const hrefs = itemsOf(getNavForKind('CLIENT', false, { permissions: manager.permissions })).map((i) => i.href)
    expect(manager.permissions).not.toContain('governance.read')
    expect(hrefs).not.toContain(PRIVACY_DESK)
    expect(mayOpen(PRIVACY_DESK, manager.permissions)).toBe(false)
  })

  it('an AP clerk can reach their own data from their firm’s menu', () => {
    // She holds no governance read and is nobody's contractor, so she
    // reads neither the desk's queue nor a "You" section — and lib/legal
    // still holds her name, her seat and every log of what she opened.
    const clerk = rolesFor('CLIENT').find((r) => r.name === 'AP Clerk')!
    const nav = getNavForKind('CLIENT', false, { permissions: clerk.permissions })
    const hrefs = itemsOf(nav).map((i) => i.href)
    expect(hrefs).toContain(OWN_DATA)
    expect(hrefs).not.toContain(PRIVACY_DESK)
    expect(nav.map((s) => s.label)).not.toContain('You')
  })

  it('offers every seated desk in every firm a way to what is held about them', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT'] as const) {
      for (const role of rolesFor(kind)) {
        const hrefs = itemsOf(getNavForKind(kind, false, { permissions: role.permissions })).map((i) => i.href)
        expect(hrefs, `${kind} / ${role.name} cannot reach their own data`).toContain(OWN_DATA)
      }
    }
  })

  it('a GSI’s own engineer is shown Your data once in each hat, never twice in one', () => {
    // Karthik Menon: Teleworld's W2 and the person the work is about, so
    // he wears two hats. The page belongs to both and prints once in
    // each: under the firm's Settings, and under "You", because it is his.
    const firm = getNavForKind('GSI', false, { worker: true, hat: 'firm' })
    expect(itemsOf(firm).map((i) => i.href).filter((h) => h === OWN_DATA).length).toBe(1)
    expect(firm.find((s) => s.label === 'Settings')!.items.map((i) => i.href)).toContain(OWN_DATA)
    const own = getNavForKind('GSI', false, { worker: true, hat: 'you' })
    expect(itemsOf(own).map((i) => i.href).filter((h) => h === OWN_DATA).length).toBe(1)
    expect(own.find((s) => s.label === 'You')!.items.map((i) => i.href)).toContain(OWN_DATA)
  })

  it('leaves the desk’s own queue on an employed worker’s menu, because it is his firm’s job not his record', () => {
    // Dedupe is by page, not by section: a GSI compliance officer who is
    // also billable keeps the queue under Settings and reads his own
    // record under "You".
    const officer = getNavForKind('GSI', false, {
      worker: true, permissions: officerOf('GSI').permissions,
    })
    expect(officer.find((s) => s.label === 'Settings')!.items.map((i) => pathOf(i.href)))
      .toContain(PRIVACY_DESK)
  })

  it('names Data requests and Document requests apart, Data requests a tab of Settings and Document requests a tab of Contracts, with two names', () => {
    // Two different things that would read as the pair of near-duplicates
    // this menu has been corrected for three times. Document requests
    // moved to Contracts with the paperwork on 2026-11-04.
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT'] as const) {
      const nav = getNavForKind(kind, false)
      const desk = nav.find((s) => s.label === 'Settings')!.items.find((i) => pathOf(i.href) === PRIVACY_DESK)!
      const packets = nav.find((s) => s.label === 'Contracts')!.items.find((i) => i.href === '/dashboard/packets')!
      expect(desk.label, kind).toBe('Data requests')
      expect(packets.label, kind).toBe('Document requests')
    }
  })

  it('names the same permission all three of the desk’s own routes ask for', () => {
    // Belt and braces over the generic check above, which reads only the
    // first route a link names. The page loads all three at once, so a
    // seat that clears one and not the others sees half a screen.
    for (const route of ['data-requests', 'legal-holds', 'breaches']) {
      const src = readFileSync(join(process.cwd(), 'src/app/api', route, 'route.ts'), 'utf8')
      expect(src, `${route} no longer gates its read on governance.read`)
        .toMatch(/const TO_READ = 'governance\.read'/)
    }
  })

  it('asks nothing of somebody opening their own record', () => {
    const own = itemsOf(getNavForKind('CLIENT', false)).find((i) => i.href === OWN_DATA)!
    expect(own.needs).toBeUndefined()
    expect(mayOpen(OWN_DATA, [])).toBe(true)
  })
})

describe('a seat that holds everything is shown everything', () => {
  // Found on the browser walk, not in a test: every seeded owner in the
  // world carries the wildcard `*` rather than a list of permissions —
  // `lib/permissions` has read it that way since it was written — and
  // the menu was comparing strings instead of asking. So Techpeple's
  // owner opened his own company and was shown no Requirements, no
  // Bench, no Invoices and no Payroll, while every one of those routes
  // would have let him in. A menu shorter than the product is the same
  // lie as a menu longer than it, facing the other way.
  const WILDCARD = ['*'] as const

  for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT'] as const) {
    it(`gives ${kind}'s owner the whole menu when the seat is stored as the wildcard`, () => {
      expect(itemsOf(getNavForKind(kind, false, { permissions: WILDCARD })).length)
        .toBe(itemsOf(getNavForKind(kind, false)).length)
    })
  }

  it('answers the + button and the search box the same way', () => {
    expect(mayOpen('/dashboard/consultants?new=1', WILDCARD)).toBe(true)
    expect(mayOpen('/dashboard/privacy', WILDCARD)).toBe(true)
  })

  it('still refuses a seat that holds nothing at all', () => {
    expect(mayOpen('/dashboard/privacy', [])).toBe(false)
  })
})

describe('a Member with no desk reads its own work and what is addressed to it, and nothing of the firm', () => {
  it('a colleague seated as Member is offered their own five pages and what is addressed to them, and no page of the firm\'s', () => {
    for (const kind of ['VENDOR', 'CLIENT', 'GSI', 'MSP'] as const) {
      const member = rolesFor(kind).find((r) => r.name === 'Member')!
      const nav = getNavForKind(kind, false, { permissions: member.permissions })
      const you = nav.find((s) => s.label === 'You')
      expect(you?.items.map((i) => i.href), kind).toEqual(expect.arrayContaining(['/dashboard/my-work', '/dashboard/my-data']))
      for (const item of nav.filter((s) => s.label !== 'You').flatMap((s) => s.items)) {
        expect(openBecause(item.href), `${kind} ${item.href}`).toBe('Everybody reads what is addressed to them.')
      }
      const hrefs = itemsOf(nav).map((i) => i.href)
      for (const firm of ['/dashboard/contracts', '/dashboard/timesheets', '/dashboard/program/budget', '/dashboard/tenure', '/dashboard/scorecards', '/dashboard/program/org']) {
        expect(hrefs, `${kind} ${firm}`).not.toContain(firm)
      }
    }
  })
})

describe('a Member seat reads only the links its seat opens', () => {
  it('a colleague seated as Member is shown no link to a page that would refuse a Member', () => {
    for (const kind of ['VENDOR', 'CLIENT', 'GSI', 'MSP'] as const) {
      const member = rolesFor(kind).find((r) => r.name === 'Member')!
      expect(member, kind).toBeTruthy()
      const nav = getNavForKind(kind, false, { permissions: member.permissions })
      const links = nav.flatMap((s) => s.items)
      expect(links.length, kind).toBeGreaterThan(0)
      for (const item of links) expect(mayOpen(item.href, member.permissions), `${kind} ${item.href}`).toBe(true)
    }
  })
})

/**
 * Sign-up walk, round five, problem 21: a program office's setup told it
 * "You run the program and place nobody, so the suppliers pay their own
 * people", and its menu then offered Payroll, Bench, Consultants and
 * Bench check-ins.
 */
describe('a program office’s menu offers nothing it does not do', () => {
  it('a program office is offered no payroll, no bench, no consultants and no bench check-ins, even holding the whole company', () => {
    const labels = itemsOf(getNavForKind('MSP', false, { permissions: ['*'] })).map((i) => i.label)
    for (const absent of ['Payroll', 'Commissions', 'Bench', 'Consultants', 'Bench check-ins']) {
      expect(labels, absent).not.toContain(absent)
    }
    // What it does do stays: its suppliers and how they score.
    expect(labels).toContain('Suppliers')
    expect(labels).toContain('Supplier scorecards')
  })
})

/**
 * Ask Etyme (founder, 2026-10-12) is the first of the nine on every
 * menu, and since 2026-10-19 it and Conversations are one entry: the link
 * opens the conversations page with Ask Etyme as its first row.
 */
describe('Ask Etyme is the first link on every menu, and Conversations is inside it', () => {
  const kinds = ['CLIENT', 'MSP', 'VENDOR', 'GSI', 'CONSULTANT_CORP'] as const

  it('is the first link on every firm\u2019s menu, with Today (Your work for a one-person firm) after it', () => {
    for (const kind of kinds) {
      const menu = getNavForKind(kind, false)
      expect(pinnedOn(menu).map((i) => i.href), kind).toEqual([ASK_ETYME_HREF])
      expect(menu.map((s) => s.label).slice(0, 2), kind).toEqual(['Ask Etyme', kind === 'CONSULTANT_CORP' ? 'Your work' : 'Today'])
      expect(linksOf(menu[0])[0].href, kind).toBe(ASK_ETYME_HREF)
    }
  })

  it('prints no Conversations link on any menu, and still opens the conversations page through Ask Etyme', () => {
    for (const kind of kinds) {
      for (const permissions of [undefined, [], ['*']]) {
        const menu = getNavForKind(kind, false, { permissions })
        expect(menu.flatMap(linksOf).map((l) => l.label), kind).not.toContain('Conversations')
        expect(menu[0].items.map((i) => i.href), kind).toEqual([ASK_ETYME_HREF, '/dashboard/conversations'])
      }
    }
  })

  it('reaches a seat with no desk too, because what is addressed to it is inside Ask Etyme', () => {
    const deskless = getNavForKind('CLIENT', false, { permissions: [] })
    expect(itemsOf(deskless).map((i) => i.href)).toContain('/dashboard/conversations')
    expect(pinnedOn(deskless).map((i) => i.label)).toEqual(['Ask Etyme'])
  })

  it('is drawn on a worker’s menu too, because Ask Etyme answers her about her own work, and on no menu with neither', () => {
    const menu = getNavForKind(null, true)
    expect(menu[0].items.map((i) => i.label)).toEqual(['Ask Etyme'])
    expect(pinnedOn(menu).map((i) => i.label)).toEqual(['Ask Etyme'])
    expect(pinnedOn([{ title: 'Elsewhere', items: [{ label: 'Bills', href: '/dashboard/invoices', icon: '' }] }] as any)).toEqual([])
  })

  it('asks for exactly what Conversations asks for, so it never offers a door that refuses', () => {
    expect(openBecause(ASK_ETYME_HREF)).toBe(openBecause('/dashboard/conversations'))
    expect(mayOpen(ASK_ETYME_HREF, [])).toBe(true)
  })

  it('is the link lit on its own page and on Conversations, because both are its pages', () => {
    const menu = getNavForKind('CLIENT', false)
    const none = { get: () => null }
    expect(activeHref(menu, ASK_ETYME_HREF, none, '/dashboard/program')).toBe(ASK_ETYME_HREF)
    const onThreads = activeHref(menu, '/dashboard/conversations', none, '/dashboard/program')
    expect(menu[0].items.map((i) => i.href)).toContain(onThreads)
    // The switch's Ask Etyme half is lit on both (lib/nav-table, `viewOf`).
    expect(viewOf(ASK_ETYME_HREF)).toBe('ask')
    expect(viewOf('/dashboard/conversations')).toBe('ask')
    const sidebar = readFileSync(join(process.cwd(), 'src/components/shell/sidebar.tsx'), 'utf8')
    expect(sidebar).toContain('const active = link.covers.some((i) => i.href === current)')
  })

  it('carries the Etyme mark as its icon, not an emoji', () => {
    expect(pinnedOn(getNavForKind('VENDOR', false))[0].icon).toBe(ETYME_MARK_ICON)
    expect(linksOf(getNavForKind('VENDOR', false)[0])[0].icon).toBe(ETYME_MARK_ICON)
    const sidebar = readFileSync(join(process.cwd(), 'src/components/shell/sidebar.tsx'), 'utf8')
    expect(sidebar).toContain('icon === ETYME_MARK_ICON')
    expect(sidebar).toContain('<EtymeMark')
  })

  it('has no Needs attention link any more, because the greeting it sits under is that list', () => {
    for (const kind of kinds) {
      const menu = getNavForKind(kind, false)
      expect(itemsOf(menu).map((i) => i.label), kind).not.toContain('Needs attention')
      expect(pinnedOn(menu).map((i) => i.label), kind).toEqual(['Ask Etyme'])
    }
  })
})

/**
 * Notifications are deleted; Ask Etyme carries the number (founder,
 * 2026-10-13: "kill notification and place Ask Etyme icon instead of it,
 * and show a number (like 5) which symbolizes 5 decisions or responses
 * expected. Ask Etyme (primary) and dashboard (switch to).").
 */
describe('Ask Etyme carries the number the bell used to', () => {
  const shell = (f: string) => readFileSync(join(process.cwd(), 'src/components/shell', f), 'utf8')
  const kinds = ['CLIENT', 'VENDOR', 'GSI', 'MSP', 'CONSULTANT_CORP'] as const

  it('no menu carries Notifications, for any party, any seat, or a consultant', () => {
    const menus = [
      ...kinds.map((k) => getNavForKind(k, false)),
      ...kinds.map((k) => getNavForKind(k, false, { permissions: [] })),
      ...kinds.map((k) => getNavForKind(k, false, { worker: true, permissions: ['assignments.read', 'timesheets.read'] })),
      getNavForKind(null, true),
    ]
    for (const menu of menus) {
      const items = menu.flatMap((s) => s.items)
      expect(items.map((i) => i.label)).not.toContain('Notifications')
      expect(items.map((i) => i.href)).not.toContain('/dashboard/notifications')
    }
    expect(openBecause('/dashboard/notifications')).toBeNull()
  })

  it('the number is the length of the one decisions queue this seat reads', () => {
    expect(owedFrom({ data: { decisions: [{}, {}, {}, {}, {}], total: 5 } })).toBe(5)
    expect(owedFrom({ data: { decisions: [{}, {}] } })).toBe(2)
  })

  it('a seat that owes nothing shows no number', () => {
    expect(owedBadge(owedFrom({ data: { decisions: [], total: 0 } }))).toBeNull()
    expect(owedLabel(0)).toBe('Ask Etyme')
  })

  it('a queue that cannot be read shows no number rather than a guess', () => {
    expect(owedFrom(null)).toBeNull()
    expect(owedFrom({ error: { message: 'refused' } })).toBeNull()
    expect(owedFrom({ data: { total: -1 } })).toBeNull()
    expect(owedBadge(null)).toBeNull()
  })

  it('reads the number as a person hears it, and past ninety-nine as 99+', () => {
    expect(owedBadge(5)).toBe('5')
    expect(owedLabel(1)).toBe('Ask Etyme, 1 thing needs you')
    expect(owedLabel(5)).toBe('Ask Etyme, 5 things need you')
    expect(owedBadge(140)).toBe('99+')
  })

  it('the queue is read when the page loads and then no more often than once a minute', () => {
    expect(OWED_REFRESH_MS).toBe(60_000)
    expect(mayRefresh(null, 0)).toBe(true)
    expect(mayRefresh(1_000, 1_000 + 59_999)).toBe(false)
    expect(mayRefresh(1_000, 1_000 + 60_000)).toBe(true)
    const mark = shell('ask-etyme-mark.tsx')
    // The greeting's own count, read with no side effect, so a worker's mark
    // carries her cards and a firm's seat the decisions total (2026-10-19).
    expect(mark).toContain("fetch('/api/conversations/twin?only=owed'")
    expect(mark).not.toContain("fetch('/api/decisions'")
    expect(mark).toContain('setInterval(read, OWED_REFRESH_MS)')
    expect(mark).toContain('!mayRefresh(lastAt, now)')
    // One store for every mark on screen: one fetch, however many subscribe.
    expect(mark.match(/fetch\(/g)?.length).toBe(1)
  })

  it('the bell, the flip and the header’s Ask Etyme link are gone, and the switch carries the number', () => {
    const header = shell('header.tsx')
    expect(header).not.toContain('NotificationBell')
    expect(existsSync(join(process.cwd(), 'src/components/notification-bell.tsx'))).toBe(false)
    expect(header).not.toContain('AskEtymeFlip')
    expect(shell('ask-etyme-mark.tsx')).not.toContain('AskEtymeFlip')
    expect(header).not.toContain('AskEtymeLink')
    expect(header).toContain('<ViewSwitch dashboardHref={dashboardTab} owed={owed} roomy />')
    expect(shell('view-switch.tsx')).toContain('href={ASK_ETYME_HREF as any}')
  })

  it('the header draws the switch only for a seat whose menu has Ask Etyme, and reads the number only for it', () => {
    const header = shell('header.tsx')
    expect(header).toMatch(/const asks = !session\.loading && pinnedOn\(getNavForKind\(/)
    expect(header).toContain('const owed = useOwedCount(asks)')
    expect(header).toContain('{asks && (')
  })

  it('the switch at the top of the rail carries the same number from the same read', () => {
    const sidebar = shell('sidebar.tsx')
    expect(sidebar).toContain('const owed = useOwedCount(asks)')
    expect(sidebar).toContain('<ViewSwitch dashboardHref={dashboardTab} owed={owed} />')
  })

  it('no face of the header opens the dashboard any more: no four squares, no Dashboard label, and no Switch to dashboard', () => {
    const header = shell('header.tsx')
    const mark = shell('ask-etyme-mark.tsx')
    expect(header).not.toContain('Switch to dashboard')
    expect(mark).not.toContain('DashboardIcon')
    expect(mark).not.toContain("'Dashboard'")
    expect(header).not.toContain('dashboardHref={home}')
  })
})

describe('master data sits under Network: the people a firm keeps and the firms it trades with (founder, 2026-11-04)', () => {
  const groupsAt = (kind: 'VENDOR' | 'GSI' | 'MSP' | 'CLIENT', permissions?: string[]) => {
    const nav = getNavForKind(kind, false, permissions ? { permissions } : {})
    const network = nav.find((s) => s.label === 'Network')!
    return tabsFor(nav, network.items[0].href)!
  }

  it('a client’s Network has Candidates and Suppliers, a supplier’s and an integrator’s Candidates and Companies, an MSP’s Companies alone', () => {
    expect(groupsAt('CLIENT').groups!.map((g) => g.name)).toEqual(['Candidates', 'Suppliers'])
    expect(groupsAt('VENDOR').groups!.map((g) => g.name)).toEqual(['Candidates', 'Companies'])
    expect(groupsAt('GSI').groups!.map((g) => g.name)).toEqual(['Candidates', 'Companies'])
    expect(groupsAt('MSP').groups!.map((g) => g.name)).toEqual(['Companies'])
  })

  it('Network draws both groups in one tab row, each group’s name and then its pages, so Bench or Contacts is one click from the link', () => {
    const vendor = groupsAt('VENDOR')
    expect(vendor.groups!.map((g) => [g.name, g.tabs.map((t) => t.label)])).toEqual([
      ['Candidates', ['Candidates', 'Bench', 'Bench pay', 'Bench check-ins', 'Training']],
      ['Companies', ['Companies', 'Suppliers', 'Contacts']],
    ])
    // The group's name is the link to its own register; the rest follow it.
    expect(groupRow(vendor.groups![0])).toMatchObject({ head: { href: '/dashboard/consultants' }, name: 'Candidates' })
    expect(groupRow(vendor.groups![1]).pages.map((p) => p.label)).toEqual(['Suppliers', 'Contacts'])
    const client = groupsAt('CLIENT')
    expect(client.groups!.map((g) => [g.name, g.tabs.map((t) => t.label)])).toEqual([
      ['Candidates', ['Candidates']],
      ['Suppliers', ['Suppliers', 'Contacts', 'Agreements', 'Supplier scorecards']],
    ])
  })

  it('Network opens on the first page the reader may open, and a group whose register the reader may not open is a plain name over its pages', () => {
    // Finance reads bench profit and no people, and no firm list.
    const nav = getNavForKind('VENDOR', false, { permissions: ['pnl.read', 'invoices.read'] })
    const network = nav.find((s) => s.label === 'Network')!
    expect(linksOf(network)[0].href).toBe('/dashboard/bench')
    const row = tabsFor(nav, '/dashboard/bench')!
    expect(groupRow(row.groups![0])).toMatchObject({ head: null, name: 'Candidates' })
    expect(groupRow(row.groups![0]).pages.map((p) => p.label)).toEqual(['Bench', 'Bench pay'])
  })

  it('no page lost its address: every register and its neighbors still open where they opened before, now as Network’s tabs', () => {
    const at = (kind: 'VENDOR' | 'GSI' | 'MSP' | 'CLIENT') =>
      getNavForKind(kind, false).find((s) => s.label === 'Network')!.items.map((i) => i.href)
    for (const kind of ['VENDOR', 'GSI'] as const) {
      expect(at(kind), kind).toEqual([
        '/dashboard/consultants', '/dashboard/bench', '/dashboard/settings/bench-pay', '/dashboard/texts', '/dashboard/training',
        '/dashboard/companies', '/dashboard/suppliers', '/dashboard/contacts',
      ])
    }
    expect(at('MSP')).toEqual(['/dashboard/companies', '/dashboard/suppliers', '/dashboard/scorecards', '/dashboard/contacts'])
    expect(at('CLIENT')).toEqual(['/dashboard/people', '/dashboard/suppliers', '/dashboard/contacts', '/dashboard/program/agreements', '/dashboard/scorecards'])
  })

  it('Sites stay under Settings, because a site is the firm’s own place and a setup item, not its network', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT'] as const) {
      const nav = getNavForKind(kind, false)
      expect(nav.find((s) => s.items.some((i) => i.href === '/dashboard/settings/sites'))!.label, kind).toBe('Settings')
    }
  })
})

describe('paperwork is a tab of Contracts, not a thing of its own (founder, 2026-11-04)', () => {
  const PAPER_PAGES = ['/dashboard/documents', '/dashboard/loose-ends', '/dashboard/packets', '/dashboard/outbound-pack', '/dashboard/compliance', '/dashboard/checks']

  it('Paperwork is a tab of Contracts on every firm’s menu, beside the lines it protects', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP'] as const) {
      const nav = getNavForKind(kind, false)
      const row = tabsFor(nav, '/dashboard/documents')!
      expect(row.label, kind).toBe('Contracts')
      expect(row.groups!.map((g) => [g.name, g.tabs.map((t) => t.label)]), kind).toEqual([
        ['Contracts', ['Sell contracts', 'Buy contracts', 'POs']],
        ['Paperwork', ['Paperwork', 'Missing paperwork', 'Document requests', 'Screening packs', 'Compliance', 'Check queue']],
      ])
    }
    const client = tabsFor(getNavForKind('CLIENT', false), '/dashboard/packets')!
    expect(client.groups!.map((g) => [g.name, g.tabs.map((t) => t.label)])).toEqual([
      ['Contracts', ['Contracts', 'Ending soon', 'Past contractors', 'Tenure', 'Duplicate check']],
      ['Paperwork', ['Compliance', 'Document requests']],
    ])
  })

  it('nothing under Settings that is a paper’s page remains there but the DNR list, and Papers you require is the setup checklist’s own item', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT'] as const) {
      const settings = getNavForKind(kind, false).find((s) => s.label === 'Settings')!.items.map((i) => i.href)
      for (const href of PAPER_PAGES) expect(settings, `${kind} ${href}`).not.toContain(href)
      if (kind !== 'CLIENT') expect(settings, kind).toContain('/dashboard/blacklist')
    }
  })

  it('no paper’s page lost its address, and the one-person firm’s Paperwork and the worker’s own Your paperwork are unchanged', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP'] as const) {
      const contracts = getNavForKind(kind, false).find((s) => s.label === 'Contracts')!.items.map((i) => i.href)
      for (const href of PAPER_PAGES) expect(contracts, `${kind} ${href}`).toContain(href)
    }
    const solo = getNavForKind('CONSULTANT_CORP', false).find((s) => s.label === 'Paperwork')!
    expect(solo.items.map((i) => i.label)).toEqual(['Company paperwork', 'Your paperwork', 'Compliance'])
    const worker = getNavForKind(null, true).find((s) => s.label === 'You')!
    expect(worker.items.map((i) => i.label)).toContain('Your paperwork')
  })
})

describe('the money follows the founder’s process order, and a bench vendor is never restricted to its bench (2026-11-04)', () => {
  it('Network sits above Jobs on every firm’s menu: the master data first, the process after it', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT'] as const) {
      const labels = getNavForKind(kind, false).map((s) => s.label)
      expect(labels.slice(0, 4), kind).toEqual(['Ask Etyme', 'Today', 'Network', 'Jobs'])
    }
  })

  it('Bills is what the firm issues upward with AR beside it, Invoice receipts is what it receives from below on AP, and Payroll pays its own people with Commissions', () => {
    const vendor = getNavForKind('VENDOR', false)
    const tabs = (label: string) => vendor.find((s) => s.label === label)!.items.map((i) => [i.label, i.href])
    expect(tabs('Bills')).toEqual([['Bills', '/dashboard/invoices'], ['AR', '/dashboard/ar']])
    expect(tabs('Invoice receipts')).toEqual([['AP', '/dashboard/ap']])
    expect(tabs('Payroll')).toEqual([['Payroll', '/dashboard/payroll'], ['Commissions', '/dashboard/payroll/commissions']])
    // The client's money noun is unchanged: what it receives, and what it owes on it.
    const client = getNavForKind('CLIENT', false).find((s) => s.label === 'Invoice receipts')!
    expect(client.items.map((i) => i.label)).toEqual(['Invoice receipts', 'AP', 'Budget', 'POs'])
  })

  it('Rolloff stays a tab of Timesheets and Reports a tab of Today, where they fold today', () => {
    const vendor = getNavForKind('VENDOR', false)
    expect(vendor.find((s) => s.items.some((i) => i.href === '/dashboard/rolloff'))!.label).toBe('Timesheets')
    expect(vendor.find((s) => s.items.some((i) => i.href === '/dashboard/reports'))!.label).toBe('Today')
  })

  it('a bench vendor reads every link a supplier reads, and its Contracts carry a corp-to-corp buy line beside a W2 line', () => {
    // Prime, sub-vendor and bench are positions on a deal, never a kind:
    // a bench firm is a VENDOR with supplierPosture BENCH, and nothing that
    // draws a menu, a tab or the contracts list reads the posture.
    for (const file of ['src/lib/nav-table.ts', 'src/components/shell/section-pills.tsx', 'src/components/shell/sidebar.tsx', 'src/components/shell/sidebar-props.ts', 'src/app/dashboard/contracts/page.tsx', 'src/app/api/contracts/route.ts']) {
      expect(readFileSync(join(process.cwd(), file), 'utf8'), file).not.toMatch(/supplierPosture|postureWord/)
    }
    const vendor = getNavForKind('VENDOR', false)
    expect(vendor.map((s) => s.label)).toContain('Payroll')
    expect(vendor.map((s) => s.label)).toContain('Invoice receipts')
    // One Buy tab for every buy line, whichever way it pays: by invoice
    // receipt to the firm below (C2C) or by payroll to its own W2.
    const buy = vendor.find((s) => s.label === 'Contracts')!.items.filter((i) => i.href.startsWith('/dashboard/contracts?side=buy'))
    expect(buy.map((i) => i.label)).toEqual(['Buy contracts'])
    const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
    expect(schema).toMatch(/enum ContractType \{[^}]*\bW2\b[^}]*\bC2C\b/)
  })
})

describe('one app, two tabs: Ask Etyme | Dashboard at the top of the left column (founder, 2026-11-08)', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  const linksAt = (kind: 'VENDOR' | 'GSI' | 'MSP' | 'CLIENT', permissions?: string[]) =>
    menuLinks(menuFor(kind, false, permissions ? { permissions } : {}))

  it('a supplier’s Dashboard column reads Today, Network over Candidates and Companies, Jobs, Submissions, HR over Contracts, Timesheets and Expenses, Accounting over Receivables, Payables, Payroll and Reports, then Settings', () => {
    const groups = menuFor('VENDOR', false)
    expect(groups.map((g) => [g.heading, g.links.map((l) => l.label)])).toEqual([
      [null, ['Today']],
      ['Network', ['Candidates', 'Companies']],
      [null, ['Jobs']],
      [null, ['Submissions']],
      ['HR', ['Contracts', 'Timesheets', 'Expenses']],
      ['Accounting', ['Receivables', 'Payables', 'Payroll', 'Reports']],
      [null, ['Settings']],
    ])
  })

  it('a group is a heading and never a link, on every firm’s column', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT'] as const) {
      const labels = linksAt(kind).map((l) => l.label)
      for (const heading of ['Network', 'HR', 'Accounting']) expect(labels, `${kind} ${heading}`).not.toContain(heading)
    }
  })

  it('Ask Etyme is not on the Dashboard column for anybody, because the switch above it is Ask Etyme', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT', 'CONSULTANT_CORP'] as const) {
      const hrefs = menuLinks(menuFor(kind, false)).flatMap((l) => l.covers.map((i) => i.href))
      expect(hrefs, kind).not.toContain(ASK_ETYME_HREF)
      expect(hrefs, kind).not.toContain('/dashboard/conversations')
    }
    expect(menuLinks(menuFor(null, true)).map((l) => l.href)).not.toContain(ASK_ETYME_HREF)
  })

  it('a link is drawn only where the role may open one of its pages: a seat that reads invoices and nothing of payroll or margin sees no Payroll, and its Reports holds no Profitability', () => {
    const links = linksAt('VENDOR', ['invoices.read'])
    const labels = links.map((l) => l.label)
    expect(labels).toContain('Receivables')
    expect(labels).not.toContain('Payroll')
    expect(links.find((l) => l.label === 'Reports')!.covers.map((i) => i.href)).toEqual(['/dashboard/reports'])
    expect(linksAt('VENDOR', ['*']).find((l) => l.label === 'Reports')!.covers.map((i) => i.href)).toContain('/dashboard/profitability')
  })

  it('the finance seat that reads bench profit and no people opens Candidates on Bench, the first of its pages it may open', () => {
    const candidates = linksAt('VENDOR', ['pnl.read', 'invoices.read']).find((l) => l.label === 'Candidates')!
    expect(candidates.href).toBe('/dashboard/bench')
  })

  it('Expenses is a link of its own and Profitability a page of Reports, and both are still tabs of Timesheets and Today, so no page lost its tab row', () => {
    const nav = getNavForKind('VENDOR', false)
    const links = menuLinks(menuOf(nav, true))
    expect(links.find((l) => l.label === 'Expenses')!.covers.map((i) => i.href)).toEqual(['/dashboard/expenses'])
    expect(links.find((l) => l.label === 'Reports')!.covers.map((i) => i.href)).toEqual(['/dashboard/reports', '/dashboard/profitability'])
    expect(links.find((l) => l.label === 'Timesheets')!.covers.map((i) => i.href)).not.toContain('/dashboard/expenses')
    expect(tabsFor(nav, '/dashboard/expenses')!.label).toBe('Timesheets')
    expect(tabsFor(nav, '/dashboard/profitability')!.label).toBe('Today')
  })

  it('every page a firm’s menu named before is still reached from one link on the column, once', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT'] as const) {
      const nav = getNavForKind(kind, false)
      const before = nav.flatMap((s) => s.items).filter((i) => i.href !== ASK_ETYME_HREF && i.href !== '/dashboard/conversations').map((i) => i.href)
      const after = menuLinks(menuFor(kind, false)).flatMap((l) => l.covers.map((i) => i.href))
      expect([...after].sort(), kind).toEqual([...before].sort())
    }
  })

  it('Money is Accounting: Receivables opens the Bills page and Payables the Invoice receipts page, and the pages keep their own tabs and words', () => {
    const links = linksAt('VENDOR')
    const receivables = links.find((l) => l.label === 'Receivables')!
    const payables = links.find((l) => l.label === 'Payables')!
    expect(receivables.covers.map((i) => i.href)).toEqual(['/dashboard/invoices', '/dashboard/ar'])
    expect(payables.covers.map((i) => i.href)).toEqual(['/dashboard/ap'])
    const nav = getNavForKind('VENDOR', false)
    expect(tabsFor(nav, '/dashboard/ar')!.tabs.map((t) => t.label)).toEqual(['Bills', 'AR'])
    for (const old of ['Bills', 'Invoice receipts', 'Money']) {
      for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT'] as const) {
        expect(menuFor(kind, false).flatMap((g) => [g.heading, ...g.links.map((l) => l.label)]), `${kind} ${old}`).not.toContain(old)
      }
    }
  })

  it('Reports leaves Today for Accounting, after the ledgers and Payroll, and keeps its address', () => {
    const vendor = linksAt('VENDOR')
    expect(vendor.find((l) => l.label === 'Today')!.covers.map((i) => i.href)).not.toContain('/dashboard/reports')
    expect(vendor.find((l) => l.label === 'Reports')!.href).toBe('/dashboard/reports')
    const accounting = menuFor('VENDOR', false).find((g) => g.heading === 'Accounting')!
    expect(accounting.links[accounting.links.length - 1].label).toBe('Reports')
  })

  it('a client reads Accounting with Payables only, and no Reports until the Reports page has been read as a client', () => {
    const accounting = menuFor('CLIENT', false).find((g) => g.heading === 'Accounting')!
    expect(accounting.links.map((l) => l.label)).toEqual(['Payables'])
    expect(accounting.links[0].covers.map((i) => i.href)).toEqual(['/dashboard/invoices', '/dashboard/ap', '/dashboard/program/budget', '/dashboard/purchase-orders'])
    expect(getNavForKind('CLIENT', false).flatMap((s) => s.items).map((i) => i.href)).not.toContain('/dashboard/reports')
  })

  it('Reports is cash flow and profitability, so Profitability is no link of its own: its page is reached under Reports, at the address it always had', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP'] as const) {
      const groups = menuFor(kind, false)
      expect(menuLinks(groups).map((l) => l.label), kind).not.toContain('Profitability')
      expect(groups.map((g) => g.heading ?? g.links[0].label).slice(-2), kind).toEqual(['Accounting', 'Settings'])
      const reports = groups.find((g) => g.heading === 'Accounting')!.links.find((l) => l.label === 'Reports')!
      expect(reports.href, kind).toBe('/dashboard/reports')
      expect(reports.covers.map((i) => i.href), kind).toContain('/dashboard/profitability')
    }
  })

  it('Reports is offered only where the seat may open Receivables\u2019 AR, Payables or Profitability, so a recruiter is not offered a page of nothing but money', () => {
    expect(linksAt('VENDOR', ['requirements.read', 'submissions.create']).map((l) => l.label)).not.toContain('Reports')
    expect(linksAt('VENDOR', ['invoices.read']).map((l) => l.label)).toContain('Reports')
    expect(linksAt('VENDOR', ['margin.read']).map((l) => l.label)).toContain('Reports')
  })

  it('a one-person firm keeps Bills, because her short menu has no Accounting heading', () => {
    expect(menuLinks(menuFor('CONSULTANT_CORP', false)).map((l) => l.label)).toContain('Bills')
  })

  it('a one-person firm and a worker read their own links with no firm headings', () => {
    expect(menuFor('CONSULTANT_CORP', false).every((g) => g.heading === null)).toBe(true)
    expect(menuFor(null, true).map((g) => g.heading)).toEqual(['You'])
  })

  it('Ask Etyme and its conversations are the Ask Etyme view, and every other page is the Dashboard view', () => {
    expect(viewOf(ASK_ETYME_HREF)).toBe('ask')
    expect(viewOf('/dashboard/conversations')).toBe('ask')
    expect(viewOf('/dashboard/conversations/abc')).toBe('ask')
    expect(viewOf('/dashboard')).toBe('dashboard')
    expect(viewOf('/dashboard/conversationsx')).toBe('dashboard')
    expect(viewOf(null)).toBe('dashboard')
  })

  it('an AP clerk, AP & Payroll and a coordinator open on Dashboard, everybody else on Ask Etyme, and a person’s own last choice beats both', () => {
    expect(firstTabFor('AP Clerk', null)).toBe('dashboard')
    expect(firstTabFor('AP & Payroll', null)).toBe('dashboard')
    expect(firstTabFor('Coordinator', null)).toBe('dashboard')
    expect(firstTabFor('Hiring Manager', null)).toBe('ask')
    expect(firstTabFor('Owner', null)).toBe('ask')
    expect(firstTabFor(null, null)).toBe('ask')
    expect(firstTabFor('AP Clerk', 'ask')).toBe('ask')
    expect(firstTabFor('Owner', 'dashboard')).toBe('dashboard')
  })

  it('the last tab is kept per person on the device, and anything stored that is not one of the two tabs is read as no choice', () => {
    expect(tabKey('p1')).not.toBe(tabKey('p2'))
    expect(readTab('ask')).toBe('ask')
    expect(readTab('dashboard')).toBe('dashboard')
    expect(readTab('chat')).toBeNull()
    expect(readTab(null)).toBeNull()
  })

  it('a browser that refuses storage still opens the app: every read and write of the remembered tab is inside try and catch', () => {
    const sw = read('src/components/shell/view-switch.tsx')
    expect(sw).toContain('try { return get() } catch { return null }')
    const touches = sw.split('\n').filter((l) => /Storage\./.test(l))
    expect(touches.length).toBeGreaterThan(0)
    for (const line of touches) expect(line).toContain('stored(() =>')
  })

  it('the switch sits at the top of the rail in both views, and in Ask Etyme the column holds the three places the Ask Etyme page fills', () => {
    const sidebar = read('src/components/shell/sidebar.tsx')
    expect(sidebar.indexOf('<ViewSwitch')).toBeLessThan(sidebar.indexOf('<nav ref={navRef}'))
    expect(sidebar).toContain('<RailSlotOutlet name="top" />')
    expect(sidebar).toContain('<RailSlotOutlet name="pinned" heading="Pinned" />')
    expect(sidebar).toContain('<RailSlotOutlet name="conversations" heading="Conversations" />')
    const slots = read('src/components/shell/rail-slots.tsx')
    expect(slots).toContain('createPortal(children, target)')
    expect(slots).toContain('{heading && filled &&')
  })
})
