/**
 * The sign-up page names the party a link opened it for (market,
 * 2026-11-01): the Suppliers door opens it on ?type=prime, ?type=sub or
 * ?type=bench, and it said "Sign up for Etyme" all the same.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COMPANY_TYPES } from '@/lib/onboarding'
import { signUpHeading, PLAIN_HEADING, CLAIM_HEADING } from '@/app/(auth)/signup/heading'

const opened = (type: string | null, tab: 'company' | 'candidate' = 'company') =>
  signUpHeading({ claim: false, openedOn: type, openedTab: tab, type: type ?? '', tab })

describe('The sign-up heading', () => {
  it('a link that opens sign-up as a prime vendor, a sub-vendor or a bench supplier says "Sign up as a supplier"', () => {
    expect(['prime', 'sub', 'bench'].map((t) => opened(t))).toEqual(Array(3).fill('Sign up as a supplier'))
  })

  it('opened with no party, it still says "Sign up for Etyme", and a supplier invitation says the company’s account is being taken', () => {
    expect(opened(null)).toBe(PLAIN_HEADING)
    expect(signUpHeading({ claim: true, openedOn: 'prime', openedTab: 'company', type: 'prime', tab: 'company' })).toBe(CLAIM_HEADING)
  })

  it('every party a link can open on is named in the doors’ own words, never with the word desk or program office', () => {
    for (const t of COMPANY_TYPES) {
      const said = opened(t.key)
      expect(said, t.key).not.toBe(PLAIN_HEADING)
      expect(said).not.toMatch(/\bdesk\b|program office/i)
    }
    expect(opened(null, 'candidate')).toBe('Sign up as a worker')
  })

  it('once opened on a party, the heading follows what the person picks rather than naming somebody else', () => {
    expect(signUpHeading({ claim: false, openedOn: 'prime', openedTab: 'company', type: 'client', tab: 'company' })).toBe('Sign up as a client')
    expect(signUpHeading({ claim: false, openedOn: 'prime', openedTab: 'company', type: 'prime', tab: 'candidate' })).toBe('Sign up as a worker')
  })

  it('the form draws its heading from this one rule', () => {
    const form = readFileSync(join(process.cwd(), 'src', 'app', '(auth)', 'signup', 'form.tsx'), 'utf8')
    expect(form).toContain('signUpHeading({')
    expect(form).not.toContain("'Sign up for Etyme'")
  })
})
