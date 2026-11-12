/**
 * Who may change who owns a company, as rules with no database in them.
 *
 * The founder, 2026-11-11: "can a company have more than one owner, what
 * happens when real owner takes over", "can one owner remove other
 * owner", "build pass ownership". Drawn and read as "build it":
 *
 *  - A company may have any number of Owners.
 *  - Only an Owner removes, pauses or moves an Owner. An Admin never can.
 *  - There is never no Owner: the last one is never removed or moved.
 *  - Removing or moving an Owner needs a second Owner's yes. One starts
 *    it, another says yes on a card. Nobody decides their own ask.
 *  - Pass ownership is one act: the Owner picks who, and what they become
 *    afterwards (Admin, an Owner still, or leaving); the new Owner says
 *    yes; both changes land together, with who and when kept.
 *
 * The ladder, always in this order and in these words: Superadmin
 * (Etyme's own staff, platform tools only) above Owner (the business)
 * above Admin (the company's people and settings). The role named Admin is
 * never called a manager or an IT owner on a screen.
 *
 * `lib/owner-proof` is the other half: at a company formed from
 * 2026-11-12 the first person is an Admin, and Owner is earned by proof.
 */

export const OWNER_ROLE = 'Owner'
export const ADMIN_ROLE = 'Admin'
export const LADDER = ['Superadmin', 'Owner', 'Admin'] as const

/** Days an ask waits for its yes before it lapses and nothing changes. */
export const ASK_DAYS = 7

export type AskKind = 'PASS' | 'REMOVE' | 'DEMOTE'
export type AskerAfter = 'OWNER' | 'ADMIN' | 'LEAVE'

/** A seat at the company, as these rules need it. */
export interface Seat {
  contextId: string
  personId: string
  name: string
  roleName: string | null
  /** Not ended and not paused. */
  live: boolean
}

export type Verdict = { ok: true } | { ok: false; says: string }

const isOwner = (s: Seat) => s.roleName === OWNER_ROLE

/** The live Owners, the ones who can say yes or keep the company owned. */
export function liveOwners(seats: readonly Seat[]): Seat[] {
  return seats.filter((s) => isOwner(s) && s.live)
}

/** The sentence an Admin reads when the act is an Owner's. */
export function onlyAnOwner(doing: string): string {
  return `Only an Owner ${doing}. An Admin never can.`
}

/**
 * May this seat ask to remove (end) or move (to another role) an Owner?
 * The ask, not the act: the act waits for a second Owner's yes.
 */
export function mayAskAboutOwner(input: {
  kind: 'REMOVE' | 'DEMOTE'
  actor: Seat
  subject: Seat
  seats: readonly Seat[]
  /** DEMOTE: the role the Owner would move to. */
  toRoleName?: string | null
}): Verdict {
  const { actor, subject, seats } = input
  const doing = input.kind === 'REMOVE' ? 'removes an Owner' : 'changes an Owner’s role'
  if (!isOwner(actor) || !actor.live) return { ok: false, says: onlyAnOwner(doing) }
  if (!isOwner(subject)) return { ok: false, says: `${subject.name} is not an Owner here.` }
  if (input.kind === 'DEMOTE') {
    if (!input.toRoleName) return { ok: false, says: `Choose the role ${subject.name} moves to.` }
    if (input.toRoleName === OWNER_ROLE) return { ok: false, says: `${subject.name} is already an Owner.` }
  }
  const others = liveOwners(seats).filter((s) => s.contextId !== subject.contextId)
  if (others.length === 0) {
    return {
      ok: false,
      says: `${subject.name} is the only Owner. There is never no Owner: pass ownership first, then ${input.kind === 'REMOVE' ? 'remove' : 'move'} them.`,
    }
  }
  if (decidersFor({ kind: input.kind, askedByPersonId: actor.personId, subject, seats }).length === 0) {
    return { ok: false, says: 'No other Owner can say yes to this. Ask Etyme support at support@etyme.com.' }
  }
  return { ok: true }
}

/**
 * May this seat ask to pass ownership to that one? The subject says yes
 * on a card; nothing changes before.
 */
export function mayAskToPass(input: { actor: Seat; subject: Seat; after: AskerAfter }): Verdict {
  const { actor, subject } = input
  if (!isOwner(actor) || !actor.live) return { ok: false, says: onlyAnOwner('passes ownership') }
  if (subject.contextId === actor.contextId) return { ok: false, says: 'Choose somebody else to take over. You are already an Owner.' }
  if (isOwner(subject)) return { ok: false, says: `${subject.name} is already an Owner.` }
  if (!subject.live) return { ok: false, says: `${subject.name} has no working seat here. Give them a seat first, then pass ownership.` }
  if (!['OWNER', 'ADMIN', 'LEAVE'].includes(input.after)) {
    return { ok: false, says: 'Say what you are afterwards: an Admin, an Owner still, or leaving.' }
  }
  return { ok: true }
}

/**
 * Who may say yes. PASS: only the person taking over, because nobody is
 * made an Owner by surprise. REMOVE and DEMOTE: any live Owner who did not
 * ask, the Owner being removed included, because "nobody decides their
 * own" is about the asker.
 */
export function decidersFor(input: { kind: AskKind; askedByPersonId: string; subject: Seat; seats: readonly Seat[] }): Seat[] {
  if (input.kind === 'PASS') return input.subject.live ? [input.subject] : []
  return liveOwners(input.seats).filter((s) => s.personId !== input.askedByPersonId)
}

/**
 * May this person say yes (or no) to the ask now? Read again on the day
 * of the yes: an Owner removed meanwhile, or the subject now the last
 * Owner, is refused rather than acted on.
 */
export function mayDecide(input: {
  kind: AskKind
  askedByPersonId: string
  deciderPersonId: string
  subject: Seat
  seats: readonly Seat[]
  expired: boolean
  pending: boolean
}): Verdict {
  if (!input.pending) return { ok: false, says: 'This has already been answered.' }
  if (input.expired) return { ok: false, says: 'This lapsed after seven days with no answer, and nothing changed. Ask again.' }
  if (input.deciderPersonId === input.askedByPersonId) {
    return { ok: false, says: 'Nobody decides their own ask. Another Owner says yes to this.' }
  }
  const deciders = decidersFor(input)
  if (!deciders.some((d) => d.personId === input.deciderPersonId)) {
    return {
      ok: false,
      says: input.kind === 'PASS'
        ? `Only ${input.subject.name} says yes to becoming an Owner.`
        : 'Only another Owner says yes to this.',
    }
  }
  if (input.kind !== 'PASS') {
    const others = liveOwners(input.seats).filter((s) => s.contextId !== input.subject.contextId)
    if (others.length === 0) return { ok: false, says: `${input.subject.name} is now the only Owner, so this cannot go ahead.` }
  }
  return { ok: true }
}

/** What the asker becomes, in words: "an Admin", "an Owner too", "no longer at Tapin". */
export function afterWords(after: AskerAfter, companyName: string): string {
  return after === 'OWNER' ? 'an Owner too' : after === 'ADMIN' ? 'an Admin' : `no longer at ${companyName}`
}

/** The yes card's sentence for a pass, as the person taking over reads it. */
export function passCardSays(input: { askerName: string; companyName: string; after: AskerAfter }): string {
  return `${input.askerName} wants to pass ${input.companyName}’s ownership to you. After this you are an Owner of ${input.companyName}. They will be ${afterWords(input.after, input.companyName)}.`
}

/** The yes card's sentence for removing or moving an Owner. */
export function ownerCardSays(input: { kind: 'REMOVE' | 'DEMOTE'; askerName: string; subjectName: string; companyName: string; toRoleName?: string | null; reason: string; youAreSubject: boolean }): string {
  const who = input.youAreSubject ? 'you' : input.subjectName
  const what = input.kind === 'REMOVE'
    ? `remove ${who} as an Owner of ${input.companyName}, ending ${input.youAreSubject ? 'your' : 'their'} seat there`
    : `move ${who} from Owner to ${input.toRoleName ?? 'another role'} at ${input.companyName}`
  return `${input.askerName} asks to ${what}: ${input.reason}. Nothing changes until an Owner who did not ask says yes.`
}

/** The record line, the drawing's ledger: "ownership passed · by A · to B · accepted by B · A now: Admin". */
export function passedLine(input: { askerName: string; subjectName: string; after: AskerAfter }): string {
  const now = input.after === 'OWNER' ? 'Owner' : input.after === 'ADMIN' ? 'Admin' : 'left'
  return `Ownership passed by ${input.askerName} to ${input.subjectName}, accepted by ${input.subjectName}; ${input.askerName} now: ${now}.`
}

/** Whether an ask has run past its seven days. */
export function lapsed(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime()
}

export function expiresFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + ASK_DAYS * 86_400_000)
}
