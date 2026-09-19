import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  tombstoneFor, isTombstone, planErasure, willDelete, keptBecause,
  type Footprint,
} from '@/lib/erasure'
import { HELD } from '@/lib/legal'
import { FATES, fateOf } from '@/lib/notify/data-rights'
import { ACTIONS, rungOf } from '@/lib/autonomy'

/**
 * What forgetting somebody actually does.
 *
 * The rule this file exists to hold is that nothing anybody's books
 * depend on is deleted, and nothing that names the person survives where
 * it does not have to. Both halves matter: a system that deletes the
 * invoice is broken, and a system that keeps the name is a promise
 * broken.
 */

const now = new Date('2026-09-19T09:00:00Z')

function footprint(over: Partial<Footprint> = {}): Footprint {
  return {
    personId: 'cl_helena',
    facts: {
      now,
      hiredAt: new Date('2021-01-01T00:00:00Z'),
      employmentEndedAt: new Date('2022-06-30T00:00:00Z'),
      lastPaidAt: new Date('2022-06-30T00:00:00Z'),
    },
    counts: {
      'Identity and sign-in': 2,
      'A consultant own profile': 1,
      'Resumes': 3,
      'Checks somebody else ran': 1,
      'Money about a person': 14,
      'Time on site': 2,
      'Messages': 9,
      'Logs': 31,
      'Bars and preferences': 1,
    },
    holds: [],
    holders: [{ companyId: 'c_brightmoor', companyName: 'Brightmoor Staffing', holding: 'EMPLOYER' }],
    ...over,
  }
}

describe('the tombstone', () => {
  it('a tombstoned person cannot be emailed, because the address is on a domain nothing routes', () => {
    const t = tombstoneFor('cl_helena')
    expect(t.primaryEmail).toBe('erased-cl_helena@erased.invalid')
    expect(t.name).toBe('Erased person')
    expect(isTombstone(t.primaryEmail)).toBe(true)
    expect(isTombstone('helena.marsh@seed.etyme.invalid')).toBe(false)
  })

  it('two people erased on the same day get two different addresses, so the unique index holds', () => {
    expect(tombstoneFor('a').primaryEmail).not.toBe(tombstoneFor('b').primaryEmail)
  })

  it('the reserved domain is one nobody can register, and the code says which rule reserves it', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/erasure.ts'), 'utf8')
    expect(src).toContain('RFC 2606')
  })
})

describe('the plan says what will happen before anything happens', () => {
  it('an erasure keeps the days on site and forgets who was on site', () => {
    const plan = planErasure(footprint())
    const days = plan.lines.find((l) => l.category === 'Time on site')!
    expect(days.disposition).toBe('ANONYMIZED')
    expect(days.says).toContain('stops naming anybody')
    expect(willDelete(plan)).not.toContain('Time on site')
  })

  it('the money is kept so an invoice that has been paid goes on footing', () => {
    const plan = planErasure(footprint())
    expect(plan.lines.find((l) => l.category === 'Money about a person')!.disposition).toBe('ANONYMIZED')
  })

  it('the log of who read somebody’s record is kept whole, because deleting it erases the evidence that protects them', () => {
    const plan = planErasure(footprint())
    expect(plan.lines.find((l) => l.category === 'Logs')!.disposition).toBe('KEPT')
  })

  it('the sign-in, the profile, the resumes and the bars are the ones that go', () => {
    const gone = willDelete(planErasure(footprint()))
    expect(gone).toContain('Identity and sign-in')
    expect(gone).toContain('A consultant own profile')
    expect(gone).toContain('Resumes')
    expect(gone).toContain('Bars and preferences')
  })

  it('an I-9 is held until its statutory floor runs, and the plan says which day that is', () => {
    const plan = planErasure(footprint())
    const check = plan.lines.find((l) => l.category === 'Checks somebody else ran')!
    expect(check.disposition).toBe('HELD')
    // Three years after 1 January 2021 beats one year after 30 June 2022.
    expect(check.until!.toISOString().slice(0, 10)).toBe('2024-01-01')
  })

  it('a category with nothing behind it is never mentioned, so a letter is not written about nothing', () => {
    const plan = planErasure(footprint({ counts: { 'Resumes': 0, 'Logs': 4 } }))
    expect(plan.categories).toEqual(['Logs'])
  })

  it('a person with an unlifted hold is held, not erased, and told a hold applies without being told the matter', () => {
    const plan = planErasure(footprint({
      holds: [{ reason: 'An audit of the 2025 contingent workforce is open.' }],
    }))
    expect(plan.blocked).toBe(true)
    expect(plan.blockedSays).toContain('An audit of the 2025 contingent workforce is open.')
    expect(plan.blockedSays).toContain('Nothing has been erased')
    expect(plan.blockedSays).not.toMatch(/matter|case number/i)
    // And nothing is marked for deletion while it is held.
    expect(willDelete(plan)).toEqual([])
  })

  it('what was kept comes back as sentences a person can read, not as a list of table names', () => {
    const kept = keptBecause(planErasure(footprint()))
    expect(kept.length).toBeGreaterThan(0)
    for (const line of kept) {
      expect(line).not.toMatch(/[A-Z]{3,}_[A-Z]/)
      expect(line.length).toBeGreaterThan(30)
    }
  })
})

describe('the plan and the letter agree about every category', () => {
  /**
   * The letter's FATES table is etyme-conversation's and was written
   * before the first column existed. The plan reads the schema's map
   * through `lib/retention`. Two tables describing one thing is one
   * wrong sentence waiting, so they are compared here rather than
   * trusted — and the one place they differ is named rather than
   * quietly reconciled.
   */
  const counts = Object.fromEntries(HELD.map((h) => [h.category, 1]))
  const plan = planErasure(footprint({ counts }))

  it('every category the privacy notice holds has a fate in the letter and a line in the plan', () => {
    expect(plan.categories.sort()).toEqual(HELD.map((h) => h.category).sort())
    expect(HELD.map((h) => h.category).filter((c) => !fateOf(c))).toEqual([])
  })

  it('nothing the letter promises to forget is something the plan actually keeps', () => {
    // This is the dangerous direction. A letter that says "forgotten"
    // over a record that survives is a written misrepresentation on the
    // first document a regulator reads.
    const broken = FATES.filter((f) => f.fate === 'FORGOTTEN')
      .filter((f) => plan.lines.find((l) => l.category === f.category)?.disposition !== 'DELETED')
      .map((f) => f.category)
    expect(broken, 'the letter promises these are forgotten and the plan keeps them').toEqual([])
  })

  it('nothing the plan deletes is something the letter said would be kept', () => {
    // The other direction, and it is the one that loses a record
    // somebody was told they still had.
    const broken = plan.lines.filter((l) => l.disposition === 'DELETED')
      .filter((l) => fateOf(l.category)!.fate !== 'FORGOTTEN')
      .map((l) => l.category)
    expect(broken, 'the plan deletes these and the letter said they were kept').toEqual([])
  })

  it('the letter calls onboarding paperwork kept under a marker, the plan holds it to a statutory period, and the plan is the one that runs', () => {
    // The one place the two tables differ, named rather than quietly
    // reconciled. The letter is the friendlier reading and the schema
    // comment on Person.erasedAt is the more careful one; where they
    // differ the careful one wins, and this sentence is how anybody
    // finds out.
    expect(fateOf('Onboarding paperwork')!.fate).toBe('UNDER_A_MARKER')
    const line = plan.lines.find((l) => l.category === 'Onboarding paperwork')!
    expect(line.disposition).toBe('HELD')
  })

  it('a category the letter keeps and the plan anonymizes is not a disagreement — the record stays either way', () => {
    // Money and days on site are kept, by somebody required to keep
    // them, and carry no name afterwards. Both sentences are true; the
    // letter says the one the reader came for.
    for (const c of ['Money about a person', 'Time on site']) {
      expect(fateOf(c)!.fate, c).toBe('KEPT')
      expect(plan.lines.find((l) => l.category === c)!.disposition, c).toBe('ANONYMIZED')
    }
  })

  it('the letter never promises to delete payroll, the I-9 or the days on site', () => {
    for (const c of ['Money about a person', 'Checks somebody else ran', 'Time on site']) {
      expect(FATES.find((f) => f.category === c)!.fate, c).toBe('KEPT')
    }
  })
})

describe('the row that records it is honest about what it did', () => {
  it('finishing an erasure sits at the top of the autonomy ladder and says it cannot be undone', () => {
    // It moved out of PLANNED the day this code first wrote the name,
    // which is where autonomy.test.ts stops watching it. Nothing puts a
    // tombstone back, so nothing may read it as low risk.
    expect(ACTIONS.ERASURE_COMPLETE.kind).toBe('UNPROMPTED')
    expect(rungOf('ERASURE_COMPLETE')).toBe('L5')

    const src = readFileSync(join(process.cwd(), 'src/lib/erasure.ts'), 'utf8')
    expect(src, 'the row it writes must not claim to be reversible').toContain('reversible: false')
  })

  it('every company whose records changed gets the row in its own log, because an automation log is read per company', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/erasure.ts'), 'utf8')
    expect(src).toContain('for (const companyId of companyIds)')
  })
})

describe('a business user asks to be forgotten too', () => {
  const SEAT = 'A seat at a company, and what was decided from it'

  it('their seat and the decisions made from it are kept under a marker, and the letter and the plan agree', () => {
    expect(fateOf(SEAT)!.fate).toBe('UNDER_A_MARKER')
    const plan = planErasure(footprint({ counts: { [SEAT]: 4 } }))
    const line = plan.lines.find((l) => l.category === SEAT)!
    expect(line.disposition).toBe('ANONYMIZED')
    expect(willDelete(plan)).not.toContain(SEAT)
  })

  it('an approval with nobody behind it is worse than one nobody is named on, and the letter says so in the reader\u2019s words', () => {
    expect(fateOf(SEAT)!.why).toContain('under a marker instead of your name')
    expect(fateOf(SEAT)!.why).not.toContain('deleted')
  })
})

