import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pageFraming } from '@/lib/page-framing'
import { orgBasis } from '@/app/api/program/org/basis'

/**
 * Round three of the sign-up walk, 2026-10-08, on the buying side's pages
 * (docs/results/2026-10-08-signup-round-3.md). Each sentence is one fix
 * the walk asked for, numbered as the walk numbered it.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('9: a supplier reads "job request", never "requirement", on its own pages', () => {
  const submissions = read('src/app/dashboard/submissions/page.tsx')

  it('the sent tab says candidates went to client job requests', () => {
    expect(submissions).not.toContain('client requirements')
    expect(submissions).toContain('client job requests')
  })

  it('the received tab says other suppliers submitted to your job requests', () => {
    expect(submissions).not.toContain('against your requirements')
    expect(submissions).toContain('submitted to your job requests')
  })

  it('the submit form, its search box and its empty list say job request', () => {
    for (const old of [
      'Submit to requirement', '>Requirement *<', 'Select a requirement', 'No open requirements',
      'Requirement skills', 'consultant, requirement, company', 'from the Requirements page',
      'Loading requirements',
    ]) expect(submissions).not.toContain(old)
  })

  it('a job request that will not load and a person page with none open say job request', () => {
    const detail = read('src/app/dashboard/requirements/[id]/page.tsx')
    expect(detail).not.toContain('Loading requirement')
    expect(detail).not.toContain("'Requirement not found'")
    const person = read('src/app/dashboard/people/[id]/page.tsx')
    expect(person).not.toContain('Post a requirement')
    expect(person).toContain('Post a job request')
  })
})

describe('16: a client reads no supplier words while its session loads', () => {
  const pages = [
    'src/app/dashboard/timesheets/page.tsx',
    'src/app/dashboard/requirements/page.tsx',
    'src/app/dashboard/requirements/[id]/page.tsx',
    'src/app/dashboard/submissions/page.tsx',
  ]

  it('none of the four pages guesses the reader is a supplier before it knows', () => {
    for (const p of pages) {
      expect(read(p), p).not.toMatch(/company\?\.kind \?\? '[A-Z_]+'/)
    }
  })

  it('an unknown reader gets no eyebrow and no subtitle on timesheets, job requests or submissions', () => {
    for (const page of ['timesheets', 'requirements', 'submissions'] as const) {
      const f = pageFraming(null, page)
      expect(f.eyebrow).toBe('')
      expect(f.subtitle).toBe('')
    }
  })

  it('the timesheet figures wait for the reader and the first read, so nobody reads "Approved value $0" while loading', () => {
    const ts = read('src/app/dashboard/timesheets/page.tsx')
    // Round four (f4a10d3b7) added a third condition: a failed read shows its
    // sentence instead of the figures, so the cards also wait for no error.
    expect(ts).toMatch(/\{company\?\.kind && readOnce && !error && \(\s*<div className="grid[^"]*">\s*<Stat /)
  })

  it('the supplier sentence under the submissions heading waits for the reader too', () => {
    const sub = read('src/app/dashboard/submissions/page.tsx')
    expect(sub).toMatch(/firmSays: !company\?\.kind\s*\?\s*''/)
  })
})

describe('19: the org view says what its figures are annualized from, in American English', () => {
  const base = { clientName: 'Walk Co', hoursPerMonth: 160 }

  it('a client with nobody on site reads a sentence, not "0 of 0 live contractor(s)"', () => {
    const s = orgBasis({ ...base, priced: 0, headcount: 0 })
    expect(s).toBe(
      'No contractors are on site at Walk Co yet, so there is nothing to annualize. ' +
      'Spend and rate variance appear here once a placement starts.'
    )
  })

  it('spells "Annualized" the American way and never writes "(s)"', () => {
    for (const [priced, headcount] of [[0, 0], [1, 1], [3, 3], [2, 3], [1, 2]]) {
      const s = orgBasis({ ...base, priced, headcount })
      expect(s).not.toMatch(/annualis/i)
      expect(s).not.toContain('(s)')
    }
  })

  it('one priced contractor reads "the one live contractor", singular', () => {
    expect(orgBasis({ ...base, priced: 1, headcount: 1 })).toContain('across the one live contractor on site.')
    expect(orgBasis({ ...base, priced: 3, headcount: 3 })).toContain('across all 3 live contractors on site.')
  })

  it('a client paying for some of its people reads how many of how many are priced', () => {
    const s = orgBasis({ ...base, priced: 2, headcount: 3 })
    expect(s).toContain('across 2 of the 3 live contractors on site.')
    expect(s).toContain('1 is on site through a supplier chain whose top contract is not live here')
  })

  it('the route speaks through the one sentence and no longer spells it the British way', () => {
    const route = read('src/app/api/program/org/route.ts')
    expect(route).toContain('orgBasis(')
    expect(route).not.toMatch(/annualis/i)
  })
})
