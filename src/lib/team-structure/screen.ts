/**
 * The few decisions Settings → Team structure makes on the screen itself,
 * with no database and no browser in them, so each is a sentence in a
 * test (walk 10, 2026-11-09).
 */

/** The regions folded when the tree first opens: every one but the first, as the drawing opened, so the tree fits. */
export function foldedAtOpen(boxes: readonly { id: string; kind: string }[]): Set<string> {
  return new Set(boxes.filter((b) => b.kind === 'REGION').slice(1).map((b) => b.id))
}

/** How far the pane scrolls so the company box opens in the middle of it, never past the start. */
export function centeredScroll(boxLeft: number, boxWidth: number, paneWidth: number): number {
  return Math.max(Math.round(boxLeft + boxWidth / 2 - paneWidth / 2), 0)
}

/** "Make team lead" is offered only to somebody who does not already lead the box. */
export function offersMakeLead(lead: { contextId: string } | null | undefined, contextId: string): boolean {
  return lead?.contextId !== contextId
}

/**
 * Whether "Move to another team…" (or "Charge to another box…") has
 * anywhere to go: another box, or, for a person on a team, "on no team".
 * A company with no teams has nowhere, so the menu leaves it out rather
 * than open a chooser with nothing in it (review, 2026-11-13). Pure.
 */
export function offersMove(boxes: readonly { id: string }[], from: string | null, kind: 'person' | 'contractor' = 'person'): boolean {
  if (boxes.some((b) => b.id !== from)) return true
  return kind === 'person' && from !== null
}

/**
 * Whether the right-click menu stays open on a scroll or a mouse-down
 * outside it. A held press on a phone scrolls as it lifts and sends a
 * mouse-down after it; neither is somebody leaving the menu.
 */
export function menuStaysOpen(menu: { at: number; touch: boolean }, now: number, event: 'scroll' | 'mousedown'): boolean {
  if (event === 'scroll') return menu.touch || now - menu.at < 700
  return menu.touch && now - menu.at < 800
}

/**
 * The company box is drawn ink on ink's opposite: an ink background with
 * canvas text. Its own names (the people on no team) read in the light
 * colors, never the ink a team box's names use, or they vanish on the
 * company box (walk, 2026-11-14).
 */
export const ROOT_BOX = { border: 'border-etyme-ink', bg: 'bg-etyme-ink', text: 'text-etyme-canvas' } as const

export function nameTones(onRoot: boolean): { link: string; label: string; aside: string; hover: string; rule: string; more: string } {
  return onRoot
    ? { link: 'text-etyme-canvas', label: 'text-etyme-canvas', aside: 'text-etyme-canvas/70', hover: 'hover:bg-etyme-canvas/10', rule: 'border-etyme-canvas/20', more: 'text-etyme-canvas hover:bg-etyme-canvas/10' }
    : { link: 'text-etyme-ink', label: 'text-etyme-ink', aside: 'text-etyme-faint', hover: 'hover:bg-etyme-sunk', rule: 'border-etyme-rule', more: 'text-etyme-action-press hover:bg-etyme-sunk' }
}

/**
 * Where the right-click menu sits, from its measured size, so it is whole
 * inside the window: moved up and left as far as it must go, never above
 * or left of an 8 px margin. A menu taller than the window starts at the
 * margin and scrolls inside itself (walk, 2026-11-14: Delete sat below a
 * 900 px window).
 */
export const MENU_MARGIN = 8
export function menuPlace(at: { x: number; y: number }, size: { width: number; height: number }, win: { width: number; height: number }): { left: number; top: number; maxHeight: number } {
  const m = MENU_MARGIN
  const maxHeight = Math.max(0, win.height - 2 * m)
  const h = Math.min(size.height, maxHeight)
  return {
    left: Math.max(m, Math.min(at.x, win.width - size.width - m)),
    top: Math.max(m, Math.min(at.y, win.height - h - m)),
    maxHeight,
  }
}

/**
 * Whether a held press (or a right-click) on this thing stops there. A name
 * sits inside its box, so a press on a name must not reach the box, or the
 * box's menu opens instead of the name's (re-walk 10b).
 */
export function holdStopsHere(on: 'box' | 'person' | 'contractor'): boolean {
  return on !== 'box'
}

/**
 * A company with no box under the company box opens as a plain list of
 * its people, never a chart of one box (founder's first-day list, fault
 * 18, 2026-11-13: Tapin, six people and no teams). Keyed on boxes alone: a
 * company with one region and everybody in it is a chart.
 */
export function drawsAsList(tree: { boxes: readonly unknown[] }): boolean {
  return tree.boxes.length === 0
}

/** The one sentence over the plain list. */
export function noTeamsSays(companyName: string): string {
  return `${companyName} has no teams yet. Add a team when one person starts answering for others.`
}

/** The people on the plain list: the Owner first, then everybody else, each once. */
export function listPeople<T extends { contextId: string }>(owner: T | null, unplaced: readonly T[]): T[] {
  const out: T[] = owner ? [owner] : []
  for (const p of unplaced) if (!out.some((o) => o.contextId === p.contextId)) out.push(p)
  return out
}

/** A role in words on the list: its own name, or that nobody gave one yet. */
export function roleInWords(role: string | null | undefined): string {
  return role && role !== 'Member' ? role : 'No role yet'
}

/** Where a person's name on Team structure opens: their row on Users & permissions. */
export const PERSON_LINK = '/dashboard/access'

/**
 * The address of one person's row on Users & permissions: the page reads
 * `?person=<contextId>` and lands on the row, marked. Where the row is not
 * on that reader's page, it opens as the plain page.
 */
export function personLink(contextId: string): string {
  return `${PERSON_LINK}?person=${encodeURIComponent(contextId)}`
}

/** How many rows the plain list shows before "Show everyone". */
export const LIST_SHOWS = 50
