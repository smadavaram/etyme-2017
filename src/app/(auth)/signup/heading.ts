/**
 * What the sign-up page is called (market, 2026-11-01): it said "Sign up
 * for Etyme" whatever door it was opened from, so a supplier sent from
 * the Suppliers door on ?type=prime read a heading written for nobody in
 * particular. Where a link names the party, the heading names it too, in
 * the doors' own words; opened with no party, it says "Create your
 * Etyme account" (founder, 2026-11-12, the sign-in drawing).
 * Once opened on a party, it follows what the person picks, so changing
 * the choice never leaves a heading that names somebody else. Pure.
 */
const SUPPLIER_TYPES: readonly string[] = ['prime', 'sub', 'bench']

const AS: Readonly<Record<string, string>> = {
  client: 'Sign up as a client',
  msp: 'Sign up as an MSP',
  gsi: 'Sign up as an integrator',
  solo: 'Sign up as a solopreneur',
}

export const PLAIN_HEADING = 'Create your Etyme account'
/** Step 2 of signing up by email: the few questions. */
export const DETAILS_HEADING = 'A few details'
export const CLAIM_HEADING = 'Take your company’s account'

export function signUpHeading(o: {
  /** A supplier invitation being taken. */
  claim: boolean
  /** The kind the link opened on (`?type=`), or null. */
  openedOn: string | null
  /** The tab the link opened on (`?as=candidate`). */
  openedTab: 'company' | 'candidate'
  /** What is picked now. */
  type: string
  tab: 'company' | 'candidate'
}): string {
  if (o.claim) return CLAIM_HEADING
  if (!o.openedOn && o.openedTab !== 'candidate') return PLAIN_HEADING
  if (o.tab === 'candidate') return 'Sign up as a worker'
  if (SUPPLIER_TYPES.includes(o.type)) return 'Sign up as a supplier'
  return AS[o.type] ?? PLAIN_HEADING
}
