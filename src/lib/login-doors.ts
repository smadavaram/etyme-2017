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
    case 'CredentialsSignin':
      return null
    default:
      return 'That sign-in did not go through. Try again, or sign in with your email and password.'
  }
}
