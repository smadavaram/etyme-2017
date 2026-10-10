import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { alreadyOursSays, readWant, wantSays, mayWriteWant, readBench } from '@/lib/bench-filter'
import { skillsSay } from '@/lib/internal-moves'
import { NICHE_PEOPLE } from '@/lib/seed-bench-profit'

/**
 * The tester's walk of 2026-10-03, re-read on 2026-10-06 against the
 * branch tip. What was still open is here, one finding at a time, as
 * sentences; what was fixed on 2026-10-03 is in bench-tester-round-two.
 */

const src = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')

describe('1.1 · a seeded bench names the rate the firm sells each person at', () => {
  it('every person on Pellwright’s bench has a rate range, low under high, in cents an hour', () => {
    const listed = NICHE_PEOPLE.filter((n) => n.listed != null || n.benchDays != null)
    expect(listed.length).toBeGreaterThan(0)
    for (const n of listed) {
      expect(n.rate, n.name).toBeDefined()
      expect(n.rate![0], n.name).toBeLessThanOrEqual(n.rate![1])
      expect(n.rate![0], n.name).toBeGreaterThan(0)
    }
  })

  it('a placed person’s range holds what the prime actually pays the firm for them', () => {
    for (const n of NICHE_PEOPLE.filter((x) => x.placement && x.rate)) {
      expect(n.placement!.bill, n.name).toBeGreaterThanOrEqual(n.rate![0])
      expect(n.placement!.bill, n.name).toBeLessThanOrEqual(n.rate![1])
    }
  })
})

describe('4.3 · a partner’s person who is already yours is never offered as somebody to ask for', () => {
  it('somebody on a placement you sell reads “On a placement through you”', () => {
    expect(alreadyOursSays({ ownListing: false, placedByUs: true })).toBe('On a placement through you')
  })

  it('somebody already on your own bench reads “Already on your bench”', () => {
    expect(alreadyOursSays({ ownListing: true, placedByUs: false })).toBe('Already on your bench')
  })

  it('somebody who is neither may still be asked', () => {
    expect(alreadyOursSays({ ownListing: false, placedByUs: false })).toBeNull()
  })

  it('the route says it on the partner bench, and the page shows the sentence in place of “Ask to represent”', () => {
    expect(src('src/app/api/bench/route.ts')).toContain("oursSays: oursOf.get(l.consultant.personId) ?? null")
    const page = src('src/app/dashboard/bench/page.tsx')
    expect(page).toContain('row.oursSays ? (')
    const read = readBench({ data: { tiers: { MARKETING: [{
      id: 'l1', tier: 'MARKETING', grantedAt: '2026-10-01', oursSays: 'On a placement through you',
      company: { id: 'c', name: 'Pellwright' },
      consultant: { id: 'k', personId: 'p', person: { id: 'p', name: 'Tobias Wren', email: null }, skills: [] },
    }] } } })
    expect(read.ok && read.rows[0].oursSays).toBe('On a placement through you')
  })
})

describe('4.4 · “What we need” sits at the top of Partner bench', () => {
  it('an ask names at least one skill, and is refused in a sentence without one', () => {
    const r = readWant({ skills: [], places: ['Remote'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.says).toBe('Name at least one skill you need.')
  })

  it('skills typed with commas become a list, each skill once, and a place keeps its comma', () => {
    const r = readWant({ skills: 'Process validation, cleaning validation, Process Validation', places: 'Wichita, KS; Remote; remote' })
    expect(r.ok && r.want.skills).toEqual(['Process validation', 'cleaning validation'])
    expect(r.ok && r.want.places).toEqual(['Wichita, KS', 'Remote'])
  })

  it('a rate range upside down is refused in a sentence, and a rate that is not a whole number of cents is refused too', () => {
    const down = readWant({ skills: ['GMP'], rateMinCents: 12_000, rateMaxCents: 9_000 })
    expect(!down.ok && down.says).toBe('The lowest rate is above the highest. Swap them.')
    const odd = readWant({ skills: ['GMP'], rateMinCents: 'ninety' })
    expect(!odd.ok && odd.says).toBe('Say each rate as a number of dollars an hour.')
  })

  it('offers go to one desk at most — a role or a person, never both', () => {
    const both = readWant({ skills: ['GMP'], receivingRoleId: 'r', receivingPersonId: 'p' })
    expect(!both.ok && both.says).toContain('a role or a person, not both')
  })

  it('an ask reads in one line: skills, places, rate and who receives offers', () => {
    expect(wantSays({ skills: ['Process validation', 'GMP documentation'], places: ['Wichita, KS', 'Remote'], rateMinCents: 9_000, rateMaxCents: 12_000, roleName: 'Recruiter', personName: null }))
      .toBe('Process validation, GMP documentation · Wichita, KS or Remote · $90–$120/hr · offers go to the Recruiter desk')
    expect(wantSays({ skills: ['GMP'], places: [], rateMinCents: null, rateMaxCents: null, roleName: null, personName: null }))
      .toBe('GMP · any place · rate not said · offers go to whoever reads Partner bench')
    expect(wantSays({ skills: ['GMP'], places: [], rateMinCents: null, rateMaxCents: null, roleName: 'Recruiter', personName: 'Priyanka Solis' }))
      .toContain('offers go to Priyanka Solis')
  })

  it('a client never writes one, and a desk that does not run the bench is told who does', () => {
    const client = mayWriteWant({ companyKind: 'CLIENT', writesPeople: true })
    expect(!client.ok && client.says).toContain('A client does not ask partners for bench')
    const finance = mayWriteWant({ companyKind: 'VENDOR', writesPeople: false })
    expect(!finance.ok && finance.says).toContain('the recruiters, the resource manager, HR and the owner')
    expect(mayWriteWant({ companyKind: 'VENDOR', writesPeople: true }).ok).toBe(true)
  })

  it('Partner bench draws “What we need” and Our bench draws what partners need, from one door', () => {
    const page = src('src/app/dashboard/bench/page.tsx')
    expect(page).toContain("scope === 'network' && (\n        <WhatWeNeed")
    expect(page).toContain("scope === 'company' && <WhatPartnersNeed />")
    const panel = src('src/app/dashboard/bench/what-we-need.tsx')
    expect(panel).toContain("fetch('/api/bench/wants')")
    expect(panel).toContain('What we need')
    // Every box has a label: each sits inside the shared Field, which ties
    // the label to the input it holds.
    for (const label of ['Skills you need *', 'Places', 'Lowest rate you pay ($ an hour)', 'Highest rate you pay ($ an hour)', 'Who receives offers']) {
      expect(panel).toContain(`<Field label="${label}">`)
    }
    expect(panel).not.toMatch(/<input\b|<select\b/)
  })
})

describe('6.2 · an integrator’s people read the skills of the job they are on', () => {
  it('their own skills come first', () => {
    expect(skillsSay({ skills: ['SQL'], seat: 'Engineer', jobSkills: { skills: ['ERP finance'], current: true } })).toBe('SQL')
  })

  it('with none of their own, the job’s skills, said as the job’s', () => {
    expect(skillsSay({ skills: [], seat: null, jobSkills: { skills: ['ERP finance', 'General ledger'], current: true } }))
      .toBe('ERP finance, General ledger (from the job they are on)')
    expect(skillsSay({ skills: [], seat: null, jobSkills: { skills: ['SQL'], current: false } }))
      .toBe('SQL (from their last job)')
  })

  it('with neither, the seat or a plain “No skills on record”', () => {
    expect(skillsSay({ skills: [], seat: 'Validation Engineer', jobSkills: null })).toBe('Validation Engineer — no skills on record')
    expect(skillsSay({ skills: [], seat: null })).toBe('No skills on record')
  })
})
