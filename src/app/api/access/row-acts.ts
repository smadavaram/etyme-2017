/**
 * What a Users & permissions row offers its reader: Pause, Reinstate, End,
 * and on a waiting row Withdraw invitation in their place.
 *
 * A screen walk found the rules at POST /api/access/:contextId and no
 * control on any screen that called them. So the register now says, per
 * row and for this reader, which of the three the route would take, read
 * from `rowActs` in lib/account-lifecycle — the same verdicts the route
 * gives — so an Admin is never offered Pause or End on an Owner, an Owner
 * is offered them on an Admin, and the last Owner is never offered either.
 *
 * Pure: no database. The route reads the seats and hands them here; the
 * page posts what `lifecycleBody` builds.
 */
import { rowActs, stateOf, type AccessRow, type Actor, type AccessState, type Verdict } from '@/lib/account-lifecycle'

export type LifecycleAction = 'suspend' | 'reinstate' | 'revoke'

export interface RowOffer {
  /** Drawn only where true. */
  pause: boolean
  reinstate: boolean
  end: boolean
  /**
   * Withdraw invitation, on a waiting row only (founder, 2026-11-12): a
   * person invited who never signed in has nothing to pause and no access
   * to end, so the row offers this in their place.
   */
  withdraw: boolean
  /**
   * End access, kept behind a waiting row's Withdraw: drawn only once the
   * withdraw route has said the person has history and cannot be removed,
   * because then ending the seat is the one way left.
   */
  endInstead: boolean
  state: AccessState
  /** What Pause, End or Withdraw does, said before somebody presses it. */
  pauseSays: string[]
  endSays: string[]
  withdrawSays: string[]
}

const NOTHING = (state: AccessState): RowOffer => ({
  pause: false, reinstate: false, end: false, withdraw: false, endInstead: false, state, pauseSays: [], endSays: [], withdrawSays: [],
})

/** Who is withdrawing: the Owner rule needs whether they are an Owner, and the self rule who they are. */
export interface Withdrawer extends Actor {
  personId?: string | null
}

/**
 * Whether this reader may withdraw this invitation.
 *
 * The same Owner rule Pause and End use (lib/account-lifecycle): only an
 * Owner acts on an Owner's seat, an Admin never, and there is never no
 * Owner. Nobody withdraws their own seat. A person who has signed in has
 * no invitation left to withdraw; their access is ended instead.
 *
 * Whether the person has history (an approval, a submission, a contract, a
 * week) is the route's to read, because it needs the database; the route
 * refuses on it with `canDeleteOutright`'s sentence and the page then
 * draws End access.
 */
export function withdrawVerdict(target: AccessRow, all: AccessRow[], actor: Withdrawer): Verdict {
  const state = stateOf(target)
  if (actor.personId && target.personId === actor.personId) {
    return { allowed: false, reason: 'This is your own seat. Somebody else here withdraws it.', consequences: [] }
  }
  if (state === 'REVOKED') {
    return { allowed: false, reason: 'Their access has already ended.', consequences: [] }
  }
  if (target.hasSignedIn) {
    return { allowed: false, reason: 'They have signed in, so there is no invitation left to withdraw. End their access instead.', consequences: [] }
  }
  if (target.isOwner) {
    if (!actor.isOwner) {
      return { allowed: false, reason: 'They are invited as an Owner. Only an Owner withdraws an Owner’s invitation. An Admin never can.', consequences: [] }
    }
    const otherOwners = all.filter((r) => r.isOwner && r.contextId !== target.contextId && !r.revokedAt && !r.suspendedAt && r.hasSignedIn).length
    if (otherOwners === 0) {
      return { allowed: false, reason: 'There would be no Owner left. Pass ownership first.', consequences: [] }
    }
  }
  return {
    allowed: true,
    reason: 'Invited, never signed in.',
    consequences: [
      'The invitation is cancelled, and the link in it stops working.',
      'If they were meant to be here, invite them again: the same address gets a fresh invitation and one seat.',
    ],
  }
}

/**
 * Every row's offer, keyed by seat. A reader who cannot change access
 * (no `team.manage`, which the route asks for) is offered nothing on any
 * row; the route would refuse each press.
 */
export function offersFor(all: AccessRow[], actor: Withdrawer, mayManage: boolean): Map<string, RowOffer> {
  const out = new Map<string, RowOffer>()
  for (const row of all) {
    const state = stateOf(row)
    if (!mayManage) { out.set(row.contextId, NOTHING(state)); continue }
    const v = rowActs(row, all, actor)
    // A waiting row: Withdraw invitation in place of Pause and End, with
    // End kept back for the one case the withdraw route refuses on history.
    if (state === 'INVITED') {
      const w = withdrawVerdict(row, all, actor)
      out.set(row.contextId, {
        ...NOTHING(state),
        withdraw: w.allowed,
        withdrawSays: w.allowed ? w.consequences : [],
        endInstead: w.allowed && v.end.allowed,
        endSays: w.allowed && v.end.allowed ? v.end.consequences : [],
      })
      continue
    }
    out.set(row.contextId, {
      ...NOTHING(state),
      pause: v.pause.allowed,
      reinstate: v.reinstate.allowed,
      end: v.end.allowed,
      pauseSays: v.pause.allowed ? v.pause.consequences : [],
      endSays: v.end.allowed ? v.end.consequences : [],
    })
  }
  return out
}

/**
 * The day an "Ends on" field names, as the number of days the grant route
 * takes. The field is a calendar day because "90" means nothing to a
 * person and "March 3" does; the route keeps its own rules on days.
 * Counted on the calendar from today, so March 3 chosen on March 1 is 2.
 */
export function daysUntilEndDay(day: string, now: Date = new Date()): { days: number } | { says: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim())
  if (!m) return { says: 'Pick the day their access ends.' }
  const chosen = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((chosen - today) / 86_400_000)
  if (!Number.isFinite(days)) return { says: 'Pick the day their access ends.' }
  if (days < 1) return { says: 'Pick a day after today. Access cannot end on a day that has already begun.' }
  return { days }
}

/** Today as the date field writes it, for the field's earliest day. */
export function tomorrowField(now: Date = new Date()): string {
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
}

/**
 * A person as a sentence names them on a form: the name, then the sign-in
 * address in brackets where there is one. "Why is Meera Iyer
 * (meera@brightmoor.example) being paused?" An Owner pausing one of two
 * people named alike must be able to tell which.
 */
export function nameWithAddress(name: string, email: string | null | undefined): string {
  return email ? `${name} (${email})` : name
}

/** The questions the route asks for each act: a reason for Pause and End, none for Reinstate. */
export const ASKS: Record<LifecycleAction, readonly ('reason')[]> = {
  suspend: ['reason'],
  revoke: ['reason'],
  reinstate: [],
}

/** What the page posts for an act, from the fields it draws. */
export function lifecycleBody(action: LifecycleAction, typed: { reason?: string }): { action: LifecycleAction; reason: string } {
  return { action, reason: ASKS[action].includes('reason') ? (typed.reason ?? '').trim() : '' }
}

/** The press's label on the page. */
export const ACT_LABEL: Record<LifecycleAction, string> = { suspend: 'Pause', reinstate: 'Reinstate', revoke: 'End access' }

/** The label on a waiting row's one press. */
export const WITHDRAW_LABEL = 'Withdraw invitation'
