/**
 * What the Activate panel draws, as a pure function of what the start's
 * own route said (GET before, POST after a press), so a test reads the
 * same decision the screen makes.
 *
 * Three rules, each the tester's retest of 2026-11-03 on Rajesh Iyer's
 * placement, which said "then activate" and had nothing to press:
 * - the button is drawn for the seat the route will take, and for nobody
 *   else (`may`, from the route's own gate);
 * - a paper that warns draws the reason box, because a reason clears it;
 *   a paper that blocks draws none, because no reason clears it (work
 *   authorization is never waived);
 * - after a press, the route's refusal is shown in its own words.
 */

import { reasonAsked } from '@/lib/award/reason-asked'
import { startRefusalSays } from '@/lib/award/start-refusal'

/** The route's answer before a press (GET /api/contracts/:id/activate). */
export interface StartPreflight {
  may: boolean
  state: string
  /** Why `may` is false, as the route's code: FORBIDDEN, INVALID_TRANSITION. Null where it may. */
  code?: string | null
  says: string | null
  /** The roles that start a placement at this kind of firm. */
  who?: string[]
  terms: { blocks: boolean; says: string | null; fix?: string | null } | null
  papers: {
    outcome: 'PASS' | 'WARN' | 'BLOCK'; says: string; fix: string | null
    /** Where the missing I-9 is recorded, for a seat that may record it. */
    door?: { says: string; href: string } | null
    /** Who records the missing I-9, for a seat that may not. */
    whoRecords?: string | null
  } | null
}

/** What the panel draws. Nothing at all where both `button` and `says` are null. */
export interface PanelView {
  /** The button's words, or null where no button is drawn. */
  button: 'Activate' | 'Activate with a reason' | null
  /** The sentence above the button: the route's own words. */
  says: string | null
  /** The reason box, where a reason clears what was said; the warnings it answers. */
  box: { answering: string[] } | null
  /** The link to the act that clears the block, where this seat may do it. */
  door?: { says: string; href: string } | null
}

const NOTHING: PanelView = { button: null, says: null, box: null }

/** Said first after a press the route refused again, so a repeat reads as an answer. */
export const STILL_BLOCKED = 'Still blocked:'

/** Before a press: the route's own verdict on this seat and these papers. */
export function viewBefore(pre: StartPreflight | null): PanelView {
  if (!pre) return NOTHING
  // A seat whose role does not start placements reads who does, and no
  // button (the release walk of 2026-11-03, fault D1: it read "…or
  // activate with a reason" with nothing to press and nobody named). Any
  // other refusal, a placement already started among them, draws nothing:
  // its text is the route's, not a sentence for a screen.
  if (!pre.may) return pre.code === 'FORBIDDEN' && pre.says ? { button: null, says: pre.says, box: null } : NOTHING
  // The terms first, as the press asks them first: a block, so no box.
  // No button: the route will refuse it, so the sentence and the next step
  // are drawn instead (a button is drawn only where its route will take it).
  if (pre.terms?.blocks) return { button: null, says: [pre.terms.says, pre.terms.fix].filter(Boolean).join(' '), box: null }
  const p = pre.papers
  if (p?.outcome === 'BLOCK') {
    return { button: 'Activate', says: [p.says, p.fix, p.whoRecords].filter(Boolean).join(' '), box: null, door: p.door ?? null }
  }
  if (p?.outcome === 'WARN') {
    return { button: 'Activate with a reason', says: [p.says, p.fix].filter(Boolean).join(' '), box: { answering: ['DOCUMENTS_WARN'] } }
  }
  return { button: 'Activate', says: null, box: null }
}

/**
 * After a press the route refused: its question with a box where it asked
 * for a reason, else its sentence alone. The button stays, so a paper
 * filed since can be pressed for again.
 *
 * Every refusal draws a sentence, whatever its code (the founder's tester,
 * 2026-11-08: Activate showed "Starting…" and then the button again, with
 * nothing said). `status` is the HTTP status, or null where the request
 * never came back; a server that did not answer in words reads "The start
 * could not be checked. Try again." (`startRefusalSays`, demand's rule).
 * Omitted, the error is read as a refusal the route wrote.
 */
export function viewAfterRefusal(error: unknown, status: number | null = 400, before?: PanelView | null): PanelView {
  const q = status !== null && status < 500 ? reasonAsked(error) : null
  if (q && q.field === 'overrideReason') {
    const e = error as { warnings?: unknown; code?: unknown }
    const answering = Array.isArray(e.warnings)
      ? e.warnings.map((w: { code?: unknown }) => String(w.code))
      : typeof e.code === 'string' ? [e.code] : []
    return { button: 'Activate with a reason', says: q.says, box: { answering } }
  }
  const says = startRefusalSays(status, error)
  // Pressed on a block the panel had already said, and refused again:
  // "Still blocked:" first, and the link to what clears it kept (the
  // founder's walk, 2026-11-15, stop 7: the same sentence twice read as
  // if nothing happened). A server that did not answer is not a block.
  if (before?.button === 'Activate' && before.says && status !== null && status < 500) {
    return { button: 'Activate', says: `${STILL_BLOCKED} ${says}`, box: null, door: before.door ?? null }
  }
  return { button: 'Activate', says, box: null }
}

/**
 * What the panel says after a start, kept across the page's reload so the
 * route's own sentence is not lost (the release walk of 2026-11-03, fault
 * D2: the page reloaded at once and only the header said it happened).
 */
export function startedSays(message: string | null | undefined): string {
  const m = (message ?? '').trim()
  return m ? `Contract activated. ${m}` : 'Contract activated.'
}

/** The key the sentence is kept under in the browser, one per contract. */
export const startedKey = (contractId: string) => `etyme:started:${contractId}`

/** How long a kept sentence is shown after the reload: a minute, then it is gone. */
export const STARTED_KEPT_MS = 60_000

/** The kept sentence, where it was written less than a minute ago; null otherwise. */
export function keptStarted(raw: string | null, now: number): string | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as { says?: unknown; at?: unknown }
    if (typeof v.says !== 'string' || typeof v.at !== 'number') return null
    return now - v.at >= 0 && now - v.at < STARTED_KEPT_MS ? v.says : null
  } catch {
    return null
  }
}
