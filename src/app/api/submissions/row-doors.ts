/**
 * Whether a Candidates row may offer "Send on" and "Message <supplier>",
 * asked of the same rules the two routes refuse on, so the page never
 * draws a button its route will turn away.
 *
 * The screen walk of 2026-11-02 pressed both at an MSP seated in a
 * client's program: "Message <supplier>" nine times and nine refusals
 * ("… was not submitted to or by you"), and "Send on →" refused with a
 * permission's key on screen. The page drew them from the row's direction
 * alone. Now the list route answers per row, the way it already answers
 * "Place" (`awardDoor`):
 *
 * - **Send on** is `maySendOn` (conversation's, `lib/forwarding`) with
 *   the actor the forward route builds: the acting desk's book and
 *   permissions (`actingDesk`), and the kind and name of that book so a
 *   refusal names who there may.
 * - **Message** is `mayMessageSupplier` (`lib/threads`), with the caller's
 *   own company and the seat its firm holds in a client's program, which
 *   is what the conversations route judges by (`programSideFor`): a seat
 *   whose role writes for the client opens the client's thread, a seat
 *   that does not and a firm with none are offered nothing; a
 *   consultant's own seat never speaks for a firm.
 *
 * Pure. The route reads; this decides.
 */
import { maySendOn, whyNotSendOn, type Actor } from '@/lib/forwarding'
import { mayMessageSupplier, type ProgramSide } from '@/lib/threads'

export interface DoorRow {
  id: string
  fromCompanyId: string
  toCompanyId: string
  status: string
  rate: number | null
  forwardedAt: Date | null
}

export interface Door {
  open: boolean
  /** The route's own refusal, where it would refuse. Null where it would not. */
  says: string | null
}

/** The actor the forward route judges by, built the same way here. */
export function sendOnActor(desk: {
  companyId: string | null | undefined
  companyName: string | null | undefined
  permissions: readonly string[]
  /** The kind of the book the desk acts in: a seat's client, or the caller's own. */
  kind: string | null | undefined
}): Actor {
  return { companyId: desk.companyId, permissions: desk.permissions, kind: desk.kind ?? null, companyName: desk.companyName ?? null }
}

export function sendOnDoor(actor: Actor, s: DoorRow): Door {
  const sub = {
    id: s.id,
    fromCompanyId: s.fromCompanyId,
    toCompanyId: s.toCompanyId,
    status: s.status,
    rateCents: s.rate ?? 0,
    forwardedAt: s.forwardedAt,
  }
  // Drawn by `maySendOn`, the one reader; the sentence is the same
  // first checks' own refusal (`whyNotSendOn`), never a copy of the rule.
  if (maySendOn(actor, sub)) return { open: true, says: null }
  return { open: false, says: whyNotSendOn(actor, sub)?.message ?? null }
}

export function messageDoor(
  caller: {
    companyId: string | null | undefined
    consultantSeat: boolean
    /** The seat the caller's firm holds in a client's program, read once per request; null for none. */
    seat?: ProgramSide | null
  },
  s: Pick<DoorRow, 'fromCompanyId' | 'toCompanyId'> & { kind: string },
): Door {
  // An internal move has no other firm to write to.
  if (s.kind === 'INTERNAL') return { open: false, says: null }
  if (caller.consultantSeat) return { open: false, says: 'Speaking for a company to another company is for its staff.' }
  return mayMessageSupplier(s, caller.companyId, caller.seat ?? null) ? { open: true, says: null } : { open: false, says: null }
}
