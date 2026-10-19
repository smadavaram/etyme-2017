import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rolesFor } from '@/lib/company-defaults'
import { approvedLine, setPasswordHref, backToClaim, jobsWaiting, WORK_ACCOUNT, clientClaimLine, claimLine, claimEyebrow } from '@/app/claim/[token]/words'

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

describe('a client its supplier invited claims its own record', () => {
  const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/claim/[token]/route.ts'), 'utf8')

  it('a client a supplier invited is told the supplier keeps a record of their work together, never that the supplier approved it', () => {
    expect(clientClaimLine('Tapin')).toBe('Tapin, your supplier, keeps a record of your work together on Etyme. Set a password to take it.')
    expect(clientClaimLine('Tapin', true)).toBe('Tapin, your supplier, keeps a record of your work together on Etyme.')
    expect(claimLine({ company: 'Northbend Athletic', invitedBy: 'Tapin', invitedAs: 'CLIENT' })).not.toContain('approved')
    expect(claimLine({ company: 'Brookfield Walk Staffing', invitedBy: 'Northbend Athletic', invitedAs: 'SUPPLIER' })).toBe(
      'Brookfield Walk Staffing was approved by Northbend Athletic. Set a password to take this account.'
    )
    expect(claimEyebrow('CLIENT')).toBe('Client account')
    expect(claimEyebrow('SUPPLIER')).toBe('Supplier account')
  })

  it('the claim read says whether the invited company is a client, from the company’s own kind, and the page never offers a client jobs', () => {
    expect(ROUTE).toContain("invitedAs: invite.company.kind === 'CLIENT' ? 'CLIENT' : 'SUPPLIER',")
    expect(PAGE).toContain('{claimLine(claim, claim.alreadyClaimed)}')
    expect(PAGE).toContain("claim.invitedAs !== 'CLIENT' && jobsWaiting(")
  })

  it('the first person to claim a client\'s record is seated in the client\'s own roles, not a supplier\'s', () => {
    // The roles are the claimed company's kind, read off the record, and
    // the owner's seat is found in that same set.
    expect(ROUTE).toContain('const kindRoles = rolesFor(invite.company.kind)')
    expect(ROUTE).toContain('kindRoles.map(')
    expect(ROUTE).toContain('const ownerName = kindRoles.find((r) => r.isOwner)?.name')
    expect(ROUTE).not.toContain("rolesFor('VENDOR')")
    // The client's set has its own owner and none of a supplier's desks.
    const client = rolesFor('CLIENT')
    expect(client.some((r) => r.isOwner)).toBe(true)
    expect(client.map((r) => r.name)).not.toContain('Recruiter')
    expect(client.map((r) => r.name)).not.toEqual(rolesFor('VENDOR').map((r) => r.name))
  })
})
