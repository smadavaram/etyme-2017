import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readBench } from '@/lib/bench-filter'
import { peopleOnBooks, booksSays } from '@/lib/document-request'

/**
 * The two compliance pickers, and what they may offer.
 *
 * ── What was wrong, and for how long ─────────────────────────────────
 *
 * "File a petition for" on the Visas tab and "From whom" on the
 * Paperwork page each read `/api/bench`'s answer under `data.listings` —
 * a key that route has never sent in its life. `undefined ?? []` is `[]`,
 * so both drew an empty dropdown at every firm on the platform, for as
 * long as the route has answered in its present shape. Nothing failed,
 * because an empty list is a valid-looking answer: a compliance officer
 * who sees nobody in the visa picker concludes there is nobody to file
 * for.
 *
 * ── And the population was wrong as well as unread ───────────────────
 *
 * A `BenchListing` is a consultant consenting to be *marketed*. Neither
 * of these screens needs that consent: a firm files an H-1B for somebody
 * it employs, and asks for a W-9 from anybody on its books. So even a
 * picker that had read the listings correctly would have offered no
 * employee of an integrator whose whole supply is its own payroll.
 */

const ROOT = process.cwd()

/** A listing as `/api/bench?scope=company` actually sends it. */
function listing(id: string, personId: string, name: string) {
  return {
    id,
    tier: 'RETAINED',
    consent: 'GRANTED',
    invitedAt: null,
    grantedAt: '2026-08-01T00:00:00.000Z',
    company: { id: 'co1', name: 'Veritan Talent', slug: 'veritan' },
    consultant: {
      id: `c-${personId}`,
      personId,
      person: { id: personId, name, email: `${personId}@example.invalid` },
      headline: null,
      skills: ['Power BI'],
      location: 'Portland, OR',
      workAuth: 'H1B',
      availableFrom: null,
      visibility: 'VERIFIED',
    },
  }
}

function benchAnswer(listings: unknown[]) {
  return {
    data: {
      scope: 'company',
      tiers: { RETAINED: listings, MARKETING: [] },
      totals: { RETAINED: listings.length, MARKETING: 0, total: listings.length },
    },
  }
}

/** The payroll as `/api/bench?scope=payroll` sends it. */
function payrollAnswer(rows: { personId: string; name: string }[]) {
  return {
    data: {
      scope: 'payroll',
      roster: rows.map((r) => ({ ...r, seat: 'Delivery', standing: 'FREE', listed: false })),
      summary: { total: rows.length },
    },
  }
}

const books = (bench: unknown, payroll: unknown) => peopleOnBooks(readBench(bench), payroll)

describe('who a compliance desk may pick', () => {
  it('a compliance officer can pick the person they are filing a petition for', () => {
    const reading = books(
      benchAnswer([listing('l1', 'p1', 'Tariq Al-Amin')]),
      payrollAnswer([{ personId: 'p2', name: 'Helena Marsh' }])
    )

    expect(reading.people.map((p) => p.name)).toEqual(['Helena Marsh', 'Tariq Al-Amin'])
    expect(reading.why).toBeNull()
    expect(reading.whole).toBe(true)
  })

  it('a desk asking for a document can pick who to ask, and gets the same answer as the visa desk', () => {
    // One door, so the two screens on one menu cannot disagree about who
    // is on this firm's books.
    const bench = benchAnswer([listing('l1', 'p1', 'Tariq Al-Amin')])
    const payroll = payrollAnswer([{ personId: 'p2', name: 'Helena Marsh' }])

    expect(books(bench, payroll)).toEqual(books(bench, payroll))
    expect(books(bench, payroll).people).toHaveLength(2)
  })

  it('a firm files a petition for somebody it employs, so an employee nobody markets is on the list', () => {
    // The founder's case, and the reason listings alone were the wrong
    // population: an integrator's whole supply is its own payroll.
    const reading = books(benchAnswer([]), payrollAnswer([{ personId: 'p9', name: 'Karthik Menon' }]))

    expect(reading.people.map((p) => p.personId)).toEqual(['p9'])
    expect(reading.people[0].because).toBe('on your payroll')
    expect(reading.why).toBeNull()
  })

  it('every name says why it is on the list — on your bench, on your payroll, or both', () => {
    const reading = books(
      benchAnswer([listing('l1', 'p1', 'Tariq Al-Amin'), listing('l2', 'p2', 'Helena Marsh')]),
      payrollAnswer([
        { personId: 'p2', name: 'Helena Marsh' },
        { personId: 'p3', name: 'Karthik Menon' },
      ])
    )

    expect(reading.people.map((p) => `${p.name} · ${p.because}`)).toEqual([
      'Helena Marsh · on your payroll and your bench',
      'Karthik Menon · on your payroll',
      'Tariq Al-Amin · on your bench',
    ])
  })

  it('somebody a firm employs who also granted it a listing is offered once, not twice', () => {
    const reading = books(
      benchAnswer([listing('l1', 'p1', 'Tariq Al-Amin')]),
      payrollAnswer([{ personId: 'p1', name: 'Tariq Al-Amin' }])
    )

    expect(reading.people).toHaveLength(1)
    expect(reading.people[0].because).toBe('on your payroll and your bench')
  })

  it('a picker that cannot read the bench says so rather than offering an empty list', () => {
    const reading = books({ data: { scope: 'company' } }, payrollAnswer([]))

    expect(reading.people).toEqual([])
    expect(reading.whole).toBe(false)
    expect(booksSays(reading)).toContain('shape this page does not understand')
    // And never the sentence for a firm that genuinely has nobody.
    expect(booksSays(reading)).not.toContain('Nobody is on your books yet')
  })

  it('a picker that cannot read the payroll still offers the bench and says what is missing', () => {
    const reading = books(benchAnswer([listing('l1', 'p1', 'Tariq Al-Amin')]), { data: { scope: 'payroll' } })

    expect(reading.people.map((p) => p.name)).toEqual(['Tariq Al-Amin'])
    expect(reading.whole).toBe(false)
    expect(booksSays(reading)).toContain('payroll')
    expect(booksSays(reading)).toContain('shorter list that looks complete')
  })

  it('a payroll row with no name fails the whole reading rather than quietly shortening the list', () => {
    const reading = books(
      benchAnswer([]),
      { data: { scope: 'payroll', roster: [{ personId: 'p1', name: 'Helena Marsh' }, { personId: 'p2' }] } }
    )

    expect(reading.people).toEqual([])
    expect(booksSays(reading)).toContain('1 row this page could not read')
  })

  it('a firm with nobody on its books is told so, in a different sentence from a bench that would not read', () => {
    const reading = books(benchAnswer([]), payrollAnswer([]))

    expect(reading.people).toEqual([])
    expect(reading.whole).toBe(true)
    expect(reading.why).toBeNull()
    expect(booksSays(reading)).toBe(
      'Nobody is on your books yet. Somebody you employ, or somebody who has granted you a bench listing, appears here.'
    )
  })

  it('a desk that may not read people is shown the refusal it was given, not a silent nothing', () => {
    const reading = peopleOnBooks(readBench(null), null, {
      bench: 'You need consultants.read permission',
      payroll: 'A payroll belongs to a company. Sign in at the firm whose people you are looking for.',
    })

    expect(booksSays(reading)).toContain('You need consultants.read permission')
    expect(booksSays(reading)).toContain('Sign in at the firm whose people you are looking for')
    expect(reading.whole).toBe(false)
  })

  it('both pickers ask the one door and neither invents the bench answer’s shape', () => {
    for (const page of ['src/app/dashboard/compliance/page.tsx', 'src/app/dashboard/documents/page.tsx']) {
      const text = readFileSync(join(ROOT, page), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

      expect(text, `${page} must ask askTheBooks for who may be picked`).toContain('askTheBooks')
      expect(text, `${page} must say why when it cannot read the books`).toContain('booksSays')
      // The key that caused it. Named in this file's prose and in the
      // page's own comment, and nowhere in either page's code.
      expect(text, `${page} still reads the bench answer by hand`).not.toMatch(/data\s*\??\.\s*(listings|tiers)/)
    }
  })
})
