/**
 * The one line under the org view's heading: what the rates say.
 *
 * A confident sentence needs its empty state. The walk on 2026-10-08
 * found "Every skill is bought at a consistent rate… Nothing to
 * reconcile" over a program with no contractors at all — a sentence
 * that was true only because there was nothing to make it false. So the
 * line says "consistent" only where at least one skill is bought by two
 * or more managers and could have differed.
 *
 * Pure, so it can be tested without a page.
 */
export interface RateFindingInput {
  /** Live contractors on site. */
  headcount: number
  /** Skills bought by more than one manager — the only ones that can be compared. */
  comparedSkills: number
  /** Annual saving from bringing rates above the median down to it. */
  annualSaving: number
}

export function rateFindingSays(input: RateFindingInput): string {
  if (input.headcount === 0) return 'No contractors yet, so nothing to compare.'
  if (input.annualSaving > 0) {
    return 'Each manager found their own vendors and negotiated their own rates. Nobody has seen this together before, because it has never existed in one place — it lived across separate inboxes and AP records.'
  }
  if (input.comparedSkills === 0) {
    return 'No skill is bought by more than one manager yet, so there is nothing to compare.'
  }
  return 'Every skill bought by more than one manager is bought at one rate. Nothing to reconcile.'
}
