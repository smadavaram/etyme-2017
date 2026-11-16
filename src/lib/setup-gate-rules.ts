/**
 * The rules of what a skipped setup item refuses, with no database in
 * them, so a pure door (`decideEntry` in lib/company-domains) and a
 * screen may read them. `lib/setup-gates` asks the database and calls
 * these; read that file for why each exists.
 */

import type { ItemKey } from '@/lib/setup-checklist'
import type { Party } from '@/lib/document-stages/required-sets'
import { bankChange, type BankFacts } from '@/lib/money/remit-change'

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
  OWNERSHIP: 'Setup → Prove ownership',
  INTEGRATIONS: 'Setup → Integrations',
  FORWARDING: 'Setup → Automatic forwarding',
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

/**
 * Who checks a supplier's bank details at the paying firm, as money's
 * reader names them (`bankCheckers` in lib/money/bank-check): its Finance
 * seats; where it has none, the seats that pay; or nobody yet.
 */
export interface BankCheckerNames {
  by: 'FINANCE' | 'FALLBACK' | 'NOBODY'
  /** "Imelda Santoro", "Imelda Santoro or Rosalind Tay". */
  names: string
  payer: string
}

/**
 * The refusal a payment and a payment run say. Names who checks where it
 * is known (founder's tester, 2026-11-08: a firm with no Finance seat was
 * told its Finance team checks them); without the names, the old line.
 */
export function bankNotChecked(payee: string, who?: BankCheckerNames | null): string {
  const head = `Pay ${payee} once its bank details are checked. ${payee} enters them under ${STEP_PLACE.BANK}`
  if (!who) return `${head}, and your Finance team checks them before anybody pays.`
  if (who.by === 'NOBODY') {
    return `${head}. Nobody at ${who.payer} pays suppliers yet: give a seat the AP Clerk or Finance role, and that seat checks them before anybody pays.`
  }
  return `${head}, and ${who.names} checks them before anybody pays.`
}

/**
 * Pure: the payee's bank details are checked.
 *
 * Where the payee has payment details on Etyme, the row a payment goes to
 * decides (`payToRow` in lib/money/pay-to: its default, else the first it
 * entered), and nothing else: an older checked row never stands in for a
 * newer unchecked default. Where it has none, the payer's own Finance
 * holding the bank item on the supplier's newest walk is the check. A
 * waived bank item checks nothing, so it never opens the gate (Layer 7
 * money review, 2026-11-16; it used to).
 */
export function bankGate(f: {
  payee: string
  /** The payee has payment details on Etyme, so the row in use decides. */
  remitOnFile: boolean
  /** The row in use carries a check. */
  remitVerified: boolean
  /** The BANK item on the payer's newest walk of this supplier. */
  walkBankState: string | null
  who?: BankCheckerNames | null
}): Gate {
  const checked = f.remitOnFile ? f.remitVerified : f.walkBankState === 'HELD'
  if (checked) return { ok: true }
  return { ok: false, says: bankNotChecked(f.payee, f.who), step: 'BANK' }
}

// ── Checked by this payer (Layer 7, record 86) ──────────────────────
//
// Record 86, answer 7: "Each payer confirms for itself, so one client's
// check never counts for another." `BankCheck` holds one row per set of
// details per paying firm, and it is read first. The old columns on the
// details (`verifiedAt`, `verifiedByCompanyId`) stay written for one
// release and count only for the payer they name. The payment gate does
// not read this yet: `bankGate` above is unchanged, and the switch is the
// next slice's (money).

/** The details as they read now, with the old single check on them. */
export interface PayToFacts extends BankFacts {
  verifiedAt: Date | null
  verifiedByCompanyId: string | null
}

/** One paying firm's own check, as its `BankCheck` row holds it. */
export interface PayerCheckRow extends BankFacts {
  checkedAt: Date
  /** The call back's outcome, where one is recorded. */
  callbackOutcome?: 'CONFIRMED' | 'DID_NOT_MATCH' | 'NOT_REACHED' | null
}

export type PayerCheck =
  | { checked: true; from: 'BANK_CHECK' | 'OLD_COLUMNS'; at: Date }
  | {
      checked: false
      why:
        | 'NO_DETAILS'
        | 'NOT_CHECKED'
        /** This payer checked details that have since changed. */
        | 'DETAILS_CHANGED'
        /** This payer's call back did not confirm the details. */
        | 'CALLBACK_DID_NOT_CONFIRM'
        /** Only another paying firm checked them. */
        | 'ANOTHER_PAYER'
        /** Checked before Etyme recorded which firm checked. */
        | 'PAYER_NOT_RECORDED'
    }

/**
 * Pure: whether this paying firm checked the details a payment goes to.
 *
 * Its own `BankCheck` decides first, and stands only while the details
 * still read what it checked: a change to the bank, the account name or
 * either last four voids it, by the same rule that clears the old check
 * (`bankChange` in lib/money/remit-change). With no `BankCheck`, the old
 * columns count only where they name this payer.
 */
export function checkedByPayer(row: PayToFacts | null, check: PayerCheckRow | null, payerCompanyId: string): PayerCheck {
  if (!row) return { checked: false, why: 'NO_DETAILS' }
  if (check) {
    const now: BankFacts = {
      bankName: row.bankName, accountName: row.accountName, accountLast4: row.accountLast4, routingLast4: row.routingLast4,
    }
    if (bankChange(check, now).cleared) return { checked: false, why: 'DETAILS_CHANGED' }
    if (check.callbackOutcome && check.callbackOutcome !== 'CONFIRMED') return { checked: false, why: 'CALLBACK_DID_NOT_CONFIRM' }
    return { checked: true, from: 'BANK_CHECK', at: check.checkedAt }
  }
  if (!row.verifiedAt) return { checked: false, why: 'NOT_CHECKED' }
  if (!row.verifiedByCompanyId) return { checked: false, why: 'PAYER_NOT_RECORDED' }
  if (row.verifiedByCompanyId !== payerCompanyId) return { checked: false, why: 'ANOTHER_PAYER' }
  return { checked: true, from: 'OLD_COLUMNS', at: row.verifiedAt }
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
