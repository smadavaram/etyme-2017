import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLIENT_PROGRAMS,
  CLIENT_DESKS,
  SUPPLIER_DESKS,
  SUPPLIER_SEATS,
  PROGRAM_OFFICE_SEATS,
  INTEGRATOR_SEATS,
  CANDIDATE_SEATS,
} from '@/app/demo/seats'

/**
 * The shape of the second public page.
 *
 * `/demo` is one click from the home page and is read by the same
 * person: a client. It drifted — three client programs, then four
 * sections of equal weight about integrators, program offices and
 * primes — and a page that gives a staffing firm the same room as the
 * customer reads as software for staffing firms, which is the exact
 * mistake CLAUDE.md records the home page making for a week.
 *
 * Reading order has no runtime behavior, so nothing would ever catch it
 * except somebody looking. These sentences are that somebody.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const page = read('src/app/demo/page.tsx')
const route = read('src/app/api/demo/route.ts')

describe('the demo door opens on the client', () => {
  it('opens on the three client programs before any supplier and before any person', () => {
    const at = (needle: string) => page.indexOf(needle)
    expect(at('CLIENT_PROGRAMS'), 'the page does not draw the client programs at all').toBeGreaterThan(-1)
    for (const later of ['SUPPLIER_SEATS', 'PROGRAM_OFFICE_SEATS', 'INTEGRATOR_SEATS', 'CANDIDATE_SEATS']) {
      // The import block names them all; the comparison is where each is drawn.
      const drawn = page.lastIndexOf(later)
      expect(drawn, `${later} is never drawn`).toBeGreaterThan(-1)
      expect(
        page.lastIndexOf('CLIENT_PROGRAMS'),
        `${later} is drawn above the client programs — the client is the customer, and a ` +
          'supplier reads this page over their shoulder.'
      ).toBeLessThan(drawn)
    }
  })

  it('offers three programs, ten supplying firms and six people', () => {
    // Eight since 2026-09-21: Brightmoor Staffing, whose nine desks are
    // the only place a supplier's own roles can be walked, and Kestrel
    // MSP, which sits at a client's compliance desk rather than its
    // program manager's. Ten since 2026-09-29: a clinical staffing firm
    // and an industrial one, so the suppliers are not all IT.
    expect(CLIENT_PROGRAMS).toHaveLength(3)
    expect([...SUPPLIER_SEATS, ...PROGRAM_OFFICE_SEATS, ...INTEGRATOR_SEATS]).toHaveLength(10)
    expect(CANDIDATE_SEATS).toHaveLength(6)
  })

  it('says what is waiting at each client program today, as a finished sentence rather than a label', () => {
    for (const p of CLIENT_PROGRAMS) {
      expect(p.waiting.trim().endsWith('.'), `${p.name}: “${p.waiting}”`).toBe(true)
      expect(p.waiting.split(/\s+/).length, `${p.name} says too little`).toBeGreaterThan(8)
      expect(p.where.trim().length, `${p.name} says nowhere`).toBeGreaterThan(2)
    }
  })

  it('draws that sentence on the page rather than keeping it in a file nobody reads', () => {
    expect(read('src/app/demo/desk-picker.tsx')).toContain('{p.waiting}')
  })
})

describe('the desks on a client door', () => {
  /** The desk suffixes POST /api/demo will actually answer to. */
  const known = (() => {
    const m = /const DESKS = \[([^\]]*)\] as const/.exec(route)
    return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : []
  })()

  it('reads the desk list out of the route at all, rather than passing on a pattern that stopped matching', () => {
    expect(known.length).toBeGreaterThan(5)
  })

  it('every client desk on the page is a door the route actually seats', () => {
    // The empty one is the company's own first seat, which the route
    // takes by sending no desk at all — so it is not in the route's list
    // and is still a door.
    const onThePage = CLIENT_DESKS.map((d) => d.desk).filter(Boolean)
    for (const desk of onThePage) {
      expect(known, `the page offers a "${desk}" desk and the route does not know it`).toContain(desk)
    }
    expect(CLIENT_DESKS.map((d) => d.desk)).toContain('')
  })

  it('names every desk the route knows, so no seeded desk is unreachable by clicking', () => {
    // Both rows of chips: a client program's desks, and the nine a
    // supplier runs on, which Brightmoor Staffing seats since
    // 2026-09-21. A desk the route answers to and no door opens is a
    // seat nobody can find.
    const onThePage = new Set([
      ...CLIENT_DESKS.map((d) => d.desk),
      ...SUPPLIER_DESKS.map((d) => d.desk),
    ])
    for (const desk of known) {
      expect(onThePage, `the route seats a "${desk}" desk that no chip on the page opens`).toContain(desk)
    }
  })

  it('every desk a supplier door offers is one the route seats', () => {
    for (const desk of SUPPLIER_DESKS.map((d) => d.desk).filter(Boolean)) {
      expect(known, `the page offers a "${desk}" desk and the route does not know it`).toContain(desk)
    }
    // And the owner's own seat, taken by naming no desk at all.
    expect(SUPPLIER_DESKS.map((d) => d.desk)).toContain('')
  })

  it('names a supplier desk in the trade’s words, not a role key', () => {
    const labels = SUPPLIER_DESKS.map((d) => d.label)
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels).toContain('Account manager')
    expect(labels).toContain('Accounts receivable')
    expect(labels).toContain('AP & payroll')
  })

  it('sends every desk somewhere its own work is', () => {
    // A desk that lands on somebody else's page is the bug the client
    // desks were given landings to fix, and the supplier desks are nine
    // more chances to make it.
    const landings = /const SUPPLIER_LANDING: Partial<Record<Desk, string>> = \{([^}]*)\}/.exec(route)
    expect(landings, 'the route no longer says where a supplier desk lands').toBeTruthy()
    for (const desk of SUPPLIER_DESKS.map((d) => d.desk).filter(Boolean)) {
      expect(landings![1], `${desk} lands nowhere`).toContain(`${desk}:`)
    }
  })

  it('names each desk once, in the words the trade uses rather than a system key', () => {
    const labels = CLIENT_DESKS.map((d) => d.label)
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels).toContain('Program manager')
    expect(labels).toContain('AP clerk')
    expect(labels).toContain('Compliance officer')
    for (const label of labels) expect(label).not.toMatch(/^[A-Z_]+$/)
  })
})

/**
 * The door that was not there until 2026-09-20.
 *
 * This block used to check that the page *said* the independent
 * candidate had no door: every seeded person was on a payroll, on a
 * bench or in a corporation of their own, so the honest thing was a
 * paragraph admitting the gap rather than four doors quietly offered as
 * "the person's side".
 *
 * Saying it was right and leaving it was not. Party 8B is not an exotic
 * case — it is the state `POST /api/onboarding` puts every
 * consumer-email sign-in in on day one, which makes it the first screen
 * a real consultant ever sees. The paragraph is a door now, and these
 * sentences hold the door open.
 */
describe('the door for somebody with no firm at all', () => {
  const door = CANDIDATE_SEATS.find((c) => c.slug === 'marisol-quintero')

  it('gives the independent candidate a door, and says they have no bench and no employer yet', () => {
    expect(door, 'party 8B has no door on the demo page').toBeTruthy()
    expect(door!.about.trim().endsWith('.')).toBe(true)
    expect(
      door!.about,
      'the door has to say what is missing, because what is missing is the whole state'
    ).toMatch(/[Nn]obody employs you|no bench|nobody lists you/)
    expect(door!.about).toMatch(/[Nn]obody lists you|no employer|incorporated nothing/)
  })

  it('no longer tells the reader a paragraph where a door should be', () => {
    expect(page).not.toContain('MISSING_DOOR')
    expect(
      page,
      'the page still says a door is missing, and it is not'
    ).not.toMatch(/no seat here|One door is missing/)
  })

  it('promises that door nothing the seeded person does not have — no placement, no week, no supplier', () => {
    // The temptation on a door this empty is to fill it. Filling it
    // makes her party 8A and deletes the state the door exists to show,
    // so the sentence may not promise work of any kind.
    expect(`${door!.waiting} ${door!.about}`).not.toMatch(/\bplacement\b|\bhours\b|\binvoice\b|\btimesheet\b/i)
  })
})

describe('the page is read on a phone first', () => {
  it('gutters at 16px on a small screen, so nothing runs off the edge at 390px', () => {
    expect(page).toContain('px-4')
  })

  it('wraps the desk chips instead of scrolling them sideways', () => {
    expect(read('src/app/demo/desk-picker.tsx')).toContain('flex flex-wrap')
  })

  it('leads with no claim about artificial intelligence, which is the least defensible thing in the product', () => {
    expect(page.toLowerCase()).not.toMatch(/\bai\b|artificial intelligence|machine learning/)
  })
})

describe('the demo tells a reader what its companies are', () => {
  // The founder's label, decided 2026-09-27. A CRO who read the site asked
  // whether the companies listed were real, and "invented" did not land
  // either — the founder himself asked what it meant.
  it('the demo says its companies are demo companies and not customers', () => {
    const text = page.replace(/\s+/g, ' ')
    expect(text).toContain(
      'Northbend Athletic, Cavanaugh Glassworks, Talvern Medical and every firm that supplies them are demo companies — not customers.'
    )
    expect(text).toContain('Nothing here is real data, and nobody named is a real person.')
    // The rest of the honest paragraph stays: the addresses cannot be
    // registered, and a re-seed resets the lot.
    expect(text).toContain('reserved names nobody can register')
    expect(text).toMatch(/re-seeding puts it all back/)
    expect(text, 'the word the founder struck is back on the page').not.toMatch(/\binvented\b/i)
  })
})

describe('the doors into the demo work without a script', () => {
  const door = read('src/components/try-demo.tsx')

  it('every demo door is a link a reader without a script can follow', async () => {
    const { DOOR_HREF } = await import('@/components/try-demo')
    expect(DOOR_HREF).toEqual({ HIRING: '/demo', BENCH: '/demo#supplier', CANDIDATE: '/demo#candidate' })
    // Every fragment a door names is a section the demo page actually has.
    for (const href of Object.values(DOOR_HREF)) {
      const id = href.split('#')[1]
      if (id) expect(page, `/demo has no section with id="${id}"`).toContain(`id="${id}"`)
    }
    // The door itself is an anchor carrying that address, not a button a
    // reader mode or a text extract drops.
    const doorReturn = door.slice(door.lastIndexOf('return ('))
    expect(doorReturn).toMatch(/<a\s[^>]*href=\{DOOR_HREF\[side\]\}/)
    expect(doorReturn).not.toMatch(/<button/)
  })

  it('still seats the visitor in one click when a script runs, by posting to the demo route', () => {
    expect(door).toMatch(/e\.preventDefault\(\)/)
    expect(door).toMatch(/fetch\('\/api\/demo', \{\s*method: 'POST'/)
  })
})

/**
 * Plain English for a global reader. The founder, 2026-09-29: "Simple
 * plain English that people in India, the US, the UK and Australia, and
 * even non-native readers, can read and understand. Don't throw prose."
 *
 * Every door is one short line of what is waiting and one short line of
 * who they are; every section opens on a line or two and a list.
 */
const EVERY_DOOR = [
  ...CLIENT_PROGRAMS,
  ...SUPPLIER_SEATS,
  ...PROGRAM_OFFICE_SEATS,
  ...INTEGRATOR_SEATS,
  ...CANDIDATE_SEATS,
]

/** The words a reader sees in the page source: JSX text, not comments, tags or code. */
function pageProse(src: string): string {
  const main = src.slice(src.indexOf('<main'), src.indexOf('</main>'))
  return main
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    // A list item, a paragraph or a heading ends a line the reader sees.
    .replace(/<\/(?:li|p|h1|h2|h3)>/g, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/&rsquo;/g, '’')
    .replace(/[ \t]*\n\s*/g, '\n')
    .replace(/[ \t]+/g, ' ')
}

const sentencesIn = (text: string) =>
  text.split(/(?<=[.?!:])\s+|\n+/).map((x) => x.trim()).filter((x) => /[a-z]/i.test(x))

describe('the demo page is plain English', () => {
  it('no sentence on the demo page runs past twenty-five words', () => {
    const lines = [
      ...sentencesIn(pageProse(page)),
      ...EVERY_DOOR.flatMap((d) => [...sentencesIn(d.waiting), ...sentencesIn(d.about)]),
      ...[...CLIENT_DESKS, ...SUPPLIER_DESKS].flatMap((d) => sentencesIn(d.waiting)),
    ]
    expect(lines.length).toBeGreaterThan(40)
    const long = lines.filter((x) => x.split(/\s+/).length > 25)
    expect(long, long.join('\n')).toEqual([])
  })

  it('each door says what is waiting in one short line and who they are in one more, and no longer', () => {
    for (const d of EVERY_DOOR) {
      expect(d.waiting.split(/\s+/).length, `${d.name}: “${d.waiting}”`).toBeLessThanOrEqual(30)
      expect(d.about.split(/\s+/).length, `${d.name}: “${d.about}”`).toBeLessThanOrEqual(40)
    }
  })

  it('draws what is waiting on every kind of door, not only on the client programs', () => {
    const picker = read('src/app/demo/desk-picker.tsx')
    for (const v of ['p', 'f', 'c']) expect(picker).toContain(`{${v}.waiting}`)
  })
})

describe('the demo shows the spread of industries', () => {
  // The founder, 2026-09-29: "Put the industry under each demo company, so
  // people know which industries can use it." CLAUDE.md: horizontal, never
  // vertical — the same product has to work for a travel nurse.
  it('every demo company and person names its industry under its name', () => {
    for (const d of EVERY_DOOR) {
      expect(d.industry?.trim().length ?? 0, `${d.name} names no industry`).toBeGreaterThan(3)
    }
    const picker = read('src/app/demo/desk-picker.tsx')
    // On its own line, straight under the name, on all three kinds of door.
    expect(picker.match(/\{(?:p|f|c)\.name\}\s*<\/h3>\s*<Industry of=\{(?:p|f|c)\} \/>/g)?.length).toBe(3)
    expect(picker).toContain('{of.industry}')
  })

  it('the client programs and the people are not all one industry', () => {
    const first = (x: string) => x.split('·')[0].trim()
    expect(new Set(CLIENT_PROGRAMS.map((p) => first(p.industry))).size).toBe(3)
    expect(new Set(CANDIDATE_SEATS.map((c) => first(c.industry))).size).toBe(6)
  })

  // CLAUDE.md: horizontal, never vertical. Until 2026-09-29 every
  // supplier door sold software people, so a reader took the product for
  // IT staffing software.
  it("the demo's suppliers cover healthcare and engineering as well as IT", () => {
    const lines = SUPPLIER_SEATS.map((s) => s.industry)
    expect(lines.some((l) => /^Healthcare staffing/.test(l)), lines.join(' | ')).toBe(true)
    expect(lines.some((l) => /^Engineering and industrial staffing/.test(l)), lines.join(' | ')).toBe(true)
    expect(lines.some((l) => /\bIT\b/.test(l)), lines.join(' | ')).toBe(true)
  })
})
