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
  MISSING_DOOR,
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

  it('offers three programs, six supplying firms and four people — nine company doors in all', () => {
    expect(CLIENT_PROGRAMS).toHaveLength(3)
    expect([...SUPPLIER_SEATS, ...PROGRAM_OFFICE_SEATS, ...INTEGRATOR_SEATS]).toHaveLength(6)
    expect(CANDIDATE_SEATS).toHaveLength(4)
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

describe('the door that is not there', () => {
  it('says the independent candidate has no door, on the page, rather than hiding the gap', () => {
    expect(page).toContain('MISSING_DOOR')
    expect(MISSING_DOOR.trim().endsWith('.')).toBe(true)
    expect(MISSING_DOOR).toMatch(/no seat here|no door/)
  })

  it('is honest about why: every person the demo can be walked as is on a payroll, a bench or their own corporation', () => {
    // If somebody seeds an independent candidate and adds the door, this
    // sentence is the thing that has to change with it.
    expect(CANDIDATE_SEATS).toHaveLength(4)
    expect(MISSING_DOOR).toMatch(/nobody employs|nobody lists/)
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
