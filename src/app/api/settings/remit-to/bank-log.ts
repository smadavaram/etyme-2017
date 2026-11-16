import { prisma } from '@/lib/db'
import { bankWords } from '@/lib/setup-checklist'
import type { BankChange } from '@/lib/money/remit-change'

/**
 * The one row a write to a firm's payment details leaves in the activity
 * log, for every door that writes them: Settings → Payment details (add
 * and edit) and Setup → Bank details. Money's review, 2026-11-16, found
 * Setup wrote the change with no row at all.
 *
 * The row shows what a screen shows (`bankWords`): the bank, the name on
 * the account and the last four digits. Never a full number, and never
 * the routing digits: the log is read more widely than the details are.
 * Never reversible: the activity log cannot undo where money arrives, and
 * the check a paying firm made is not put back by putting the old bank
 * back. It is changed again where it was changed, and checked again.
 */

export interface BankWrite {
  companyId: string
  remitToId: string
  legalName: string
  byName: string
  /** True when the write made a new set of details. */
  added: boolean
  /** True when the write made these the details new bills name. */
  madeDefault?: boolean
  /** Settings or Setup, said in the reason. */
  door: 'SETTINGS' | 'SETUP'
  /** What the row holds after the write. */
  after: { bankName: string | null; accountName: string | null; accountLast4: string | null }
  /** `bankChange` (lib/money/remit-change) on the same write. */
  change: BankChange
}

/** The row, pure, so a test reads its words without a database. */
export function bankLogRow(w: BankWrite) {
  const shows = bankWords({ bankName: w.after.bankName, accountName: w.after.accountName ?? w.legalName, last4: w.after.accountLast4 })
  const did = w.added ? 'added' : 'changed'
  const where = w.door === 'SETUP' ? 'Entered in setup' : w.added ? 'Added in settings' : 'Edited in settings'
  return {
    companyId: w.companyId,
    action: w.added ? 'REMIT_TO_ADDED' : 'REMIT_TO_CHANGED',
    summary: `${w.byName} ${did} payment details for ${w.legalName}${shows ? `: ${shows}` : ''}${w.madeDefault ? ', and made them the default' : ''}.`,
    reason: w.change.cleared && !w.added
      ? `${where}. The bank changed, so the check on it was cleared.`
      : where,
    payload: {
      remitToId: w.remitToId,
      legalName: w.legalName,
      bankName: w.after.bankName,
      accountName: w.after.accountName,
      accountLast4: w.after.accountLast4,
      changed: w.change.cleared ? w.change.changed : [],
      checkCleared: w.change.cleared,
      madeDefault: !!w.madeDefault,
    },
    reversible: false,
  }
}

export async function recordBankWrite(w: BankWrite): Promise<void> {
  // The action is named again at the write, so the autonomy inventory
  // (actionsNamedIn, lib/autonomy) reads who writes each one.
  await prisma.automationLog.create({ data: { ...bankLogRow(w), action: w.added ? 'REMIT_TO_ADDED' : 'REMIT_TO_CHANGED' } })
}
