/**
 * Whether an address is at a domain nobody can register.
 *
 * Its own file, with no import at all, because pages drawn in the browser
 * read it (Contacts, through lib/contacts) and `lib/demo-session`, where
 * it lived, signs cookies with `node:crypto`, which no browser bundle can
 * hold. The release build of 2026-11-13 failed on exactly that chain.
 * `lib/demo-session` re-exports both names, so every older import stands.
 */

/** The suffixes a signed demo cookie may name. None of them can be bought. */
export const RESERVED_SUFFIXES = ['.invalid', '.example', '.local'] as const

/**
 * Checked on the last label so that `somebody@example.com` — a real,
 * buyable domain whose name merely contains the word — is refused. It
 * ends in `.com`.
 */
export function reservedAddress(email: string): boolean {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase()
  if (!email.includes('@') || domain.length === 0) return false
  return RESERVED_SUFFIXES.some((suffix) => domain.endsWith(suffix))
}
