import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * One implementation of a signed link, for every page a stranger opens.
 *
 * `/packet/[token]`, `/reply/[token]` and now bench invitations all hand
 * somebody a URL that acts on their behalf without an account. Each of
 * them needs the same three things: the payload cannot be edited, a
 * wrong signature is refused in constant time, and a link built for one
 * purpose cannot be replayed against another.
 *
 * It lives here because `reply-link` had it privately and a second copy
 * was about to be written. Two independent HMAC implementations is
 * exactly how one of them ends up weaker — the copy gets a shortcut
 * during a hurry and nothing fails.
 *
 * ── The `kind` prefix ────────────────────────────────────────────────
 *
 * Every payload is signed with a purpose in front of it, so a token that
 * answers a freshness ping cannot be posted to the endpoint that accepts
 * a bench invitation. Same secret, same person, different meaning — and
 * without the prefix the signature would validate.
 */

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('NEXTAUTH_SECRET is required to sign links')
  return s
}

function mac(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('base64url')
}

/**
 * A token carrying these parts, for this purpose.
 *
 * Parts must not contain a colon; ids and enum values do not.
 */
export function sign(kind: string, parts: string[]): string {
  const body = Buffer.from([kind, ...parts].join(':')).toString('base64url')
  return `${body}.${mac(body)}`
}

/**
 * The parts back, or null for anything that is not exactly ours.
 *
 * Null rather than a thrown error, and null for every kind of wrong —
 * a bad signature, a missing secret, a token for a different purpose.
 * A caller that can tell those apart can be used to probe.
 */
export function read(kind: string, token: string | undefined | null): string[] | null {
  if (!token || typeof token !== 'string') return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null

  let expected: string
  try {
    expected = mac(body)
  } catch {
    // No signing secret configured. Refusing is the only safe answer.
    return null
  }

  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const parts = Buffer.from(body, 'base64url').toString('utf8').split(':')
  if (parts.length < 2 || parts[0] !== kind) return null
  return parts.slice(1)
}

/**
 * Where the links point.
 *
 * Absolute, because they are read in a mail client. Empty when nothing
 * says where this deployment lives, and the caller sends no link rather
 * than a broken one.
 */
export function baseUrl(): string {
  const explicit = process.env.NEXTAUTH_URL
  if (explicit) return explicit.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return ''
}
