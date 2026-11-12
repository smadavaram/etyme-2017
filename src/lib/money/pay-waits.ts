import { ownerOnlyLineAt, type OwnerLine } from '@/lib/owner-proof'

/**
 * Where a company still waits for a verified Owner, no money leaves it
 * (the proof rule, founder 2026-11-11), and every payment route refuses
 * Pay in the gate's own sentence. A screen that draws Pay there draws a
 * button the route will refuse, and the first person to learn of the rule
 * is the AP clerk pressing it in her first week.
 *
 * So the screens that pay (Payables, the receipt's own page, the payment
 * run) ask this first: the gate's own sentence and its link to Setup,
 * Prove ownership (`ownerOnlyLine` in lib/owner-gate, drawn by
 * `OwnerGateLine`), and no Pay control where it is said. Null where the
 * company may pay, so nothing is said and nothing changes for a company
 * formed before the rule, or one whose Owner is verified.
 *
 * Only the line with a step to take: at a company with a verified Owner
 * paying is not an Owner act (an AP clerk pays), so the Owner-only words
 * `ownerOnlyLine` says there are never shown beside Pay.
 */
export async function payWaitsAt(companyId: string): Promise<OwnerLine | null> {
  const line = await ownerOnlyLineAt(companyId, 'PAY')
  return line.href ? line : null
}
