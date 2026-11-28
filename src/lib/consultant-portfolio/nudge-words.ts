/**
 * The activity log's line for reaching somebody again about their own
 * bench listing (`POST /api/bench/listings/:id/nudge`), said from what
 * the send returned (fix list D1, 2026-11-15).
 *
 * The row read "<name> sent <who> the bench invitation again." whatever
 * happened, so a refused or unconfigured email read as sent. Now only an
 * email that left reads as sent; anything else reads as a try. Rows
 * already written are not changed.
 *
 * Pure.
 */

import type { Status } from '@/lib/messages'

export function nudgeLogSummary(o: {
  actor: string
  shown: string
  act: 'RESEND' | 'RENEW'
  /** The send's own state (`send` in lib/messages). Only SENT left. */
  status: Status
}): string {
  const went = o.status === 'SENT'
  if (o.act === 'RESEND') {
    return went
      ? `${o.actor} sent ${o.shown} the bench invitation again.`
      : `${o.actor} tried to send ${o.shown} the bench invitation again; the email did not go.`
  }
  return went
    ? `${o.actor} asked ${o.shown} to renew their stay on the bench.`
    : `${o.actor} tried to ask ${o.shown} to renew their stay on the bench; the email did not go.`
}

/**
 * What the firm reads when Resend or Ask to renew did not go (the
 * conversation builder's find, 2026-11-15). It read the email sender's
 * own note, its name and status code included. Now it reads the plain
 * sentence Bench check-ins reads for the same try (`whyNotSent` in
 * lib/notify/check-in-rows), and the way round it. Pure.
 */
export function resendNotSentSays(shown: string, why: string | null): string {
  return `Recorded for ${shown}. ${why ?? 'The email did not go.'} Copy the link and send it yourself.`
}
