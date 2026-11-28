/**
 * What the Repair the pay window button says and posts, kept apart from
 * the repair's own arithmetic (lib/money/window-repair) so the payroll
 * screen imports nothing that plans cycles. Pure, and safe in a browser.
 */

/** The act, as a gerund phrase, for the sentence that names who may do it. */
export const REPAIRING_THE_WINDOW = 'Repairing the pay window'

/** The button's words on the held row. */
export const REPAIR_BUTTON = 'Repair the pay window'

/** The body the button posts: the placement, the pay line and the person. Every field the route reads. */
export function windowRepairBody(t: { sellContractId: string; buyContractId: string; personId: string }) {
  return { sellContractId: t.sellContractId, buyContractId: t.buyContractId, personId: t.personId }
}
