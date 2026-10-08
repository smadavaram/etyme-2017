/**
 * Who a caller is to a person's terms with a firm. Pure: no database.
 *
 * Sign-up walk, round six (2026-10-08), problem 1. Karthik Menon is
 * Teleworld's own W2 engineer with no desk. "Your terms" is on every
 * worker's menu, so the one door lets a desk-less seat through to
 * `submissions/[id]/terms`, and the route then asked only "is this caller at
 * the submitting firm?". So he read Felix Brenner's pay, Deepa Varma's,
 * and the sub-vendor holding Marcus Whitfield — and the access log wrote
 * each as an allowed read of "own terms".
 *
 * Opening a route to "your own" needs the route itself to check "own":
 *
 * - the person the submission names is a party, whatever their seat;
 * - the firm is a party only through a desk that reads the firm's
 *   submissions (`submissions.read`, the recruiting desk's read) or that
 *   papers its contracts (the contract desk, who states the terms);
 * - a seat at the firm with neither — a Member, a worker, HR, AR — is
 *   refused, in the no-desk sentence, naming nobody;
 * - anybody at another company is a stranger, refused as before.
 */
import { holdsContractDesk } from '@/lib/papering'
import { hasPermission } from '@/lib/permissions'
import { noDeskYet } from '@/lib/no-desk'
import { holdsNoDesk } from '../../own-only'

export type TermsStanding = 'PERSON' | 'FIRM' | 'NO_DESK' | 'STRANGER'

export function termsStanding(input: {
  callerPersonId: string
  callerCompanyId: string | null | undefined
  permissions: readonly string[] | null | undefined
  personId: string
  firmId: string
}): TermsStanding {
  if (input.callerPersonId === input.personId) return 'PERSON'
  if (!input.callerCompanyId || input.callerCompanyId !== input.firmId) return 'STRANGER'
  const held = Array.isArray(input.permissions) ? input.permissions : []
  if (holdsNoDesk(held)) return 'NO_DESK'
  if (hasPermission(held, 'submissions.read') || holdsContractDesk(held)) return 'FIRM'
  return 'NO_DESK'
}

/** The refusal a seat at the firm without the desk reads. Names no person and no firm beyond the reader's own. */
export function colleaguesTermsRefused(company: string | null | undefined): string {
  return noDeskYet('Somebody else’s terms', company)
}
