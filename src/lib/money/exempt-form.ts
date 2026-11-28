/**
 * The Payroll row's answer to "is this person exempt from overtime?".
 *
 * Walk, 2026-11-14: a week over 40 hours for a W-2 employee went out at
 * straight time because nobody had recorded whether the person is
 * exempt, and the only door that records it (POST
 * /api/contracts/[id]/exempt) had no screen. The week is now held until
 * somebody says, so the row that holds it must offer the answer.
 *
 * Etyme never decides exemption: it turns on duties, which are not in the
 * record. The employer says, and the route keeps what it said. "Not
 * exempt" needs no reason. "Exempt" names which exemption, and a note;
 * the route asks for a written reason where the pay cannot meet the
 * exemption's salary test, so the form always carries the note box.
 *
 * Pure: no database, safe for the browser.
 */

export type ExemptChoice = 'NONEXEMPT' | 'EXEMPT'

/** The exemptions the route accepts, in the words a payroll person reads. */
export const EXEMPTION_CHOICES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'EXECUTIVE', label: 'Executive' },
  { value: 'ADMINISTRATIVE', label: 'Administrative' },
  { value: 'PROFESSIONAL', label: 'Learned or creative professional' },
  { value: 'COMPUTER', label: 'Computer employee' },
  { value: 'OUTSIDE_SALES', label: 'Outside sales' },
  { value: 'HIGHLY_COMPENSATED', label: 'Highly compensated employee' },
]

/** Every field the form draws, for the contract test against the route. */
export const EXEMPT_FORM_FIELDS = ['status', 'basis', 'note'] as const

/** The body the row posts to POST /api/contracts/[id]/exempt. */
export function exemptBody(
  personId: string,
  choice: ExemptChoice,
  typed: { basis?: string | null; note?: string | null } = {}
): { personId: string; status: ExemptChoice; basis?: string; note?: string } {
  if (choice === 'NONEXEMPT') {
    const note = typed.note?.trim()
    return note ? { personId, status: 'NONEXEMPT', note } : { personId, status: 'NONEXEMPT' }
  }
  return {
    personId,
    status: 'EXEMPT',
    basis: typed.basis ?? '',
    note: (typed.note ?? '').trim(),
  }
}

/** The sentence after a save: what was recorded and what happens to the held week. */
export function exemptSavedSays(personName: string, choice: ExemptChoice): string {
  return choice === 'NONEXEMPT'
    ? `Recorded: ${personName} is not exempt, so hours over 40 a week are paid as overtime. Press Calculate to work the week out.`
    : `Recorded: ${personName} is exempt, so overtime follows the contract's own terms. Press Calculate to work the week out.`
}
