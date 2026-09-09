import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { globSync } from 'fs'

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
  const consultantNav = extractArray('CONSULTANT_NAV')

  it('has no link into the vendor staff\'s consultant list', () => {
    expect(consultantNav).not.toContain("href: '/dashboard/consultants'")
  })

  it('has no link into the vendor\'s bench-wide training analytics', () => {
    expect(consultantNav).not.toContain("href: '/dashboard/training'")
  })

  it('gives a candidate exactly one place to edit their own profile', () => {
    const matches = consultantNav.match(/href:\s*'\/dashboard\/my-page'/g) ?? []
    expect(matches.length).toBe(1)
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

describe('the vendor Operate section reads as three named clusters, not one wall of links', () => {
  const vendorNav = extractArray('VENDOR_NAV')
  const operateStart = vendorNav.indexOf("label: 'Operate'")
  const growStart = vendorNav.indexOf("label: 'Grow'")
  const operate = vendorNav.slice(operateStart, growStart)

  it('gives every Operate item except the queue at the top a named group', () => {
    const itemLines = operate
      .split('\n')
      .filter((l) => /href:\s*'\/dashboard\//.test(l))
    // Missing paperwork is deliberately ungrouped — it is a queue, sitting above
    // the clusters, not inside one.
    const ungrouped = itemLines.filter((l) => !/group:\s*'/.test(l))
    expect(ungrouped.length).toBe(1)
    expect(ungrouped[0]).toContain('Missing paperwork')
  })

  it('keeps each group as one contiguous block, so its header prints once', () => {
    assertGroupsAreContiguous(operate)
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
  const programStart = clientNav.indexOf("label: 'Program'")
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

describe('a GSI gets the Deliver / Supply / Operate nav CLAUDE.md names, not the vendor nav', () => {
  // Built on explicit instruction, ahead of the five-vendor bar CLAUDE.md
  // sets for Phase 3/4 — done knowingly, so this pins that it actually
  // shipped rather than half-landing.
  const gsiNav = extractArray('GSI_NAV')

  it('has exactly the three sections CLAUDE.md names, in order', () => {
    const labels = [...gsiNav.matchAll(/label:\s*'(Deliver|Supply|Operate)'/g)].map((m) => m[1])
    expect(labels).toEqual(['Deliver', 'Supply', 'Operate'])
  })

  it('routes a GSI company to GSI_NAV rather than falling back to the vendor nav', () => {
    expect(SOURCE).toMatch(/case 'GSI':\s*return GSI_NAV/)
  })

  it('does not send a GSI onto a client-only or consultant-only screen', () => {
    for (const href of ['/dashboard/program', '/dashboard/requisitions', '/dashboard/my-work', '/dashboard/my-page']) {
      expect(gsiNav, href).not.toContain(`href: '${href}'`)
    }
  })

  it('checks a GSI\'s own bench before a role reaches a sub-vendor, same as any vendor', () => {
    // The requirement page's own-bench check lives behind "Requirements",
    // reused rather than rebuilt — see match-engine.ts for the scope fix
    // that makes "own bench" actually mean the GSI's own bench.
    expect(gsiNav).toContain("href: '/dashboard/requirements'")
    expect(gsiNav).toContain("href: '/dashboard/bench'")
  })

  it('keeps every Operate item except the queue grouped, same as the vendor section it was copied from', () => {
    const operateStart = gsiNav.indexOf("label: 'Operate'")
    const operate = gsiNav.slice(operateStart)
    const itemLines = operate.split('\n').filter((l) => /href:\s*'\/dashboard\//.test(l))
    const ungrouped = itemLines.filter((l) => !/group:\s*'/.test(l))
    expect(ungrouped.length).toBe(1)
    expect(ungrouped[0]).toContain('Missing paperwork')
    assertGroupsAreContiguous(operate)
  })
})

describe('MSP still falls back to the vendor nav — GSI is specified, MSP is not', () => {
  it('is the only other company kind case that reaches the vendor-nav fallthrough', () => {
    const switchBody = SOURCE.slice(
      SOURCE.indexOf('function getNavForKind'),
      SOURCE.indexOf('export function Sidebar')
    )
    expect(switchBody).toMatch(/case 'MSP':\s*\/\//)
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
  ]

  /** Every UI file — the screens and the shell, not the libraries. */
  const files = globSync('src/{app/dashboard,components/shell}/**/*.tsx')

  it('has no screen still headed by a name the menu has dropped', () => {
    const offenders: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      src.split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '')
        if (/^\s*\*/.test(line)) return // a docblock may recount the history
        for (const name of RETIRED) {
          if (code.includes(name)) offenders.push(`${file}:${i + 1} — ${name}`)
        }
      })
    }
    expect(
      offenders,
      `these still show a retired name:\n  ${offenders.join('\n  ')}`
    ).toEqual([])
  })
})
