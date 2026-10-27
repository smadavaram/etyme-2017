/**
 * The papers a company requires, per party it deals with, before it has
 * written a rule of its own.
 *
 * ── Why this is here ─────────────────────────────────────────────────
 *
 * The founder, 2026-10-20: setup gains a step, **Papers you require**,
 * "pre-filled from the shipped default sets for a W2, a corp-to-corp
 * worker and a sub-vendor, so a company sees what it will ask for before
 * it asks, and adds or waives with a reason". The sets already exist, per
 * line shape, in `lib/document-requirements` (`defaultItemsFor`); this
 * reads them out per party, in the order a company meets each party, with
 * the three facts the step must show beside every item: what it is for,
 * who owes it, and whether it may be waived at all.
 *
 * Read off the shipped sets, never a second list, so the setup step and
 * the line a placement actually checks cannot disagree.
 *
 * ── Which parties a company deals with ───────────────────────────────
 *
 *   Client           suppliers, and one-person firms it buys from direct
 *   Supplier, GSI    its own W2 workers, one-person firms, sub-vendors,
 *                    and the customers it bills
 *   MSP              the customers whose programs it runs; it places
 *                    nobody, so it asks nothing of a worker
 *   One-person firm  the customers she bills
 *
 * ── What it is not yet ───────────────────────────────────────────────
 *
 * A company-level set is not on the record: a `DocumentRequirement` row
 * belongs to an order, a sell line or a buy line, never to a company. So
 * this is the default the step shows, and what a company changes on it
 * has nowhere to live until the architect adds a company owner to that
 * table. Pure: no database.
 */

import { defaultItemsFor, owedByFor, CANNOT_BE_WAIVED, type LineShape, type OwedBy } from '@/lib/document-requirements'
import { builtInType, type Purpose } from '@/lib/document-type'
import { stageFor, STANDS_ON_RULE, type Jurisdiction, type Stage } from '@/lib/document-stages'

/** A party a company deals with, as the setup step names it. */
export type Party = 'WORKERS_W2' | 'CORP_TO_CORP' | 'SUB_VENDORS' | 'CUSTOMERS'

export const PARTY_SAYS: Record<Party, string> = {
  WORKERS_W2: 'Your own employees (W2)',
  CORP_TO_CORP: 'Workers paid through their own company',
  SUB_VENDORS: 'Suppliers you buy from',
  CUSTOMERS: 'Customers you bill',
}

const PARTY_SHAPE: Record<Party, LineShape> = {
  WORKERS_W2: 'W2',
  CORP_TO_CORP: 'CORP_TO_CORP',
  SUB_VENDORS: 'SUB_VENDOR',
  CUSTOMERS: 'CUSTOMER',
}

/** Which parties each kind of company deals with, in the order it meets them. */
export const PARTIES_OF: Record<string, Party[]> = {
  CLIENT: ['SUB_VENDORS', 'CORP_TO_CORP'],
  VENDOR: ['WORKERS_W2', 'CORP_TO_CORP', 'SUB_VENDORS', 'CUSTOMERS'],
  GSI: ['WORKERS_W2', 'CORP_TO_CORP', 'SUB_VENDORS', 'CUSTOMERS'],
  MSP: ['CUSTOMERS'],
  CONSULTANT_CORP: ['CUSTOMERS'],
}

export interface RequiredItem {
  key: string
  label: string
  purpose: Purpose | null
  owedBy: OwedBy
  required: boolean
  /** False where nobody may agree to go without it: work authorization. */
  waivable: boolean
  /** When it may first be asked: before an offer, or after. */
  stage: Stage
}

export interface RequiredSet {
  party: Party
  says: string
  items: RequiredItem[]
}

/**
 * The shipped paper sets for a new company of this kind, one per party it
 * deals with. An unknown kind reads as a supplier, the same fallback the
 * menu uses, rather than as a company that requires nothing.
 */
export function defaultRequiredSets(companyKind: string | null | undefined, jurisdiction: Jurisdiction = 'US'): RequiredSet[] {
  const parties = PARTIES_OF[companyKind ?? ''] ?? PARTIES_OF.VENDOR
  return parties.map((party) => {
    const shape = PARTY_SHAPE[party]
    return {
      party,
      says: PARTY_SAYS[party],
      items: defaultItemsFor(shape).map((i): RequiredItem => {
        const t = builtInType(i.key)
        return {
          key: i.key,
          label: t?.label ?? i.key,
          purpose: t?.purpose ?? null,
          owedBy: i.owedBy ?? (t ? owedByFor(t, shape) : 'US'),
          required: i.required,
          waivable: !CANNOT_BE_WAIVED.includes(i.key),
          stage: stageFor(STANDS_ON_RULE[i.key] ?? i.key, jurisdiction).stage,
        }
      }),
    }
  })
}
