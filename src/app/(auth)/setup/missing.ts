/**
 * What a first-sign-in button pressed too early says, instead of being
 * greyed out with no words (the founder's first-day list, 2026-11-13: no
 * button is disabled for an empty field; it is pressable and says what is
 * missing, like every other form).
 */
export const NAME_MISSING = 'Type your company’s name first, then press Set up my company.'
export const KIND_MISSING = 'Choose which one you are first, then press Continue.'
export const COMPANY_NAME_MISSING = 'Type your company’s name first, then press Continue.'

/**
 * A company name sent and left blank is refused in the screen's own
 * sentence, never replaced by a guess (sign-in walk fda, item 10: a cleared
 * box made a company called "Seed"). A name not sent at all may still be
 * guessed from the domain. `ownFirm` is the "Set up my company" form.
 */
export function blankNameSays(body: unknown, ownFirm: boolean): string | null {
  if (!body || typeof body !== 'object' || !('name' in body)) return null
  const name = (body as { name?: unknown }).name
  if (String(name ?? '').trim() !== '') return null
  return ownFirm ? NAME_MISSING : COMPANY_NAME_MISSING
}
