/**
 * Whether a document request can be sent again, and how long its link is
 * then open. Pure: the route reads the request and the day, and this
 * decides (the founder's tester, 2026-11-03: a request stuck at 0 of 3
 * could not be sent again from the page).
 */
import { plainDate } from '@/lib/plain-date'

/** How long a link sent again stays open, where it had run out. */
export const RESEND_OPEN_DAYS = 30

export type ResendPlan =
  | { ok: true; expiresAt: Date; until: string; waitingOn: string }
  | { ok: false; code: 'DONE' | 'CANCELLED' | 'NOTHING_OWED'; message: string }

export function resendPlan(
  packet: {
    label: string
    expiresAt: Date
    completedAt: Date | null
    cancelledAt: Date | null
    items: { label: string; required: boolean; state: string }[]
  },
  now: Date
): ResendPlan {
  if (packet.cancelledAt) return { ok: false, code: 'CANCELLED', message: `${packet.label} was called off, so there is nothing to send again. Ask again as a new request.` }
  if (packet.completedAt) return { ok: false, code: 'DONE', message: `Everything in ${packet.label} has arrived, so there is nothing to chase.` }
  const owed = packet.items.filter((i) => i.state === 'PENDING' || i.state === 'REJECTED')
  if (owed.length === 0) {
    return { ok: false, code: 'NOTHING_OWED', message: `Everything in ${packet.label} has arrived and waits for your look, so there is nothing to chase.` }
  }
  const expiresAt = packet.expiresAt.getTime() > now.getTime() ? packet.expiresAt : new Date(now.getTime() + RESEND_OPEN_DAYS * 86_400_000)
  const names = owed.map((i) => i.label)
  const waitingOn = names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return { ok: true, expiresAt, until: plainDate(expiresAt.toISOString()), waitingOn }
}

/** Where one item of a request stands, in the words a row shows when opened. Pure. */
export function itemStateSays(state: string, required: boolean): string {
  switch (state) {
    case 'ACCEPTED': return 'Accepted'
    case 'RECEIVED': return 'Arrived, waiting for your look'
    case 'REJECTED': return 'Sent back, asked for again'
    default: return required ? 'Not sent yet' : 'Not sent yet (optional)'
  }
}
