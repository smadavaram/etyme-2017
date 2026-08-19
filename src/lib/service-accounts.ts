import { createHash, randomBytes, timingSafeEqual, createHmac } from 'crypto'

/**
 * Keys for machines, and signatures for what they receive.
 *
 * Integrations need an identity of their own. Giving one a person's
 * account is how a leaver's departure breaks the nightly ERP feed — or
 * worse, does not, and their access outlives them by two years.
 *
 * The posture matches the one already applied to people: scoped, expiring
 * by default, last use recorded. A key nobody has used in three months is
 * exposure rather than integration, and the only way to know that is to
 * write down when it was last used.
 */

/** Recognisable at a glance in a log or a config file. */
const PREFIX = 'etyk_'

export interface NewKey {
  /** Shown once. Never recoverable. */
  key: string
  /** What is stored. */
  hash: string
  /** The first characters, so two keys can be told apart in a list. */
  prefix: string
}

/**
 * Mint a key.
 *
 * Only the hash is kept. A system that can show you a key again is one
 * that can be made to show it to somebody else, and the cost of that
 * design is one support conversation per lost key against every key at
 * once.
 */
export function mintKey(): NewKey {
  const secret = randomBytes(32).toString('base64url')
  const key = `${PREFIX}${secret}`
  return {
    key,
    hash: hashKey(key),
    // Enough to identify, far too little to use.
    prefix: key.slice(0, PREFIX.length + 6),
  }
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

/**
 * Compare in constant time.
 *
 * A plain === leaks how much of the key was right through how long the
 * comparison took. It is a small leak and an old one, and avoiding it
 * costs one function call.
 */
export function keyMatches(presented: string, storedHash: string): boolean {
  const a = Buffer.from(hashKey(presented), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function looksLikeKey(value: string): boolean {
  return value.startsWith(PREFIX) && value.length > PREFIX.length + 20
}

// ── Whether a key may be used ─────────────────────────────────────────

export interface KeyState {
  revokedAt: Date | null
  expiresAt: Date | null
  permissions: string[]
}

export interface KeyVerdict {
  usable: boolean
  reason: string
}

/**
 * Refusals say which of the three it is, because they lead to different
 * work: a revoked key is somebody's decision, an expired one needs
 * renewing, and a key with no permissions was never finished.
 */
export function checkKey(state: KeyState, now: Date): KeyVerdict {
  if (state.revokedAt) {
    return { usable: false, reason: 'This key was revoked. Ask for a new one.' }
  }
  if (state.expiresAt && state.expiresAt.getTime() < now.getTime()) {
    return {
      usable: false,
      reason: `This key expired on ${state.expiresAt.toISOString().slice(0, 10)}. Renewing it is a click for whoever issued it.`,
    }
  }
  if (state.permissions.length === 0) {
    return { usable: false, reason: 'This key has no permissions, so there is nothing it can do.' }
  }
  return { usable: true, reason: 'Valid' }
}

/**
 * How long a key should run.
 *
 * Shorter where it can change things. A read-only feed for a dashboard is
 * a different risk from a key that can record payments, and giving both a
 * year is pretending otherwise.
 */
export function suggestedDurationDays(permissions: string[]): number {
  const writes = permissions.some((p) => p.endsWith('.write') || p.endsWith('.issue') ||
    p.endsWith('.manage') || p.endsWith('.record') || p.endsWith('.approve') || p === '*')
  return writes ? 90 : 365
}

export interface Review {
  finding: 'EXPIRED' | 'EXPIRING' | 'NEVER_USED' | 'DORMANT' | 'OK'
  detail: string
}

/**
 * Whether a key is still doing a job.
 *
 * Never used is the loudest: it means an integration was set up and either
 * abandoned or never finished, and the key has been sitting there since.
 */
export function reviewKey(
  k: { createdAt: Date; lastUsedAt: Date | null; expiresAt: Date | null },
  now: Date
): Review {
  const days = (d: Date) => Math.floor((now.getTime() - d.getTime()) / 86_400_000)

  if (k.expiresAt && k.expiresAt.getTime() < now.getTime()) {
    return { finding: 'EXPIRED', detail: `Expired ${days(k.expiresAt)} days ago and still on file.` }
  }
  if (!k.lastUsedAt) {
    const age = days(k.createdAt)
    if (age >= 14) {
      return {
        finding: 'NEVER_USED',
        detail: `Issued ${age} days ago and never used. Either the integration was never finished, or it is finished and pointed somewhere else.`,
      }
    }
    return { finding: 'OK', detail: 'Issued recently, not used yet.' }
  }
  const idle = days(k.lastUsedAt)
  if (idle >= 90) {
    return { finding: 'DORMANT', detail: `Last used ${idle} days ago. Held but not doing anything.` }
  }
  if (k.expiresAt) {
    const left = Math.ceil((k.expiresAt.getTime() - now.getTime()) / 86_400_000)
    if (left <= 21) {
      return { finding: 'EXPIRING', detail: `Expires in ${left} days. The feed stops that morning unless it is renewed.` }
    }
  }
  return { finding: 'OK', detail: `Last used ${idle} day${idle === 1 ? '' : 's'} ago.` }
}

// ── Signing what we send ──────────────────────────────────────────────

/**
 * Sign a webhook payload.
 *
 * The receiver has an open endpoint on the internet; without a signature
 * they cannot tell our delivery from anybody else's POST, and an
 * integration that acts on unverified input is a way into their ERP.
 *
 * The timestamp is inside the signed material so an old, genuine payload
 * cannot be replayed later.
 */
export function sign(payload: string, secret: string, timestamp: number): string {
  const signed = `${timestamp}.${payload}`
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(signed).digest('hex')}`
}

export function verifySignature(
  payload: string,
  header: string,
  secret: string,
  now: number,
  toleranceSeconds = 300
): { valid: boolean; reason: string } {
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const [k, ...v] = p.split('=')
      return [k.trim(), v.join('=')]
    })
  )
  const t = Number(parts.t)
  const given = String(parts.v1 ?? '')

  if (!Number.isFinite(t) || !given) {
    return { valid: false, reason: 'Signature header is malformed' }
  }
  if (Math.abs(now - t) > toleranceSeconds) {
    return { valid: false, reason: 'Signature is outside the accepted time window' }
  }

  const expected = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(given, 'hex')
  if (a.length !== b.length) return { valid: false, reason: 'Signature does not match' }
  return {
    valid: timingSafeEqual(a, b),
    reason: timingSafeEqual(a, b) ? 'Valid' : 'Signature does not match',
  }
}

// ── Retrying a delivery ───────────────────────────────────────────────

/**
 * When to try again.
 *
 * Backing off rather than hammering, because a receiver that is down comes
 * back sooner if it is not also being flooded. Six attempts spans about
 * two hours, which covers a deploy and a short outage.
 */
export const MAX_ATTEMPTS = 6

export function nextAttemptDelaySeconds(attempt: number): number {
  // 30s, 2m, 8m, 30m, 2h — then give up.
  const ladder = [30, 120, 480, 1800, 7200]
  return ladder[Math.min(attempt - 1, ladder.length - 1)]
}

export function shouldRetry(statusCode: number | null, attempt: number): { retry: boolean; why: string } {
  if (attempt >= MAX_ATTEMPTS) {
    return { retry: false, why: `Gave up after ${MAX_ATTEMPTS} attempts` }
  }
  if (statusCode === null) {
    return { retry: true, why: 'No response — the receiver may be restarting' }
  }
  // A 4xx means the receiver understood and refused. Retrying will not
  // change their mind, and hammering a rejection looks like an attack.
  if (statusCode >= 400 && statusCode < 500 && statusCode !== 408 && statusCode !== 429) {
    return { retry: false, why: `The receiver refused it (${statusCode}) — retrying will not change that` }
  }
  return { retry: true, why: `Received ${statusCode}` }
}
