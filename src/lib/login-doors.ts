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
      return 'Your Microsoft or Google account has not confirmed that email address, so it cannot sign you in here. Sign in with your email and password instead.'
    case 'NoEmail':
      return 'Your Microsoft or Google account did not share an email address, so it cannot sign you in here. Sign in with your email and password instead.'
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
    case 'CredentialsSignin':
      return null
    default:
      return 'That sign-in did not go through. Try again, or sign in with your email and password.'
  }
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
