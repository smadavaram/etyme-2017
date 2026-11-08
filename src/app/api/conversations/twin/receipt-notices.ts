/**
 * The twin's notice about an invoice receipt, read against the record on
 * the day it is said (the founder's walk 7, 2026-11-08, and the open line
 * after fda026207).
 *
 * The nightly run tells the paying team when a receipt does not match.
 * Until fda026207 a clean receipt held only on the supplier's bank
 * details was told the same way, so notices written before it read
 * "PR-2026-0441 from Pinnacle Resourcing does not match what was
 * accepted" about a receipt whose hours and rate agree. Those notices are
 * still unread on some seats, and their title never changes on its own.
 *
 * So the greeting does not trust a written title about a receipt. It reads
 * the receipt's verdict now, through the twin's own reader
 * (`invoiceVerdict`, and `receiptFlag` decides what the paying team is
 * told), and says that:
 *
 *   MISMATCH     "<number> from <supplier> does not match what was accepted"
 *   BANK_HOLD    "<number> from <supplier> is held: the bank details are not
 *                checked", with the hold's own sentence (who checks) under it
 *   NOT_PAYABLE  "<number> from <supplier> is held", with what holds it
 *   NONE         not said: nothing holds it any more, and the pay card
 *                carries it from here
 *
 * Nothing here decides a hold. Where the receipt cannot be read, the title
 * stays as it was written; it is never guessed.
 */

import { prisma } from '@/lib/db'
import { partiesOf, directionFrom } from '@/lib/money/invoice-parties'
import { invoiceVerdict, invoiceRulesFor, receiptFlag, bankHoldTitle, type InvoiceVerdict } from '@/lib/twin/rules/invoice'
import { RECEIPT_FLAG_ACT } from '@/lib/twin/held-notices'

/** The twin's mismatch notice as the nightly run titled it before the receipt was named (lib/twin/performers). */
export const MISMATCH_TITLE = 'An invoice receipt does not match what was accepted'

/** "PR-2026-0442 from Pinnacle Resourcing does not match what was accepted." */
export function mismatchSays(number: string, supplier: string | null): string {
  return `${number}${supplier ? ` from ${supplier}` : ''} does not match what was accepted`
}

/** "PR-2026-0441 from Pinnacle Resourcing", or as much of it as the record holds. */
function receiptNamed(number: string | null, supplier: string | null): string {
  if (number && supplier) return `${number} from ${supplier}`
  if (number) return `Invoice receipt ${number}`
  if (supplier) return `An invoice receipt from ${supplier}`
  return 'An invoice receipt'
}

export type ReceiptNoticeToday =
  | { kind: 'SAY'; title: string; body: string | null }
  /** Nothing holds the receipt any more: the line is not said, and is marked read with the rest. */
  | { kind: 'CLOSED' }

/**
 * What a notice about a receipt says today, from the receipt's verdict now.
 * Null where the verdict could not be read: the written title stands.
 * Pure.
 */
export function receiptNoticeToday(
  verdict: Pick<InvoiceVerdict, 'verdict' | 'payable' | 'heldOn' | 'rationale'> | null,
  named: { number: string | null; supplier: string | null },
): ReceiptNoticeToday | null {
  if (!verdict) return null
  const flag = receiptFlag(verdict)
  const why = verdict.rationale?.trim() ? verdict.rationale.trim() : null
  if (flag === 'NONE') return { kind: 'CLOSED' }
  if (flag === 'BANK_HOLD') return { kind: 'SAY', title: bankHoldTitle({ number: named.number, supplierName: named.supplier }), body: why }
  if (flag === 'NOT_PAYABLE') return { kind: 'SAY', title: `${receiptNamed(named.number, named.supplier)} is held`, body: why }
  return {
    kind: 'SAY',
    title: named.number ? mismatchSays(named.number, named.supplier) : `${receiptNamed(null, named.supplier)} does not match what was accepted`,
    body: null,
  }
}

function twinActOf(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const act = (data as Record<string, unknown>).twinAction
  return typeof act === 'string' ? act : null
}

/** Whether a notice is the twin's line about a receipt: its act, or the old generic title. Pure. */
export function isReceiptFlagNotice(n: { title: string; entityId: string | null; data: unknown }): boolean {
  if (!n.entityId) return false
  return n.title === MISMATCH_TITLE || twinActOf(n.data) === RECEIPT_FLAG_ACT
}

/**
 * The receipt notices among these, each read against its receipt today.
 * `titles` holds what to say (and the body, where the record has one);
 * `closed` the notices nothing holds any more. One verdict per receipt,
 * only for a receipt this company pays. Never throws.
 */
export async function receiptNoticesToday(
  rows: ReadonlyArray<{ id: string; title: string; entityId: string | null; data: unknown }>,
  companyId: string | null,
): Promise<{ titles: Map<string, { title: string; body: string | null }>; closed: Set<string> }> {
  const titles = new Map<string, { title: string; body: string | null }>()
  const closed = new Set<string>()
  const flagged = rows.filter(isReceiptFlagNotice)
  if (flagged.length === 0) return { titles, closed }
  const ids = [...new Set(flagged.map((n) => n.entityId!))]
  try {
    const [invoices, keyed] = await Promise.all([
      prisma.invoice.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, number: true,
          engagement: { select: { msa: { select: { vendorId: true, clientId: true, vendor: { select: { id: true, name: true } }, client: { select: { id: true, name: true } } } } } },
          workOrder: { select: { issuedById: true, issuedToId: true, issuedBy: { select: { id: true, name: true } }, issuedTo: { select: { id: true, name: true } } } },
        },
      }),
      prisma.vendorBill.findMany({ where: { id: { in: ids } }, select: { id: true, number: true, vendorCompany: { select: { name: true } } } }),
    ])
    const said = new Map<string, ReceiptNoticeToday>()
    const mine = invoices.flatMap((i) => {
      const parties = partiesOf({ agreement: i.engagement?.msa ?? null, order: i.workOrder ?? null })
      // A receipt the reader is not paying keeps its title.
      if (companyId && directionFrom(parties, companyId) !== 'PAYABLE') return []
      return [{ id: i.id, number: i.number, supplier: parties.vendor?.name ?? null }]
    })
    const rules = mine.length && companyId ? await invoiceRulesFor(companyId).catch(() => undefined) : undefined
    const verdicts = await Promise.all(mine.map((i) => invoiceVerdict(i.id, rules).catch(() => null)))
    mine.forEach((i, k) => {
      const today = receiptNoticeToday(verdicts[k], { number: i.number, supplier: i.supplier })
      // A receipt whose verdict cannot be read is still named, as it was said.
      said.set(i.id, today ?? { kind: 'SAY', title: mismatchSays(i.number, i.supplier), body: null })
    })
    // A typed-in receipt is not read by the twin's run; it is named as it was said.
    for (const b of keyed) said.set(b.id, { kind: 'SAY', title: mismatchSays(b.number, b.vendorCompany?.name ?? null), body: null })
    for (const n of flagged) {
      const t = said.get(n.entityId!)
      if (!t) continue
      if (t.kind === 'CLOSED') closed.add(n.id)
      else titles.set(n.id, { title: t.title, body: t.body })
    }
  } catch {
    // The title as it was written; never a guess.
  }
  return { titles, closed }
}
