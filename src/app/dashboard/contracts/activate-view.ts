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

/** The route's answer before a press (GET /api/contracts/:id/activate). */
export interface StartPreflight {
  may: boolean
  state: string
  says: string | null
  terms: { blocks: boolean; says: string | null } | null
  papers: { outcome: 'PASS' | 'WARN' | 'BLOCK'; says: string; fix: string | null } | null
}

/** What the panel draws. Nothing at all where `button` is null. */
export interface PanelView {
  /** The button's words, or null where no button is drawn. */
  button: 'Activate' | 'Activate with a reason' | null
  /** The sentence above the button: the route's own words. */
  says: string | null
  /** The reason box, where a reason clears what was said; the warnings it answers. */
  box: { answering: string[] } | null
}

const NOTHING: PanelView = { button: null, says: null, box: null }

/** Before a press: the route's own verdict on this seat and these papers. */
export function viewBefore(pre: StartPreflight | null): PanelView {
  if (!pre || !pre.may) return NOTHING
  // The terms first, as the press asks them first: a block, so no box.
  if (pre.terms?.blocks) return { button: 'Activate', says: pre.terms.says, box: null }
  const p = pre.papers
  if (p?.outcome === 'BLOCK') {
    return { button: 'Activate', says: [p.says, p.fix].filter(Boolean).join(' '), box: null }
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
 */
export function viewAfterRefusal(error: unknown): PanelView {
  const q = reasonAsked(error)
  if (q && q.field === 'overrideReason') {
    const e = error as { warnings?: unknown; code?: unknown }
    const answering = Array.isArray(e.warnings)
      ? e.warnings.map((w: { code?: unknown }) => String(w.code))
      : typeof e.code === 'string' ? [e.code] : []
    return { button: 'Activate with a reason', says: q.says, box: { answering } }
  }
  const message = error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message
    : 'The placement could not be started.'
  const fix = error && typeof error === 'object' && typeof (error as { fix?: unknown }).fix === 'string'
    ? (error as { fix: string }).fix
    : null
  return { button: 'Activate', says: fix && !message.includes(fix) ? `${message} ${fix}` : message, box: null }
}
