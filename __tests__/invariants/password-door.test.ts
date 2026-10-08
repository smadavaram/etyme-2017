import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  weakPasswordReason, hashPassword, passwordMatches, checkAddress, numberedAddress,
  secondsToWait, waitSentence, tokenUsable, expiresAfter, newToken, hashToken,
  NO_MATCH, VERIFY_HOURS, RESET_HOURS, cleanEmail,
} from '@/lib/password'
import { assess, type ReadinessFacts } from '@/lib/readiness'

/**
 * A password door, until the single sign-on keys exist (founder,
 * 2026-10-08). The rules with no database in them; the walk through the
 * real doors is __integration__/password-door.test.ts.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('an address is lowercase letters, digits and hyphens, never a reserved word, and never taken twice', () => {
  it('takes a plain lowercase name and gives it back cleaned', () => {
    expect(checkAddress('  Acme-Staffing ', new Set())).toMatchObject({ ok: true, value: 'acme-staffing' })
  })

  it('refuses spaces, dots and underscores in a sentence', () => {
    for (const bad of ['acme corp', 'acme.co', 'acme_co']) {
      const v = checkAddress(bad, new Set())
      expect(v.ok).toBe(false)
      expect(v.says).toBe('Letters, numbers and hyphens only. No spaces, dots or underscores.')
    }
  })

  it('refuses fewer than three characters and more than forty', () => {
    expect(checkAddress('ab', new Set()).says).toBe('Too short — three characters or more.')
    expect(checkAddress('a'.repeat(41), new Set()).says).toBe('Too long. Use 40 characters or fewer.')
    expect(checkAddress('a'.repeat(40), new Set()).ok).toBe(true)
  })

  it('never hands out a word that is ours, nor a name the demo world could use', () => {
    for (const word of ['www', 'api', 'demo', 'admin', 'etyme']) {
      expect(checkAddress(word, new Set()).ok, word).toBe(false)
    }
    expect(checkAddress('world-nike', new Set()).says).toBe('Addresses that start with world- or demo- are kept for the demo.')
    expect(checkAddress('demo-acme', new Set()).ok).toBe(false)
  })

  it('never gives one address to two companies', () => {
    expect(checkAddress('acme', new Set(['acme']))).toMatchObject({ ok: false, says: "acme.etyme.com is already somebody else's." })
  })

  it('numbers an address taken in the same minute rather than refusing it, and stays inside forty characters', () => {
    expect(numberedAddress('acme', new Set(['acme']))).toBe('acme-2')
    expect(numberedAddress('acme', new Set(['acme', 'acme-2']))).toBe('acme-3')
    expect(numberedAddress('a'.repeat(40), new Set()).length).toBeLessThanOrEqual(40)
  })
})

describe('a weak password is refused in a sentence that says what makes it weak', () => {
  it('asks for twelve characters and says how many there were', () => {
    expect(weakPasswordReason('short1!')).toBe('Use at least 12 characters. This one has 7.')
  })

  it('refuses the email address, or the part before the @', () => {
    expect(weakPasswordReason('dana.whitfield-2026', { email: 'dana.whitfield@acme.example' }))
      .toBe('Do not use your email address in your password.')
  })

  it('refuses the company name, however it is spaced', () => {
    expect(weakPasswordReason('NorthbendAthletic!9', { companyName: 'Northbend Athletic' }))
      .toBe('Do not use the company name in your password.')
  })

  it('refuses "password" and the other first guesses', () => {
    expect(weakPasswordReason('MyPassword2026!')).toBe('Do not use "password" in your password. It is one of the first guesses.')
    expect(weakPasswordReason('qwertyuiop!!AB')).toMatch(/qwerty/)
  })

  it('refuses one character repeated, and a handful of characters over and over', () => {
    expect(weakPasswordReason('aaaab-cdefgh-1')).toBe('Do not repeat one character four times in a row.')
    expect(weakPasswordReason('abababababab')).toBe('Use more different characters. This one repeats a few over and over.')
  })

  it('accepts a long password that is none of these', () => {
    expect(weakPasswordReason('copper kettle rides north', { email: 'dana@acme.example', companyName: 'Acme' })).toBeNull()
  })
})

describe('a password is stored as a slow hash and never returned or logged', () => {
  it('is hashed with argon2id, and the hash does not contain the password', async () => {
    const hash = await hashPassword('copper kettle rides north')
    expect(hash.startsWith('$argon2id$')).toBe(true)
    expect(hash).not.toContain('copper')
    expect(await passwordMatches(hash, 'copper kettle rides north')).toBe(true)
    expect(await passwordMatches(hash, 'copper kettle rides south')).toBe(false)
  })

  it('a missing hash never matches, and takes the time a real check takes', async () => {
    const t0 = Date.now()
    expect(await passwordMatches(null, 'anything at all here')).toBe(false)
    expect(Date.now() - t0).toBeGreaterThan(5)
  })

  it('nothing on the door logs, and no answer carries a hash', () => {
    for (const f of [
      'src/lib/password.ts', 'src/lib/password-door.ts', 'src/lib/auth.ts',
      'src/app/api/auth/password/signup/route.ts', 'src/app/api/auth/password/resend/route.ts',
      'src/app/api/auth/password/reset/route.ts', 'src/app/api/auth/password/reset/confirm/route.ts',
    ]) {
      const src = read(f)
      expect(src, f).not.toMatch(/console\.(log|info|warn|error|debug)/)
      if (f.includes('/route.ts')) expect(src, f).not.toMatch(/passwordHash/)
    }
  })

  it('a link keeps only the hash of its token, and the email is the only place the token lives', () => {
    const { token, tokenHash } = newToken()
    expect(token.length).toBeGreaterThanOrEqual(40)
    expect(tokenHash).toBe(hashToken(token))
    expect(tokenHash).not.toContain(token)
    expect(read('src/lib/password-door.ts')).toContain('[the one-time link was in the email and is not kept]')
  })
})

describe('a wrong password and an unknown email get the same sentence', () => {
  it('is one sentence, and it names neither case', () => {
    expect(NO_MATCH).toBe('That email and password do not match.')
    expect(read('src/lib/password-door.ts')).not.toMatch(/no such account|not registered|already registered/i)
  })

  it('compares emails lowercase and trimmed', () => {
    expect(cleanEmail('  Dana@ACME.example ')).toBe('dana@acme.example')
  })
})

describe('five wrong tries slow the door for a minute, and the sentence says so', () => {
  const now = new Date('2026-10-08T12:00:00Z')
  const ago = (s: number) => new Date(now.getTime() - s * 1000)

  it('four wrong tries do not slow it', () => {
    expect(secondsToWait({ byEmail: [ago(1), ago(2), ago(3), ago(4)], byIp: [] }, now)).toBe(0)
  })

  it('five inside fifteen minutes make it wait a minute from the latest', () => {
    expect(secondsToWait({ byEmail: [ago(0), ago(60), ago(120), ago(180), ago(240)], byIp: [] }, now)).toBe(60)
    expect(secondsToWait({ byEmail: [ago(20), ago(60), ago(120), ago(180), ago(240)], byIp: [] }, now)).toBe(40)
  })

  it('counts one network address across many emails', () => {
    expect(secondsToWait({ byEmail: [], byIp: [ago(1), ago(2), ago(3), ago(4), ago(5)] }, now)).toBe(59)
  })

  it('forgets a try older than fifteen minutes, and lets them in again once the minute is up', () => {
    expect(secondsToWait({ byEmail: [ago(901), ago(60), ago(120), ago(180), ago(240)], byIp: [] }, now)).toBe(0)
    expect(secondsToWait({ byEmail: [ago(61), ago(62), ago(63), ago(64), ago(65)], byIp: [] }, now)).toBe(0)
  })

  it('says the wait in seconds, in a sentence', () => {
    expect(waitSentence(60)).toBe('Too many tries. Wait 60 seconds, then try again.')
    expect(waitSentence(1)).toBe('Too many tries. Wait 1 second, then try again.')
  })
})

describe('a verification link works once and dies after a day; signing up again resends it', () => {
  const now = new Date('2026-10-08T12:00:00Z')

  it('lives twenty-four hours', () => {
    expect(VERIFY_HOURS).toBe(24)
    const row = { usedAt: null, expiresAt: expiresAfter(VERIFY_HOURS, now) }
    expect(tokenUsable(row, 'VERIFY', new Date(now.getTime() + 23.9 * 3600_000)).ok).toBe(true)
    expect(tokenUsable(row, 'VERIFY', new Date(now.getTime() + 24 * 3600_000))).toMatchObject({
      ok: false, reason: 'EXPIRED', says: 'This link has expired. Sign up again with the same email and we send a new one.',
    })
  })

  it('works once', () => {
    expect(tokenUsable({ usedAt: now, expiresAt: expiresAfter(24, now) }, 'VERIFY', now)).toMatchObject({ ok: false, reason: 'USED' })
  })
})

describe('a reset link works once and dies after an hour', () => {
  const now = new Date('2026-10-08T12:00:00Z')

  it('lives one hour, and says to ask for another', () => {
    expect(RESET_HOURS).toBe(1)
    const row = { usedAt: null, expiresAt: expiresAfter(RESET_HOURS, now) }
    expect(tokenUsable(row, 'RESET', new Date(now.getTime() + 59 * 60_000)).ok).toBe(true)
    expect(tokenUsable(row, 'RESET', new Date(now.getTime() + 61 * 60_000))).toMatchObject({
      ok: false, says: 'This link has expired. Ask for a new one on the reset page.',
    })
  })

  it('a link nobody issued says it does not work', () => {
    expect(tokenUsable(null, 'RESET', now)).toMatchObject({ ok: false, reason: 'UNKNOWN' })
  })
})

describe('the readiness page counts a password sign-in as a real sign-in and says password among the providers', () => {
  const base: ReadinessFacts = {
    env: { database: true, nextauthSecret: true, cronSecret: true, microsoft: false, google: false, emailLink: false, emailSender: true, anthropic: false },
    db: { reachable: true, schemaCurrent: true, ms: 10 },
    realCompanies: 0, realSignIns: 0,
    imports: { total: 0, committed: 0 }, email: { sent: 0, unsent: 0 },
    teams: { workflowsChannels: 0, retiredChannels: 0, postedByWorkflows: 0 },
    cron: { tracked: true, lastRunAt: null, lastBroke: 0 },
    watch: { staffConfigured: false, alertsSent: 0, incidentsToday: 0 },
    demo: { seeded: true, current: true },
  }
  const signin = (f: ReadinessFacts) => assess(f).edges.find((e) => e.key === 'signin')!

  it('with an email sender and no provider keys, the password door is the way in and nobody has used it yet', () => {
    expect(signin(base)).toMatchObject({ state: 'SET', says: 'Sign-in with password is configured. Nobody has used it yet.' })
  })

  it('one real password sign-in proves the edge', () => {
    expect(signin({ ...base, realSignIns: 1 })).toMatchObject({ state: 'PROVEN', says: '1 person has signed in through password.' })
  })

  it('with no sender, the row says the password door cannot confirm emails and is off', () => {
    const e = signin({ ...base, env: { ...base.env, emailSender: false } })
    expect(e.state).toBe('MISSING')
    expect(e.says).toContain('The password door cannot confirm emails without an email sender, so it is off.')
    expect(e.fix).toContain('RESEND_API_KEY')
  })

  it('a password sign-in is counted the way every other one is: a used credential from a real address', () => {
    const facts = read('src/lib/readiness-facts.ts')
    expect(facts).toMatch(/prisma\.credential\.count\(\{\s*where: \{ lastUsedAt: \{ not: null \}/)
    expect(read('src/lib/password-door.ts')).toMatch(/provider: 'PASSWORD'/)
  })
})

describe('the login page offers email and password even when no provider key is set', () => {
  const KEYS = ['AZURE_AD_CLIENT_ID', 'AZURE_AD_CLIENT_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'EMAIL_SERVER']
  let saved: Record<string, string | undefined> = {}
  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
    for (const k of KEYS) delete process.env[k]
  })
  afterEach(() => {
    for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))
  })

  it('registers the password door with no keys set at all', async () => {
    const mod = await import('@/lib/auth')
    expect(mod.configuredProviders().map((p: any) => p.id)).toEqual(['credentials'])
  })

  it('draws the email and password form before any provider button, and never behind a provider check', () => {
    const page = read('src/app/(auth)/login/page.tsx')
    const form = page.indexOf("signIn('credentials'")
    const microsoft = page.indexOf("signIn('azure-ad'")
    expect(form).toBeGreaterThan(0)
    expect(page.indexOf('id="pw"')).toBeLessThan(microsoft)
    expect(page).not.toContain("has('credentials')")
    expect(page).not.toContain('No sign-in method is switched on')
  })

  it('links to sign-up and to a reset from the sign-in form', () => {
    const page = read('src/app/(auth)/login/page.tsx')
    expect(page).toContain('href="/signup"')
    expect(page).toContain('href="/reset"')
  })
})
