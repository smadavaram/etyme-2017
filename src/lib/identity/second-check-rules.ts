import { OWNER_ROLE, onlyAnOwner, liveOwners, type Seat, type Verdict } from '@/lib/owner-rules'
import { SAYS, FIRST_FACTOR_MINUTES, FAILURES_ALLOWED } from '@/lib/identity/second-check-words'

/**
 * The second check, as rules with no database in them (Layer 7, slice S1
 * and S6; record 86, answers 2, 3 and 5).
 *
 * A second check is a check before one act, inside Etyme: a passkey first,
 * an authenticator app as the fallback. It is never a second step of
 * signing in, and nothing here or on a screen calls it that.
 *
 * - Each act asks for its own check, and a check is never reused across
 *   acts (answer 2). A check passed hands back a proof bound to the act
 *   and its subject, good for two minutes and spent once.
 * - A first passkey or app needs a sign-in within the last 15 minutes, so
 *   an idle stolen session cannot plant one. Each later one needs a check
 *   with one already held.
 * - A lost device is reset by another Owner, never by the person herself,
 *   and never by an Admin (answer 5). At a company with one Owner the
 *   reset is Etyme's recovery act, which is not built yet; the sentence
 *   says so.
 */

export * from '@/lib/identity/second-check-words'

// ── Who may add one ──────────────────────────────────────────────────

/**
 * May this person add a passkey or an authenticator app now? Pure.
 * `liveFactors` counts passkeys not removed and apps confirmed and not
 * removed. `authAt` is when this session signed in, in milliseconds, or
 * null where the session does not say. `spentProof` is true where the
 * caller already spent a proof for `second_check.add`.
 */
export function mayAddFactor(i: { keySet: boolean; liveFactors: number; authAt: number | null; spentProof: boolean; now: Date }): Verdict {
  if (!i.keySet) return { ok: false, says: SAYS.notReady }
  if (i.liveFactors > 0) return i.spentProof ? { ok: true } : { ok: false, says: SAYS.checkFirst }
  const at = i.authAt
  const fresh = at !== null && Number.isFinite(at) && i.now.getTime() - at <= FIRST_FACTOR_MINUTES * 60_000 && at <= i.now.getTime() + 60_000
  return fresh ? { ok: true } : { ok: false, says: SAYS.signInAgain }
}

/** Whether a person has waited out her failures. Pure: the failures in the window, counted by the caller. */
export function mustWait(failuresInWindow: number): boolean {
  return failuresInWindow >= FAILURES_ALLOWED
}

// ── A lost device ────────────────────────────────────────────────────

/**
 * May `actor` reset `subject`'s second check at this company? Pure.
 * Nobody resets their own. Only an Owner resets, and never an Admin. An
 * Owner's is reset by another Owner. The only Owner's own is Etyme's
 * recovery act, which is not built yet, and the sentence says so.
 */
export function mayResetSecondCheck(i: { actor: Seat | null; subject: Seat | null; seats: readonly Seat[]; companyName: string }): Verdict {
  const { actor, subject } = i
  if (!actor || !subject) return { ok: false, says: `That person holds no seat at ${i.companyName}.` }
  if (actor.personId === subject.personId) return { ok: false, says: ownResetSays(i.seats, actor, i.companyName) }
  const subjectIsOwner = subject.roleName === OWNER_ROLE
  if (actor.roleName !== OWNER_ROLE || !actor.live) {
    return { ok: false, says: onlyAnOwner(subjectIsOwner ? 'resets an Owner’s second check' : 'resets a second check') }
  }
  return { ok: true }
}

/** What a person reads when she asks to reset her own. Pure. */
export function ownResetSays(seats: readonly Seat[], me: Pick<Seat, 'personId'>, companyName: string): string {
  const others = liveOwners(seats).filter((s) => s.personId !== me.personId)
  if (others.length > 0) {
    return `Nobody resets their own second check. Ask another Owner at ${companyName}: ${others.map((s) => s.name).join(', ')}.`
  }
  return (
    `Nobody resets their own second check, and you are the only Owner at ${companyName}. ` +
    'Then it is Etyme’s recovery act, which is not built yet. Write to support@etyme.com.'
  )
}

// ── Where a passkey belongs ──────────────────────────────────────────

/**
 * The relying party a passkey is made for, from the address the page was
 * opened at. Under the platform's own domain every tenant address shares
 * one (etyme.com), so a passkey works at any of them. Anywhere else (a
 * preview address, this machine) it is the host itself. Pure.
 */
export function relyingParty(origin: string, platformHost: string): { rpID: string; origin: string } {
  const u = new URL(origin)
  const host = u.hostname.toLowerCase()
  const root = platformHost.toLowerCase().replace(/^\.+/, '')
  const rpID = host === root || host.endsWith(`.${root}`) ? root : host
  return { rpID, origin: u.origin }
}
