import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { approvedLine, setPasswordHref, backToClaim, jobsWaiting, WORK_ACCOUNT } from '@/app/claim/[token]/words'

/**
 * The page an approved supplier opens to take its account.
 *
 * Sign-up walk, round one, item 38: it said "Sign in as priya@…" and
 * sent to the sign-in page, to a firm that had never been given a
 * password. Read partly from the source, because which door a button
 * opens is the thing under test.
 */
const PAGE = readFileSync(join(process.cwd(), 'src/app/claim/[token]/page.tsx'), 'utf8')

describe('the claim page speaks to a firm with no account yet', () => {
  it('says who approved the firm and that a password takes the account', () => {
    expect(approvedLine('Brookfield Walk Staffing', 'Northbend Athletic')).toBe(
      'Brookfield Walk Staffing was approved by Northbend Athletic. Set a password to take this account.'
    )
  })

  it('never asks a firm with no account to sign in as an address', () => {
    expect(PAGE).not.toContain('Sign in as')
    expect(PAGE).not.toContain('/login?next=/claim')
  })

  it('the button goes to the password door carrying the claim token', () => {
    expect(setPasswordHref('abc123')).toBe('/signup?claim=abc123')
    expect(PAGE).toContain('href={setPasswordHref(token!)')
  })

  it('offers a work-account sign-in beside the password only where Microsoft or Google is on', () => {
    expect(WORK_ACCOUNT).toBe('Or sign in with your work account')
    expect(PAGE).toMatch(/\(work\.microsoft \|\| work\.google\) &&/)
    expect(PAGE).toContain("signIn('azure-ad', { callbackUrl: backToClaim(token!) })")
    expect(PAGE).toContain("signIn('google', { callbackUrl: backToClaim(token!) })")
    expect(backToClaim('abc123')).toBe('/claim/abc123')
  })

  it('once somebody has taken the account it stops offering to set a password', () => {
    expect(approvedLine('Brookfield Walk Staffing', 'Northbend Athletic', true)).toBe(
      'Brookfield Walk Staffing was approved by Northbend Athletic.'
    )
  })

  it('says how many jobs are waiting only when there are any', () => {
    expect(jobsWaiting(0, 'Northbend Athletic')).toBeNull()
    expect(jobsWaiting(1, 'Northbend Athletic')).toBe('1 job is waiting for you from Northbend Athletic.')
    expect(jobsWaiting(3, 'Northbend Athletic')).toBe('3 jobs are waiting for you from Northbend Athletic.')
  })
})

describe('a firm that has just claimed its account opens setup', () => {
  const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/claim/[token]/route.ts'), 'utf8')

  it('a newly claimed owner is sent to setup, whichever door they signed in by, never to invitations', () => {
    expect(ROUTE).toContain("landing: '/start'")
    expect(ROUTE).not.toContain("landing: '/dashboard/invitations'")
  })
})
