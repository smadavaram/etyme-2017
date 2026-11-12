import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { doorsFor, signUpWith, tooManyDoorAsks, DOOR_ASKS_PER_MINUTE, NO_DIRECTORY_YET, type DoorsQuestion } from '@/lib/login-doors'

/**
 * The sign-in page asks for the email first (founder, 2026-11-12): one
 * email box, then only the door that address's company allows. The email
 * is routing, never proof, and the page never says whether an address has
 * an account.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const ALL = new Set(['credentials', 'directory-oidc', 'google', 'azure-ad', 'linkedin'])
const ask = (over: Partial<DoorsQuestion>): DoorsQuestion => ({
  domain: 'kestrelworks.com', publicAddress: false, domainCompany: null, configured: ALL, ...over,
})

describe('which door the second screen draws', () => {
  it('a directory-only domain is never offered a password, with a directory or without one', () => {
    const withDir = doorsFor(ask({ domainCompany: { mode: 'SSO_ONLY', issuers: ['https://login.acme.example/v2'] } }))
    expect(withDir.doors).toEqual(['directory'])
    const noDir = doorsFor(ask({ domainCompany: { mode: 'SSO_ONLY', issuers: [] } }))
    expect(noDir.doors).toEqual([])
    expect(noDir.says).toBe(NO_DIRECTORY_YET)
  })

  it('a domain whose company has a directory turned on is sent to that directory and nothing else, whatever its mode', () => {
    for (const mode of [null, 'SSO_ONLY', 'HYBRID', 'INVITE_ONLY'] as const) {
      expect(doorsFor(ask({ domainCompany: { mode, issuers: ['https://idp.example/'] } })).doors, String(mode)).toEqual(['directory'])
    }
  })

  it('an unknown address and a known address on the same kind of domain get the same doors, because nothing about an account is asked', () => {
    // The question has no field for a person: only the domain and its company.
    const keys = Object.keys(ask({})).sort()
    expect(keys).toEqual(['configured', 'domain', 'domainCompany', 'publicAddress'])
    expect(doorsFor(ask({ domain: 'kestrelworks.com' }))).toEqual(doorsFor(ask({ domain: 'nobody-here.com' })))
    expect(read('src/app/api/auth/doors/route.ts')).not.toMatch(/prisma\.person|primaryEmail/)
  })

  it('a company with no directory, invitation-only or hybrid, gets the ordinary doors and keeps the password', () => {
    for (const mode of [null, 'HYBRID', 'INVITE_ONLY'] as const) {
      expect(doorsFor(ask({ domainCompany: { mode, issuers: [] } })).doors).toEqual(['google', 'microsoft', 'password'])
    }
  })

  it('a Gmail address is offered Google and a password, an Outlook address Microsoft and a password, and LinkedIn is for public addresses only', () => {
    expect(doorsFor(ask({ domain: 'gmail.com', publicAddress: true })).doors).toEqual(['google', 'linkedin', 'password'])
    expect(doorsFor(ask({ domain: 'outlook.com', publicAddress: true })).doors).toEqual(['microsoft', 'linkedin', 'password'])
    expect(doorsFor(ask({ domain: 'yahoo.com', publicAddress: true })).doors).toEqual(['linkedin', 'password'])
    expect(doorsFor(ask({})).doors).not.toContain('linkedin')
  })

  it('Google and Microsoft are offered only where this deployment holds their keys; the password always is', () => {
    expect(doorsFor(ask({ configured: new Set(['credentials']) })).doors).toEqual(['password'])
    expect(doorsFor(ask({ domain: 'gmail.com', publicAddress: true, configured: new Set(['credentials']) })).doors).toEqual(['password'])
  })

  it('the doors route is public, slowed after a burst, and sends a directory address straight to the directory', () => {
    const now = 1_000_000
    expect(tooManyDoorAsks(Array(DOOR_ASKS_PER_MINUTE - 1).fill(now), now)).toBe(false)
    expect(tooManyDoorAsks(Array(DOOR_ASKS_PER_MINUTE).fill(now), now)).toBe(true)
    expect(tooManyDoorAsks(Array(DOOR_ASKS_PER_MINUTE).fill(now - 61_000), now)).toBe(false)
    const route = read('src/app/api/auth/doors/route.ts')
    expect(route).toContain("answer.doors.includes('directory') ? directoryStart(email) : null")
    expect(route).toContain('status: 429')
  })
})

describe('the first screen', () => {
  const page = read('src/app/(auth)/login/page.tsx')

  it('draws one email box and two buttons, Create your account first and filled, Sign in second and outlined, both full width', () => {
    expect(page.match(/type="email"/g)).toHaveLength(1)
    const create = page.indexOf('data-door="create"')
    const signIn = page.indexOf('data-door="sign-in"')
    expect(create).toBeGreaterThan(0)
    expect(create).toBeLessThan(signIn)
    expect(page.slice(create, signIn)).toContain('className={doorButton}')
    expect(page.slice(signIn, signIn + 200)).toContain('className={outlineButton}')
    expect(read('src/app/(auth)/door-frame.tsx')).toMatch(/doorButton =\s*'w-full px-4 py-2\.5/)
    expect(page).toMatch(/const outlineButton =\s*'w-full px-4 py-2\.5/)
  })

  it('has no second email box, no directory section and no long sentence under the heading', () => {
    expect(page).not.toContain('dir-email')
    expect(page).not.toContain('pw-email')
    expect(page).not.toContain('for your company&rsquo;s directory')
    expect(page).not.toContain('loginSubtitle')
    expect(page).not.toContain('Send magic link')
  })

  it('asks for a password only on the second screen, and only where the route named the password door', () => {
    expect(page.indexOf('id="pw"')).toBeGreaterThan(page.indexOf('doors === null ?'))
    expect(page).toContain("doors.includes('password') && (")
    expect(page.indexOf('Forgot your password?')).toBeGreaterThan(page.indexOf("doors.includes('password')"))
  })

  it('Create your account carries the email to sign-up, so it is typed once', () => {
    expect(signUpWith(' dana@kestrelworks.com ')).toBe('/signup?email=dana%40kestrelworks.com')
    expect(signUpWith('')).toBe('/signup')
    expect(read('src/app/(auth)/signup/page.tsx')).toContain('initialEmail={email}')
  })
})
