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
