/**
 * A visa petition, from filing to the day it runs out.
 *
 * VisaPetition carried seven statuses and one job that read them; nothing
 * wrote FILED, RFE or STAMPED, so an H-1B could not be filed here, an
 * RFE could not be recorded, and the visa-watch job counted down to an
 * expiry nobody had entered. The 2017 build tracked every petition on
 * the bench because a consultant on an expiring visa is the vendor's
 * problem before it is anybody else's.
 *
 * The moves, in the order the process goes:
 *
 *   FILED → RFE → (answered) → APPROVED → STAMPED → ACTIVE → EXPIRING → EXPIRED
 *   FILED or RFE → DENIED
 *
 * Approval needs the date it runs out; stamping is only after approval;
 * active is the day the person may work on it. EXPIRING and EXPIRED are
 * the watch job's to set, by the calendar, not a person's.
 */

export type PetitionStatus = 'FILED' | 'RFE' | 'APPROVED' | 'STAMPED' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'DENIED'
export type Move = 'RFE' | 'RFE_ANSWERED' | 'APPROVED' | 'DENIED' | 'STAMPED' | 'ACTIVE'

/** What a person may do next, by status. The watch job's moves are not here. */
export const MOVES: Record<string, Move[]> = {
  FILED: ['RFE', 'APPROVED', 'DENIED'],
  RFE: ['RFE_ANSWERED', 'APPROVED', 'DENIED'],
  APPROVED: ['STAMPED', 'ACTIVE'],
  STAMPED: ['ACTIVE'],
  ACTIVE: [],
  EXPIRING: [],
  EXPIRED: [],
  DENIED: [],
}

export const MOVE_WORDS: Record<Move, string> = {
  RFE: 'Request for evidence received',
  RFE_ANSWERED: 'Evidence sent',
  APPROVED: 'Approved',
  DENIED: 'Denied',
  STAMPED: 'Visa stamped',
  ACTIVE: 'Working on it',
}

/** The event written for each move. */
export const EVENT_FOR: Record<Move, string> = {
  RFE: 'RFE_ISSUED',
  RFE_ANSWERED: 'RFE_RESPONDED',
  APPROVED: 'APPROVED',
  DENIED: 'DENIED',
  STAMPED: 'STAMPED',
  ACTIVE: 'ACTIVATED',
}

export type MoveVerdict =
  | { ok: true; status: PetitionStatus; event: string; says: string }
  | { ok: false; code: 'NOT_NEXT' | 'DATE_REQUIRED'; message: string }

export function applyMove(
  status: string,
  move: Move,
  facts: { personName: string; type: string; expiresAt?: Date | null }
): MoveVerdict {
  const allowed = MOVES[status] ?? []
  if (!allowed.includes(move)) {
    const next = allowed.length ? `From here it can be ${allowed.map((m) => MOVE_WORDS[m].toLowerCase()).join(', or ')}.` : 'Nothing more can be done on it.'
    return {
      ok: false, code: 'NOT_NEXT',
      message: `${facts.personName}'s ${facts.type} is ${statusWord(status).toLowerCase()}. ${next}`,
    }
  }
  if (move === 'APPROVED' && !facts.expiresAt) {
    return { ok: false, code: 'DATE_REQUIRED', message: 'An approval comes with the date it runs out. Enter it.' }
  }
  const next: PetitionStatus = move === 'RFE_ANSWERED' ? 'RFE' : move
  return {
    ok: true, status: next, event: EVENT_FOR[move],
    says: `${facts.personName}'s ${facts.type}: ${MOVE_WORDS[move].toLowerCase()}.`,
  }
}

export function statusWord(status: string): string {
  switch (status) {
    case 'FILED': return 'Filed'
    case 'RFE': return 'Evidence requested'
    case 'APPROVED': return 'Approved'
    case 'STAMPED': return 'Stamped'
    case 'ACTIVE': return 'Working on it'
    case 'EXPIRING': return 'Running out'
    case 'EXPIRED': return 'Expired'
    case 'DENIED': return 'Denied'
    default: return status.toLowerCase()
  }
}

/** The watch job's rule: inside ninety days is running out; past the date is expired. */
export function byCalendar(status: string, expiresAt: Date | null, now: Date): PetitionStatus | null {
  if (!expiresAt) return null
  if (!['APPROVED', 'STAMPED', 'ACTIVE', 'EXPIRING'].includes(status)) return null
  if (expiresAt.getTime() < now.getTime()) return status === 'EXPIRED' ? null : 'EXPIRED'
  const days = (expiresAt.getTime() - now.getTime()) / 86_400_000
  if (days <= 90 && status === 'ACTIVE') return 'EXPIRING'
  return null
}
