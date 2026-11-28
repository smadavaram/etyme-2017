import { hasPermission } from '@/lib/permissions'

/**
 * Whether a bill's page offers "Send again".
 *
 * Only on a bill that has gone to the customer and is still owed — sent,
 * or partly paid — because a draft or a raised bill is sent with Send,
 * and a paid or cancelled one has nothing to send. Only on the firm's own
 * bill (the side that collects), never on an invoice receipt it was sent.
 * Only to whoever sends bills (`invoices.issue`). The route asks every one
 * of these again, and adds the five-minute rule, so this decides only
 * whether the button is drawn: a button the route would refuse is a
 * button that lies.
 */
export const SENT_AND_OWED = ['SUBMITTED', 'PARTIALLY_PAID'] as const

export function offersSendAgain(a: {
  status: string
  direction: 'RECEIVABLE' | 'PAYABLE' | 'NEITHER' | string
  permissions: readonly string[] | null
  /** True where the page reads another company's book from a seat there. */
  readingInASeat?: boolean
}): boolean {
  if (a.readingInASeat) return false
  if (a.direction !== 'RECEIVABLE') return false
  if (!(SENT_AND_OWED as readonly string[]).includes(a.status)) return false
  return a.permissions != null && hasPermission(a.permissions, 'invoices.issue')
}
