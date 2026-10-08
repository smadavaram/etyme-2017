/**
 * The password door's sentences and the two path rules a page needs, with
 * no imports at all, so a page drawn in the browser can read them without
 * pulling the hashing and the token code into the bundle. `lib/password`
 * re-exports everything here.
 */

/** Without an email sender nobody can prove a mailbox, so these doors say so before any form. */
export const SIGNUP_SHUT = 'Sign-up is off on this deployment until an email sender is set up.'
export const RESET_SHUT = 'Password reset is off on this deployment until an email sender is set up.'

/** A seeded demo person never gets a password (round one of the sign-up walk, item 46). */
export const DEMO_REFUSAL =
  'This address belongs to the Etyme demo. A demo seat opens only from the demo page, never with a password.'

/** Prefix on a refusal for an address that is already confirmed, so the link page can offer Sign in. */
export const CONFIRMED_CODE = 'CONFIRMED'
export const ALREADY_CONFIRMED = 'Your email is already confirmed. Sign in.'

/** What a newer link does to an older one, said where the older one is opened. */
export const SUPERSEDED = 'A newer link was sent to this email. Use the link in the newest email.'

/**
 * The opening of the email to somebody a firm put on the record, who
 * never set a password, when they sign up. Names the firm, because "a
 * company" tells a person nothing about why the mail came (sign-up walk,
 * round two, item 33).
 */
export function firmAddedYou(firm: string | null | undefined): string {
  return `${firm?.trim() || 'A company'} added you to its bench. Confirm your email to sign in.`
}

/** The opening of the email to somebody already on the record who signed up a company of their own: a candidate becoming a one-person firm. */
export function soloFromCandidate(company: string, keepsPassword: boolean): string {
  return `Confirm your email to set up ${company} as your own company on Etyme.` +
    (keepsPassword ? ' You sign in with the password you already use.' : '')
}

/** What a colleague reads once they are seated as Member. */
export function memberWelcome(company: string): string {
  return `You are in ${company} as Member. Your owner has been told; you will see more once they give you a desk.`
}

/**
 * What the sign-up form says when the email belongs at a company already
 * here. `companys` is the name's possessive, made by `possessive` in
 * lib/requisition-approval ("Walk Co's", "Kestrel Works'"), passed in so
 * this file keeps no imports.
 */
export function colleagueSentence(address: string, companys: string): string {
  return `${address} is ${companys} address. You will join it as Member once you confirm your email.`
}

/**
 * Where to go after signing in, when a page asked. Only a path on this
 * site: never another host, so a link cannot send somebody away.
 */
export function safeNext(raw: unknown): string | null {
  const v = typeof raw === 'string' ? raw.trim() : ''
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return null
  if (/[\r\n]/.test(v)) return null
  return v
}

/** The claim token in a `/claim/<token>` path, or null. */
export function claimTokenIn(path: string | null | undefined): string | null {
  const m = String(path ?? '').match(/^\/claim\/([A-Za-z0-9_-]+)\/?$/)
  return m ? m[1] : null
}


/**
 * What the password field says under it. A candidate has no company, so
 * their hint names none (sign-up walk, round two, item 22).
 */
export const PASSWORD_HINT_COMPANY = 'At least 12 characters. Not your email or the company name.'
export const PASSWORD_HINT_PERSON = 'At least 12 characters. Not your email.'

/**
 * A sentence shown under a heading that already says its first words.
 * "Check your email" as the heading and again as the first line read as
 * a stutter (round two, item 2), so the line drops what the heading said.
 */
export function underHeading(heading: string, says: string): string {
  const lead = heading.trim().replace(/\.$/, '')
  return says.startsWith(`${lead}. `) ? says.slice(lead.length + 2) : says
}
