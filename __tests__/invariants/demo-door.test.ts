import { DESKS as DEMO_DESKS } from '@/lib/demo-desks'
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
  FIRST_SUPPLIERS,
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
    // Read where each is drawn, in the markup, not where it is imported.
    const jsx = page.slice(page.indexOf('return ('))
    const clients = jsx.indexOf('<ProgramDoors programs={CLIENT_PROGRAMS}')
    expect(clients, 'the page does not draw the client programs at all').toBeGreaterThan(-1)
    for (const later of ['<DoorRows firms={first}', '<DoorRows firms={others}', '<DoorRows people={CANDIDATE_SEATS}']) {
      const drawn = jsx.indexOf(later)
      expect(drawn, `${later} is never drawn`).toBeGreaterThan(-1)
      expect(
        clients,
        `${later} is drawn above the client programs — the client is the customer, and a ` +
          'supplier reads this page over their shoulder.'
      ).toBeLessThan(drawn)
    }
  })

  it('offers three programs, eleven supplying firms and six people', () => {
    // Eight since 2026-09-21: Brightmoor Staffing, whose nine desks are
    // the only place a supplier's own roles can be walked, and Kestrel
    // MSP, which sits at a client's compliance desk rather than its
    // program manager's. Ten since 2026-09-29: a clinical staffing firm
    // and an industrial one, so the suppliers are not all IT. Eleven
    // since 2026-10-05: Pellwright Validation Partners, a bench vendor.
    expect(CLIENT_PROGRAMS).toHaveLength(3)
    expect([...SUPPLIER_SEATS, ...PROGRAM_OFFICE_SEATS, ...INTEGRATOR_SEATS]).toHaveLength(11)
    expect(CANDIDATE_SEATS).toHaveLength(6)
  })

  it('says what is waiting at each client program today in one short line, a finished sentence rather than a label', () => {
    // The founder's one-screen drawing, 2026-10-15: one line per client.
    for (const p of CLIENT_PROGRAMS) {
      expect(p.waiting.trim().endsWith('.'), `${p.name}: “${p.waiting}”`).toBe(true)
      expect(p.waiting.split(/\s+/).length, `${p.name} says too little`).toBeGreaterThan(5)
      expect(p.waiting.split(/\s+/).length, `${p.name} says more than one line`).toBeLessThanOrEqual(14)
      expect(p.where.trim().length, `${p.name} says nowhere`).toBeGreaterThan(2)
    }
  })

  it('a client card shows the program manager, the hiring manager and the AP clerk, and folds every other role under More roles without removing one', () => {
    const picker = read('src/app/demo/desk-picker.tsx')
    expect(picker).toContain("const FIRST_ROLES = ['programme', 'hiring', 'ap'] as const")
    expect(picker).toContain('More roles')
    // Both halves of CLIENT_DESKS are drawn: the first three, and the rest once opened.
    expect(picker).toContain('{first.map(chip)}')
    expect(picker).toContain('rest.map(chip)')
    const first = CLIENT_DESKS.filter((d) => ['programme', 'hiring', 'ap'].includes(d.desk)).map((d) => d.label)
    expect(first).toEqual(['Program manager', 'Hiring manager', 'AP clerk'])
  })

  it('shows four suppliers before the fold and keeps every other firm and every person one click away under it', () => {
    expect(FIRST_SUPPLIERS).toEqual(['world-brightmoor', 'world-computer-systems', 'world-techpeple', 'world-sorrelwood'])
    for (const slug of FIRST_SUPPLIERS) expect(SUPPLIER_SEATS.map((s) => s.slug)).toContain(slug)
    // The fold draws every supplier not shown above it, both MSPs, both
    // integrators and all six people: a cut of words, never of doors.
    expect(page).toContain('SUPPLIER_SEATS.filter((s) => !FIRST_SUPPLIERS.includes(s.slug))')
    expect(page).toContain('...PROGRAM_OFFICE_SEATS,')
    expect(page).toContain('...fillDoors(INTEGRATOR_SEATS, facts, new Date()),')
    const fold = page.slice(page.indexOf('<details id="everyone"'), page.indexOf('</details>'))
    expect(fold).toContain('All suppliers, MSPs, integrators and workers')
    expect(fold).toContain('<DoorRows firms={others} />')
    expect(fold).toContain('<DoorRows people={CANDIDATE_SEATS} />')
    // A firm with roles of its own keeps them all on its row, behind Roles.
    const picker = read('src/app/demo/desk-picker.tsx')
    expect(picker).toContain('d.desks.map((r)')
  })

  it('draws that sentence on the page rather than keeping it in a file nobody reads', () => {
    expect(read('src/app/demo/desk-picker.tsx')).toContain('{p.waiting}')
  })
})

describe('the desks on a client door', () => {
  /** The desk suffixes POST /api/demo will actually answer to. */
  // The list moved from the route to lib/demo-desks on 2026-09-30, and
  // is imported now rather than read out of source with a pattern.
  const known: string[] = [...DEMO_DESKS]

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
      // And a firm door's own row, where it seats more than one desk —
      // Teleworld's delivery manager since 2026-10-03.
      ...[...SUPPLIER_SEATS, ...PROGRAM_OFFICE_SEATS, ...INTEGRATOR_SEATS].flatMap((f) => (f.desks ?? []).map((d) => d.desk)),
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
  it('the demo says its companies are demo companies and not customers, in one line under the heading', () => {
    // Since the one-screen drawing (2026-10-15) the long paragraph is the
    // one line under the heading.
    const text = page.replace(/\s+/g, ' ')
    expect(text).toContain('Demo companies, not customers. Nothing you change touches anything real.')
    expect(text.indexOf('Demo companies, not customers.')).toBeGreaterThan(text.indexOf('Pick a company and a role'))
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
    // A client card draws its line; every firm and person row draws its own.
    const picker = read('src/app/demo/desk-picker.tsx')
    for (const v of ['p', 'd']) expect(picker).toContain(`{${v}.waiting}`)
  })

  it('the demo page shows about two hundred and sixty words before anybody clicks, where it showed 1,874', () => {
    // What a visitor reads with nothing opened: the heading and its line,
    // each client's name, line and four role buttons, the four suppliers'
    // rows, the fold's one line and the closing line. Hover text and the
    // fold are not on screen.
    const count = (x: string) => x.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length
    const first = CLIENT_DESKS.filter((d) => ['programme', 'hiring', 'ap'].includes(d.desk))
    const firms = FIRST_SUPPLIERS.map((slug) => SUPPLIER_SEATS.find((s) => s.slug === slug)!)
    const words =
      count('Pick a company and a role Demo companies, not customers. Nothing you change touches anything real.') +
      count('Clients Suppliers All suppliers, MSPs, integrators and workers Want this with your own suppliers? Sign up, or ask a person.') +
      CLIENT_PROGRAMS.reduce((n, p) => n + count(p.name) + count(p.waiting) + first.reduce((m, d) => m + count(d.label), 0) + count('More roles'), 0) +
      firms.reduce((n, f) => n + count(f.name) + count(f.where) + count(f.waiting) + count('Open') + (f.desks ? count('Roles') : 0), 0)
    expect(words).toBeLessThanOrEqual(260)
  })
})

describe('the demo shows the spread of industries', () => {
  // The founder, 2026-09-29: "Put the industry under each demo company, so
  // people know which industries can use it." CLAUDE.md: horizontal, never
  // vertical — the same product has to work for a travel nurse.
  it('every demo company and person names its industry, printed under its name where a phone reader sees it', () => {
    for (const d of EVERY_DOOR) {
      expect(d.industry?.trim().length ?? 0, `${d.name} names no industry`).toBeGreaterThan(3)
    }
    const picker = read('src/app/demo/desk-picker.tsx')
    // Brought back by the founder on 2026-10-15, after the one-screen cut
    // had moved it into hover text, which a phone never shows: on a client
    // card under the name, and on every row beside its kind.
    expect(picker).toContain('<p className="mt-1 text-[12.5px] text-etyme-muted">{p.industry}</p>')
    expect(picker).toContain('{d.where} · {d.industry}')
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

/**
 * A door says what its seeded person holds, never more and never less.
 *
 * A tester opened Karthik Menon's door on 2026-09-30: the card said
 * "both sides signed four weeks of it", and his page showed fourteen
 * weeks approved and paid. The seed had moved to three whole calendar
 * months, every weekday filed and signed and every month paid, and the
 * card had not.
 */
describe('each door says what the seed behind it holds', () => {
  const karthik = CANDIDATE_SEATS.find((c) => c.slug === 'karthik-menon')!

  it('Karthik Menon’s door says every week of his three months was signed and every month paid, as his page shows', async () => {
    const { karthikWindow, calendarWeeks } = await import('@/lib/seed-doors')
    const { start, end } = karthikWindow(new Date('2026-09-30T00:00:00Z'))
    // Three whole calendar months, so "three months" on the card is the seed's own shape.
    expect(start.getUTCDate()).toBe(1)
    expect((end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth()).toBe(2)
    // More than four weeks are signed, so the card may not name a count it cannot keep.
    expect(calendarWeeks(start, end).length).toBeGreaterThan(4)
    expect(karthik.about).toMatch(/signed every week of it/)
    expect(karthik.about).toMatch(/all three months are paid/)
    expect(karthik.about).not.toMatch(/\b(one|two|three|four|five|\d+) weeks\b/)
  })

  it('Karthik Menon’s door names no number of weeks ago, because the day the world was born moves it', () => {
    expect(karthik.about).not.toMatch(/weeks? ago/)
  })

  it('Marisol Quintero\u2019s door says which firm has asked to market her and that only she can answer', () => {
    const marisol = CANDIDATE_SEATS.find((c) => c.slug === 'marisol-quintero')!
    expect(marisol.waiting).toMatch(/Brightmoor Staffing has asked to market you/)
    expect(marisol.waiting).toMatch(/only you can answer/)
  })

})
