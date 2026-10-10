/**
 * An ask is made once, and said once.
 *
 * A client tester pressed "Ask Pinnacle Resourcing to submit" on
 * 2026-09-30 and the button stayed live beside the green line saying the
 * ask had gone; pressed again, it went again, and the dashboard's "Done
 * today" listed the same ask three times. A supplier reading three
 * identical messages learns the client does not know what it sent.
 *
 * So after asking, the match says when, and the button is gone until
 * three days have passed — long enough for a supplier to answer, short
 * enough that a quiet one can be nudged. The route refuses a repeat
 * inside the window in a sentence, and the dashboard lists one line per
 * ask, however many were pressed before this rule existed.
 *
 * Beside the route rather than in `src/lib`, for the reason
 * `app/api/requisitions/words.ts` gives: a new file there needs an owner
 * in `lib/domains.ts`. No database and no clock of its own.
 */

/** Days after an ask before the same ask is offered again. */
export const ASK_AGAIN_AFTER_DAYS = 3

const DAY = 86_400_000

/** "Sep 30" — the way a person says a date. */
export function askDay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** What one ask is about: this person, from this supplier, for this job. */
export function askKey(metadata: unknown): string | null {
  const md = (metadata ?? {}) as Record<string, unknown>
  const person = typeof md.personId === 'string' ? md.personId : null
  const job = typeof md.requirementId === 'string' ? md.requirementId : null
  if (!person || !job) return null
  const firm = typeof md.supplierId === 'string' ? md.supplierId : ''
  return `${job}|${person}|${firm}`
}

export interface AskState {
  /** When it was last asked. */
  at: string
  /** Whether "Ask again" is offered. */
  mayAskAgain: boolean
  /** The day it may be asked again, where it may not yet. */
  againFrom: string | null
  /** What the row says in place of the button. */
  says: string
}

/** Where an ask stands, from the last time it was made. Null: never asked. */
export function askState(lastAskedAt: Date | null, now: Date): AskState | null {
  if (!lastAskedAt) return null
  const again = new Date(lastAskedAt.getTime() + ASK_AGAIN_AFTER_DAYS * DAY)
  const mayAskAgain = now.getTime() >= again.getTime()
  return {
    at: lastAskedAt.toISOString(),
    mayAskAgain,
    againFrom: mayAskAgain ? null : again.toISOString(),
    says: `Asked on ${askDay(lastAskedAt)}`,
  }
}

/** The refusal for a repeat inside the window, in a sentence. */
export function askedAlreadySays(input: { firm: string; person: string; at: Date }): string {
  const again = new Date(input.at.getTime() + ASK_AGAIN_AFTER_DAYS * DAY)
  return (
    `You asked ${input.firm} for ${input.person} on ${askDay(input.at)}. ` +
    `Give them time to answer — you can ask again from ${askDay(again)}.`
  )
}

/**
 * One line per ask. Rows with the same person, supplier and job collapse
 * to the first time it was asked; the order of the rows is kept.
 */
export function oneLinePerAsk<T extends { createdAt: Date; metadata: unknown }>(rows: T[]): T[] {
  const first = new Map<string, T>()
  for (const r of rows) {
    const k = askKey(r.metadata)
    if (k == null) continue
    const had = first.get(k)
    if (!had || r.createdAt < had.createdAt) first.set(k, r)
  }
  const keep = new Set(first.values())
  return rows.filter((r) => askKey(r.metadata) == null || keep.has(r))
}
