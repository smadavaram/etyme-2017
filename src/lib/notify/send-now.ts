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
import { dressLetter } from './letter-html'
import { cleanProviderWords, isMailRefused, type MailFailure } from './mail-failure'
import { isMailHeld, recordNotSent, type MailAbout, type MailToSend } from './mail-door'

/** The note a row keeps where this deployment has no email sender. */
export const NOT_SET_UP_NOTE = 'No email provider set up, so this was recorded and not sent.'

export interface EmailToSend {
  to: string
  subject: string
  body: string
  /**
   * The HTML part. Left out, a letter that carries a link is dressed from
   * its own text (`dressLetter`); null sends the text alone.
   */
  html?: string | null
  /** For the staff alert only; never put in the email. */
  companyId?: string | null
  personId?: string | null
  /** What the mail ledger records this email was for (lib/notify/mail-door). */
  about?: MailAbout | null
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
  /**
   * Writes the mail ledger row for an email that cannot leave (no sender,
   * or a demo address), with no provider call; `recordNotSent` of the mail
   * door when not given.
   */
  notSent?: (mail: MailToSend, outcome: 'NOT_CONFIGURED' | 'DEMO_SKIPPED') => Promise<unknown>
  /** How Etyme's staff are told; `reportMailRefused` when not given. */
  report?: (err: unknown, ctx: { companyId?: string | null; personId?: string | null }) => Promise<void>
}

export async function sendEmailNow(mail: EmailToSend, deps: SendNowDeps = {}): Promise<EmailSent> {
  const now = deps.now ?? new Date()
  const report = deps.report ?? reportMailRefused
  // Every attempt is on the mail ledger, the two that cannot leave
  // included: the door writes their row, and no provider is called.
  const about = mail.about ? { ...mail.about, companyId: mail.about.companyId ?? mail.companyId ?? null } : null
  const notSent = async (outcome: 'NOT_CONFIGURED' | 'DEMO_SKIPPED') => {
    const ledger = deps.notSent ?? ((m: MailToSend, o: 'NOT_CONFIGURED' | 'DEMO_SKIPPED') => recordNotSent(m, o))
    await ledger({ to: mail.to, subject: mail.subject, text: mail.body, about: about ?? (mail.companyId ? { companyId: mail.companyId, template: '' } : null) }, outcome).catch(() => {})
  }
  if (demoAddress(mail.to)) {
    await notSent('DEMO_SKIPPED')
    return {
      left: false, state: 'DEMO_SKIPPED', at: null, note: DEMO_ADDRESS_NOTE,
      failure: { kind: 'DEMO', status: null, provider: null, words: null },
    }
  }
  const sender = deps.sender === undefined ? emailSender() : deps.sender
  if (!sender) {
    await notSent('NOT_CONFIGURED')
    return {
      left: false, state: 'NOT_CONFIGURED', at: null, note: NOT_SET_UP_NOTE,
      failure: { kind: 'NOT_SET_UP', status: null, provider: null, words: null },
    }
  }
  try {
    const html = mail.html === undefined ? dressLetter(mail.subject, mail.body) : mail.html
    if (html || about) await sender.send(mail.to, mail.subject, mail.body, null, html || null, ...(about ? [about] : []))
    else await sender.send(mail.to, mail.subject, mail.body)
    return { left: true, state: 'SENT', at: now, note: null, failure: null }
  } catch (err) {
    // A rule of the mail door held it: Etyme's own sentence, and nothing
    // for staff to mend, so nobody is alerted.
    if (isMailHeld(err)) {
      return { left: false, state: 'FAILED', at: null, note: err.message, failure: { kind: 'HELD', status: null, provider: null, words: err.message } }
    }
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
