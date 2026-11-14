/**
 * What the overtime dialog posts, and which of its boxes answers each
 * refusal its route can give.
 *
 * Walk tpd, 2026-11-14 (trace 7d): a client pressed "Overtime to decide"
 * on a 46-hour week that was also over the role's hours. The dialog
 * posted the overtime answers with no reason, the approve route refused
 * with "Say why this week is right before you sign it", and the dialog
 * had no box to say it in. Only the drawer's "Approve anyway…" asked
 * first. So the dialog draws the reason box itself, wherever the week is
 * flagged and the signature is asked for a reason, and every refusal the
 * route names a field for opens the box that answers it
 * ("every question a route asks, its screen has a field for").
 *
 * Pure: no database, no clock, safe to import on a screen.
 */

/**
 * The fields the dialog sends, by the names the approve route reads them
 * under. `note` and `reason` are boxes the dialog draws. `acceptedHours`
 * is carried from the "Accept fewer hours" form, which drew it and ran the
 * route's own check on it (`checkAcceptedHours`) before this opened.
 */
export const DECIDE_OVERTIME_FIELDS = {
  /** The reason a flagged week is right. Goes on the signature. */
  flagReason: 'note',
  /** Why one week's answer differs from the contract. */
  weekReason: 'reason',
  /** The hours accepted, from the form that asked them. */
  acceptedHours: 'acceptedHours',
} as const

export type Treatment = 'SAME_RATE' | 'PREMIUM' | 'TIME_OFF'

export interface WeekAnswer {
  weekOf: string
  treatment: Treatment | null
  multiplierBps: number
  reason: string
}

/**
 * The reason box's sentence, where the dialog must ask for one: the week
 * is flagged, this signature is asked for a reason, and no reason came
 * with the dialog. Null where no box is drawn.
 */
export function flagReasonAsked(p: {
  flag: string | null | undefined
  flagAsksReason?: boolean | null
  note?: string | null
}): string | null {
  if (!p.flag) return null
  if (p.flagAsksReason === false) return null
  if (p.note && p.note.trim()) return null
  return p.flag
}

/** The body the dialog posts to `POST /api/timesheets/:id/approve`. */
export function decideOvertimeBody(p: {
  note?: string | null
  flagReason?: string | null
  acceptedHours?: string | null
  answers: WeekAnswer[]
}): {
  note?: string
  acceptedHours?: string
  overtime: { weekOf: string; treatment: Treatment | null; multiplierBps?: number; reason?: string }[]
} {
  const note = (p.note ?? '').trim() || (p.flagReason ?? '').trim()
  return {
    ...(note ? { note } : {}),
    ...(p.acceptedHours ? { acceptedHours: p.acceptedHours } : {}),
    overtime: p.answers.map((a) => ({
      weekOf: a.weekOf,
      treatment: a.treatment,
      multiplierBps: a.treatment === 'PREMIUM' ? a.multiplierBps : undefined,
      reason: a.reason.trim() || undefined,
    })),
  }
}

/**
 * Which box a refusal asks the dialog to open. A refusal with no field
 * is shown as its sentence and nothing else; there is nothing to type.
 */
export type RefusalOpens =
  | { box: 'flagReason'; says: string }
  | { box: 'weekReason'; weekOf: string }
  | { box: 'acceptedHours' }
  | null

export function refusalOpens(error: { field?: unknown; flag?: unknown; message?: unknown; weekOf?: unknown } | null | undefined): RefusalOpens {
  if (!error) return null
  if (error.field === DECIDE_OVERTIME_FIELDS.flagReason) {
    const says = typeof error.flag === 'string' && error.flag ? error.flag : typeof error.message === 'string' ? error.message : ''
    return { box: 'flagReason', says }
  }
  if (error.field === DECIDE_OVERTIME_FIELDS.weekReason && typeof error.weekOf === 'string') {
    return { box: 'weekReason', weekOf: error.weekOf }
  }
  if (error.field === DECIDE_OVERTIME_FIELDS.acceptedHours) return { box: 'acceptedHours' }
  return null
}
