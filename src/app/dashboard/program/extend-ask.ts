/**
 * What the client's Extend sends, and what a refusal asks for next.
 *
 * Found by the screen walk of 2026-10-22: Extend on the client dashboard
 * sent "three months" and nothing else. Every refusal the extend route
 * gives asks for a reason — a paper that runs out before the new end, a
 * time limit the client only warns on — and the button had no box to
 * type one into, so the refusal was a dead end.
 *
 * The route is money's (`app/api/contracts/[id]/extend`) and takes
 * `newEndDate`, `note` (why it is extended), `reason` (answers a paper
 * ending first) and `limitReason` (answers the time limit). Its refusal
 * names the one it wants in `field`. Pure: the form imports this.
 */

/** The two questions the route can ask, by the field it names. */
export type ExtendField = 'reason' | 'limitReason'

export interface ExtendDraft {
  /** The new last day, YYYY-MM-DD, picked by the person. */
  newEndDate: string
  /** Why it is extended, in their words. */
  reason: string
  /** The questions the route has asked so far; the reason answers each. */
  asked: ExtendField[]
}

/** The day after a contract's last day, YYYY-MM-DD — the earliest a new end may be. */
export function earliestNewEnd(currentEnd: string | null, today: Date): string {
  const base = currentEnd ? new Date(currentEnd) : today
  const floor = base.getTime() < today.getTime() ? today : base
  const next = new Date(Date.UTC(floor.getUTCFullYear(), floor.getUTCMonth(), floor.getUTCDate() + 1))
  return next.toISOString().slice(0, 10)
}

/**
 * What is wrong with the draft before anything is sent, in a sentence;
 * null where it may go.
 */
export function draftRefusal(draft: ExtendDraft, currentEnd: string | null, today: Date): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.newEndDate)) return 'Pick the new last day.'
  const earliest = earliestNewEnd(currentEnd, today)
  if (draft.newEndDate < earliest) {
    return currentEnd
      ? 'The new last day has to be after the current one. To end it sooner, use Roll off.'
      : 'The new last day has to be after today.'
  }
  if (draft.reason.trim().length < 10) return 'Say why it is extended, in a sentence. It is kept with the extension.'
  return null
}

/** The body the extend route reads. The reason answers every question it asked. */
export function extendBody(draft: ExtendDraft): Record<string, string> {
  const reason = draft.reason.trim()
  const body: Record<string, string> = { newEndDate: draft.newEndDate, note: reason }
  for (const f of draft.asked) body[f] = reason
  return body
}

/** The question a refusal asks, where it asks one the reason can answer. */
export function askedBy(error: { field?: unknown } | null | undefined): ExtendField | null {
  const f = error?.field
  return f === 'reason' || f === 'limitReason' ? f : null
}
