/**
 * The password door's rules, with no database in them.
 *
 * Decided by the founder, 2026-10-08 (CLAUDE.md, "A password door, until
 * the single sign-on keys exist"): a company signs up with a work email, a
 * password and an Etyme address; a candidate with an email and a password.
 * The Microsoft and Google doors stay and win when their keys arrive.
 *
 * What is here, and why each is a rule rather than a preference:
 *
 *   - A password is twelve characters or more, and not the obvious thing.
 *     The refusal says what makes it weak, because "invalid password"
 *     sends somebody to guess.
 *   - It is stored as an argon2id hash, slow on purpose, and the function
 *     that makes the hash is the only thing that ever sees the password.
 *   - A link in an email is a random token. Only its SHA-256 is kept, so a
 *     copy of the table opens nobody's account.
 *   - Five wrong tries for one email or one network address in fifteen
 *     minutes and the door waits a minute, said in a sentence.
 *   - A wrong password and an unknown email get the same sentence, so the
 *     door never tells a stranger who has an account.
 *   - The Etyme address is the subdomain rule the custom-address form
 *     already holds (`checkSubdomain`), capped at forty characters and
 *     never one of the demo world's prefixes.
 */

import { createHash, randomBytes } from 'node:crypto'
import { checkSubdomain, RESERVED_SUBDOMAINS } from '@/lib/domains-owned'
import { reservedAddress } from '@/lib/demo-session'

export * from '@/lib/password-words'
import { SUPERSEDED } from '@/lib/password-words'

// ── Passwords ─────────────────────────────────────────────────────────

export const MIN_PASSWORD = 12

/** Words a password may not contain, whatever is around them. */
const OBVIOUS = ['password', 'passw0rd', 'qwerty', '123456', 'letmein', 'etyme', 'welcome']

/**
 * Why a password is weak, in a sentence, or null when it is not.
 *
 * Checked against what the person typed on the same form — their email
 * and, for a company, its name — because those are the first guesses
 * anybody makes.
 */
export function weakPasswordReason(
  password: string,
  about: { email?: string | null; companyName?: string | null } = {},
): string | null {
  const p = String(password ?? '')
  if (p.length < MIN_PASSWORD) {
    return `Use at least ${MIN_PASSWORD} characters. This one has ${p.length}.`
  }
  const lower = p.toLowerCase()

  const email = (about.email ?? '').trim().toLowerCase()
  const local = email.split('@')[0] ?? ''
  if (email && (lower.includes(email) || (local.length >= 4 && lower.includes(local)))) {
    return 'Do not use your email address in your password.'
  }

  const name = (about.companyName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (name.length >= 4 && lower.replace(/[^a-z0-9]/g, '').includes(name)) {
    return 'Do not use the company name in your password.'
  }

  const word = OBVIOUS.find((w) => lower.includes(w))
  if (word) return `Do not use "${word}" in your password. It is one of the first guesses.`

  if (/(.)\1{3,}/.test(p)) {
    return 'Do not repeat one character four times in a row.'
  }
  if (new Set(p).size < 5) {
    return 'Use more different characters. This one repeats a few over and over.'
  }
  return null
}

/**
 * The hash, argon2id, with the library's defaults (64 MiB, three passes).
 *
 * Imported lazily so the pure rules above load in a test or a screen
 * without the native module.
 */
export async function hashPassword(password: string): Promise<string> {
  const argon2 = await import('argon2')
  return argon2.hash(password, { type: argon2.argon2id })
}

export async function passwordMatches(hash: string | null | undefined, password: string): Promise<boolean> {
  const argon2 = await import('argon2')
  if (!hash) {
    // Spend the same time as a real check, so how long the door takes to
    // answer does not say whether the account exists.
    await argon2.verify(DUMMY_HASH, password).catch(() => false)
    return false
  }
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}

/** A real argon2id hash of a random string nobody knows. Used only to spend time. */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$qIWPh5JsG44uoYGiW27cEQ$OFpDwwfoaClYFh5PG9fwwa5P8uVmVWvI/a3lKSvUGoM'

// ── The sentences the door says ───────────────────────────────────────

/** One sentence for a wrong password and for an email nobody signed up with. */
export const NO_MATCH = 'That email and password do not match.'

/** Prefix on the refusal for an unverified address, so the page can offer the link again. */
export const UNVERIFIED_CODE = 'UNVERIFIED'

export function unverifiedSentence(email: string): string {
  return `Confirm your email first. We sent a link to ${email}.`
}

/**
 * Whether an email belongs to the demo world: a domain nobody can register
 * (.example, .invalid, .local) or any demo.etyme host. Such a person is
 * reached through the demo door and nothing else.
 */
export function demoEmail(email: string): boolean {
  const e = String(email ?? '').trim().toLowerCase()
  const domain = e.slice(e.lastIndexOf('@') + 1)
  if (!e.includes('@') || !domain) return false
  return reservedAddress(e) || domain.startsWith('demo.etyme.') || domain === 'demo.etyme'
}

/** What the sign-up form says whatever happened, so it never tells a stranger who is registered. */
export function checkYourEmail(email: string): string {
  return `Check your email. We sent a link to ${email}. It works for 24 hours.`
}

// ── One-time links ────────────────────────────────────────────────────

export const VERIFY_HOURS = 24
export const RESET_HOURS = 1

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** A fresh token and the hash that is stored for it. The token itself is only ever in the email. */
export function newToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashToken(token) }
}

export function expiresAfter(hours: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000)
}

export type TokenVerdict = { ok: true } | { ok: false; reason: 'USED' | 'EXPIRED' | 'UNKNOWN' | 'SUPERSEDED'; says: string }

/**
 * Whether a stored link still works: not used, not past its time, and the
 * newest for its email. A newer link kills the older ones when it is sent,
 * and the older one says so rather than "already used".
 */
export function tokenUsable(
  row: { usedAt: Date | null; expiresAt: Date; supersededAt?: Date | null } | null,
  purpose: 'VERIFY' | 'RESET',
  now: Date = new Date(),
): TokenVerdict {
  const again =
    purpose === 'VERIFY'
      ? 'Sign up again with the same email and we send a new one.'
      : 'Ask for a new one on the reset page.'
  if (!row) return { ok: false, reason: 'UNKNOWN', says: `This link does not work. ${again}` }
  if (row.supersededAt) return { ok: false, reason: 'SUPERSEDED', says: SUPERSEDED }
  if (row.usedAt) return { ok: false, reason: 'USED', says: `This link was already used. ${again}` }
  if (row.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'EXPIRED', says: `This link has expired. ${again}` }
  }
  return { ok: true }
}

// ── Slowing the door ──────────────────────────────────────────────────

export const FAILURE_WINDOW_MS = 15 * 60 * 1000
export const FAILURES_ALLOWED = 5
export const WAIT_MS = 60 * 1000

/**
 * How many seconds the door makes somebody wait, or zero.
 *
 * Five failures for one email, or for one network address, inside fifteen
 * minutes, and the door waits a minute from the latest. Counted for each
 * separately, because an attacker trying one password on many emails
 * shows up on the address and one trying many passwords on one email
 * shows up on the email.
 */
export function secondsToWait(
  failures: { byEmail: Date[]; byIp: Date[] },
  now: Date = new Date(),
): number {
  const wait = (times: Date[]) => {
    const recent = times.filter((t) => now.getTime() - t.getTime() < FAILURE_WINDOW_MS)
    if (recent.length < FAILURES_ALLOWED) return 0
    const latest = Math.max(...recent.map((t) => t.getTime()))
    const left = latest + WAIT_MS - now.getTime()
    return left > 0 ? Math.ceil(left / 1000) : 0
  }
  return Math.max(wait(failures.byEmail), wait(failures.byIp))
}

export function waitSentence(seconds: number): string {
  return `Too many tries. Wait ${seconds} second${seconds === 1 ? '' : 's'}, then try again.`
}

// ── The Etyme address ─────────────────────────────────────────────────

export const ADDRESS_MAX = 40

/** Prefixes the seeded demo world uses. A real company never holds one. */
const DEMO_PREFIXES = ['world-', 'demo-']

export interface AddressVerdict {
  ok: boolean
  value: string | null
  says: string
}

/**
 * Whether somebody may have this Etyme address.
 *
 * The subdomain rule the custom-address form already holds, and two more:
 * forty characters at most, and never a name the demo world could use.
 */
export function checkAddress(raw: string, taken: Set<string>): AddressVerdict {
  const value = String(raw ?? '').trim().toLowerCase()
  if (value.length > ADDRESS_MAX) {
    return { ok: false, value: null, says: `Too long. Use ${ADDRESS_MAX} characters or fewer.` }
  }
  if (DEMO_PREFIXES.some((p) => value.startsWith(p))) {
    return { ok: false, value: null, says: 'Addresses that start with world- or demo- are kept for the demo.' }
  }
  if (RESERVED_SUBDOMAINS.has(value)) {
    return { ok: false, value: null, says: `${value} is kept for Etyme. Try your company's name, like brookfield.` }
  }
  const v = checkSubdomain(value, taken)
  return { ok: v.ok, value: v.value, says: v.reason }
}

/** The next free numbered address, for the rare case two people verified one name in the same minute. */
export function numberedAddress(value: string, taken: Set<string>): string {
  for (let i = 2; ; i++) {
    const suffix = `-${i}`
    const candidate = value.slice(0, ADDRESS_MAX - suffix.length) + suffix
    if (!taken.has(candidate)) return candidate
  }
}

// ── Who the person is ─────────────────────────────────────────────────

/** Emails are compared lowercase and trimmed everywhere on this door. */
export function cleanEmail(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase()
}

export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
