/**
 * How long a person stays on a bench — their choice, made with their yes.
 *
 * ── The decision, 2026-09-30 ─────────────────────────────────────────
 *
 * The founder: *"Allow candidate to stay on bench for 5, 7, 15, 25, 50,
 * 60, 500 days or until cancelled."* The choice is the person's, made in
 * the same step as saying yes — one choice beside the yes button, "until
 * cancelled" preselected — and changeable later from their own page. So
 * saying yes is never a second question.
 *
 * When the time runs out the listing ends by itself: the person leaves
 * every match and cannot be put forward through it, and a submission
 * already made stands. They are reminded before it ends and can renew in
 * one tap; the firm is told when it ends.
 *
 * ── How an ending is written ─────────────────────────────────────────
 *
 * The daily job writes `revokedAt` — the one column every read of a bench
 * already honors — and `lapsedAt` beside it, so the record says the
 * clock ended it rather than the person, and a renew may bring it back.
 * A listing the person took back themselves has no `lapsedAt` and cannot
 * be renewed by a reminder link; asking again is a conversation.
 *
 * Between the day passing and the job running, matching and the submit
 * door read `staysUntil` themselves (`stayOver`), so nobody is put
 * forward on a stay that has ended even for an hour.
 *
 * Pure. No database here.
 */

/** The choices, in days. Null is "until you cancel", the default. */
export const STAY_CHOICES = [5, 7, 15, 25, 50, 60, 500] as const
export type StayDays = (typeof STAY_CHOICES)[number]

const DAY = 86_400_000

/** What each choice reads as, beside the yes button. */
export function stayLabel(days: number | null): string {
  return days == null ? 'Until I cancel' : `${days} days`
}

/**
 * Read a choice off a request body.
 *
 * Missing, null, empty or "UNTIL_CANCELLED" is until cancelled — the
 * default, so a yes with nothing else said is a complete answer.
 */
export function readStay(raw: unknown): { ok: true; days: number | null } | { ok: false; says: string } {
  if (raw === undefined || raw === null || raw === '' || raw === 'UNTIL_CANCELLED') return { ok: true, days: null }
  const n = typeof raw === 'number' ? raw : Number(raw)
  if ((STAY_CHOICES as readonly number[]).includes(n)) return { ok: true, days: n }
  return {
    ok: false,
    says: `Choose how long you stay: ${STAY_CHOICES.join(', ')} days, or until you cancel.`,
  }
}

/** The fields a choice writes, counted from the day it is made. */
export function stayFields(days: number | null, from: Date): { stayDays: number | null; staysUntil: Date | null; stayRemindedAt: null } {
  return {
    stayDays: days,
    staysUntil: days == null ? null : new Date(from.getTime() + days * DAY),
    stayRemindedAt: null,
  }
}

export interface StayFacts {
  stayDays: number | null
  staysUntil: Date | null
  stayRemindedAt?: Date | null
  revokedAt?: Date | null
  lapsedAt?: Date | null
}

/** True once the chosen stay has run out. Until-cancelled never does. */
export function stayOver(l: Pick<StayFacts, 'staysUntil'>, now: Date): boolean {
  return l.staysUntil != null && l.staysUntil.getTime() <= now.getTime()
}

/**
 * How far ahead the reminder goes.
 *
 * Two days, or one for the five- and seven-day choices, where two days'
 * notice would be most of the stay.
 */
export function reminderLeadDays(days: number | null): number {
  return days != null && days <= 7 ? 1 : 2
}

/** Whether tonight is the night to remind them. Once per stay. */
export function reminderDue(l: StayFacts, now: Date): boolean {
  if (l.staysUntil == null || l.revokedAt || l.stayRemindedAt) return false
  if (stayOver(l, now)) return false
  const from = l.staysUntil.getTime() - reminderLeadDays(l.stayDays) * DAY
  return now.getTime() >= from
}

/** What renewing writes: the same choice again, from today, and back on the bench. */
export function renewFields(l: StayFacts, now: Date): { ok: true; data: Record<string, unknown> } | { ok: false; says: string } {
  if (l.revokedAt && !l.lapsedAt) {
    return { ok: false, says: 'You took this listing back yourself, so there is nothing to renew. The firm can ask you again.' }
  }
  if (l.stayDays == null) {
    return { ok: false, says: 'This stay has no end date — it lasts until you cancel — so there is nothing to renew.' }
  }
  return {
    ok: true,
    data: { ...stayFields(l.stayDays, now), revokedAt: null, lapsedAt: null },
  }
}

function onDay(d: Date): string {
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** One sentence about the stay, to the person. */
export function staySays(l: StayFacts, firm: string, now: Date): string {
  if (l.lapsedAt || (l.staysUntil && stayOver(l, now))) {
    return `Your stay on ${firm}'s bench ended on ${onDay(l.staysUntil ?? l.lapsedAt!)}. Renew it and they can put you forward again.`
  }
  if (l.staysUntil == null) return `You stay on ${firm}'s bench until you cancel.`
  return `You stay on ${firm}'s bench until ${onDay(l.staysUntil)} (${l.stayDays} days). After that it ends by itself.`
}

/** What the firm reads when a stay ends. */
export function endedSays(person: string, firm: string, on: Date): string {
  return (
    `${person}'s chosen stay on ${firm}'s bench ended on ${onDay(on)}. ` +
    'They are out of every match and nobody can put them forward through this listing. ' +
    'Submissions already made stand. They can renew it from their own page.'
  )
}

/** The refusal at the submit door. */
export function refusedSays(person: string, firm: string, on: Date): string {
  return (
    `${person}'s stay on ${firm}'s bench ended on ${onDay(on)}, so nobody can put them forward through it. ` +
    'They can renew it from their own page in one step.'
  )
}

/** The reminder letter. */
export function reminderText(o: { personName: string; firm: string; until: Date; days: number; url: string }): { subject: string; body: string } {
  const first = o.personName.trim().split(/\s+/)[0]
  return {
    subject: `Your stay on ${o.firm}'s bench ends on ${onDay(o.until)}`,
    body:
      `Hi ${first},\n\n` +
      `You chose to stay on ${o.firm}'s bench for ${o.days} days. That ends on ${onDay(o.until)}.\n\n` +
      `After that, ${o.firm} cannot put you forward for new jobs. Anything already sent stays as it is.\n\n` +
      `To stay another ${o.days} days, open this link and press Renew — no password, no account:\n${o.url}\n\n` +
      'If you do nothing, it simply ends.',
  }
}
