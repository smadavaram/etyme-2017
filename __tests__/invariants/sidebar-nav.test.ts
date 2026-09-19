import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { globSync } from 'fs'
import { getNavForKind, mayOpen } from '@/components/shell/sidebar'
import { sidebarPropsFrom } from '@/components/shell/sidebar-props'
import { ownPage } from '@/lib/consultant-portfolio'
import { PERMISSIONS } from '@/lib/permissions'
import { rolesFor } from '@/lib/company-defaults'

/**
 * The founder's own words: "apps on client side seems to be duplicating
 * candidates and people and too many organized links."
 *
 * Two real bugs, traced to this one file. This pins the fix so neither
 * comes back the next time somebody adds a nav item without reading the
 * section it lands in.
 */

const SOURCE = readFileSync(
  join(__dirname, '../../src/components/shell/sidebar.tsx'),
  'utf8'
)

function extractArray(name: string): string {
  const decl = `const ${name}: NavSection[] = [`
  const start = SOURCE.indexOf(decl)
  expect(start, `${name} not found`).toBeGreaterThan(-1)
  // Walk bracket depth from the opening `[` to its matching close. Start
  // the search past the declaration itself — "NavSection[]" carries its
  // own `[` earlier on the same line.
  let depth = 0
  let i = start + decl.length - 1
  const open = i
  for (; i < SOURCE.length; i++) {
    if (SOURCE[i] === '[') depth++
    if (SOURCE[i] === ']') {
      depth--
      if (depth === 0) break
    }
  }
  return SOURCE.slice(open, i + 1)
}

describe('a client viewing People never sees the same human twice under two different names', () => {
  const clientNav = extractArray('CLIENT_NAV')

  it('has no nav item pointing at the raw, one-row-per-submission feed', () => {
    // The raw feed put every vendor's submission of the same person on
    // its own row with the name repeated — that IS the duplication the
    // founder saw. It still exists as a route; it just is not a front
    // door into the client's people register any more.
    const candidatesToRawFeed =
      /label:\s*'Candidates',\s*href:\s*'\/dashboard\/submissions'/.test(clientNav)
    expect(candidatesToRawFeed).toBe(false)
  })

  it('offers exactly one entry point for people, and it is the merged register', () => {
    const peopleMatches = clientNav.match(/href:\s*'\/dashboard\/people'/g) ?? []
    expect(peopleMatches.length).toBe(1)
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

/**
 * A group split across two non-adjacent blocks would print its own
 * sub-header twice — the render in sidebar.tsx only starts a new header
 * when a group name differs from the item right before it. Shared by
 * both the vendor and client checks below.
 */
function assertGroupsAreContiguous(sectionText: string) {
  const groups = [...sectionText.matchAll(/group:\s*'([^']+)'/g)].map((m) => m[1])
  const seen = new Set<string>()
  let previous: string | null = null
  for (const g of groups) {
    if (g !== previous) {
      expect(
        seen.has(g),
        `group "${g}" reappears after another group started — its header would print twice`
      ).toBe(false)
      seen.add(g)
    }
    previous = g
  }
}

describe('the vendor Operate section reads as named clusters, not one wall of links', () => {
  const operate = getNavForKind('VENDOR', false).find((s) => s.label === 'Operate')!

  it('gives every Operate item except the queue at the top a named group', () => {
    // Missing paperwork is deliberately ungrouped — it is a queue, sitting
    // above the clusters, not inside one.
    const ungrouped = operate.items.filter((i) => !i.group)
    expect(ungrouped.map((i) => i.label)).toEqual(['Missing paperwork'])
    expect(operate.items[0].label).toBe('Missing paperwork')
  })

  it('names the three things a firm does with a placement: who, what, and the money', () => {
    const groups = [...new Set(operate.items.map((i) => i.group).filter(Boolean))]
    expect(groups).toEqual(['Network', 'Contracts & time', 'Money'])
  })
})

describe('a client\'s nav reads as the sequence of a placement, not a wall of links', () => {
  // Founder report, verbatim: "so many duplicates in left navigation
  // like candidates and people, almost missing is contacts and the
  // interface is not user friendly. You mixed admin setup to daily
  // operational activity like timesheets approve - the whole left
  // navigation should be better streamlined to reflect sequence of
  // steps." Four real complaints, fixed together in one pass.
  const clientNav = extractArray('CLIENT_NAV')
  const programStart = clientNav.indexOf("label: 'Workforce'")
  const governanceStart = clientNav.indexOf("label: 'Governance'")
  const program = clientNav.slice(programStart, governanceStart)
  const governance = clientNav.slice(governanceStart)

  it('has a Contacts link — the rolodex vendors already had, clients did not', () => {
    expect(clientNav).toContain("href: '/dashboard/contacts'")
  })

  it('offers one way into a requirement, not two that read as rivals', () => {
    // Raised twice by the founder. The first fix grouped "Requisitions"
    // and "Open roles" under one header and left both entries standing,
    // on the reasoning that they are two steps rather than two things.
    // They are the same Requirement row before approval and after
    // release, and a header did not stop them reading as duplicates —
    // the second report was "what is the difference between requisitions
    // and open roles".
    //
    // So there is one entry now and the stage is a filter on the screen.
    // Asserted as an absence, because that is the thing that must not
    // come back.
    expect(program).toContain("label: 'Requirements'")
    expect(program).not.toContain("label: 'Open roles'")
    expect(program).not.toContain("label: 'Requisitions'")
  })

  it('keeps Timesheets and Invoices out of the same group as Settings and access', () => {
    // The founder's exact complaint: admin setup mixed into daily
    // operational work. Timesheets/Invoices now live under Program's
    // Operate group; Settings/access now live under Governance's Setup
    // group — never the same group, in the same section or not.
    const groupOf = (nav: string, label: string) => {
      const idx = nav.indexOf(`label: '${label}'`)
      expect(idx, `${label} not found`).toBeGreaterThan(-1)
      const line = nav.slice(idx, nav.indexOf('\n', idx))
      return line.match(/group:\s*'([^']+)'/)?.[1] ?? null
    }
    const timesheetsGroup = groupOf(program, 'Timesheets')
    const settingsGroup = groupOf(governance, 'Settings')
    const accessGroup = groupOf(governance, 'Users & permissions')
    expect(timesheetsGroup).not.toBeNull()
    expect(timesheetsGroup).not.toBe(settingsGroup)
    expect(timesheetsGroup).not.toBe(accessGroup)
  })

  it('gives every item a named group except the dashboard entry point at the top', () => {
    const itemLines = clientNav
      .split('\n')
      .filter((l) => /href:\s*'\/dashboard/.test(l))
    const ungrouped = itemLines.filter((l) => !/group:\s*'/.test(l))
    expect(ungrouped.length).toBe(1)
    expect(ungrouped[0]).toContain('Dashboard')
  })

  it('keeps each group as one contiguous block in both sections', () => {
    assertGroupsAreContiguous(program)
    assertGroupsAreContiguous(governance)
  })
})

describe('an integrator gets the Deliver and Supply sections CLAUDE.md names', () => {
  const gsi = getNavForKind('GSI', false)
  const hrefs = gsi.flatMap((s) => s.items.map((i) => i.href))

  it('keeps Deliver and Supply either side of Operate, the way a prime holds both hats', () => {
    expect(gsi.map((s) => s.label)).toEqual(
      ['Today', 'Deliver', 'Supply', 'Operate', 'Grow', 'Governance']
    )
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

  it('does not offer both "Candidates" and "People", which nobody could tell apart', () => {
    // The founder's first report named this pair exactly. A person on the
    // bench is a consultant; a person at a client is a contractor; a name
    // and a phone number is a contact. Three different things, three
    // different words, none of them "people".
    expect(LABELS).not.toContain('People')
    expect(LABELS).not.toContain('Candidates')
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
  'a program office': getNavForKind('MSP', false),
  'a client': getNavForKind('CLIENT', false),
  'a consultant': getNavForKind(null, true),
} as const

/** The firms that trade with somebody. A consultant is a person. */
const TRADING = ['a staffing vendor', 'an integrator', 'a program office', 'a client'] as const

/**
 * Seven.
 *
 * Not a round number: it is where a person stops scanning a list and
 * starts searching it, and it is the length of the longest group in the
 * client's own menu — the one the founder held up as organized.
 */
const MOST_LINKS_IN_A_RUN = 7

function itemsOf(sections: ReturnType<typeof getNavForKind>) {
  return sections.flatMap((s) => s.items)
}

/** The page a link opens, without the tab it opens it on. */
function pathOf(href: string) {
  return href.split('?')[0]
}

describe('every party reads the menu CLAUDE.md says it reads', () => {
  // The code and the table had drifted: the table said Procure and the
  // build shipped "Talent", which is a word the table has never
  // contained. Nothing noticed, because a table in a document cannot.
  const doc = readFileSync(join(process.cwd(), 'CLAUDE.md'), 'utf8')
  const table = doc.slice(
    doc.indexOf('### Navigation per company type'),
    doc.indexOf('**Eyebrow labels are company-type-specific.**')
  )

  const documented = new Map<string, string[]>()
  for (const line of table.split('\n')) {
    const row = line.match(/^\|\s*([A-Za-z]+)[^|]*\|\s*([^|]+?)\s*\|$/)
    if (!row || row[1] === 'Company') continue
    documented.set(row[1], row[2].split('→').map((x) => x.trim()))
  }

  const CODE: Record<string, readonly string[]> = {
    Vendor: getNavForKind('VENDOR', false).map((s) => s.label),
    GSI: getNavForKind('GSI', false).map((s) => s.label),
    MSP: getNavForKind('MSP', false).map((s) => s.label),
    Client: getNavForKind('CLIENT', false).map((s) => s.label),
    Consultant: getNavForKind(null, true).map((s) => s.label),
  }

  it('names all five parties in the table, and nobody else', () => {
    expect([...documented.keys()].sort()).toEqual(
      ['Client', 'Consultant', 'GSI', 'MSP', 'Vendor']
    )
  })

  for (const party of ['Vendor', 'GSI', 'MSP', 'Client', 'Consultant']) {
    it(`shows ${party} exactly the sections the table names, in that order`, () => {
      expect(CODE[party]).toEqual(documented.get(party))
    })
  }

  it('states the rule for a person who is also a worker, in the same place as the table', () => {
    // The table is per company type and a worker's menu is a firm's plus
    // one section, so the rule cannot be a row. It is the sentence under
    // the table, and this is what stops the code and the document
    // drifting apart the way they did over "Talent" and "Procure".
    expect(
      table,
      'CLAUDE.md no longer states what a menu does for somebody who is also a worker'
    ).toContain('A person who is also a worker keeps their firm\'s sections and gains "You"\nat the end.')
  })

  for (const party of ['Vendor', 'GSI', 'MSP', 'Client'] as const) {
    it(`gives ${party} its own sections and then "You" when the reader is also a worker`, () => {
      const kind = party === 'Vendor' ? 'VENDOR' : party.toUpperCase()
      expect(getNavForKind(kind as any, false, { worker: true }).map((s) => s.label))
        .toEqual([...documented.get(party)!, 'You'])
    })
  }

  it('changes nothing for somebody whose seat already is the consultant seat', () => {
    expect(getNavForKind(null, true, { worker: true }).map((s) => s.label))
      .toEqual(documented.get('Consultant'))
  })
})

describe('no menu is a long flat list of links', () => {
  // "All over the place" was seventeen links in a row with two headings
  // somewhere in the middle of them. A section is either short enough to
  // read whole or every link in it sits under a heading.
  for (const [party, sections] of Object.entries(MENUS)) {
    for (const section of sections) {
      const ungrouped = section.items.filter((i) => !i.group)
      const grouped = section.items.filter((i) => i.group)

      it(`keeps ${party}'s ${section.label} section readable`, () => {
        if (grouped.length === 0) {
          expect(
            section.items.length,
            `${section.label} is ${section.items.length} links with nothing between them`
          ).toBeLessThanOrEqual(MOST_LINKS_IN_A_RUN)
        } else {
          // One ungrouped link is allowed, and only at the top: a queue
          // that sits above the headings rather than inside one.
          expect(
            ungrouped.length,
            `${section.label} mixes ${ungrouped.length} loose links in among its headings`
          ).toBeLessThanOrEqual(1)
          if (ungrouped.length === 1) {
            expect(section.items[0].group, `${section.label}'s loose link is not at the top`).toBeUndefined()
          }
        }
      })
    }
  }

  it('never puts more than seven links under one heading', () => {
    const tooLong: string[] = []
    for (const [party, sections] of Object.entries(MENUS)) {
      for (const section of sections) {
        const counts = new Map<string, number>()
        for (const item of section.items) {
          if (!item.group) continue
          counts.set(item.group, (counts.get(item.group) ?? 0) + 1)
        }
        for (const [group, n] of counts) {
          if (n > MOST_LINKS_IN_A_RUN) tooLong.push(`${party}: ${section.label} → ${group} (${n})`)
        }
      }
    }
    expect(tooLong, `these read as a wall rather than a group:\n  ${tooLong.join('\n  ')}`).toEqual([])
  })

  it('keeps every heading as one contiguous block, so it prints once', () => {
    for (const [party, sections] of Object.entries(MENUS)) {
      for (const section of sections) {
        const seen = new Set<string>()
        let previous: string | undefined
        for (const item of section.items) {
          if (item.group && item.group !== previous) {
            expect(
              seen.has(item.group),
              `${party}: "${item.group}" reappears in ${section.label} after another heading started`
            ).toBe(false)
            seen.add(item.group)
          }
          previous = item.group
        }
      }
    }
  })
})

describe('both sides of a contract, and the hours under them, are Operate’s', () => {
  // The founder's own instruction: "contracts buy sell timesheets should
  // be under operate". They were split across Sell and Talent for a
  // vendor and across Deliver and Supply for an integrator, so the same
  // table was reached from two unrelated places.
  for (const party of TRADING) {
    const sections = MENUS[party]
    const contractLinks = itemsOf(sections).filter((i) => pathOf(i.href) === '/dashboard/contracts')
    const timesheets = itemsOf(sections).find((i) => pathOf(i.href) === '/dashboard/timesheets')

    it(`files every contract link ${party} has under Operate`, () => {
      expect(contractLinks.length, 'no contracts link at all').toBeGreaterThan(0)
      for (const link of contractLinks) {
        const section = sections.find((s) => s.items.includes(link))!
        const where = party === 'a client' ? link.group : section.label
        expect(where, `"${link.label}" sits under ${section.label} / ${link.group}`).toBe('Operate')
      }
    })

    it(`files ${party}'s timesheets under Operate, beside the contracts they are filed against`, () => {
      expect(timesheets, 'no timesheets link at all').toBeTruthy()
      const section = sections.find((s) => s.items.includes(timesheets!))!
      const where = party === 'a client' ? timesheets!.group : section.label
      expect(where).toBe('Operate')
    })
  }
})

describe('a firm that has counterparties can see them', () => {
  // "Network on left navigation is missing." It was: the group landed
  // for the client on 2026-09-13 and reached nobody else, so a supplier
  // with sub-vendors under it had no way into its own supplier list.
  for (const party of TRADING) {
    it(`gives ${party} a Network group`, () => {
      const groups = itemsOf(MENUS[party]).map((i) => i.group)
      expect(groups, `${party} has no Network group`).toContain('Network')
    })
  }

  it('leaves a consultant without one, because a person has no counterparties to keep', () => {
    // "Who has you" is the whole of a consultant's network, and it is
    // already on their own section. A group of one is a heading with
    // nothing under it.
    const groups = itemsOf(MENUS['a consultant']).map((i) => i.group)
    expect(groups.filter(Boolean)).toEqual([])
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
    const supply = msp.find((s) => s.label === 'Supply')!
    const hrefs = supply.items.map((i) => i.href)
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

describe('the + button and the search box say what the menu beside them says', () => {
  // Both are doors into the same product and both had their own
  // hand-kept list. The client's + menu was still headed "Program", a
  // section the client's menu stopped having; the search offered every
  // party the vendor's pages, and offered a client no contracts at all.
  const HEADER_SRC = readFileSync(join(process.cwd(), 'src/components/shell/header.tsx'), 'utf8')

  it('heads the + menu with words that reader’s own menu uses', () => {
    const sectionsFor = (kind: 'VENDOR' | 'GSI' | 'MSP' | 'CLIENT') =>
      new Set(getNavForKind(kind, false).map((s) => s.label))

    // The supplier menu is relabeled per party from one table; the
    // client has its own. Read both out of the source and check every
    // heading against the menu the same seat sees.
    const plusSections = HEADER_SRC.slice(
      HEADER_SRC.indexOf('const PLUS_SECTIONS'),
      HEADER_SRC.indexOf('const PLUS_MENU')
    )
    for (const kind of ['VENDOR', 'GSI', 'MSP'] as const) {
      const row = plusSections.match(new RegExp(`${kind}: \\['([^']+)', '([^']+)'\\]`))
      expect(row, `${kind} has no + menu headings`).toBeTruthy()
      for (const name of [row![1], row![2]]) {
        expect(sectionsFor(kind), `${kind}'s + menu says "${name}"`).toContain(name)
      }
    }

    const clientPlus = HEADER_SRC.slice(
      HEADER_SRC.indexOf('const CLIENT_PLUS_MENU'),
      HEADER_SRC.indexOf('function plusMenuFor')
    )
    for (const m of clientPlus.matchAll(/^  {4}label: '([^']+)'/gm)) {
      expect(sectionsFor('CLIENT'), `the client's + menu says "${m[1]}"`).toContain(m[1])
    }
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
    ])
  })

  it('and still sees the firm that employs them, because they are both', () => {
    // Not the consultant menu instead. He holds a real seat at
    // Teleworld, and hiding his employer's menu would be this same bug
    // facing the other way.
    expect(engineer.map((s) => s.label)).toEqual(
      ['Today', 'Deliver', 'Supply', 'Operate', 'Grow', 'Governance', 'You']
    )
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
      companyName: 'Teleworld Solutions', companyLabel: 'GSI · Delivery',
    })
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
    expect(getNavForKind('GSI', false, { worker: karthik.ok }).map((s) => s.label))
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
    expect(getNavForKind(null, true, { worker: false }).map((s) => s.label)).toEqual(['You'])
  })

  it('offers the notifications page once, from Today, not twice', () => {
    const hrefs = engineer.flatMap((s) => s.items.map((i) => i.href))
    expect(hrefs.filter((h) => h === '/dashboard/notifications').length).toBe(1)
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
      .map((i) => JSON.stringify({ href: pathOf(i.href), needs: i.needs }))
  )].map((j) => JSON.parse(j) as { href: string; needs: string[] })

  it('names a real permission on every link that names one', () => {
    expect(annotated.length).toBeGreaterThan(5)
    const unknown = annotated.flatMap((a) => a.needs.filter((p) => !PERMISSIONS.includes(p as any)))
    expect(unknown, `no such permission: ${unknown.join(', ')}`).toEqual([])
  })

  it('asks for exactly what the route behind it asks for, read off that route', () => {
    // Not a second hand-kept table. The permission on a nav item is read
    // back out of the GET handler it points at, so a gate that changes
    // in one place and not the other breaks the build.
    const wrong: string[] = []
    for (const { href, needs } of annotated) {
      const route = join(API, href.replace('/dashboard/', ''), 'route.ts')
      if (!existsSync(route)) {
        wrong.push(`${href} — no route at ${route} to check the claim against`)
        continue
      }
      const src = readFileSync(route, 'utf8')
      const start = src.indexOf('export async function GET')
      const after = src.indexOf('export async function', start + 10)
      const body = src.slice(start, after < 0 ? src.length : after)
      const guard = body.match(/if \(!hasPermission\((?:[^{])*/)?.[0] ?? ''
      const asked = [...guard.matchAll(/hasPermission\([^,]+,\s*'([^']+)'/g)].map((m) => m[1])
      if (asked.join('|') !== needs.join('|')) {
        wrong.push(`${href} — menu says ${needs.join(', ') || '(nothing)'}; the route asks ${asked.join(', ') || '(nothing)'}`)
      }
    }
    expect(wrong, `these promise something the route does not:\n  ${wrong.join('\n  ')}`).toEqual([])
  })

  it('shows a delivery engineer no payroll, no invoices and no profit', () => {
    const labels = itemsOf(getNavForKind('GSI', false, {
      worker: true, permissions: ['assignments.read', 'timesheets.read'],
    })).map((i) => i.label)
    for (const refused of ['Payroll', 'Commissions', 'Invoices', 'Profitability', 'POs', 'Expenses', 'Bench', 'Consultants']) {
      expect(labels, `${refused} would answer him with a permission error`).not.toContain(refused)
    }
    // And he keeps the week he files and the contracts he is on.
    expect(labels).toContain('Timesheets')
    expect(labels).toContain('Sell contracts')
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
    expect(HEADER_SRC).toContain('{ worker: isWorker, permissions }')
  })

  it('does not filter a menu at all until it knows what the seat holds', () => {
    // The moment before /api/me answers. A menu that shortens itself a
    // beat after it draws is a menu that flickers.
    expect(itemsOf(getNavForKind('GSI', false, { permissions: null })).length)
      .toBe(itemsOf(getNavForKind('GSI', false)).length)
  })
})
