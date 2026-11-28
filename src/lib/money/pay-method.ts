/**
 * How a payment is made, in the words the pay form offers, and which one
 * it opens on.
 *
 * The form opened on Wire for every invoice, above a remit-to line that
 * said the supplier is paid by ACH. A clerk who does not change it
 * records a wire that was never sent — or sends one to a supplier set up
 * for ACH. The supplier's own remit-to method is the one the form opens
 * on; Wire is never assumed.
 *
 * Pure: no database.
 */

export const PAYMENT_METHODS = ['ACH', 'Wire', 'Check', 'Credit Card', 'Other'] as const
export type PaymentMethodWord = (typeof PAYMENT_METHODS)[number]

/**
 * The form's word for a remit-to method (`BankAccount.paymentMethod`:
 * ACH · WIRE · CHECK). Null where the supplier has none on file or one
 * this form does not know, so the screen can ask rather than pick.
 */
export function payMethodFor(remitMethod: string | null | undefined): PaymentMethodWord | null {
  switch (String(remitMethod ?? '').trim().toUpperCase()) {
    case 'ACH': return 'ACH'
    case 'WIRE': return 'Wire'
    case 'CHECK': return 'Check'
    case 'CARD':
    case 'CREDIT CARD':
    case 'CREDIT_CARD': return 'Credit Card'
    default: return null
  }
}
