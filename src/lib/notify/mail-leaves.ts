/**
 * Whether an email can leave this deployment: the one answer every
 * sentence that says a letter went, goes or will go reads.
 *
 * Found on the Tapin walks (2026-10-29 and 2026-10-30): pages said "a
 * letter is on its way" and "notifications go by email" on a deployment
 * with no email key, where nothing could leave. The bench invitation
 * already asked first (`configured` in lib/messages, `inviteMail` in
 * lib/bench-filter), and other callers asked `emailSender() !== null`
 * themselves. Now the sender itself asks here, so a sentence that reads
 * this and the send that follows it cannot disagree.
 *
 * Email leaves only where a provider key (Resend or SendGrid) and the
 * address it is sent from (NOTIFY_FROM_EMAIL) are both set. A reserved
 * demo address is never written to even then (`demoAddress` in
 * lib/notification-delivery); that is a fact about the address, not the
 * deployment, and the sender says it where it applies.
 *
 * No database, no fetch: it reads the environment it is handed.
 */

type Env = Record<string, string | undefined>

export function mailLeaves(env: Env = process.env): boolean {
  if (!env.NOTIFY_FROM_EMAIL) return false
  return Boolean(env.RESEND_API_KEY || env.SENDGRID_API_KEY)
}

/** Said where a sentence would otherwise promise an email that cannot leave. */
export const NO_MAIL_HERE = 'No email can be sent from here yet'
