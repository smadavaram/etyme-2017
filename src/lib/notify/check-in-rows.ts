import { failureFromNote, mailFailureSays } from '@/lib/notify/mail-failure'

/**
 * What each row on Bench check-ins was, and why a try did not send.
 *
 * ── The fault this closes (fix list, layer five, F3) ─────────────────
 *
 * The tester read one person's check-in twice, both "Did not send.
 * failed". It was two real tries: the first invitation, and Resend. The
 * page drew both as "reply", with the same body and the same chip, so
 * two tries read as one row listed twice. Every outbound bench letter is
 * written with kind LINK, and LINK was labeled "reply" although the firm
 * sent it.
 *
 * ── How a row is named ──────────────────────────────────────────────
 *
 * The message row holds no subject, so what it was is read from what
 * already sits beside it, never guessed from its words:
 *
 *  - a row the Resend or Ask to renew log names by its message id is
 *    "sent again" or "asked to renew";
 *  - a row a stay reminder log names (by message id, or the listing and
 *    the minutes after the send, for rows written before the id was kept)
 *    is the reminder;
 *  - otherwise the first letter on a listing is the bench invitation, and
 *    any later one on the same listing is that invitation sent again;
 *  - a letter about no listing, sent just after the person answered, is
 *    the thank-you; anything else is "message".
 *
 * Only an inbound row is "replied". Pure: the route reads the rows.
 */

export type CheckInWhat =
  | 'INVITED'
  | 'INVITED_AGAIN'
  | 'RENEW_ASKED'
  | 'STAY_REMINDED'
  | 'THANKED'
  | 'MESSAGE'
  | 'FRESHNESS'
  | 'CONSENT'
  | 'OUTCOME'
  | 'PLACED'
  | 'REPLIED'

export interface CheckInRow {
  id: string
  personId: string
  kind: string
  direction: string
  aboutType: string | null
  aboutId: string | null
  at: Date
}

export interface CheckInLog {
  action: string
  at: Date
  messageId: string | null
  listingId: string | null
}

export const RESENT_ACTION = 'BENCH_INVITATION_RESENT'
export const RENEW_ACTION = 'BENCH_STAY_RENEW_ASKED'
export const REMINDED_ACTION = 'BENCH_STAY_REMINDED'
/** The log rows the route reads to name a letter. */
export const CHECK_IN_LOG_ACTIONS = [RESENT_ACTION, RENEW_ACTION, REMINDED_ACTION] as const

/** A stay reminder's log is written right after its send; this is how long "right after" may be. */
const REMINDER_WINDOW_MS = 5 * 60_000
/** The thank-you goes out as soon as the answer is written down. */
const THANKS_WINDOW_MS = 2 * 60_000

const KIND_WHAT: Record<string, CheckInWhat> = {
  FRESHNESS: 'FRESHNESS',
  CONSENT: 'CONSENT',
  OUTCOME: 'OUTCOME',
  PLACED: 'PLACED',
}

/**
 * What each row was. `firstOnListing` holds, for each listing a row is
 * about, the id of the first letter ever sent about it (it may sit
 * outside the page's window, which is why the route reads it apart).
 */
export function whatEachWas(
  rows: readonly CheckInRow[],
  o: { logs: readonly CheckInLog[]; firstOnListing: ReadonlyMap<string, string> }
): Map<string, CheckInWhat> {
  const out = new Map<string, CheckInWhat>()
  const byMessage = new Map<string, CheckInWhat>()
  for (const l of o.logs) {
    if (!l.messageId) continue
    if (l.action === RESENT_ACTION) byMessage.set(l.messageId, 'INVITED_AGAIN')
    else if (l.action === RENEW_ACTION) byMessage.set(l.messageId, 'RENEW_ASKED')
    else if (l.action === REMINDED_ACTION) byMessage.set(l.messageId, 'STAY_REMINDED')
  }
  // Reminder logs with no message id, each claiming at most one row.
  const reminders = o.logs.filter((l) => l.action === REMINDED_ACTION && !l.messageId && l.listingId)
  const claimed = new Set<number>()

  for (const r of rows) {
    if (r.direction === 'IN') { out.set(r.id, 'REPLIED'); continue }
    if (KIND_WHAT[r.kind]) { out.set(r.id, KIND_WHAT[r.kind]); continue }

    const named = byMessage.get(r.id)
    if (named) { out.set(r.id, named); continue }

    if (r.aboutType === 'LISTING' && r.aboutId) {
      const i = reminders.findIndex((l, n) => {
        if (claimed.has(n) || l.listingId !== r.aboutId) return false
        const after = l.at.getTime() - r.at.getTime()
        return after >= 0 && after <= REMINDER_WINDOW_MS
      })
      if (i >= 0) { claimed.add(i); out.set(r.id, 'STAY_REMINDED'); continue }
      const first = o.firstOnListing.get(r.aboutId)
      out.set(r.id, !first || first === r.id ? 'INVITED' : 'INVITED_AGAIN')
      continue
    }

    const answeredJustBefore = rows.some((x) =>
      x.direction === 'IN' && x.personId === r.personId &&
      r.at.getTime() - x.at.getTime() >= 0 && r.at.getTime() - x.at.getTime() <= THANKS_WINDOW_MS
    )
    out.set(r.id, answeredJustBefore ? 'THANKED' : 'MESSAGE')
  }
  return out
}

/** The words after the person's name on the row. */
export function whatItWasSays(w: CheckInWhat): string {
  switch (w) {
    case 'INVITED': return 'bench invitation'
    case 'INVITED_AGAIN': return 'bench invitation, sent again'
    case 'RENEW_ASKED': return 'asked to renew their bench stay'
    case 'STAY_REMINDED': return 'reminded their bench stay ends soon'
    case 'THANKED': return 'thanked for answering'
    case 'MESSAGE': return 'message'
    case 'FRESHNESS': return 'asked if still looking for work'
    case 'CONSENT': return 'asked if OK to put forward'
    case 'OUTCOME': return 'told how a job turned out'
    case 'PLACED': return 'told they got the job'
    case 'REPLIED': return 'replied'
  }
}

/** Written on the row by the sender where there was no address to send to (`send` in lib/messages). */
export const NO_ADDRESS_REASON = 'No email address on file.'

/**
 * Why a try did not send, in the words every other screen uses for an
 * email that did not go (`mailFailureSays`). Never the provider's own
 * words, its name or a status code: those are for Etyme's staff. Null
 * for a letter that went.
 */
export function whyNotSent(status: string, failReason: string | null): string | null {
  if (status === 'SENT') return null
  if (status === 'PENDING') return 'Not sent yet.'
  if (status === 'NOT_CONFIGURED') return mailFailureSays({ kind: 'NOT_SET_UP' })
  if (failReason === NO_ADDRESS_REASON) return 'There is no email address on their record, so nothing was sent.'
  return mailFailureSays(failureFromNote(failReason))
}

/** The chip on a row that did not go. */
export function notSentChip(status: string): string | null {
  if (status === 'SENT') return null
  return status === 'PENDING' ? 'not sent yet' : 'not sent'
}

/**
 * What the firm reads on a row, before and after her yes (batch five,
 * the walk of 2026-11-16).
 *
 * A firm that asked somebody at an address whose record is her own read
 * the row as "Daniel Osei · bench invitation", the name on her record,
 * and the letter below it greeted her by her own first name. CLAUDE.md:
 * before her yes, a firm reads only what it typed, and one reader decides
 * it (`firmReadsAt` in lib/consultant-portfolio/before-her-yes).
 *
 *  - `typedName` is that reader's answer for the row's person: the name
 *    the firm typed, else the address it asked at; null where the firm
 *    reads her record (she said yes, works here, or every word on the
 *    record is the firm's own).
 *  - Before her yes the row names her as typed, and the body is not
 *    shown: the letter she received greets her by her own name, and a
 *    reply is her words. Only she reads those until she says yes. The
 *    letter she receives keeps her own name.
 *  - After her yes, the row reads as it always did.
 *
 * Pure.
 */
export function checkInShown(
  m: { personName: string; direction: string; body: string },
  typedName: string | null
): { name: string; body: string | null; bodyWaits: string | null } {
  if (typedName == null) return { name: m.personName, body: m.body, bodyWaits: null }
  return { name: typedName, body: null, bodyWaits: bodyWaitsSays(typedName, m.direction) }
}

/** The line in place of a body the firm does not read yet. Pure. */
export function bodyWaitsSays(name: string, direction: string): string {
  return direction === 'IN'
    ? `What ${name} wrote is shown here once they say yes. Until then you read only what you typed.`
    : `This letter is shown here once ${name} says yes. Until then you read only what you typed.`
}
