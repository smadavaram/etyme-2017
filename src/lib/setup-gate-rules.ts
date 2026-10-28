/**
 * The rules of what a skipped setup item refuses, with no database in
 * them, so a pure door (`decideEntry` in lib/company-domains) and a
 * screen may read them. `lib/setup-gates` asks the database and calls
 * these; read that file for why each exists.
 */

import type { ItemKey } from '@/lib/setup-checklist'
import type { Party } from '@/lib/document-stages/required-sets'

export type Gate = { ok: true } | { ok: false; says: string; step: ItemKey }

/** Where the step is, in the words the refusal names it with. */
export const STEP_PLACE: Record<ItemKey, string> = {
  COMPANY: 'Setup → Your company',
  ADDRESSES: 'Setup → Addresses',
  SITES: 'Setup → Sites',
  PEOPLE_IN_CHARGE: 'Setup → The people in charge',
  HOW_YOU_WORK: 'Setup → How you work',
  PAPERS: 'Setup → Papers you require',
  BANK: 'Setup → Bank details',
  COMPANIES: 'Setup → Your companies',
  TEAM: 'Setup → Your team',
  DOMAIN: 'Setup → Your domain',
  INTEGRATIONS: 'Setup → Integrations',
}

/** The sentence a bill is refused with. */
export const NO_BILLING_ADDRESS = `Add a billing address under ${STEP_PLACE.ADDRESSES}, then send the bill.`

/**
 * Pure: whether the issuer has an address a bill can name. The billing
 * address where one is on file; the legal address where billing is the
 * same as legal; and, for a company set up before the checklist, the
 * address on its payment details, which every bill it sent already
 * printed.
 */
export function billingAddressGate(f: {
  billingSameAsLegal: boolean
  legal: { street: string | null; city: string | null } | null
  billing: { street: string | null; city: string | null } | null
  remitAddressLines: readonly string[]
}): Gate {
  const filled = (a: { street: string | null; city: string | null } | null) => !!a && !!a.street?.trim() && !!a.city?.trim()
  if (f.billingSameAsLegal ? filled(f.legal) : filled(f.billing)) return { ok: true }
  if (f.remitAddressLines.some((l) => l.trim())) return { ok: true }
  return { ok: false, says: NO_BILLING_ADDRESS, step: 'ADDRESSES' }
}

export function bankNotChecked(payee: string): string {
  return `Pay ${payee} once its bank details are checked. ${payee} enters them under ${STEP_PLACE.BANK}, and your Finance team checks them before anybody pays.`
}

/**
 * Pure: the payee's bank details are checked where its payment details
 * carry a check, or where the payer's own Finance checked them on the
 * supplier's walk (the BANK item held or waived with a reason).
 */
export function bankGate(f: {
  payee: string
  remitVerified: boolean
  walkBankState: string | null
}): Gate {
  if (f.remitVerified) return { ok: true }
  if (f.walkBankState === 'HELD' || f.walkBankState === 'WAIVED') return { ok: true }
  return { ok: false, says: bankNotChecked(f.payee), step: 'BANK' }
}

export function domainNotVerified(company: string, domain: string): string {
  return `${company} has not verified ${domain} yet, so colleagues join by invitation. Ask ${company} to invite you, or to verify ${domain} under ${STEP_PLACE.DOMAIN}.`
}

/**
 * Pure: may a person on this domain join this company by signing in?
 * Only once the company proved the domain. Read by `decideEntry` in
 * lib/company-domains, the one door both sign-in ways use.
 */
export function mayJoinByDomain(claim: { companyName: string; domain: string; verified: boolean }): Gate {
  if (claim.verified) return { ok: true }
  return { ok: false, says: domainNotVerified(claim.companyName, claim.domain), step: 'DOMAIN' }
}

/** The parties of the regulatory set, in the words a refusal uses. */
const PARTY_PLAIN: Record<Party, string> = {
  WORKERS_W2: 'your W2 employees',
  CORP_TO_CORP: 'workers paid through their own company',
  SUB_VENDORS: 'the suppliers you buy from',
  CUSTOMERS: 'the customers you bill',
}

export function setNotConfirmed(party: Party): string {
  return `Etyme does not chase ${PARTY_PLAIN[party]} for papers until you confirm what you require of them, under ${STEP_PLACE.PAPERS}.`
}

/** Pure: whether the company confirmed its set for this party. */
export function paperChaseGate(party: Party, confirmedParties: readonly string[]): Gate {
  if (confirmedParties.includes(party)) return { ok: true }
  return { ok: false, says: setNotConfirmed(party), step: 'PAPERS' }
}
