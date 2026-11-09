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
 * Whether the right-click menu stays open on a scroll or a mouse-down
 * outside it. A held press on a phone scrolls as it lifts and sends a
 * mouse-down after it; neither is somebody leaving the menu.
 */
export function menuStaysOpen(menu: { at: number; touch: boolean }, now: number, event: 'scroll' | 'mousedown'): boolean {
  if (event === 'scroll') return menu.touch || now - menu.at < 700
  return menu.touch && now - menu.at < 800
}

/**
 * Whether a held press (or a right-click) on this thing stops there. A name
 * sits inside its box, so a press on a name must not reach the box, or the
 * box's menu opens instead of the name's (re-walk 10b).
 */
export function holdStopsHere(on: 'box' | 'person' | 'contractor'): boolean {
  return on !== 'box'
}
