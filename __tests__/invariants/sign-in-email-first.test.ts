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
    // The password box is drawn only by the doors the route named, after the first screen.
    expect(page.indexOf('{ordered.map(door)}')).toBeGreaterThan(page.indexOf('doors === null ?'))
    expect(page.match(/id="pw"/g)).toHaveLength(1)
    expect(page).toContain("if (d === 'password') {")
    expect(page.indexOf('Forgot your password?')).toBeGreaterThan(page.indexOf("if (d === 'password') {"))
  })

  it('Create your account carries the email to sign-up, so it is typed once', () => {
    expect(signUpWith(' dana@kestrelworks.com ')).toBe('/signup?email=dana%40kestrelworks.com')
    expect(signUpWith('')).toBe('/signup')
    expect(read('src/app/(auth)/signup/page.tsx')).toContain('initialEmail={email}')
  })
})

// ── The founder's own sign-in, 2026-11-12: faults 1, 2, 3 and 7 ──────

import {
  orderDoors, parseLastDoor, readLastDoor, rememberDoor, LAST_DOOR_KEY, OR_USE_A_PASSWORD,
  signInRefusal, didNotFinish, parseRetry, keepRetry, takeRetry, RETRY_KEY, chooserFor,
  continueAs, USE_ANOTHER_ACCOUNT, emailFromLink, SIGN_IN_DID_NOT_FINISH,
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

describe('the second screen draws the company account first and remembers the door used (fault 1)', () => {
  const page = read('src/app/(auth)/login/page.tsx')

  it('a work address on a Google Workspace domain is drawn the Google button before the password box', () => {
    const offered = doorsFor(ask({ domain: 'etyme.com' })).doors
    expect(orderDoors(offered, null)).toEqual(['google', 'microsoft', 'password'])
    // The page draws by that order and nothing else.
    expect(page).toContain('const ordered = doors ? orderDoors(doors, lastDoor) : []')
    expect(page).toContain('{ordered.map(door)}')
  })

  it('a Gmail address is drawn Continue with Google before the password box', () => {
    const offered = doorsFor(ask({ domain: 'gmail.com', publicAddress: true })).doors
    expect(orderDoors(offered, null)).toEqual(['google', 'linkedin', 'password'])
  })

  it('the password box sits under the words "or use a password" on every address that is offered it beside another door', () => {
    expect(OR_USE_A_PASSWORD).toBe('or use a password')
    expect(page).toContain("d === 'password' ? OR_USE_A_PASSWORD")
    for (const domain of ['etyme.com', 'gmail.com', 'outlook.com', 'yahoo.com']) {
      const drawn = orderDoors(doorsFor(ask({ domain, publicAddress: domain !== 'etyme.com' })).doors, null)
      expect(drawn[drawn.length - 1], domain).toBe('password')
    }
  })

  it('where the password is the only door it is drawn alone, focused, with no line over it', () => {
    const only = orderDoors(doorsFor(ask({ configured: new Set(['credentials']) })).doors, 'google')
    expect(only).toEqual(['password'])
    expect(page).toContain('{divider && !passwordAlone && <Divider words={divider} />}')
    expect(page).toContain('autoFocus={first} autoComplete="current-password"')
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

  it('a browser signed in is shown one Continue as button and Use another account, and no email box', () => {
    expect(continueAs(' sharath@etyme.com ')).toBe('Continue as sharath@etyme.com')
    expect(USE_ANOTHER_ACCOUNT).toBe('Use another account')
    const card = page.indexOf('{signedIn ? (')
    const form = page.indexOf('type="email"')
    expect(card).toBeGreaterThan(0)
    expect(form).toBeGreaterThan(card)
    const cardBody = page.slice(card, page.indexOf(') : (', card))
    expect(cardBody).toContain('href="/start"')
    expect(cardBody).toContain('{USE_ANOTHER_ACCOUNT}')
    expect(cardBody).not.toContain('CREATE_ACCOUNT')
    expect(cardBody).not.toContain('type="email"')
  })

  it('the sign-in page never shows "You are signed in" beside the email box, nor the development banner beside the card', () => {
    expect(page).not.toMatch(/<AnotherAccount[ \/]/)
    expect(page.indexOf('{devEmail && (')).toBeGreaterThan(page.indexOf('{signedIn ? ('))
  })

  it('nothing but the heading is drawn until the session read answers', () => {
    expect(page).toContain('{signedIn !== undefined && (')
    expect(page.indexOf('{WELCOME}')).toBeLessThan(page.indexOf('{signedIn !== undefined && ('))
  })

  it('the sentences a link carries, an error or another account, are still drawn above the card', () => {
    expect(page.indexOf('{sentBack && ')).toBeLessThan(page.indexOf('{signedIn ? ('))
    expect(page.indexOf('{another && ')).toBeLessThan(page.indexOf('{signedIn ? ('))
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

  it('a sign-in that comes back unfinished shows a Try again button that restarts the same provider with the address kept', () => {
    withStorage('sessionStorage', memoryStorage(), () => {
      keepRetry('google', 'sharath@etyme.com')
      expect(takeRetry()).toEqual({ door: 'google', email: 'sharath@etyme.com' })
      // Cleared after use.
      expect(takeRetry()).toBeNull()
    })
    expect(page).toContain("onClick={() => startAccountDoor(retry.door, '/start', retry.email)}")
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
    expect(effect).not.toContain('/api/auth/doors')
    expect(effect).not.toContain('askDoors(')
  })
})
