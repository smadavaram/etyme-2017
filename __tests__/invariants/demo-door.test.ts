import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLIENT_PROGRAMS,
  CLIENT_DESKS,
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

  it('offers three programs, six supplying firms and five people — nine company doors in all', () => {
    expect(CLIENT_PROGRAMS).toHaveLength(3)
    expect([...SUPPLIER_SEATS, ...PROGRAM_OFFICE_SEATS, ...INTEGRATOR_SEATS]).toHaveLength(6)
    expect(CANDIDATE_SEATS).toHaveLength(5)
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
    const onThePage = new Set(CLIENT_DESKS.map((d) => d.desk))
    for (const desk of known) {
      expect(onThePage, `the route seats a "${desk}" desk that no chip on the page opens`).toContain(desk)
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
    expect(door!.about).not.toMatch(/\bplacement\b|\bhours\b|\binvoice\b|\btimesheet\b/i)
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
