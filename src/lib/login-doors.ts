/**
 * Which ways in the login page draws, and the one line above them.
 *
 * Pure, so the rule is a test rather than a hope. The list of providers
 * arrives a moment after the page does. Until it arrives nothing beyond
 * the password door is drawn, because a "Continue with Microsoft" button
 * that flashes for a second and vanishes is a promise the deployment
 * cannot keep (sign-up walk, round three, item 3). If the list cannot be
 * fetched at all, the same holds: the password door is always there, and
 * no other door is offered on a guess.
 */

/** Null while the list is not known yet, or could not be read. */
export type KnownDoors = ReadonlySet<string> | null

export function offers(available: KnownDoors, id: string): boolean {
  return available !== null && available.has(id)
}

/** The company accounts this deployment can actually sign somebody in with. */
export function companyAccounts(available: KnownDoors): string[] {
  return [
    offers(available, 'azure-ad') ? 'Microsoft' : null,
    offers(available, 'google') ? 'Google' : null,
  ].filter((n): n is string => n !== null)
}

/**
 * What the sign-in page says when NextAuth sends somebody back with a
 * code (`/login?error=…`). A Microsoft or Google sign-in is refused where
 * the provider does not vouch for the email (oauthRefusal in lib/auth),
 * because the email is who the session is. Null for no code; any code we
 * did not write gets one plain sentence rather than the code itself.
 */
export function signInRefusal(code: string | null | undefined): string | null {
  if (!code) return null
  switch (code) {
    case 'EmailNotVerified':
      return 'Your Microsoft or Google account has not confirmed that email address, so it cannot sign you in here. Sign in another way.'
    case 'NoEmail':
      return 'Your Microsoft or Google account did not share an email address, so it cannot sign you in here. Sign in another way.'
    case 'DirectoryOnly':
      // A company's sign-in policy refused the door (lib/identity). The
      // company is not named, because the page does not know which.
      return 'Your company signs its people in through your company\'s directory only. Use the directory sign-in your company gave you.'
    case 'NoDirectory':
      return 'We could not find a company directory for that address. Sign in another way, or ask your company\'s IT.'
    case 'SamlNotBuilt':
      return 'Your company signs in through a SAML directory, and Etyme does not read SAML yet. Ask your company\'s IT for an OpenID Connect sign-in.'
    case 'DirectoryDown':
      return 'Your company\'s directory did not answer. Try again in a minute, or ask your company\'s IT.'
    case 'DirectoryRefused':
      return 'Your company\'s directory did not sign you in. Start again, or ask your company\'s IT.'
    case 'SessionUnread':
      // The person's session version could not be read at sign-in, twice
      // (lib/auth). Never signed in at a guessed version (fault 4).
      return SESSION_UNREAD_SAYS
    case 'CredentialsSignin':
      return null
    default:
      // A provider's own callback that did not finish (a slow answer from
      // Google, a code used twice by the back button) and anything we did
      // not write. Never "use your password": the page does not know
      // whether this address is offered one, and a directory-only
      // company's people never are (fault 3, 2026-11-12).
      return didNotFinish(code) ? SIGN_IN_DID_NOT_FINISH : 'That sign-in did not go through. Try again.'
  }
}

// ── A sign-in that did not finish, and Try again (2026-11-12) ─────────

/** The codes NextAuth sends back when a provider's round trip broke part way. */
const UNFINISHED = new Set(['OAuthCallback', 'OAuthSignin', 'Callback'])

/** Whether a code means the round trip with the provider did not finish, rather than a refusal. */
export function didNotFinish(code: string | null | undefined): boolean {
  return !!code && UNFINISHED.has(code)
}

/** Said where Etyme could not read what it needs to finish a sign-in. */
export const SESSION_UNREAD_SAYS = 'Etyme could not finish signing you in. Try again in a minute.'

export const SIGN_IN_DID_NOT_FINISH = 'That sign-in did not finish. Try again.'
export const TRY_AGAIN = 'Try again'

/**
 * What Try again restarts: the provider pressed and the address typed,
 * kept in this tab's session storage (never the address bar, never a
 * log) and read once. A fresh sign-in starts, so a one-time code the
 * back button used twice is never replayed.
 */
export const RETRY_KEY = 'etyme_retry'
export type RetryDoor = 'google' | 'microsoft' | 'linkedin'
export interface Retry { door: RetryDoor; email: string }

/** A stored retry, read back; null for anything that is not one. */
export function parseRetry(raw: string | null | undefined): Retry | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    const door = v?.door
    if (door !== 'google' && door !== 'microsoft' && door !== 'linkedin') return null
    const email = typeof v.email === 'string' && looksLikeEmail(v.email) ? v.email.trim().slice(0, 254) : ''
    return { door, email }
  } catch {
    return null
  }
}

/** Keep the door pressed and the address, for this tab only. Never throws. */
export function keepRetry(door: RetryDoor, email?: string | null): void {
  try {
    const e = (email ?? '').trim()
    globalThis.sessionStorage?.setItem(RETRY_KEY, JSON.stringify({ door, email: looksLikeEmail(e) ? e : '' }))
  } catch {
    // A browser that refuses storage still signs in; it only loses Try again.
  }
}

/** Read the kept retry once, and clear it. Never throws. */
export function takeRetry(): Retry | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(RETRY_KEY) ?? null
    globalThis.sessionStorage?.removeItem(RETRY_KEY)
    return parseRetry(raw)
  } catch {
    return null
  }
}

/** NextAuth's provider id for a door. */
export function providerOf(door: RetryDoor): 'google' | 'azure-ad' | 'linkedin' {
  return door === 'microsoft' ? 'azure-ad' : door
}

/**
 * What a provider button asks the provider for: its account chooser, and
 * the address the person typed as a hint, so Google opens on that account.
 * The hint is only what the person typed; it reveals nothing.
 */
export function chooserFor(email?: string | null): { prompt: 'select_account'; login_hint?: string } {
  const e = (email ?? '').trim()
  return looksLikeEmail(e) ? { ...CHOOSE_ACCOUNT, login_hint: e } : { ...CHOOSE_ACCOUNT }
}

// ── The door this browser used last (fault 1, 2026-11-12) ────────────

/**
 * The door this browser used last, kept in local storage as one of four
 * words and nothing else: never the address, never `directory` (that door
 * goes straight to the company before any list is drawn). Read only in
 * the browser, never on the server.
 */
export const LAST_DOOR_KEY = 'etyme_last_door'
export type RememberedDoor = 'google' | 'microsoft' | 'linkedin' | 'password'
const REMEMBERED: readonly RememberedDoor[] = ['google', 'microsoft', 'linkedin', 'password']

/** A stored value, read back; null for anything that is not one of the four words. */
export function parseLastDoor(raw: unknown): RememberedDoor | null {
  return typeof raw === 'string' && (REMEMBERED as readonly string[]).includes(raw) ? (raw as RememberedDoor) : null
}

/** Remember the door used. Never throws. */
export function rememberDoor(door: RememberedDoor): void {
  try {
    globalThis.localStorage?.setItem(LAST_DOOR_KEY, door)
  } catch {
    // Storage refused: the page still draws, in the usual order.
  }
}

/** The door remembered on this browser, or null. Never throws. */
export function readLastDoor(): RememberedDoor | null {
  try {
    return parseLastDoor(globalThis.localStorage?.getItem(LAST_DOOR_KEY) ?? null)
  } catch {
    return null
  }
}

/** The line over the password box when a company-account door is drawn above it. */
export const OR_USE_A_PASSWORD = 'or use a password'

/**
 * The order the second screen draws the doors it was offered: the
 * company-account doors first (Google, then Microsoft), then LinkedIn,
 * then the password. The door this browser used last goes first, but
 * only when the address is offered it; a remembered door the address is
 * not offered is ignored. `directory` is never drawn in a list. Pure.
 */
export function orderDoors(doors: readonly SignInDoor[], last: RememberedDoor | null): SignInDoor[] {
  const rank: Record<SignInDoor, number> = { google: 0, microsoft: 1, linkedin: 2, password: 3, directory: 9 }
  const drawn = doors.filter((d) => d !== 'directory').slice().sort((a, b) => rank[a] - rank[b])
  if (last && drawn.includes(last)) return [last, ...drawn.filter((d) => d !== last)]
  return drawn
}

// ── Already signed in (fault 2, 2026-11-12) ───────────────────────────

/** The one button a signed-in browser is shown on the sign-in page. */
export function continueAs(email: string): string {
  return `Continue as ${email.trim()}`
}
export const USE_ANOTHER_ACCOUNT = 'Use another account'

/**
 * The address a link carried (`/login?email=`), for the email box and
 * nothing else: no call is made with it and nothing is submitted. Null
 * for anything that is not an address.
 */
export function emailFromLink(raw: string | null | undefined): string | null {
  const e = String(raw ?? '').trim().slice(0, 254)
  return looksLikeEmail(e) ? e : null
}

// ── Another account ───────────────────────────────────────────────────

/**
 * What the Microsoft and Google buttons ask the provider for: the list of
 * accounts, every time (founder, 2026-10-20). The providers carry the same
 * prompt in lib/auth, so a sign-in started from anywhere shows it.
 */
export const CHOOSE_ACCOUNT = { prompt: 'select_account' } as const

/** The link under "signed in as": it signs out and reopens the door. */
export const ANOTHER_ACCOUNT = 'Not you? Use another account'

/** Where signing out for another account lands: the sign-in page, saying why. */
export const AFTER_ANOTHER_ACCOUNT = '/login?another=1'

/** Who this browser is signed in as, said once over the door. */
export function signedInAsSays(email: string | null | undefined): string | null {
  const e = (email ?? '').trim()
  return e ? `You are signed in as ${e}.` : null
}

/** The line on the sign-in page after signing out for another account. */
export const PICK_ANOTHER_ACCOUNT =
  'You are signed out. Sign in with the account you want. Microsoft and Google will ask which account to use.'

// ── Your company's directory, and LinkedIn ────────────────────────────

/** The directory door's line, the same for a client and a larger company (founder, 2026-11-11). */
export const DIRECTORY_DOOR_SAYS = 'Your team signs in through your company\u2019s directory. No separate Etyme password.'

/** Where the directory door starts, from the work email typed. */
export function directoryStart(email: string, next = '/start'): string {
  return `/api/sso/start?email=${encodeURIComponent(email.trim())}&next=${encodeURIComponent(next)}`
}

/** LinkedIn's button says who it is for, because it is not a door to a company with colleagues. */
export const LINKEDIN_DOOR_SAYS = 'For workers and one-person firms.'

// ── The email first, then only its door (founder, 2026-11-12) ─────────

/** The heading of the first screen, and its two buttons, Create first. */
export const WELCOME = 'Welcome to Etyme'
export const CREATE_ACCOUNT = 'Create your account'
export const SIGN_IN = 'Sign in'

/** A door the second screen may draw. `directory` is never drawn beside another. */
export type SignInDoor = 'directory' | 'google' | 'microsoft' | 'linkedin' | 'password'

export interface DoorsQuestion {
  /** The address's domain, lowercased, or null where it has none. */
  domain: string | null
  /** A consumer provider's address (gmail.com and the rest): a person, never a company. */
  publicAddress: boolean
  /**
   * The company whose verified domain the address is on, with its sign-in
   * mode and the issuers of its directories that are turned on. Read from
   * the domain, never from whether the address has an account.
   */
  domainCompany: { mode: 'SSO_ONLY' | 'INVITE_ONLY' | 'HYBRID' | null; issuers: readonly string[] } | null
  /** The providers this deployment holds keys for (NextAuth ids). */
  configured: ReadonlySet<string>
}

export interface DoorsAnswer {
  doors: SignInDoor[]
  /** A sentence where no door can be drawn. */
  says?: string
}

const GOOGLE_MAIL = new Set(['gmail.com', 'googlemail.com'])
const MICROSOFT_MAIL = new Set(['hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com'])

/** Said where a directory-only company has no directory turned on yet. Names nobody. */
export const NO_DIRECTORY_YET =
  'Your company signs in through its own directory, and it is not turned on yet. Ask your company\u2019s IT.'

/**
 * Which doors the second screen draws for one address.
 *
 * The email is routing, never proof: it only decides what is drawn, and
 * who the person is comes from the door. It is decided from the address's
 * domain and that domain's company alone, so an unknown address is shown
 * exactly the doors a known one is and nobody learns who is on Etyme by
 * typing addresses.
 *
 *  - A domain whose company has a directory turned on: that directory and
 *    nothing else; the page goes straight to it.
 *  - A directory-only domain with no directory turned on: no door, one
 *    sentence. Never a password.
 *  - Everybody else: the password, Google and Microsoft where this
 *    deployment holds their keys (a Gmail address is offered Google, an
 *    Outlook address Microsoft, another public address neither), and
 *    LinkedIn for a public address, the door for workers and one-person
 *    firms.
 */
export function doorsFor(q: DoorsQuestion): DoorsAnswer {
  const co = q.domainCompany
  if (!q.publicAddress && co) {
    if (co.issuers.length > 0) return { doors: ['directory'] }
    if (co.mode === 'SSO_ONLY') return { doors: [], says: NO_DIRECTORY_YET }
  }
  const d = q.domain ?? ''
  const doors: SignInDoor[] = []
  const work = !q.publicAddress
  if (q.configured.has('google') && (work || GOOGLE_MAIL.has(d))) doors.push('google')
  if (q.configured.has('azure-ad') && (work || MICROSOFT_MAIL.has(d))) doors.push('microsoft')
  if (q.configured.has('linkedin') && q.publicAddress) doors.push('linkedin')
  doors.push('password')
  return { doors }
}

/** Where "Create your account" goes, carrying the address so it is typed once. */
export function signUpWith(email: string): string {
  const e = email.trim()
  return e ? `/signup?email=${encodeURIComponent(e)}` : '/signup'
}

/** A plain address check, before anything is asked. */
export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

/**
 * How many times one caller may ask which doors to draw in a minute. The
 * answer reveals no account, so this only stops the route being used to
 * read a domain's sign-in mode at volume. Kept per server instance.
 */
export const DOOR_ASKS_PER_MINUTE = 30

export function tooManyDoorAsks(seen: readonly number[], now: number): boolean {
  return seen.filter((t) => now - t < 60_000).length >= DOOR_ASKS_PER_MINUTE
}
