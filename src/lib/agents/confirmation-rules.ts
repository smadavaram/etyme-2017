/**
 * The confirmation tracker's rules (record 112, chain 1, "Win work"). Pure:
 * no database, no clock but the one it is handed.
 *
 * A submission goes out; the other side confirms it got it. This reads
 * the two against each other and says, for each submission that went out,
 * where it stands:
 *
 *  - NOT_SENT: the package has not left. A draft is never a confirmation,
 *    whatever else is on the record.
 *  - CONFIRMED: somebody recorded a confirmation, or a reply Etyme already
 *    holds says so, and the letter that carried it did not bounce.
 *  - FAILED_DELIVERY: the letter about it did not reach the other side
 *    (the mail ledger says so), so it is open again. A bounce reopens an
 *    item that read confirmed, too.
 *  - AWAITING: out, not bounced, not confirmed.
 *  - BLOCKED: it is one of two authorizations for the same person and job
 *    in an overlapping window. No confirmation is recorded on it until two
 *    different seats release it.
 */

export const CHANNELS = ['EMAIL', 'PHONE', 'PORTAL', 'MANUAL'] as const
export type Channel = (typeof CHANNELS)[number]

export const CONFIRMATION_AGENT = 'confirmation-tracker'
export const CONFIRMATION_RULE = 'confirmation-tracker-v1'

/**
 * PROPOSED DEFAULT, AWAITING THE OWNER. Nobody has decided how many days a
 * submission may wait for its confirmation before it reads as late.
 */
export const PROPOSED_LATE_AFTER_DAYS = 3

export const FAILED_PREFIX = 'Failed delivery: '
export const DUAL_PREFIX = 'Two authorizations for '

/** A reply that says "we have it" on its face: an interview proposed, or a rate confirmed. Plain text proves nothing. */
export const CONFIRMING_MESSAGE_TYPES = ['INTERVIEW', 'RATE_CONFIRMATION'] as const

export type ItemState = 'NOT_SENT' | 'AWAITING' | 'CONFIRMED' | 'FAILED_DELIVERY' | 'BLOCKED'

export interface MailFact { id: string; outcome: string; createdAt: Date }
export interface ConfirmationFact { id: string; mailSendId: string | null; confirmedAt: Date }
export interface SubmissionFact {
  id: string
  personId: string
  personName: string
  /** The client and the job's title, lower cased: what makes two requirements the same job. */
  jobKey: string
  jobTitle: string
  submittedAt: Date
  /** The day it was rejected or withdrawn; null while it stands. */
  endedAt: Date | null
  checkState: string
}

/** Whether the package has left. Only SENT has. */
export const wentOut = (s: { checkState: string }): boolean => s.checkState === 'SENT'

/** A confirmation counts only if the letter it answers, where it names one, left and did not bounce. Pure. */
export function countingConfirmations(confirmations: readonly ConfirmationFact[], mails: readonly MailFact[]): ConfirmationFact[] {
  return confirmations.filter((c) => {
    if (!c.mailSendId) return true
    const mail = mails.find((m) => m.id === c.mailSendId)
    return !!mail && mail.outcome === 'SENT'
  })
}

/** The newest letter about the submission, or null. Pure. */
function newest(mails: readonly MailFact[]): MailFact | null {
  return [...mails].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)).at(-1) ?? null
}

/** Whether the newest letter about the submission failed to reach. Pure. */
export function lastLetterBounced(mails: readonly MailFact[]): boolean {
  return newest(mails)?.outcome === 'FAILED_DELIVERY'
}

export function itemState(input: {
  submission: Pick<SubmissionFact, 'checkState'>
  confirmations: readonly ConfirmationFact[]
  mails: readonly MailFact[]
  blocked: boolean
}): ItemState {
  if (!wentOut(input.submission)) return 'NOT_SENT'
  if (input.blocked) return 'BLOCKED'
  const counting = countingConfirmations(input.confirmations, input.mails)
  const last = newest(input.mails)
  const bounced = last?.outcome === 'FAILED_DELIVERY'
  if (counting.length > 0) {
    // A bounce after the last confirmation reopens the item; one before it was answered.
    const latest = Math.max(...counting.map((c) => c.confirmedAt.getTime()))
    return bounced && last!.createdAt.getTime() > latest ? 'FAILED_DELIVERY' : 'CONFIRMED'
  }
  if (bounced) return 'FAILED_DELIVERY'
  // A confirmation tied to a letter that bounced is not one.
  const tiedToBounce = input.confirmations.some((c) => input.mails.find((m) => m.id === c.mailSendId)?.outcome === 'FAILED_DELIVERY')
  return tiedToBounce ? 'FAILED_DELIVERY' : 'AWAITING'
}

const FAR = Number.MAX_SAFE_INTEGER
const windowOf = (s: SubmissionFact): [number, number] => [s.submittedAt.getTime(), s.endedAt ? s.endedAt.getTime() : FAR]

/**
 * Groups of live submissions for one person and one job whose windows
 * overlap. One person put forward twice for the same job at once is two
 * authorizations: only one of them can be right. Each group lists its
 * members in the order they went out. Pure.
 */
export function dualAuthorizations(subs: readonly SubmissionFact[]): SubmissionFact[][] {
  const live = subs.filter((s) => wentOut(s) && !s.endedAt)
  const byKey = new Map<string, SubmissionFact[]>()
  for (const s of live) byKey.set(`${s.personId}|${s.jobKey}`, [...(byKey.get(`${s.personId}|${s.jobKey}`) ?? []), s])
  const groups: SubmissionFact[][] = []
  for (const members of byKey.values()) {
    const overlapping = members.filter((a) => members.some((b) => {
      if (a.id === b.id) return false
      const [as, ae] = windowOf(a); const [bs, be] = windowOf(b)
      return as < be && bs < ae
    }))
    if (overlapping.length >= 2) groups.push(overlapping.sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime() || a.id.localeCompare(b.id)))
  }
  return groups.sort((a, b) => a[0].id.localeCompare(b[0].id))
}

/** The block is lifted only when two different people, at two different seats, approved. Pure. */
export function blockReleased(approvedBy: readonly (string | null)[]): boolean {
  return new Set(approvedBy.filter((p): p is string => !!p)).size >= 2
}

/** Two different working seats to put the override to, or null where the firm has only one. Pure. */
export function twoSeats(preferred: string | null, owner: string | null, anyOther: string | null): [string, string] | null {
  const first = preferred ?? owner
  const second = [owner, anyOther].find((p) => p && p !== first) ?? null
  return first && second ? [first, second] : null
}

/** Days from `from` to `to`, whole, never negative. Pure. */
export const daysWaiting = (from: Date, to: Date): number => Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000))

export function failedQuestion(person: string, job: string): string {
  return `${FAILED_PREFIX}the submission of ${person} for ${job} did not reach the other side. Send it again, or confirm another way.`
}

export function dualQuestion(person: string, job: string): string {
  return `${DUAL_PREFIX}${person} on ${job}. Both are on hold: no confirmation is recorded on either. Say which one stands.`
}

export function dualProof(members: readonly SubmissionFact[]): string {
  const lines = members.map((m, i) => `${i + 1}. Went out ${m.submittedAt.toISOString().slice(0, 10)}, submission ${m.id}.`).join(' ')
  return `${lines} The same person was put forward twice for the same job in overlapping time. This is put to two different people, and it lifts only when both say yes. The tracker never lifts it alone.`
}

/** The refusal for a person who tries to record a confirmation. Null where it may be recorded. Pure. */
export function confirmationRefusal(input: {
  state: ItemState
  channel: unknown
  alreadyConfirmed: boolean
}): string | null {
  if (typeof input.channel !== 'string' || !CHANNELS.includes(input.channel as Channel)) return 'Say how it was confirmed: email, phone, portal or manual.'
  if (input.state === 'NOT_SENT') return 'This submission has not gone out yet. A draft is not a confirmation.'
  if (input.state === 'BLOCKED') return 'This person is put forward twice for the same job. Two different people release that hold before a confirmation is recorded.'
  if (input.alreadyConfirmed) return 'This submission is already confirmed.'
  return null
}

/**
 * The day a confirmation is recorded as of. Never a day that has not
 * happened, never before the submission went out. Returns the moment to
 * store (now, for today; midday UTC for an earlier day) or the sentence
 * that says what to fix. Nothing typed means now. Pure.
 */
export function confirmedMoment(typed: unknown, submittedAt: Date, now: Date): { ok: true; at: Date } | { ok: false; says: string } {
  if (typed === undefined || typed === null || typed === '') return { ok: true, at: now }
  if (typeof typed !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(typed) || Number.isNaN(new Date(`${typed}T00:00:00Z`).getTime())) {
    return { ok: false, says: 'Give the day it was confirmed as a day, such as 2026-11-23.' }
  }
  const today = now.toISOString().slice(0, 10)
  if (typed > today) return { ok: false, says: 'That day has not happened yet. Choose today or an earlier day.' }
  if (typed < submittedAt.toISOString().slice(0, 10)) return { ok: false, says: 'That is before the submission was sent. Choose the day it was sent or later.' }
  return { ok: true, at: typed === today ? now : new Date(`${typed}T12:00:00Z`) }
}
