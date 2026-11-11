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

/** The sentence under the heading. It names only doors that are drawn. */
export function loginSubtitle(available: KnownDoors): string {
  const names = companyAccounts(available)
  return names.length
    ? `Sign in with your email and password, or your company’s ${names.join(' or ')} account.`
    : 'Sign in with your email and password.'
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
