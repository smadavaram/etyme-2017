import { describe, it, expect } from 'vitest'
import { whatTheyDo, publicHeadings } from '@/lib/public-site'

/**
 * siteLiveAt has been set at sign-up since the beginning and nothing was
 * ever served on it — the subdomain a company was given led nowhere, which
 * is the ninety-second promise recorded and not kept.
 *
 * The page is public, so what it says is what we are willing to say about a
 * customer to anybody who types their name.
 */

describe('what a company is said to do', () => {
  it('describes each kind in a phrase somebody would use', () => {
    expect(whatTheyDo('CLIENT', null)).toBe('hires contract staff')
    expect(whatTheyDo('MSP', null)).toBe('runs contingent workforce programs')
    expect(whatTheyDo('GSI', 'PRIME')).toBe('delivers projects and supplies people')
  })

  it('tells a bench firm apart from one selling direct', () => {
    // They are different businesses and a buyer reads them differently.
    expect(whatTheyDo('VENDOR', 'PRIME')).toBe('supplies consultants to clients')
    expect(whatTheyDo('VENDOR', 'BENCH')).toBe('supplies consultants through other staffing firms')
  })

  it('a one-person firm’s page says what she does, never that she supplies consultants', () => {
    const said = whatTheyDo('CONSULTANT_CORP', null)
    expect(said).toBe('is an independent contractor’s own company, paid for contract work')
    expect(said).not.toMatch(/supplies|consultants/)
    expect(said).not.toMatch(/\b(she|her|he|his)\b/)
  })

  it('never leaves an enum on a public page', () => {
    for (const kind of ['CLIENT', 'MSP', 'GSI', 'VENDOR', 'CONSULTANT_CORP']) {
      const said = whatTheyDo(kind, null)
      expect(said, kind).not.toContain('_')
      expect(said, kind).toBe(said.toLowerCase())
    }
  })
})

describe('the headings a company\'s public page serves', () => {
  it('a heading stored as training never reaches a company\'s public page', () => {
    const h = publicHeadings({ training: 'Training they run', skills: 'Courses we run' })
    expect(h).not.toHaveProperty('training')
    expect(JSON.stringify(h)).not.toMatch(/train|course/i)
    expect(h.skills).toBe('What they place')
  })

  it('a stored heading under a key the page does not know is never served', () => {
    const h = publicHeadings({ margin: 'Our margin', skills: 'What we place' })
    expect(h).not.toHaveProperty('margin')
    expect(h.skills).toBe('What we place')
  })
})
