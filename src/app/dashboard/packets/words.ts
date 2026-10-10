/**
 * What the Document requests page says when nothing has been asked yet.
 *
 * Pure, so it is a test sentence. The page explained what a "packet"
 * was — a system word the menu does not use — and offered nothing to
 * press, so the desk that should ask for a renewal read an explanation
 * and left (tester, 2026-09-30).
 */
export function emptyRequestsSays(canAsk: boolean): string {
  return canAsk
    ? 'You have not asked anybody for documents yet. Send one link and the other side uploads ' +
        'what you need — a W-9, an insurance certificate, a renewal — with no account and no ' +
        'back-and-forth email.'
    : 'You have not asked anybody for documents yet, and this seat cannot send a request. The ' +
        'compliance desk, or a desk that manages suppliers or people, can.'
}
