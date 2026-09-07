import { describe, it, expect } from 'vitest'
import {
  authDecision, permittedBy, sortsByOrigin, originRefusal, mayApplyFromAdvert,
  type Restriction,
} from '@/lib/work-authorisation'

/**
 * The product could already do the unlawful thing automatically.
 *
 * `requirements/parse` read "US Citizen" out of an advert and set a hard
 * requirement at 0.92 confidence, unflagged. `bench-filter` then dropped
 * every consultant who was not an exact string match, silently.
 *
 * That is citizenship-status discrimination under INA §274B, and "US
 * citizens or green card holders only" is the most commonly cited form
 * of it in staffing. These tests are the rules that stop it.
 */

const restrict = (over: Partial<Restriction> = {}): Restriction => ({
  requires: ['US_CITIZEN'],
  basis: null,
  ...over,
})

describe('a role that says nothing about work authorisation excludes nobody', () => {
  it('passes anybody when there is no restriction at all', () => {
    expect(authDecision(null, 'H1B').verdict).toBe('PASS')
  })

  it('passes anybody when the restriction names no status', () => {
    expect(authDecision(restrict({ requires: [] }), 'OPT').verdict).toBe('PASS')
  })
})

describe('a restriction with no lawful reason recorded cannot turn anybody away', () => {
  it('warns rather than blocks, and the person stays on the list', () => {
    // The whole defect, in one assertion. This used to be a silent drop.
    const d = authDecision(restrict(), 'H1B')
    expect(d.verdict).toBe('WARN')
    expect(d.verdict).not.toBe('BLOCK')
  })

  it('says plainly that a reason has to be recorded before anybody is refused', () => {
    expect(authDecision(restrict(), 'H1B').reason).toMatch(/no lawful reason is recorded/i)
  })

  it('marks the restriction itself as suspect, not just unproven', () => {
    expect(authDecision(restrict(), 'H1B').restrictionSuspect).toBe(true)
  })
})

describe('not knowing somebody’s status is a question, never a refusal', () => {
  it('warns and says to ask them', () => {
    const d = authDecision(restrict({ basis: 'SECURITY_CLEARANCE' }), null)
    expect(d.verdict).toBe('WARN')
    expect(d.reason).toMatch(/ask them/i)
  })

  it('does not block even where the restriction is properly grounded', () => {
    // Dropping them is how a recruiter never finds out they were a
    // citizen all along.
    expect(authDecision(restrict({ basis: 'FEDERAL_CONTRACT_CLAUSE' }), null).verdict).not.toBe('BLOCK')
  })
})

describe('a grounded restriction is a hard stop, which is the other half of the rule', () => {
  it('blocks an H-1B holder from a role that genuinely needs a clearance', () => {
    const d = authDecision(restrict({ basis: 'SECURITY_CLEARANCE', cite: 'DoD Secret' }), 'H1B')
    expect(d.verdict).toBe('BLOCK')
  })

  it('names the reason and the citation rather than a code', () => {
    const d = authDecision(restrict({ basis: 'FEDERAL_CONTRACT_CLAUSE', cite: 'FAR 52.222-x' }), 'OPT')
    expect(d.reason).toContain('FAR 52.222-x')
    expect(d.reason).toMatch(/federal contract clause/i)
  })
})

describe('export control permits green card holders, so a citizens-only version of it is too narrow', () => {
  it('counts a lawful permanent resident as a US person', () => {
    // 22 CFR §120.62 and 15 CFR §772.1 both include LPRs. The commonest
    // real-world version of this restriction is over-broad on its own
    // stated grounds.
    expect(permittedBy('EXPORT_CONTROL')).toContain('GC')
  })

  it('warns instead of blocking when the role asks for less than its own reason allows', () => {
    const d = authDecision(restrict({ requires: ['US_CITIZEN'], basis: 'EXPORT_CONTROL' }), 'GC')
    expect(d.verdict).toBe('WARN')
    expect(d.reason).toMatch(/narrower than the reason given/i)
  })

  it('still blocks somebody export control genuinely does not cover', () => {
    const d = authDecision(restrict({ requires: ['US_CITIZEN', 'GC'], basis: 'EXPORT_CONTROL' }), 'H1B')
    expect(d.verdict).toBe('BLOCK')
  })

  it('counts asylees and refugees as US persons too, which is routinely missed', () => {
    expect(permittedBy('EXPORT_CONTROL')).toContain('ASYLEE')
    expect(permittedBy('EXPORT_CONTROL')).toContain('REFUGEE')
  })
})

describe('declining to sponsor is not the same as excluding non-citizens', () => {
  it('does not exclude a green card holder, who needs no sponsoring', () => {
    // The commonest unlawful refusal in this industry, and usually an
    // honest mistake.
    const d = authDecision(restrict({ basis: 'SPONSORSHIP_UNAVAILABLE' }), 'GC')
    expect(d.verdict).toBe('WARN')
    expect(d.reason).toMatch(/need no sponsorship/i)
    expect(d.reason).toMatch(/unlawful/i)
  })

  it('does not exclude somebody working on an EAD either', () => {
    expect(authDecision(restrict({ basis: 'SPONSORSHIP_UNAVAILABLE' }), 'EAD').verdict).toBe('WARN')
  })

  it('does exclude somebody who would actually need a petition', () => {
    const d = authDecision(restrict({ requires: ['US_CITIZEN'], basis: 'SPONSORSHIP_UNAVAILABLE' }), 'H1B')
    expect(d.verdict).toBe('BLOCK')
  })
})

describe('a sentence in an advert is not permission to filter on it', () => {
  it('never applies a restriction lifted straight out of advert text', () => {
    // An advert saying "USC/GC only" is evidence of what somebody wrote,
    // not evidence they were allowed to write it.
    expect(mayApplyFromAdvert()).toBe(false)
  })
})

describe('nothing here records where anybody is from', () => {
  it('recognises a list sorted by national origin, whatever it calls itself', () => {
    // These are the actual names on files uploaded to this project.
    expect(sortsByOrigin('DESI CLIENTS')).toBe(true)
    expect(sortsByOrigin('Tier 1 Prime Vendors (Indians)')).toBe(true)
    expect(sortsByOrigin('Candidates by nationality')).toBe(true)
  })

  it('does not flag an ordinary list that merely mentions a country', () => {
    expect(sortsByOrigin('Tier 1 Prime Vendors')).toBe(false)
    expect(sortsByOrigin('American Express — accounts payable')).toBe(false)
    expect(sortsByOrigin('Client calling list')).toBe(false)
  })

  it('refuses the grouping while keeping the contacts, and says which it did', () => {
    // The rows are real firms and are fine. It is the grouping that is
    // unlawful, so the grouping is what gets dropped — and recorded,
    // because a record of having removed it is a defence and removing it
    // quietly is not.
    const said = originRefusal('DESI CLIENTS')
    expect(said).toMatch(/contacts can be imported/i)
    expect(said).toMatch(/the grouping cannot/i)
    expect(said).toMatch(/no lawful use of it exists/i)
  })
})

// ── and the same rule, where uploads actually arrive ──────────────────

import { mapColumns } from '@/lib/import-mapper'

describe('an uploaded sheet sorted by national origin loses the grouping, not the contacts', () => {
  it('refuses a sheet named the way the real uploads were named', () => {
    const r = mapColumns(['EMAIL', 'COMPANY NAME'], 'Tier 1 Prime Vendors (Indians)')
    expect(r.refused).toHaveLength(1)
    expect(r.refused[0]).toMatch(/sorts people by where they are from/i)
  })

  it('still maps the ordinary columns on that same sheet, because the firms are real', () => {
    const r = mapColumns(['EMAIL', 'COMPANY NAME'], 'DESI CLIENTS')
    expect(r.mappings.some((m) => m.targetField === 'email')).toBe(true)
  })

  it('drops a column header that sorts by origin, and there is no field for it to land in', () => {
    const r = mapColumns(['NAME', 'EMAIL', 'ETHNICITY'])
    expect(r.refused[0]).toMatch(/ethnicity/i)
    expect(r.mappings.some((m) => m.sourceColumn === 'ETHNICITY')).toBe(false)
  })

  it('keeps refusals apart from warnings, because a refusal is not overridable', () => {
    const r = mapColumns(['EMAIL'], 'DESI CLIENTS')
    expect(r.refused).toHaveLength(1)
    expect(r.warnings).toHaveLength(0)
  })

  it('leaves an ordinary sheet completely alone', () => {
    const r = mapColumns(['CONSULTANT NAME', 'EMAIL', 'PHONE'], 'Sheet1')
    expect(r.refused).toEqual([])
  })
})
