/**
 * What a Users & permissions row offers its reader: Pause, Reinstate, End.
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
import { rowActs, stateOf, type AccessRow, type Actor, type AccessState } from '@/lib/account-lifecycle'

export type LifecycleAction = 'suspend' | 'reinstate' | 'revoke'

export interface RowOffer {
  /** Drawn only where true. */
  pause: boolean
  reinstate: boolean
  end: boolean
  state: AccessState
  /** What Pause or End does, said before somebody presses it. */
  pauseSays: string[]
  endSays: string[]
}

const NOTHING = (state: AccessState): RowOffer => ({ pause: false, reinstate: false, end: false, state, pauseSays: [], endSays: [] })

/**
 * Every row's offer, keyed by seat. A reader who cannot change access
 * (no `team.manage`, which the route asks for) is offered nothing on any
 * row; the route would refuse each press.
 */
export function offersFor(all: AccessRow[], actor: Actor, mayManage: boolean): Map<string, RowOffer> {
  const out = new Map<string, RowOffer>()
  for (const row of all) {
    const state = stateOf(row)
    if (!mayManage) { out.set(row.contextId, NOTHING(state)); continue }
    const v = rowActs(row, all, actor)
    out.set(row.contextId, {
      pause: v.pause.allowed,
      reinstate: v.reinstate.allowed,
      end: v.end.allowed,
      state,
      pauseSays: v.pause.allowed ? v.pause.consequences : [],
      endSays: v.end.allowed ? v.end.consequences : [],
    })
  }
  return out
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
