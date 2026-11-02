/**
 * What the Activate button and its reason box post to the start, as a
 * pure function of what the dialog draws, so a test can fill in every
 * field the dialog draws, post exactly this, and run the start's own rule
 * on it (`startWarningVerdict` in lib/money/start-warnings). The pattern
 * demand set for Place (`submissions/award-body.ts`), after the founder's
 * I-9 bug of 2026-11-01: a route asked for a field no screen offered, and
 * a test of the rule alone and a test of the screen alone both passed.
 */

/** What the dialog holds when Activate, or the reason box's own button, is pressed. */
export interface ActivateTyped {
  /** The act pressed: "activate" from the button and the box alike. */
  action: string
  /** The reason typed in the box the refusal drew; absent on the first press. */
  reason?: string
  /** The warnings the box showed, by code, so the reason answers those and no other. */
  answering?: readonly string[]
}

/** The body the dialog posts. */
export function activateBody(t: ActivateTyped): Record<string, unknown> {
  const payload: Record<string, unknown> = { action: t.action }
  // As typed: the start trims it, and a box left empty sends nothing.
  if (t.reason) payload.overrideReason = t.reason
  // The warnings the person read: the reason answers those and no other.
  if (t.reason && t.answering?.length) payload.answering = [...t.answering]
  return payload
}

/**
 * Every field the start reads that this dialog never sends, and why it
 * need not. None today: the act, the reason and the warnings it answers
 * are the three it reads.
 */
export const ACTIVATE_FIELDS_NOT_SENT: Readonly<Record<string, string>> = {}
