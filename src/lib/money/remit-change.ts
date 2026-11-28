/**
 * Whether a change to a firm's payment details clears the check a paying
 * firm's Finance made on them.
 *
 * The schema's rule (`RemitTo.verifiedAt`): any change to the bank, the
 * account or the routing clears the check, because a paying firm checked
 * those facts and no others, and nobody is paid on details nobody checked
 * (`mayPayFirm` in lib/setup-gates). A label, an address or a default
 * flag changes nothing a payer checked, so the check stands.
 *
 * Pure, so every writer of those columns (Settings → Payment details,
 * Setup → Bank details, a supplier's walk) reads one rule and says one
 * sentence. Compares what is about to be written against what is stored;
 * a field the writer does not touch is left out of `after`.
 */

export interface BankFacts {
  bankName?: string | null
  accountName?: string | null
  accountLast4?: string | null
  routingLast4?: string | null
}

const CHECKED: readonly (keyof BankFacts)[] = ['bankName', 'accountName', 'accountLast4', 'routingLast4']

/** The sentence a writer answers with when the check was cleared. */
export const BANK_CHANGED_SAYS = 'Bank details changed; your client’s Finance checks them again before paying.'

const norm = (v: string | null | undefined) => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

export type BankChange =
  | { cleared: false }
  | {
      cleared: true
      /** Which of the checked facts moved. */
      changed: (keyof BankFacts)[]
      /** Spread into the write. */
      data: { verifiedAt: null; verifiedById: null; verifiedByCompanyId: null }
      says: string
    }

export function bankChange(before: BankFacts | null, after: BankFacts): BankChange {
  const changed = CHECKED.filter((k) => k in after && norm(after[k]) !== norm(before?.[k]))
  if (changed.length === 0) return { cleared: false }
  return {
    cleared: true,
    changed,
    data: { verifiedAt: null, verifiedById: null, verifiedByCompanyId: null },
    says: BANK_CHANGED_SAYS,
  }
}
