import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  doorsFor, signUpWith, tooManyDoorAsks, DOOR_ASKS_PER_MINUTE, NO_DIRECTORY_YET, type DoorsQuestion,
  SIGN_IN_HEADING, OR_USE_YOUR_EMAIL, CONTINUE, EMAIL_HINT, TYPE_YOUR_EMAIL, TYPE_YOUR_PASSWORD, LINKEDIN_DOOR_SAYS,
  LINKEDIN_HAS_SEAT_SAYS, accountButtons, looksLikeEmail, directoryCardSays, continueToDirectory,
} from '@/lib/login-doors'

/**
 * The sign-in page (founder, 2026-11-12): the account buttons first, then
 * one email box, and after the email only the door that address's company
 * allows. The email is routing, never proof, and the page never says
 * whether an address has an account. The morning's version asked for the
 * email before any account button; the evening's flow replaced it.
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

describe('the first screen: the account buttons first, then the email (founder, 2026-11-12, evening)', () => {
  // Brought up to the founder's flow of the evening of 2026-11-12: the page
  // no longer asks for the email before it shows the account buttons.
  const page = read('src/app/(auth)/login/page.tsx')

  it('says "Sign in to Etyme" and, under it, "New here? Sign up" as a link carrying the address typed', () => {
    expect(SIGN_IN_HEADING).toBe('Sign in to Etyme')
    expect(page).toContain('{signedIn ? WELCOME_BACK : SIGN_IN_HEADING}')
    expect(page).toMatch(/New here\?\{' '\}\s*<a href=\{signUpWith\(email\)\}/)
    expect(signUpWith(' dana@kestrelworks.com ')).toBe('/signup?email=dana%40kestrelworks.com')
    expect(signUpWith('')).toBe('/signup')
    expect(read('src/app/(auth)/signup/page.tsx')).toContain('initialEmail={email}')
  })

  it('draws the account buttons above the one email box, under the words "or use your email"', () => {
    expect(OR_USE_YOUR_EMAIL).toBe('or use your email')
    expect(page.match(/type="email"/g)).toHaveLength(1)
    const buttons = page.indexOf('<AccountButtons available={available}')
    const divider = page.indexOf('<AccountDividerWhen')
    const box = page.indexOf('type="email"')
    expect(buttons).toBeGreaterThan(0)
    expect(buttons).toBeLessThan(divider)
    expect(divider).toBeLessThan(box)
    expect(page).toContain('<DoorDivider words={OR_USE_YOUR_EMAIL} />')
  })

  it('offers only the providers this deployment holds keys for, Google, Microsoft, then LinkedIn, the door used last first', () => {
    expect(accountButtons(null, null)).toEqual([])
    expect(accountButtons(new Set(['credentials']), 'google')).toEqual([])
    expect(accountButtons(ALL, null)).toEqual(['google', 'microsoft', 'linkedin'])
    expect(accountButtons(ALL, 'linkedin')).toEqual(['linkedin', 'google', 'microsoft'])
    expect(accountButtons(new Set(['google', 'credentials']), 'microsoft')).toEqual(['google'])
    expect(accountButtons(ALL, 'password')).toEqual(['google', 'microsoft', 'linkedin'])
  })

  it('every account button is an outline with the provider’s mark, and Continue is the one filled button on the screen', () => {
    const doors = read('src/app/(auth)/account-doors.tsx')
    expect(doors).toContain('className={retry ? retryButton : accountButton}')
    expect(doors).toMatch(/const accountButton =\s*'w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-etyme-rule/)
    expect(doors).toContain('<Mark />')
    expect(page).toContain("className={retried ? doorOutline : doorButton}")
    expect(CONTINUE).toBe('Continue')
    expect(EMAIL_HINT).toBe('For a password, or your company\u2019s own sign-in.')
    // The development banner's way in is a link, so it never makes a second filled button.
    expect(page).not.toContain('bg-etyme-navy')
  })

  it('LinkedIn says "Candidates only" on the button itself, at its right edge and in its accessible name', () => {
    expect(LINKEDIN_DOOR_SAYS).toBe('Candidates only')
    const doors = read('src/app/(auth)/account-doors.tsx')
    expect(doors).toContain("aria-label={door === 'linkedin' ? `${words}, ${LINKEDIN_DOOR_SAYS.toLowerCase()}` : undefined}")
    expect(doors).toContain('<span className={`shrink-0 text-xs')
    // The words fit at 390 wide: the label shrinks, the tag does not wrap away.
    expect(doors).toContain('<span className="flex-1 min-w-0 text-left">{words}</span>')
  })

  it('Continue can always be pressed: an empty or half-typed address is said, and nothing is sent', () => {
    expect(TYPE_YOUR_EMAIL).toBe('Type your email address, like you@company.com.')
    expect(looksLikeEmail('dana@')).toBe(false)
    expect(page).toContain('if (!looksLikeEmail(email)) {\n      setEmailRefused(TYPE_YOUR_EMAIL)\n      return\n    }')
    expect(page).toContain("disabled={asking}")
    expect(page).toContain("{asking ? 'Checking…' : CONTINUE}")
    expect(page).not.toMatch(/disabled=\{[^}]*!email/)
    expect(page).not.toMatch(/\srequired[\s>]/)
  })

  it('has no second email box, no directory section, no magic link and no long sentence under the heading', () => {
    expect(page).not.toContain('dir-email')
    expect(page).not.toContain('pw-email')
    expect(page).not.toContain('for your company&rsquo;s directory')
    expect(page).not.toContain('loginSubtitle')
    expect(page).not.toContain('Send magic link')
  })
})

describe('after Continue, the doors route decides, exactly as before', () => {
  const page = read('src/app/(auth)/login/page.tsx')

  it('a company that signs in through its directory is sent straight there, with no second screen', () => {
    expect(page).toContain('if (j.data.start) {\n        // The company\'s own directory: no second screen.\n        window.location.assign(j.data.start)')
  })

  it('an address with the password door gets the address with Change, Password, Sign in and Forgot your password, and nothing else', () => {
    const second = page.slice(page.indexOf('} else if (doors !== null) {'), page.indexOf('} else {\n    /* The first screen'))
    expect(second).toContain('<DoorWho email={email.trim()} onChange={change} />')
    expect(second).toContain('id="pw"')
    expect(second).toContain("{busy ? 'Signing in…' : SIGN_IN}")
    expect(second).toContain('href="/reset"')
    expect(second.indexOf('{offersPassword ? (')).toBeLessThan(second.indexOf('id="pw"'))
    expect(page.match(/id="pw"/g)).toHaveLength(1)
  })

  it('Sign in can always be pressed: with no password the page says "Type your password." and nothing is sent', () => {
    expect(TYPE_YOUR_PASSWORD).toBe('Type your password.')
    const fn = page.slice(page.indexOf('async function signInWithPassword'), page.indexOf('async function resend'))
    expect(fn.indexOf('setRefusal(TYPE_YOUR_PASSWORD)')).toBeLessThan(fn.indexOf("signIn('credentials'"))
    expect(page).toContain('disabled={busy} className={doorButton}>\n              {busy ? \'Signing in…\' : SIGN_IN}')
  })

  it('an address whose only doors are account buttons gets the address, Change and those buttons', () => {
    expect(page).toContain("const buttonsOnly = ordered.filter((d): d is RetryDoor => d === 'google' || d === 'microsoft' || d === 'linkedin')")
    expect(page).toContain('{buttonsOnly.map((d, i) => (')
  })
})

describe('an account button a directory-only company refused draws that company’s directory', () => {
  const page = read('src/app/(auth)/login/page.tsx')
  const SECRET = 'a-test-secret-for-the-door-proof'

  it('the proof is sealed for the address the provider vouched for, opens only with the deployment’s secret, and is good for ten minutes', async () => {
    const { sealDoorProof, openDoorProof, DOOR_PROOF_MINUTES } = await import('@/lib/identity/door-proof')
    const now = 1_800_000_000_000
    const t = sealDoorProof('Marcus@Northbend.example', now, SECRET)!
    expect(t).not.toContain('northbend')
    expect(openDoorProof(t, now + 60_000, SECRET)).toBe('marcus@northbend.example')
    expect(openDoorProof(t, now + DOOR_PROOF_MINUTES * 60_000 + 1, SECRET)).toBeNull()
    expect(openDoorProof(t, now, 'another-secret')).toBeNull()
    expect(openDoorProof(t.slice(0, -2) + (t.endsWith('A') ? 'BB' : 'AA'), now, SECRET)).toBeNull()
    expect(openDoorProof('not a proof', now, SECRET)).toBeNull()
    expect(sealDoorProof('a@b.com', now, null)).toBeNull()
  })

  it('only a Google, Microsoft or LinkedIn sign-in refused by a directory-only company carries a proof', () => {
    const auth = read('src/lib/auth.ts')
    expect(auth).toContain("const proven = v.policy === 'SSO_ONLY' && (door === 'GOOGLE_SOCIAL' || door === 'MICROSOFT_SOCIAL' || door === 'LINKEDIN')")
    // In an httpOnly cookie for the doors route, never on the address (review, 2026-11-13).
    expect(auth).toContain('cookies().set(doorProofCookie(proof))')
    expect(auth).toContain("return '/login?error=DirectoryOnly'")
    expect(auth).not.toContain('&proof=')
  })

  it('the proof travels in an httpOnly cookie sent only to the doors route, never on the sign-in address, so no log, Referer or history holds it', async () => {
    const { doorProofCookie, DOOR_PROOF_COOKIE, DOOR_PROOF_PATH, DOOR_PROOF_MINUTES } = await import('@/lib/identity/door-proof')
    expect(doorProofCookie('x')).toMatchObject({ name: DOOR_PROOF_COOKIE, httpOnly: true, sameSite: 'lax', path: DOOR_PROOF_PATH, maxAge: DOOR_PROOF_MINUTES * 60 })
    expect(DOOR_PROOF_PATH).toBe('/api/auth/doors')
    expect(page).not.toContain("params.get('proof')")
    expect(page).toContain("body: JSON.stringify({ proof: true })")
  })

  it('a proof is taken once: the second presentation reads as nothing, and a forged one never counts as used', async () => {
    const { sealDoorProof, takeDoorProof } = await import('@/lib/identity/door-proof')
    const now = 1_800_000_000_000
    const t = sealDoorProof('helena@northbend.example', now, SECRET)!
    expect(takeDoorProof(t, now + 1_000, SECRET)).toBe('helena@northbend.example')
    expect(takeDoorProof(t, now + 2_000, SECRET)).toBeNull()
    expect(takeDoorProof('not a proof at all, just forty characters long', now, SECRET)).toBeNull()
  })

  it('the doors route names the company only for a proof it took from its cookie, deletes the cookie in the same answer, and answers a forged one as if nothing was sent', () => {
    const route = read('src/app/api/auth/doors/route.ts')
    expect(route).toContain("const proven = body.proof === true ? takeDoorProof(request.cookies.get(DOOR_PROOF_COOKIE)?.value) : null")
    expect(route).toContain("res.cookies.set(doorProofCookie('', 0))")
    expect(route).toContain("if (!proven || !co || facts!.publicAddress) return answer({ directory: null })")
  })

  it('the sign-in doors limit is keyed on the address the platform saw, never on a header the caller writes first, with one ceiling across every caller', async () => {
    const { askerOf, tooManyDoorAsksAll, DOOR_ASKS_ALL_PER_MINUTE } = await import('@/lib/login-doors')
    const h = (m: Record<string, string>) => ({ get: (n: string) => m[n] ?? null })
    expect(askerOf('203.0.113.9', h({ 'x-forwarded-for': 'spoofed, 198.51.100.4' }))).toBe('203.0.113.9')
    expect(askerOf(undefined, h({ 'x-real-ip': '198.51.100.7', 'x-forwarded-for': 'spoofed' }))).toBe('198.51.100.7')
    expect(askerOf(undefined, h({ 'x-forwarded-for': 'spoofed-by-caller, 198.51.100.4' }))).toBe('198.51.100.4')
    const now = 1_800_000_000_000
    expect(tooManyDoorAsksAll(Array(DOOR_ASKS_ALL_PER_MINUTE).fill(now - 1_000), now)).toBe(true)
    expect(tooManyDoorAsksAll(Array(DOOR_ASKS_ALL_PER_MINUTE).fill(now - 61_000), now)).toBe(false)
  })

  it('the directory screen shows the address with Change, one sentence, and one filled button to the company’s own sign-in', () => {
    expect(directoryCardSays('Northbend Athletic')).toBe('Northbend Athletic signs in through its own directory. No Etyme password, and no personal account.')
    expect(continueToDirectory('Northbend Athletic')).toBe('Continue to Northbend Athletic\u2019s sign-in')
    const screen = page.slice(page.indexOf('} else if (directory) {'), page.indexOf('} else if (doors !== null) {'))
    expect(screen).toContain('<DoorWho email={directory.email} onChange={change} />')
    expect(screen).toContain('{continueToDirectory(directory.company)}')
    expect(screen).not.toContain('id="pw"')
    expect(screen.match(/className=\{doorButton\}/g)).toHaveLength(1)
  })

})

describe('LinkedIn is for candidates only (founder, 2026-11-12)', () => {
  it('a LinkedIn sign-in by somebody who holds a seat at any company, a one-person firm included, is refused in one sentence that says which button to use', () => {
    expect(signInRefusal('LinkedInHasSeat')).toBe(LINKEDIN_HAS_SEAT_SAYS)
    expect(LINKEDIN_HAS_SEAT_SAYS).toBe('LinkedIn is for candidates only. You have a seat at a company on Etyme, so use Continue with Google, Continue with Microsoft or your email.')
    const auth = read('src/lib/auth.ts')
    expect(auth).toContain("if (await linkedInSeatAtSignIn(sessionEmail(user.email)!)) return '/login?error=LinkedInHasSeat'")
    const reader = read('src/lib/identity/read.ts')
    const fn = reader.slice(reader.indexOf('export async function linkedInSeatAtSignIn'))
    // Any live seat at a company, whatever the company's kind.
    expect(fn).toContain('where: { revokedAt: null, companyId: { not: null }, person: { primaryEmail: address } }')
    expect(fn).not.toContain('CONSULTANT_CORP')
    // The refusal's row is written before the refusal goes back.
    expect(fn.indexOf('await recordIdentityEvent(')).toBeLessThan(fn.indexOf('return true'))
  })

  it('a person with no seat anywhere who signs in through LinkedIn is set up as a candidate, never a company or a one-person firm', () => {
    const route = read('src/app/api/onboarding/route.ts')
    expect(route).toContain("if (door !== 'LINKEDIN' || decision.action === 'REFUSE') return decision")
    expect(route.match(/forDoor\(decideEntry\(email, await allClaims\(\)\), identity\?\.door \?\? null\)/g)).toHaveLength(2)
    expect(route).toContain("&& identity?.door !== 'LINKEDIN'")
  })
})

// ── The founder's own sign-in, 2026-11-12: faults 1, 2, 3 and 7 ──────

import {
  orderDoors, parseLastDoor, readLastDoor, rememberDoor, LAST_DOOR_KEY, OR_USE_A_PASSWORD,
  signInRefusal, didNotFinish, parseRetry, keepRetry, takeRetry, RETRY_KEY, chooserFor,
  USE_ANOTHER_ACCOUNT, emailFromLink, SIGN_IN_DID_NOT_FINISH, WELCOME_BACK, middleEllipsis, tryAgainWith,
} from '@/lib/login-doors'

/** A storage that keeps strings, like the browser's. */
function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)) },
    removeItem: (k: string) => { m.delete(k) },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size },
  } as Storage
}
function withStorage(name: 'localStorage' | 'sessionStorage', value: unknown, run: () => void) {
  const had = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, typeof value === 'function'
    ? { get: value as () => unknown, configurable: true }
    : { value, configurable: true, writable: true })
  try { run() } finally {
    if (had) Object.defineProperty(globalThis, name, had)
    else delete (globalThis as any)[name]
  }
}

describe('the account buttons come first, and the door this browser used last leads (fault 1)', () => {
  const page = read('src/app/(auth)/login/page.tsx')

  it('a work address on a Google Workspace domain meets the Google button before any password box', () => {
    const offered = doorsFor(ask({ domain: 'etyme.com' })).doors
    expect(orderDoors(offered, null)).toEqual(['google', 'microsoft', 'password'])
    // The account buttons are the first screen; the password is the second.
    expect(page.indexOf('<AccountButtons available={available}')).toBeGreaterThan(page.indexOf('id="pw"'))
    expect(page.indexOf('} else if (doors !== null) {')).toBeLessThan(page.indexOf('id="pw"'))
    expect(page.indexOf('/* The first screen: the account buttons, then the email. */')).toBeGreaterThan(page.indexOf('id="pw"'))
  })

  it('a Gmail address is drawn Continue with Google before the password box', () => {
    const offered = doorsFor(ask({ domain: 'gmail.com', publicAddress: true })).doors
    expect(orderDoors(offered, null)).toEqual(['google', 'linkedin', 'password'])
  })

  it('the password box is never drawn beside the account buttons: it is asked only after the email, on its own screen', () => {
    expect(OR_USE_A_PASSWORD).toBe('or use a password')
    expect(page).not.toContain('OR_USE_A_PASSWORD')
    const first = page.slice(page.indexOf('/* The first screen: the account buttons, then the email. */'))
    expect(first).not.toContain('type="password"')
    for (const domain of ['etyme.com', 'gmail.com', 'outlook.com', 'yahoo.com']) {
      const drawn = orderDoors(doorsFor(ask({ domain, publicAddress: domain !== 'etyme.com' })).doors, null)
      expect(drawn[drawn.length - 1], domain).toBe('password')
    }
  })

  it('where no account button is switched on, the email is drawn alone with no line over it, and the password box is focused when it comes', () => {
    const only = orderDoors(doorsFor(ask({ configured: new Set(['credentials']) })).doors, 'google')
    expect(only).toEqual(['password'])
    expect(page).toContain('return accountButtons(available, null).length > 0 ?')
    expect(page).toContain('<input id="pw" type="password" autoFocus autoComplete="current-password"')
  })

  it('the door this browser used last is drawn first', () => {
    expect(orderDoors(['google', 'microsoft', 'password'], 'password')).toEqual(['password', 'google', 'microsoft'])
    expect(orderDoors(['google', 'microsoft', 'password'], 'microsoft')).toEqual(['microsoft', 'google', 'password'])
  })

  it('a remembered door the address is not offered is ignored', () => {
    expect(orderDoors(['google', 'linkedin', 'password'], 'microsoft')).toEqual(['google', 'linkedin', 'password'])
  })

  it('a remembered door holds only a door name and never an email address, and never the directory', () => {
    for (const d of ['google', 'microsoft', 'linkedin', 'password']) expect(parseLastDoor(d)).toBe(d)
    for (const raw of ['directory', 'sharath@etyme.com', '', null, 42, '{"door":"google"}']) expect(parseLastDoor(raw)).toBeNull()
    withStorage('localStorage', memoryStorage(), () => {
      rememberDoor('google')
      expect(globalThis.localStorage.getItem(LAST_DOOR_KEY)).toBe('google')
      expect(readLastDoor()).toBe('google')
      globalThis.localStorage.setItem(LAST_DOOR_KEY, 'sharath@etyme.com')
      expect(readLastDoor()).toBeNull()
    })
    // The page and the shared button write only the four words.
    expect(page).toContain("rememberDoor('password')")
    expect(read('src/app/(auth)/account-doors.tsx')).toContain('rememberDoor(door)')
  })

  it('a directory-only company’s address is never drawn a password box whatever this browser remembers', () => {
    const offered = doorsFor(ask({ domainCompany: { mode: 'SSO_ONLY', issuers: [] } })).doors
    expect(orderDoors(offered, 'password')).toEqual([])
    const withDir = doorsFor(ask({ domainCompany: { mode: 'SSO_ONLY', issuers: ['https://idp.example/'] } })).doors
    expect(orderDoors(withDir, 'password')).toEqual([])
  })

  it('a browser that refuses local storage still draws the sign-in page', () => {
    withStorage('localStorage', () => { throw new Error('SecurityError') }, () => {
      expect(readLastDoor()).toBeNull()
      expect(() => rememberDoor('google')).not.toThrow()
    })
    withStorage('sessionStorage', () => { throw new Error('SecurityError') }, () => {
      expect(takeRetry()).toBeNull()
      expect(() => keepRetry('google', 'a@b.com')).not.toThrow()
    })
    // Read in an effect, never while drawing, so the server and the browser draw the same.
    expect(page.indexOf('setLastDoor(readLastDoor())')).toBeGreaterThan(page.indexOf('useEffect(() => {'))
  })
})

describe('a browser already signed in is shown one card (fault 2)', () => {
  const page = read('src/app/(auth)/login/page.tsx')

  it('a browser signed in reads "Welcome back", one filled Continue with the address under it, and Use another account as an outline, and no email box', () => {
    expect(WELCOME_BACK).toBe('Welcome back')
    expect(USE_ANOTHER_ACCOUNT).toBe('Use another account')
    const card = page.indexOf('if (signedIn) {')
    const form = page.indexOf('type="email"')
    expect(card).toBeGreaterThan(0)
    expect(form).toBeGreaterThan(card)
    const cardBody = page.slice(card, page.indexOf('} else if (directory) {'))
    expect(cardBody).toContain('href="/start"')
    expect(cardBody).toContain('className={`${doorButton} block text-center`}')
    expect(cardBody).toContain('{middleEllipsis(signedIn)}')
    expect(cardBody).toContain('aria-label={`${CONTINUE} as ${signedIn}`}')
    expect(cardBody).toContain('className={doorOutline}>\n          {USE_ANOTHER_ACCOUNT}')
    expect(cardBody).not.toContain('type="email"')
  })

  it('a long address is cut in the middle so it fits on the button, the start and the domain kept, and a short one is whole', () => {
    expect(middleEllipsis('sharath@etyme.com')).toBe('sharath@etyme.com')
    const cut = middleEllipsis('sharath.madavaram.the.founder.of.tapin@etyme.com')
    expect(cut.length).toBeLessThanOrEqual(34)
    expect(cut.startsWith('sharath.')).toBe(true)
    expect(cut.endsWith('\u2026@etyme.com')).toBe(true)
    const odd = middleEllipsis('somebody@a-very-long-company-domain-name-that-will-not-fit.example')
    expect(odd.length).toBeLessThanOrEqual(34)
    expect(odd).toContain('\u2026')
  })

  it('the sign-in page never shows "You are signed in" beside the email box, nor the development banner beside the card', () => {
    expect(page).not.toMatch(/<AnotherAccount[ \/]/)
    expect(page.indexOf('{devEmail && (')).toBeGreaterThan(page.indexOf('if (signedIn) {'))
  })

  it('nothing but the heading is drawn until the session read answers', () => {
    expect(page).toContain('{signedIn !== undefined && (')
    expect(page.indexOf('{signedIn ? WELCOME_BACK : SIGN_IN_HEADING}')).toBeLessThan(page.indexOf('{signedIn !== undefined && ('))
  })

  it('the sentences a link carries, an error or another account, are still drawn above the card', () => {
    expect(page.indexOf('{sentBack && ')).toBeLessThan(page.indexOf('{screen}'))
    expect(page.indexOf('{another && ')).toBeLessThan(page.indexOf('{screen}'))
  })
})

describe('a sign-in that did not finish is offered Try again (fault 3)', () => {
  const page = read('src/app/(auth)/login/page.tsx')

  it('a sign-in that comes back with OAuthCallback, OAuthSignin or Callback says it did not finish', () => {
    for (const code of ['OAuthCallback', 'OAuthSignin', 'Callback']) {
      expect(didNotFinish(code)).toBe(true)
      expect(signInRefusal(code)).toBe(SIGN_IN_DID_NOT_FINISH)
    }
    expect(SIGN_IN_DID_NOT_FINISH).toBe('That sign-in did not finish. Try again.')
    expect(didNotFinish('DirectoryOnly')).toBe(false)
  })

  it('no sentence after a failed sign-in tells the reader to use a password', () => {
    for (const code of ['OAuthCallback', 'OAuthSignin', 'Callback', 'Something', 'EmailNotVerified', 'NoEmail', 'SessionUnread']) {
      expect(signInRefusal(code) ?? '', code).not.toMatch(/password/i)
    }
  })

  it('a sign-in that comes back unfinished draws the provider tried first and filled as "Try Google again", the address kept in the Email box, and Continue as an outline', () => {
    expect(tryAgainWith('google')).toBe('Try Google again')
    expect(tryAgainWith('microsoft')).toBe('Try Microsoft again')
    expect(page).toContain('retry={retried}')
    expect(page).toContain('const typed = (didNotFinish(code) && kept?.email) || emailFromLink(params.get(\'email\'))')
    expect(page).toContain("className={retried ? doorOutline : doorButton}")
    const doors = read('src/app/(auth)/account-doors.tsx')
    expect(doors).toContain('const drawn = accountButtons(available, retry ?? last)')
    expect(doors).toContain('const words = retry ? tryAgainWith(door) : continueWith(door)')
    withStorage('sessionStorage', memoryStorage(), () => {
      keepRetry('google', 'sharath@etyme.com')
      expect(takeRetry()).toEqual({ door: 'google', email: 'sharath@etyme.com' })
      // Cleared after use.
      expect(takeRetry()).toBeNull()
    })
    expect(read('src/app/(auth)/account-doors.tsx')).toContain('onClick={() => startAccountDoor(door, callbackUrl, email)}')
    expect(page).toContain('if (didNotFinish(code) && kept) setRetry(kept)')
  })

  it('the email is never put in the address bar when a sign-in is retried; it goes to the provider only as a hint', () => {
    expect(chooserFor('sharath@etyme.com')).toEqual({ prompt: 'select_account', login_hint: 'sharath@etyme.com' })
    const doors = read('src/app/(auth)/account-doors.tsx')
    expect(doors).toContain('keepRetry(door, email)')
    expect(doors).not.toMatch(/callbackUrl:\s*`[^`]*email/)
    expect(RETRY_KEY).toBe('etyme_retry')
  })

  it('a kept retry that is not a door and an address is ignored', () => {
    expect(parseRetry('{"door":"directory","email":"a@b.com"}')).toBeNull()
    expect(parseRetry('not json')).toBeNull()
    expect(parseRetry('{"door":"microsoft","email":"not an address"}')).toEqual({ door: 'microsoft', email: '' })
  })
})

describe('a link may carry the address (fault 7)', () => {
  const page = read('src/app/(auth)/login/page.tsx')

  it('the sign-in page fills the email box from ?email= and does nothing else: no call and no submit', () => {
    expect(emailFromLink(' partner@gmail.com ')).toBe('partner@gmail.com')
    expect(emailFromLink('not an address')).toBeNull()
    expect(emailFromLink(null)).toBeNull()
    expect(page).toContain("emailFromLink(params.get('email'))")
    // The address only fills the box: the doors are asked when Sign in is pressed.
    const effect = page.slice(page.indexOf('useEffect(() => {'), page.indexOf('async function askDoors'))
    // The only question the effect asks is a directory proof's, never the address.
    expect(effect).not.toContain('JSON.stringify({ email')
    expect(effect).not.toContain('askDoors(')
  })
})

describe('sign up is the same screen, then a few details (founder, 2026-11-12, evening)', () => {
  const form = read('src/app/(auth)/signup/form.tsx')

  it('step 1 says "Create your Etyme account", "Already have an account? Sign in", the same account buttons, "or use your email", Email and Continue', async () => {
    const { PLAIN_HEADING, DETAILS_HEADING } = await import('@/app/(auth)/signup/heading')
    expect(PLAIN_HEADING).toBe('Create your Etyme account')
    expect(DETAILS_HEADING).toBe('A few details')
    const step1 = form.slice(form.indexOf('if (step === 1) {'), form.indexOf('{DETAILS_HEADING}'))
    expect(step1).toMatch(/Already have an account\?\{' '\}\s*<a href=\{signInHref\}/)
    expect(step1.indexOf('<AccountButtons')).toBeLessThan(step1.indexOf('<DoorDivider words={OR_USE_YOUR_EMAIL} />'))
    expect(step1.indexOf('<DoorDivider')).toBeLessThan(step1.indexOf('type="email"'))
    expect(step1).toContain("{busy ? 'Checking…' : CONTINUE}")
  })

  it('the label is "Email", never "Work email", and the address is never asked twice', () => {
    expect(form).not.toContain('Work email')
    expect(form.match(/type="email"/g)).toHaveLength(1)
    const step2 = form.slice(form.indexOf('{DETAILS_HEADING}'))
    expect(step2).toContain('<DoorWho email={email.trim()}')
    expect(step2).not.toContain('type="email"')
  })

  it('step 2 asks only your name, who the account is for, the company’s name, its Etyme address as one line with Change, what it does, and the password', () => {
    const step2 = form.slice(form.indexOf('{DETAILS_HEADING}'))
    const labels = [...step2.matchAll(/<DoorLabel htmlFor="([a-z-]+)">/g)].map((m) => m[1])
    expect(labels).toEqual(['person-name', 'company-name', 'address', 'type', 'password'])
    expect(step2).toContain('This account is for')
    expect(step2).toContain('My company')
    expect(step2).toContain('Me, as a candidate')
    expect(step2).toContain('Your Etyme address will be')
    // The address field is drawn only on Change, or when the route says the guess is taken.
    expect(step2).toContain('{addressOpen && (')
    expect(form).toContain('if (aboutAddress(String(err.message ?? \'\'))) setAddressOpen(true)')
    expect(step2).toContain('What your company does')
    expect(step2).not.toContain('id="country"')
    expect(step2).not.toContain('id="currency"')
  })

  it('who the account is for is preselected by the address, a public address a candidate, and is one tap to change', () => {
    expect(form).toContain("setTab(classifyEmail(email) === 'CONSUMER' ? 'candidate' : 'company')")
    expect(form).toContain("aria-pressed={tab === 'company'}")
    expect(form).toContain("aria-pressed={tab === 'candidate'}")
  })

  it('Create account is the one filled button on step 2, and the two choices are outlines, never filled', () => {
    const step2 = form.slice(form.indexOf('{DETAILS_HEADING}'))
    expect(step2.match(/className=\{doorButton\}/g)).toHaveLength(1)
    expect(step2).toContain("{busy ? 'Creating your account…' : 'Create account'}")
    expect(form).toContain("on ? 'border-etyme-action bg-etyme-sunk text-etyme-ink'")
    expect(form).not.toMatch(/on \? 'bg-etyme-action/)
  })

  it('no button on sign-up or reset is greyed out for an empty field: each says what is missing and sends nothing', () => {
    expect(form).toContain("if (!personName.trim()) return 'Type your name.'")
    expect(form).toContain("if (!password) return 'Type a password.'")
    expect(form).toContain('if (!looksLikeEmail(email)) { setError(TYPE_YOUR_EMAIL); return }')
    const reset = read('src/app/(auth)/reset/form.tsx')
    expect(reset).toContain('if (!looksLikeEmail(email)) { setError(TYPE_YOUR_EMAIL); return }')
    const withLink = read('src/app/(auth)/reset/[token]/form.tsx')
    expect(withLink).toContain("if (!password) { setError('Type a new password.'); return }")
    for (const page of [form, reset, withLink, read('src/app/(auth)/login/page.tsx')]) {
      expect(page).not.toMatch(/\srequired[\s>]/)
      expect(page).not.toMatch(/disabled=\{[^}]*(!email|!password|!name|!type)/)
      expect(page).not.toMatch(/\b(alert|confirm|prompt)\(/)
    }
  })

  it('every rule of sign-up stays: the same route, the same answers, the guessed country and currency sent', () => {
    expect(form).toContain("fetch('/api/auth/password/signup', {")
    expect(form).toContain("{ as: 'company', email, password, personName, name, type, country: guesses.country, currency: guesses.currency, address }")
    expect(form).toContain("{ as: 'candidate', email, password, name: personName }")
    expect(form).toContain("{ as: 'claim', token: claimToken, email, password, personName }")
  })
})
