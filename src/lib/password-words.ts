/**
 * The password door's sentences and the two path rules a page needs, with
 * no server import, so a page drawn in the browser can read them without
 * pulling the hashing and the token code into the bundle. It reads only
 * plain modules (company defaults, setup's country list, the consumer
 * domain list). `lib/password` re-exports what it needs from here.
 */
import { countryFromDomain } from '@/lib/company-defaults'
import { COUNTRIES, currencyFor, countryGuessSentence } from '@/lib/setup-steps'
import { isConsumerDomain } from '@/lib/company-domains'


/** Without an email sender nobody can prove a mailbox, so these doors say so before any form. */
export const SIGNUP_SHUT = 'Sign-up is off on this deployment until an email sender is set up.'
export const RESET_SHUT = 'Password reset is off on this deployment until an email sender is set up.'

/** A seeded demo person never gets a password (round one of the sign-up walk, item 46). */
export const DEMO_REFUSAL =
  'This address belongs to the Etyme demo. A demo seat opens only from the demo page, never with a password.'

/** Prefix on a refusal for an address that is already confirmed, so the link page can offer Sign in. */
export const CONFIRMED_CODE = 'CONFIRMED'
export const ALREADY_CONFIRMED = 'Your email is already confirmed. Sign in.'

/**
 * What a newer link does to an older one, said where the older one is
 * opened. Says nothing about email, because the staff bootstrap reissues
 * a link by hand and nothing is emailed then.
 */
export const SUPERSEDED = 'A newer link replaced this one. Use the newest link you were given.'

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
  return `You are in ${company} as Member. Your owner has been told; you will see more once they give you a role.`
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

// ── The address, the country and the currency, guessed at sign-up ────
//
// The onboarding walk of 2026-10-27: the company form asked for an Etyme
// address with an empty box and started every firm in the United States,
// while the Microsoft and Google door guessed both. The form now guesses
// the same way, says each is a guess, and a person changes any of them.

/** Etyme addresses are at most forty characters. */
export const ADDRESS_MAX = 40

/**
 * A company's name as an Etyme address: lower case, letters and digits
 * joined by single hyphens, at most forty characters. Null where nothing
 * of three characters or more is left. The one rule, read by the sign-up
 * form and by the door that checks the address (lib/password).
 */
export function addressFromName(name: string | null | undefined): string | null {
  const v = String(name ?? '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ADDRESS_MAX)
    .replace(/-+$/, '')
  return v.length >= 3 ? v : null
}

export interface SignUpGuesses {
  /** The address suggested from the company's name, or null. */
  address: string | null
  /** Two letters, always one the form offers. */
  country: string
  currency: string
  /** The guess said as a guess, under the country. Null before an email is typed. */
  says: string | null
}

/**
 * What the company form fills in for a person, from the work email and
 * the company's name. The country follows the web address the way the
 * Microsoft and Google door reads it (`countryFromDomain`), the currency
 * follows the country, and the address follows the name. A guess is only
 * a starting point: the form stops replacing a field once the person has
 * changed it.
 */
export function signUpGuesses(email: string, companyName: string): SignUpGuesses {
  const at = email.lastIndexOf('@')
  const raw = at > 0 ? email.slice(at + 1).trim().toLowerCase() : ''
  const domain = raw.includes('.') && !isConsumerDomain(raw) ? raw : null
  const guessed = countryFromDomain(domain)
  const country = COUNTRIES.some((c) => c.code === guessed) ? guessed : 'US'
  return {
    address: addressFromName(companyName),
    country,
    currency: currencyFor(country),
    says: raw.includes('.') ? countryGuessSentence(country, domain) : null,
  }
}

// ── Where no email can be sent ───────────────────────────────────────
//
// Decided 2026-10-27 (coordinator, after the onboarding walk): a
// deployment with no email key keeps sign-up open, and the confirmation
// link is kept on the notice for Etyme staff to pass on
// (`recordedBody` in lib/notify/account-mail). The page and the answer
// say so, rather than "check your email" for an email that never left.

/** Said on the sign-up page, above the form, where no email can leave this deployment. */
export const NO_EMAIL_HERE =
  'This deployment cannot send email yet. You can still sign up: your confirmation link is kept with Etyme staff, who pass it on to you.'

/** The answer after signing up where no email could be sent. */
export function linkWithStaff(email: string): string {
  return `No email could be sent from here, so the link for ${email} is kept with Etyme staff. They pass it on to you; it works for 24 hours.`
}
