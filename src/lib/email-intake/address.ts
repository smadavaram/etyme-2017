/**
 * The one forwarding address a company has, and how a message finds it.
 *
 * `<label>-<token>@in.etyme.com`. The label is the company's slug, there
 * so the person writing the mail rule can see whose address it is; it
 * decides nothing. The token is twenty characters of base32 from the
 * operating system's random source (100 bits), shown once to the Owner or
 * Admin who made it and stored only as a SHA-256 hash. A message is
 * matched by hashing the token it was sent to and looking the hash up, so
 * the table can recognize an address and can never produce one.
 *
 * Pure: no database, so a test can hold the whole rule.
 */
import { createHash, randomBytes } from 'node:crypto'

/** The receiving subdomain. Its MX record points at the mail provider. */
export const INTAKE_DOMAIN = 'in.etyme.com'

/** Characters in the random half: 20 × 5 bits = 100 bits. */
export const TOKEN_LENGTH = 20

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567'

/** Twenty random base32 characters. Never Math.random. */
export function mintToken(): string {
  const bytes = randomBytes(TOKEN_LENGTH)
  let out = ''
  for (let i = 0; i < TOKEN_LENGTH; i++) out += BASE32[bytes[i] & 31]
  return out
}

/** What is stored in place of the token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token.toLowerCase(), 'utf8').digest('hex')
}

/** The last four characters, for a person telling two addresses apart. */
export function tokenHint(token: string): string {
  return token.slice(-4)
}

/** The readable half, from the company's slug: lowercase letters, digits and single hyphens, at most 24. */
export function labelFor(slug: string): string {
  const clean = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24)
    .replace(/-$/, '')
  return clean || 'company'
}

export function addressFor(label: string, token: string): string {
  return `${label}-${token}@${INTAKE_DOMAIN}`
}

export interface ParsedAddress {
  label: string
  token: string
  tokenHash: string
  /** The address with the token cut to its last four, safe to write down. */
  hint: string
}

/**
 * Read an address a message was sent to. Null for anything that is not
 * exactly an intake address: another domain, no token, a token of the
 * wrong length or alphabet. Case does not matter in a mailbox name.
 */
export function parseAddress(raw: string): ParsedAddress | null {
  const address = (raw.match(/<([^>]+)>/)?.[1] ?? raw).trim().toLowerCase()
  const at = address.lastIndexOf('@')
  if (at < 1) return null
  if (address.slice(at + 1) !== INTAKE_DOMAIN) return null
  const local = address.slice(0, at)
  const dash = local.lastIndexOf('-')
  if (dash < 1) return null
  const label = local.slice(0, dash)
  const token = local.slice(dash + 1)
  if (token.length !== TOKEN_LENGTH || !/^[a-z2-7]+$/.test(token)) return null
  if (!/^[a-z0-9-]+$/.test(label)) return null
  return {
    label,
    token,
    tokenHash: hashToken(token),
    hint: `${label}-…${tokenHint(token)}@${INTAKE_DOMAIN}`,
  }
}

/**
 * Every intake address among the recipients, once each. A message copied
 * to two intake addresses carries both, and the caller refuses it if they
 * belong to two companies.
 */
export function intakeAddressesIn(recipients: readonly string[]): ParsedAddress[] {
  const seen = new Map<string, ParsedAddress>()
  for (const r of recipients) {
    const p = typeof r === 'string' ? parseAddress(r) : null
    if (p && !seen.has(p.tokenHash)) seen.set(p.tokenHash, p)
  }
  return [...seen.values()]
}
