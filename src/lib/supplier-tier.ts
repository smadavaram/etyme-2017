/**
 * A supplier's standing with a client.
 *
 * The VENDOR_TIER rule — "vendor must be approved or preferred" — had
 * nothing to read: no supplier had a tier anywhere, so the rule passed
 * anybody with an agreement on file and warned about everybody else.
 * The standing lives on the client's counterparty row for the supplier,
 * set from the suppliers page, and this is what a rule makes of it.
 *
 *   PROBATION   may work what is already placed; nothing new without a reason
 *   APPROVED    may be sent roles
 *   PREFERRED   first call
 *
 * Null means never rated. An agreement on file then counts as APPROVED,
 * which is what an agreement is.
 */

export const TIERS = ['PROBATION', 'APPROVED', 'PREFERRED'] as const
export type Tier = (typeof TIERS)[number]

export function isTier(x: unknown): x is Tier {
  return typeof x === 'string' && (TIERS as readonly string[]).includes(x)
}

export function rank(tier: string | null | undefined, hasAgreement: boolean): number {
  if (isTier(tier)) return TIERS.indexOf(tier)
  return hasAgreement ? TIERS.indexOf('APPROVED') : -1
}

export function tierWord(tier: string | null | undefined, hasAgreement: boolean): string {
  if (isTier(tier)) return tier === 'PROBATION' ? 'On probation' : tier === 'APPROVED' ? 'Approved' : 'Preferred'
  return hasAgreement ? 'Approved by agreement' : 'Not rated'
}

export function meets(input: {
  supplierName: string
  tier: string | null | undefined
  hasAgreement: boolean
  required: string
}): { ok: boolean; reason: string } {
  const required = isTier(input.required) ? input.required : 'APPROVED'
  const have = rank(input.tier, input.hasAgreement)
  const need = TIERS.indexOf(required)
  const word = tierWord(input.tier, input.hasAgreement).toLowerCase()
  if (have >= need) return { ok: true, reason: `${input.supplierName} is ${word}.` }
  if (have < 0) return { ok: false, reason: `${input.supplierName} has no agreement with this client and no standing. This role needs a supplier that is ${required.toLowerCase()} or better.` }
  return { ok: false, reason: `${input.supplierName} is ${word}. This role needs a supplier that is ${required.toLowerCase()} or better.` }
}
