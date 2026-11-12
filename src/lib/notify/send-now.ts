/**
 * One email, sent now and waited for, with an honest answer.
 *
 * For a caller that must not say "emailed" before anything was tried: the
 * invitation route (the founder's three invitations of 2026-11-12 said
 * "emailed" on one path before the send was even attempted), the sign-in
 * link, the password door. It answers whether the email left and, if it did
 * not, why: the provider's status and cleaned words for the row and for
 * Etyme's staff, and `mailFailureSays(failure)` for the person who pressed
 * the button.
 *
 * It writes no notice row: the caller writes its own, because a letter
 * carrying a one-time link keeps the link in the mailbox and nowhere else
 * (lib/notify/account-mail). It never throws. A provider failure is
 * reported to Etyme's staff (`reportMailRefused`, one email an hour).
 */
import { demoAddress, DEMO_ADDRESS_NOTE, reportMailRefused, type Sender } from '@/lib/notification-delivery'
import { emailSender } from '@/lib/senders'
import { cleanProviderWords, isMailRefused, type MailFailure } from './mail-failure'

/** The note a row keeps where this deployment has no email sender. */
export const NOT_SET_UP_NOTE = 'No email provider set up, so this was recorded and not sent.'

export interface EmailToSend {
  to: string
  subject: string
  body: string
  /** For the staff alert only; never put in the email. */
  companyId?: string | null
  personId?: string | null
}

export type EmailSent =
  | { left: true; state: 'SENT'; at: Date; note: null; failure: null }
  | {
      left: false
      state: 'FAILED' | 'NOT_CONFIGURED' | 'DEMO_SKIPPED'
      at: null
      /** For the row's `deliveryNote`: the status and the provider's cleaned words. */
      note: string
      failure: MailFailure
    }

export interface SendNowDeps {
  /** The sender; `emailSender()` when not given. Null means none is set up. */
  sender?: Sender | null
  now?: Date
  /** How Etyme's staff are told; `reportMailRefused` when not given. */
  report?: (err: unknown, ctx: { companyId?: string | null; personId?: string | null }) => Promise<void>
}

export async function sendEmailNow(mail: EmailToSend, deps: SendNowDeps = {}): Promise<EmailSent> {
  const now = deps.now ?? new Date()
  const report = deps.report ?? reportMailRefused
  if (demoAddress(mail.to)) {
    return {
      left: false, state: 'DEMO_SKIPPED', at: null, note: DEMO_ADDRESS_NOTE,
      failure: { kind: 'DEMO', status: null, provider: null, words: null },
    }
  }
  const sender = deps.sender === undefined ? emailSender() : deps.sender
  if (!sender) {
    return {
      left: false, state: 'NOT_CONFIGURED', at: null, note: NOT_SET_UP_NOTE,
      failure: { kind: 'NOT_SET_UP', status: null, provider: null, words: null },
    }
  }
  try {
    await sender.send(mail.to, mail.subject, mail.body)
    return { left: true, state: 'SENT', at: now, note: null, failure: null }
  } catch (err) {
    const ctx = { companyId: mail.companyId ?? null, personId: mail.personId ?? null }
    await report(err, ctx).catch(() => {})
    if (isMailRefused(err)) {
      return { left: false, state: 'FAILED', at: null, note: err.message, failure: err.failure }
    }
    const words = cleanProviderWords(err instanceof Error ? err.message : String(err)) || null
    return {
      left: false, state: 'FAILED', at: null, note: words ?? 'Sending failed',
      failure: { kind: 'DOWN', status: null, provider: null, words },
    }
  }
}
