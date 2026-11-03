/**
 * Where a bill is paid, in one line: the firm's checked payment details,
 * shown as the bank, the name on the account and four digits, never more
 * (CLAUDE.md, the setup checklist's bank item). Pure.
 */
export function payToSays(r: {
  legalName: string
  accountName: string | null
  bankName: string | null
  accountLast4: string | null
  paymentMethod: string | null
} | null): string {
  if (!r) return 'No checked payment details are on this bill yet.'
  const parts = [
    r.accountName ?? r.legalName,
    r.bankName,
    r.accountLast4 ? `account ending ${r.accountLast4}` : null,
    r.paymentMethod ? `by ${r.paymentMethod === 'CHECK' ? 'check' : r.paymentMethod === 'WIRE' ? 'wire' : 'ACH'}` : null,
  ].filter(Boolean)
  return `Pay to ${parts.join(', ')}.`
}
