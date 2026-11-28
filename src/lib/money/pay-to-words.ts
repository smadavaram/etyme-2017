/** In the account's place where the firm's payment details are not checked yet. */
export const PAY_TO_BEING_CONFIRMED = 'Payment details are being confirmed, so no account is printed on this bill yet.'

/** In the account's place where the firm has entered no payment details. */
export const PAY_TO_NONE = 'No payment details are on this bill yet.'

/**
 * Where a bill is paid, in one line: the firm's checked payment details,
 * shown as the bank, the name on the account and four digits, never more
 * (CLAUDE.md, the setup checklist's bank item). Where none is printed,
 * `entered` says whether details wait to be checked or were never given.
 * Pure.
 */
export function payToSays(r: {
  legalName: string
  accountName: string | null
  bankName: string | null
  accountLast4: string | null
  paymentMethod: string | null
} | null, entered = false): string {
  if (!r) return entered ? PAY_TO_BEING_CONFIRMED : PAY_TO_NONE
  const parts = [
    r.accountName ?? r.legalName,
    r.bankName,
    r.accountLast4 ? `account ending ${r.accountLast4}` : null,
    r.paymentMethod ? `by ${r.paymentMethod === 'CHECK' ? 'check' : r.paymentMethod === 'WIRE' ? 'wire' : 'ACH'}` : null,
  ].filter(Boolean)
  return `Pay to ${parts.join(', ')}.`
}
