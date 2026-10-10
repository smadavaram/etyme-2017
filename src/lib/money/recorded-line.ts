/**
 * The pay line a recorded placement writes, under the award's own rules.
 *
 * ── Why ──────────────────────────────────────────────────────────────
 *
 * "Record a placement" is the door a firm uses for work it is already
 * running. Until 2026-10-06 it took a pay rate and nothing else: no
 * engagement type, no "bought from", a contract type that defaulted to
 * W2, and a rate of nothing that quietly wrote no line. The award was
 * closed the same day against writing an employment nobody agreed
 * (`lib/award/hire-terms`), and a second door that still wrote one would
 * have reopened it.
 *
 * So this door asks the same two questions and refuses the same things:
 * how the firm engages the person — its employee, an independent, through
 * the person's own company, or employed by another firm — and whom it
 * buys them from, if anybody. Where nobody is in between, the answer goes
 * through `checkStatedTerms`, demand's rule, word for word: no $0 line, a
 * corp-to-corp line pays the person's own company, and "employed by
 * another firm" is refused with the road that works.
 *
 * ── Bought from a supplier ───────────────────────────────────────────
 *
 * The line is to the supplier, corp-to-corp, at what the firm pays the
 * supplier. How the supplier engages and pays the person is the
 * supplier's agreement with them, never this firm's to type — the same
 * reason a buyer may not set the pay at the award. So with a supplier
 * named, an engagement that says this firm employs or pays the person
 * directly is a contradiction and refused; "employed by another firm" is
 * what buying from a supplier means, and is accepted.
 *
 * ── Why the person is not asked here ─────────────────────────────────
 *
 * The award writes a terms paper the person signs on their own page. A
 * recorded placement has no submission and so no such page; a paper that
 * waited on a signature nobody can give would hold the start for ever. A
 * line written by the contract desk with no paper and a rate above
 * nothing is "on record" in `hopZero` by demand's own rule, so the start
 * gate reads it the same way it reads any other desk-written line.
 *
 * Pure. The route reads the companies; this decides.
 */

import { checkStatedTerms, ENGAGEMENT_TYPES, perHour, type EngagementType } from '@/lib/award/hire-terms'

export interface RecordedLineInput {
  /** What the screen sends: W2, IND_1099, OWN_COMPANY or OTHER_EMPLOYER. */
  engagementType?: string | null
  /** The older field the API still accepts: W2, IND_1099 or C2C. */
  contractType?: string | null
  /** The firm this firm buys the person from, or null where it pays them itself. */
  boughtFrom: { id: string; name: string } | null
  /** Cents an hour, as typed. Anything that is not a positive number is a missing rate. */
  payRateCents?: unknown
  personName: string
  firmName: string
  /** The person's own company, where they have one on record. */
  ownCompany: { id: string; name: string } | null
}

export type RecordedLine =
  | {
      ok: true
      /** Null where nothing about pay was said: no line is written, and the start waits on it. */
      write: { contractType: 'W2' | 'IND_1099' | 'C2C'; vendorCompanyId: string | null; payRateCents: number } | null
      says: string
    }
  | {
      ok: false
      code: 'NO_TYPE' | 'NO_RATE' | 'NO_OWN_COMPANY' | 'THROUGH_THE_EMPLOYER' | 'TWO_ENGAGEMENTS'
      field: 'engagementType' | 'payRate' | 'boughtFromId'
      says: string
    }

const said = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== ''

function rateOf(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.round(n) : 0
}

/** The engagement the caller meant, read from the new field or the old one. */
function engagementFrom(i: RecordedLineInput): string | null {
  if (said(i.engagementType)) return String(i.engagementType).toUpperCase()
  if (!said(i.contractType)) return null
  const t = String(i.contractType).toUpperCase()
  if (t === 'W2' || t === 'IND_1099') return t
  // A corp-to-corp line names a firm to pay. With a supplier named it is
  // that supplier; with none it can only be the person's own company.
  if (t === 'C2C') return i.boughtFrom ? 'OTHER_EMPLOYER' : 'OWN_COMPANY'
  return t
}

export function recordedLine(i: RecordedLineInput): RecordedLine {
  const engagement = engagementFrom(i)
  const rateSaid = said(i.payRateCents)

  // A supplier that is the person's own company is not a supplier: it is
  // the corp-to-corp case, and goes through the same rule as one.
  const supplier = i.boughtFrom && i.boughtFrom.id !== i.ownCompany?.id ? i.boughtFrom : null
  const ownAsSupplier = Boolean(i.boughtFrom) && !supplier

  if (!engagement && !i.boughtFrom && !rateSaid) {
    return {
      ok: true,
      write: null,
      says:
        `No pay line yet. ${i.firmName} has not said how it engages ${i.personName} or what it pays them, ` +
        'so the placement cannot start until it does.',
    }
  }

  if (supplier) {
    if (engagement && engagement !== 'OTHER_EMPLOYER') {
      return {
        ok: false,
        code: 'TWO_ENGAGEMENTS',
        field: 'engagementType',
        says:
          `${i.firmName} cannot pay ${i.personName} itself and buy them from ${supplier.name} at once. ` +
          `Choose "bought from: nobody" if ${i.firmName} pays them, or leave how they are engaged to ${supplier.name}.`,
      }
    }
    const rate = rateOf(i.payRateCents)
    if (rate <= 0) {
      return {
        ok: false,
        code: 'NO_RATE',
        field: 'payRate',
        says: `Say what ${i.firmName} pays ${supplier.name} for ${i.personName}. An empty rate is a missing rate, not a free placement.`,
      }
    }
    return {
      ok: true,
      write: { contractType: 'C2C', vendorCompanyId: supplier.id, payRateCents: rate },
      says:
        `${i.firmName} buys ${i.personName} from ${supplier.name} at ${perHour(rate)}. ` +
        `How ${supplier.name} engages and pays them is between them.`,
    }
  }

  if (ownAsSupplier && engagement && engagement !== 'OWN_COMPANY') {
    return {
      ok: false,
      code: 'TWO_ENGAGEMENTS',
      field: 'engagementType',
      says:
        `${i.boughtFrom!.name} is ${i.personName}’s own company, so buying from it is paying them through their own company. ` +
        'Choose that, or "bought from: nobody".',
    }
  }

  const verdict = checkStatedTerms({
    engagementType: ownAsSupplier ? 'OWN_COMPANY' : engagement,
    payRateCents: rateOf(i.payRateCents),
    personName: i.personName,
    firmName: i.firmName,
    ownCompany: i.ownCompany,
  })
  if (!verdict.ok) {
    return {
      ok: false,
      code: verdict.code,
      field: verdict.code === 'NO_RATE' ? 'payRate' : 'engagementType',
      says: verdict.says,
    }
  }
  return {
    ok: true,
    write: { contractType: verdict.contractType, vendorCompanyId: verdict.vendorCompanyId, payRateCents: verdict.payRateCents },
    says: verdict.says,
  }
}

/** The choices the screen offers, in the order and the words of the terms page. */
export const RECORDED_ENGAGEMENTS: readonly EngagementType[] = ENGAGEMENT_TYPES
