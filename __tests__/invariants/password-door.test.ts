import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  weakPasswordReason, hashPassword, passwordMatches, checkAddress, numberedAddress,
  secondsToWait, waitSentence, tokenUsable, expiresAfter, newToken, hashToken,
  NO_MATCH, VERIFY_HOURS, RESET_HOURS, cleanEmail,
  demoEmail, SUPERSEDED, SIGNUP_SHUT, RESET_SHUT, DEMO_REFUSAL, ALREADY_CONFIRMED, firmAddedYou, soloFromCandidate,
  PASSWORD_HINT_COMPANY, PASSWORD_HINT_PERSON, underHeading,
  memberWelcome, colleagueSentence, claimTokenIn, safeNext,
} from '@/lib/password'
import { possessive } from '@/lib/requisition-approval'
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
    privacyContact: false,
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

describe('round one of the sign-up walk, said as the walk found it', () => {
  it('a seeded demo person can never set a password; the demo door is the only way into a demo seat', () => {
    for (const e of ['dana@northbend.example', 'ap@cavanaugh.invalid', 'hr@talvern.local', 'pm@demo.etyme.com', ' PM@Demo.Etyme.io ']) {
      expect(demoEmail(e), e).toBe(true)
    }
    for (const e of ['dana@kestrelworks.com', 'helena@gmail.com', 'x@demoetyme.com', 'not-an-email']) {
      expect(demoEmail(e), e).toBe(false)
    }
    expect(DEMO_REFUSAL).toBe('This address belongs to the Etyme demo. A demo seat opens only from the demo page, never with a password.')
    // Every door of the password door asks it: sign-up, claim, resend, reset, sign-in.
    const door = read('src/lib/password-door.ts')
    for (const fn of ['signUpCompany', 'signUpCandidate', 'signUpClaim', 'resendVerification', 'requestReset']) {
      const body = door.slice(door.indexOf(`export async function ${fn}`), door.indexOf('\n}\n', door.indexOf(`export async function ${fn}`)))
      expect(body, fn).toContain('demoRefusal(email)')
    }
  })

  it('only the newest link for an email works; an older one says a newer link was sent', () => {
    const now = new Date('2026-10-08T12:00:00Z')
    const row = { usedAt: now, expiresAt: expiresAfter(24, now), supersededAt: now }
    expect(tokenUsable(row, 'VERIFY', now)).toEqual({ ok: false, reason: 'SUPERSEDED', says: SUPERSEDED })
    expect(tokenUsable(row, 'RESET', now)).toMatchObject({ reason: 'SUPERSEDED' })
    expect(SUPERSEDED).toBe('A newer link was sent to this email. Use the link in the newest email.')
  })

  it('with no email sender, sign-up and reset say so before any form', () => {
    expect(SIGNUP_SHUT).toBe('Sign-up is off on this deployment until an email sender is set up.')
    expect(RESET_SHUT).toBe('Password reset is off on this deployment until an email sender is set up.')
    for (const [page, words] of [['src/app/(auth)/signup/page.tsx', 'SIGNUP_SHUT'], ['src/app/(auth)/reset/page.tsx', 'RESET_SHUT']] as const) {
      const src = read(page)
      expect(src.indexOf('doorOpen()'), page).toBeGreaterThan(0)
      expect(src.indexOf(`{${words}}`), page).toBeGreaterThan(src.indexOf('doorOpen()'))
      expect(src.indexOf(`{${words}}`), page).toBeLessThan(src.lastIndexOf('Form'))
    }
  })

  it('the Etyme address "demo" is kept for Etyme, and the refusal suggests the company name the person typed', () => {
    expect(checkAddress('demo', new Set(), 'Other Three Corp').says).toBe("demo is kept for Etyme. Try your company's name, like other-three-corp.")
    expect(checkAddress('demo', new Set(), 'Brookfield Walk Staffing').says).toBe("demo is kept for Etyme. Try your company's name, like brookfield-walk-staffing.")
  })

  it('the refusal of a kept address never suggests a name the person did not type, nor one that is taken or kept itself', () => {
    expect(checkAddress('demo', new Set()).says).toBe("demo is kept for Etyme. Try your company's name.")
    expect(checkAddress('demo', new Set(['acme']), 'Acme').says).toBe("demo is kept for Etyme. Try your company's name.")
    expect(checkAddress('demo', new Set(), 'Demo').says).toBe("demo is kept for Etyme. Try your company's name.")
    expect(checkAddress('demo', new Set(), 'Other Three Corp').says).not.toContain('brookfield')
  })

  it('a verify link clicked again after confirming says the email is already confirmed and offers Sign in', () => {
    expect(ALREADY_CONFIRMED).toBe('Your email is already confirmed. Sign in.')
    const page = read('src/app/(auth)/verify/[token]/page.tsx')
    expect(page).toContain('CONFIRMED_CODE')
    expect(page).toMatch(/>Sign in<\/a>/)
  })

  it('a colleague is told which company they join, and a confirmed Member is told what happens next', () => {
    expect(colleagueSentence('walkco', possessive('Walk Co'))).toBe('walkco is Walk Co\'s address. You will join it as Member once you confirm your email.')
    expect(colleagueSentence('kestrel', possessive('Kestrel Works'))).toBe('kestrel is Kestrel Works\' address. You will join it as Member once you confirm your email.')
    expect(memberWelcome('Walk Co')).toBe('You are in Walk Co as Member. Your owner has been told; you will see more once they give you a desk.')
    expect(read('src/app/(auth)/start/page.tsx')).toContain('memberWelcome(')
  })

  it('a person a company added is told which company, and to confirm their email to sign in', () => {
    expect(firmAddedYou('Brookfield Walk Staffing')).toBe('Brookfield Walk Staffing added you to its bench. Confirm your email to sign in.')
    expect(firmAddedYou(null)).toBe('A company added you to its bench. Confirm your email to sign in.')
  })

  it('the sign-up page reads a supplier invitation from ?claim=, and only a path on this site from ?next=', () => {
    expect(read('src/app/(auth)/signup/page.tsx')).toContain('searchParams?.claim')
    expect(claimTokenIn('/claim/abc_123')).toBe('abc_123')
    expect(claimTokenIn('/dashboard')).toBeNull()
    expect(safeNext('//evil.example/claim/x')).toBeNull()
    expect(safeNext('https://evil.example')).toBeNull()
  })

  it('the sign-up and reset emails are written down as account mail, never as a notice for the bell', () => {
    const door = read('src/lib/password-door.ts')
    expect(door).toContain('type: ACCOUNT_MAIL')
    expect(door).not.toContain("type: 'SYSTEM'")
  })

  it('the sign-in page names only the ways in this deployment has set up, in one sentence', async () => {
    const { loginSubtitle } = await import('@/lib/login-doors')
    expect(loginSubtitle(new Set(['credentials', 'azure-ad', 'google']))).toBe('Sign in with your email and password, or your company\u2019s Microsoft or Google account.')
    expect(loginSubtitle(new Set(['credentials', 'google']))).toBe('Sign in with your email and password, or your company\u2019s Google account.')
    expect(loginSubtitle(new Set(['credentials']))).toBe('Sign in with your email and password.')
    expect(loginSubtitle(null)).toBe('Sign in with your email and password.')
    expect(read('src/app/(auth)/login/page.tsx')).toContain('{loginSubtitle(available)}')
  })

  it('the sign-in page draws no Microsoft, Google or magic-link door until it knows the deployment has one', async () => {
    const { offers, companyAccounts } = await import('@/lib/login-doors')
    // Null is "not known yet" — the second before the list arrives, or a list that could not be read.
    for (const id of ['azure-ad', 'google', 'email']) expect(offers(null, id)).toBe(false)
    expect(companyAccounts(null)).toEqual([])
    expect(offers(new Set(['credentials', 'email']), 'email')).toBe(true)
    expect(offers(new Set(['credentials']), 'azure-ad')).toBe(false)
    const page = read('src/app/(auth)/login/page.tsx')
    expect(page).toContain('const has = (id: string) => offers(available, id)')
    expect(page).not.toContain('available === null ||')
  })

  it('the sign-up form offers the one-person firm, which may use a personal email', async () => {
    const { COMPANY_TYPES } = await import('@/lib/onboarding')
    const solo = COMPANY_TYPES.find((t) => t.key === 'solo')!
    expect(solo).toMatchObject({ kind: 'CONSULTANT_CORP', personalEmail: true })
    expect(COMPANY_TYPES.filter((t) => t.personalEmail).map((t) => t.key)).toEqual(['solo'])
    expect(read('src/app/(auth)/signup/form.tsx')).toContain('COMPANY_TYPES.map')
  })
})

describe('round two of the sign-up walk, said as the walk found it', () => {
  const door = read('src/lib/password-door.ts')

  it('a real person a demo firm added can still sign up, reset and sign in; only a reserved demo address is refused', () => {
    // The address decides, never who typed it in.
    expect(door).not.toContain('seedOnly')
    const refusal = door.slice(door.indexOf('function demoRefusal'), door.indexOf('\n}\n', door.indexOf('function demoRefusal')))
    expect(refusal).toContain('demoEmail(email)')
    expect(refusal).not.toContain('prisma')
    expect(demoEmail('helena.marsh@gmail.com')).toBe(false)
    expect(demoEmail('colleen.byrne@seed.etyme.invalid')).toBe(true)
  })

  it('a person a firm added signs up once: the password they typed is the one that works, and the mail names the firm', () => {
    expect(firmAddedYou('Brookfield Walk Staffing')).toContain('Brookfield Walk Staffing added you to its bench.')
    // The confirming link, not a one-hour reset, and a password already in use is never replaced by it.
    expect(door).toContain('firmAddedYou(await firmThatAdded(existing.id))')
    expect(door).toContain('passwordHash: person.passwordHash ?? pending.passwordHash')
  })

  it('a dead reset link says so on open, before anything is typed', () => {
    const page = read('src/app/(auth)/reset/[token]/page.tsx')
    expect(page).toContain('await resetLinkState(params.token)')
    expect(page.indexOf('resetLinkState')).toBeLessThan(page.indexOf('<ResetWithLinkForm'))
    expect(page).not.toContain("'use client'")
    expect(read('src/app/(auth)/reset/[token]/form.tsx')).toContain('Set your password')
  })

  it('a candidate may become a one-person firm with the same email, and nothing they typed is thrown away', () => {
    expect(soloFromCandidate('Okafor Care LLC', true)).toBe('Confirm your email to set up Okafor Care LLC as your own company on Etyme. You sign in with the password you already use.')
    expect(soloFromCandidate('Okafor Care LLC', false)).toBe('Confirm your email to set up Okafor Care LLC as your own company on Etyme.')
    expect(read('src/app/(auth)/signup/page.tsx')).toContain('searchParams?.type')
  })

  it('the sign-up page says "Check your email" once, as its heading', () => {
    expect(underHeading('Check your email', 'Check your email. We sent a link to a@b.co. It works for 24 hours.'))
      .toBe('We sent a link to a@b.co. It works for 24 hours.')
    expect(underHeading('Check your email', 'Something else.')).toBe('Something else.')
    expect(read('src/app/(auth)/signup/form.tsx')).toContain("underHeading('Check your email', sent)")
  })

  it("a candidate's password hint names no company", () => {
    expect(PASSWORD_HINT_PERSON).toBe('At least 12 characters. Not your email.')
    expect(PASSWORD_HINT_COMPANY).toBe('At least 12 characters. Not your email or the company name.')
    expect(read('src/app/(auth)/signup/form.tsx')).toContain("tab === 'candidate' && !claimToken ? PASSWORD_HINT_PERSON : PASSWORD_HINT_COMPANY")
  })

  it('the sign-in page sits in the same frame as the other doors, says no false footer, and links the terms', () => {
    const page = read('src/app/(auth)/login/page.tsx')
    expect(page).toContain('<DoorFrame>')
    expect(page).toContain('font-serif')
    expect(page).not.toContain('bg-white')
    expect(page).not.toContain('A personal address signs you in as a consultant')
    expect(page).toContain('<Link href="/terms"')
  })
})
