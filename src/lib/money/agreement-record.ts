/**
 * Recording an agreement two firms actually signed.
 *
 * ── The fault this closes (release walk, 2026-10-27) ────────────────
 *
 * A sub-vendor could not record its agreement with a prime on any
 * screen. The agreements page was a client's tab, reached by a supplier
 * only by typing its address, and it had no add button, because no route
 * created an agreement with terms: three routes wrote an unsigned
 * placeholder at thirty days so a counterparty had a row, and the
 * agreements routes read, amended, signed and ended what was there. So
 * the terms every bill and payment between a pair follows (founder,
 * 2026-10-18: "AR and AP is always based on the agreed MSA") could be
 * agreed at signing and typed in nowhere.
 *
 * ── The rules ────────────────────────────────────────────────────────
 *
 * - **Either party may record it**, the firm that sells or the firm that
 *   buys, because either may be the one holding the paper. Both read the
 *   same row.
 * - **A firm on Etyme is named only where the two already trade**: an
 *   order, a contract, an agreement, a job sent, or the firm's own
 *   register. Otherwise any firm could put its name to an agreement with
 *   any real tenant (`mayNameCounterparty` in `lib/off-system`, the same
 *   rule said for agreements). A firm not on Etyme is the caller's own
 *   record and may be named.
 * - **One live agreement per pair.** A second is refused and names the
 *   one on file, which is amended rather than duplicated. An unsigned
 *   placeholder somebody's route wrote (no signature, no file, no term,
 *   no rhythm, nothing ever amended) is not an agreement anybody signed,
 *   so it is filled in instead of refused.
 * - **The terms are the agreement's own**: net days, what they run from,
 *   the rhythm, the currency. One left blank is silence (null where the
 *   column allows it), never a default somebody did not choose.
 * - **The signed copy is a link and a name**, recorded and never verified
 *   by us. Signatures, both sides, are recorded afterwards on the
 *   agreement, the countersignature with them.
 *
 * No database in here.
 */

import { isAnchor, ANCHORS } from '@/lib/billing-cascade'
import type { OrderTerms, AgreementTerms as ReadByTheCascade } from '@/lib/money/order-terms'

/** The period engine's own rhythms: an agreement says nothing the cascade cannot read. */
export type AgreementRhythm = OrderTerms['frequency']
export const AGREEMENT_RHYTHMS: readonly AgreementRhythm[] = ['WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY']

export interface RecordedTerms {
  paymentTerms: number | null
  paymentTermsFrom: string | null
  billFrequency: AgreementRhythm | null
  currency: string | null
  effectiveDate: Date | null
  expiresAt: Date | null
  executedFileName: string | null
  executedFileUrl: string | null
}

export type TermsRead =
  | { ok: true; terms: RecordedTerms }
  | { ok: false; says: string; field: string }

/**
 * The recorded terms as the cascade reads an agreement
 * (`termsFor` in lib/money/order-terms): what every bill and payment
 * between the two firms follows from now on.
 */
export function readByTheCascade(t: RecordedTerms, fallbackCurrency: string): ReadByTheCascade {
  return {
    billFrequency: t.billFrequency,
    paymentTerms: t.paymentTerms,
    paymentTermsFrom: t.paymentTermsFrom,
    currency: t.currency ?? fallbackCurrency,
  }
}

const blank = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '')

function dateOf(v: unknown): Date | null | 'BAD' {
  if (blank(v)) return null
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? 'BAD' : d
}

/** The terms as typed, or the one sentence that says what is wrong with them. */
export function readAgreementTerms(body: Record<string, unknown>): TermsRead {
  let paymentTerms: number | null = null
  if (!blank(body.paymentTerms)) {
    const n = Number(body.paymentTerms)
    if (!Number.isInteger(n) || n < 0 || n > 180) {
      return { ok: false, field: 'paymentTerms', says: 'Net days are a whole number of days, from 0 to 180, as the agreement writes them.' }
    }
    paymentTerms = n
  }

  let paymentTermsFrom: string | null = null
  if (!blank(body.paymentTermsFrom)) {
    const from = String(body.paymentTermsFrom).toUpperCase()
    if (!isAnchor(from)) {
      return {
        ok: false,
        field: 'paymentTermsFrom',
        says: `Net days run from the invoice being received, the invoice date, the end of the work period or approval (${ANCHORS.join(', ')}).`,
      }
    }
    paymentTermsFrom = from
  }

  let billFrequency: AgreementRhythm | null = null
  if (!blank(body.billFrequency)) {
    const f = String(body.billFrequency).toUpperCase()
    if (!(AGREEMENT_RHYTHMS as readonly string[]).includes(f)) {
      return { ok: false, field: 'billFrequency', says: 'A bill is raised weekly, every other week, twice a month or monthly. Leave it blank where the agreement does not say.' }
    }
    billFrequency = f as AgreementRhythm
  }

  let currency: string | null = null
  if (!blank(body.currency)) {
    const c = String(body.currency).trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(c)) {
      return { ok: false, field: 'currency', says: 'A currency is its three-letter code, such as USD, INR or GBP.' }
    }
    currency = c
  }

  const effectiveDate = dateOf(body.effectiveDate)
  if (effectiveDate === 'BAD') return { ok: false, field: 'effectiveDate', says: 'The day the agreement starts is not a date.' }
  const expiresAt = dateOf(body.expiresAt)
  if (expiresAt === 'BAD') return { ok: false, field: 'expiresAt', says: 'The day the agreement runs out is not a date.' }
  if (effectiveDate && expiresAt && expiresAt.getTime() <= effectiveDate.getTime()) {
    return { ok: false, field: 'expiresAt', says: 'An agreement cannot run out before it starts.' }
  }

  let executedFileUrl: string | null = null
  let executedFileName: string | null = null
  if (!blank(body.executedFileUrl)) {
    const url = String(body.executedFileUrl).trim()
    if (!/^https?:\/\/\S+$/i.test(url)) {
      return { ok: false, field: 'executedFileUrl', says: 'Give a link to the signed copy, starting http:// or https://.' }
    }
    executedFileUrl = url
    executedFileName = blank(body.executedFileName)
      ? decodeURIComponent(url.split('?')[0].split('/').filter(Boolean).pop() ?? 'Signed copy')
      : String(body.executedFileName).trim()
  } else if (!blank(body.executedFileName)) {
    return { ok: false, field: 'executedFileUrl', says: 'Give the link to the signed copy as well as its name, so anybody can open it.' }
  }

  return {
    ok: true,
    terms: { paymentTerms, paymentTermsFrom, billFrequency, currency, effectiveDate, expiresAt, executedFileName, executedFileUrl },
  }
}

export interface ExistingAgreement {
  id: string
  /** When it was put on file. */
  createdAt: Date
  paymentTerms: number
  paymentTermsFrom: string
  billFrequency: string | null
  effectiveDate: Date | null
  expiresAt: Date | null
  signedAt: Date | null
  executedFileName: string | null
  signatures: number
  versions: number
}

/**
 * An unsigned placeholder a route wrote so a counterparty had a row:
 * thirty days from the period end, nothing signed, nothing attached, no
 * term, no rhythm, and never amended by anybody.
 */
export function isPlaceholder(a: ExistingAgreement): boolean {
  return (
    a.signatures === 0 &&
    a.signedAt == null &&
    a.executedFileName == null &&
    a.effectiveDate == null &&
    a.expiresAt == null &&
    a.billFrequency == null &&
    a.paymentTerms === 30 &&
    a.paymentTermsFrom === 'PERIOD_END' &&
    a.versions === 0
  )
}

export type RecordVerdict =
  | { ok: true; fillId: string | null; vendorId: string; clientId: string; says: string }
  | { ok: false; says: string; field: string }

export function mayRecordAgreement(input: {
  caller: { id: string; name: string }
  other: { id: string; name: string; claimedAt: Date | null } | null
  /** True where the caller sells to the other firm; false where it buys from them. */
  callerSells: boolean
  /** Whether the two already trade: an order, a contract, an agreement, a job sent, or the register. */
  relationshipExists: boolean
  /** The live agreement between the pair, where there is one. */
  existing: ExistingAgreement | null
}): RecordVerdict {
  const { caller, other } = input
  if (!other) {
    return { ok: false, field: 'otherCompanyId', says: 'Pick the firm the agreement is with. Add them from Companies first if they are not there; they do not need to be on Etyme.' }
  }
  if (other.id === caller.id) {
    return { ok: false, field: 'otherCompanyId', says: 'An agreement is between two firms. Pick the other party to it.' }
  }
  if (other.claimedAt != null && !input.relationshipExists) {
    return {
      ok: false,
      field: 'otherCompanyId',
      says:
        `${other.name} is on Etyme and the two of you do not trade here yet, so an agreement in their name ` +
        `would be one nobody at ${other.name} knows about. Start from a job they sent you, an order, or ` +
        `ask them to add you, then record it.`,
    }
  }

  const vendorId = input.callerSells ? caller.id : other.id
  const clientId = input.callerSells ? other.id : caller.id
  const seller = input.callerSells ? caller.name : other.name
  const buyer = input.callerSells ? other.name : caller.name

  if (input.existing) {
    if (isPlaceholder(input.existing)) {
      return {
        ok: true,
        fillId: input.existing.id,
        vendorId,
        clientId,
        says:
          `The agreement between ${seller} and ${buyer} now reads what was signed. ` +
          `Until today it was an unsigned placeholder at thirty days.`,
      }
    }
    const since = input.existing.createdAt.toISOString().slice(0, 10)
    return {
      ok: false,
      field: 'otherCompanyId',
      says:
        `An agreement between ${seller} and ${buyer} is already on file, since ${since}. ` +
        `Change its terms there, with a reason, rather than recording a second one.`,
    }
  }

  return {
    ok: true,
    fillId: null,
    vendorId,
    clientId,
    says:
      `The agreement between ${seller} and ${buyer} is on file. ` +
      (other.claimedAt != null
        ? `Both firms read it; record each side's signature when you have it.`
        : `${other.name} is not on Etyme, so it is your record of it until they join.`),
  }
}

// ── Signing on screen ────────────────────────────────────────────────

/**
 * Whether this reader is offered "Record a signature" on an agreement
 * row, which side is still to sign, and what is said where it is not.
 *
 * The Tapin walk, 2026-10-29: an agreement could be recorded and never
 * signed on any screen, though the form said each side's signature is
 * recorded afterwards. The signature route
 * (`POST /api/program/agreements/[id]/sign`) records both sides, by the
 * supplier's seat holding `rates.write` or `settings.manage` — the seat
 * that holds the paper — and writes `MasterAgreement.signedAt` on the
 * later of the two when the second (the countersignature) is in. The
 * button follows exactly that rule, so the screen never offers what the
 * route refuses.
 */
export type SignOffer =
  | { offer: true; sides: Array<'VENDOR' | 'CLIENT'>; says: string }
  | { offer: false; says: string | null }

export function signOfferFor(a: {
  /** This reader's side: VENDOR where they sell under it. */
  role: 'VENDOR' | 'CLIENT'
  counterpartyName: string
  signedParties: readonly string[]
  /** `rates.write` or `settings.manage`, as the sign route asks. */
  holdsTheDesk: boolean
  ended?: boolean
}): SignOffer {
  const missing = (['VENDOR', 'CLIENT'] as const).filter((p) => !a.signedParties.includes(p))
  if (missing.length === 0) return { offer: false, says: null }
  if (a.ended) return { offer: false, says: 'This agreement was ended, so nothing more is signed on it.' }
  if (a.role === 'CLIENT') {
    return { offer: false, says: `${a.counterpartyName} records the signatures, both sides, from the copy it holds.` }
  }
  if (!a.holdsTheDesk) {
    return { offer: false, says: 'Your contract manager, an admin or the owner records the signatures.' }
  }
  const says = missing.length === 2
    ? 'Record each side’s signature as it is on the paper: the second one is the countersignature.'
    : missing[0] === 'CLIENT'
      ? `Your side is signed. Record ${a.counterpartyName}’s countersignature.`
      : `${a.counterpartyName} signed. Record your countersignature.`
  return { offer: true, sides: [...missing], says }
}
