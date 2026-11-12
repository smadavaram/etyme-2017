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

import { passCardForNewOwner } from '@/lib/notify/owner-words'

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

// ── After a pass: the new Owner may move the previous one to Admin ────

/**
 * The one exception to "moving an Owner needs another Owner's yes"
 * (founder, 2026-11-12): the Owner who took over by a pass may move the
 * Owner who passed it to them to Admin alone. The previous Owner agreed to
 * the pass, so no second yes is asked. It reaches only the person they
 * took over from, only to Admin, and never the last Owner; it is recorded
 * with who and when, and the previous Owner is told.
 *
 * `passedToActorBy` is the people whose pass to the actor was accepted
 * (OwnershipRequest PASS, ACCEPTED, the actor's seat as its subject).
 */
export function movesAloneAfterPass(input: {
  actor: Seat
  subject: Seat
  toRoleName: string | null | undefined
  passedToActorBy: readonly string[]
  seats?: readonly Seat[]
}): boolean {
  const { actor, subject } = input
  if (!isOwner(actor) || !actor.live) return false
  if (!isOwner(subject) || subject.personId === actor.personId) return false
  if (input.toRoleName !== ADMIN_ROLE) return false
  if (!input.passedToActorBy.includes(subject.personId)) return false
  if (input.seats && liveOwners(input.seats).filter((s) => s.contextId !== subject.contextId).length === 0) return false
  return true
}

/** The record line and the previous Owner's notice for that move. */
export function movedAfterPassSays(input: { actorName: string; subjectName: string; companyName: string }): string {
  return `${input.actorName}, who took over ${input.companyName}’s ownership from ${input.subjectName}, moved ${input.subjectName} from Owner to Admin. ${input.subjectName} agreed to the pass, so no second yes was asked.`
}

/**
 * Users & permissions never moves an Owner off Owner: the yes goes through
 * Settings → Owners. Said in one sentence, the place named.
 */
export function ownerMovesOnOwnersPage(personName: string): string {
  return `${personName} is an Owner. Moving an Owner to another role needs another Owner’s yes, so it is done under Settings → Owners.`
}

/** What the asker becomes, in words: "an Admin", "an Owner too", "no longer at Tapin". */
export function afterWords(after: AskerAfter, companyName: string): string {
  return after === 'OWNER' ? 'an Owner too' : after === 'ADMIN' ? 'an Admin' : `no longer at ${companyName}`
}

/**
 * The yes card's sentence for a pass, as the person taking over reads it:
 * the asker named again, never "They" (lib/notify/owner-words).
 */
export function passCardSays(input: { askerName: string; companyName: string; after: AskerAfter }): string {
  return passCardForNewOwner({ askerName: input.askerName, subjectName: '', companyName: input.companyName, after: input.after })
}

/**
 * A reason typed by a person, ready to sit inside a sentence: its own last
 * stop taken off, so "…: Left the firm.. Nothing changes" never reads with
 * two (screen walk on df3074094).
 */
export function clause(reason: string): string {
  return reason.trim().replace(/[\s.!?…。]+$/u, '')
}

/** The yes card's sentence for removing or moving an Owner. */
export function ownerCardSays(input: { kind: 'REMOVE' | 'DEMOTE'; askerName: string; subjectName: string; companyName: string; toRoleName?: string | null; reason: string; youAreSubject: boolean }): string {
  const who = input.youAreSubject ? 'you' : input.subjectName
  const what = input.kind === 'REMOVE'
    ? `remove ${who} as an Owner of ${input.companyName}, ending ${input.youAreSubject ? 'your' : 'their'} seat there`
    : `move ${who} from Owner to ${input.toRoleName ?? 'another role'} at ${input.companyName}`
  return `${input.askerName} asks to ${what}: ${clause(input.reason)}. Nothing changes until an Owner who did not ask says yes.`
}

/** Whether an ask has run past its seven days. */
export function lapsed(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime()
}

export function expiresFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + ASK_DAYS * 86_400_000)
}

// ── One ask, said to each reader (screen walk on df3074094) ───────────

/**
 * Who is reading an ask decides its sentence. The walk found the asker
 * reading her own pass as if it were to her ("Camille wants to pass
 * ownership to you" on Camille's page). Three readers:
 *  - ASKER: the Owner who asked, waiting.
 *  - ADDRESSEE: whoever may say yes (the person taking over for a pass;
 *    an Owner who did not ask for a removal or a move).
 *  - OTHER: anybody else who reads the Owners screen (an Admin, an Owner
 *    who is neither).
 */
export type AskReader = 'ASKER' | 'ADDRESSEE' | 'OTHER'

export interface AskWords {
  kind: AskKind
  askerName: string
  subjectName: string
  companyName: string
  /** PASS: what the asker becomes once the yes lands. */
  after?: AskerAfter | null
  /** DEMOTE: the role the Owner moves to. */
  toRoleName?: string | null
  reason: string
  /** The names of whoever may say yes. */
  deciderNames: readonly string[]
  /** The reader is the seat the ask is about. */
  youAreSubject: boolean
}

function either(names: readonly string[]): string {
  if (names.length === 0) return 'another Owner'
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}

export function askSaysTo(reader: AskReader, w: AskWords): string {
  if (reader === 'ADDRESSEE') {
    return w.kind === 'PASS'
      ? passCardSays({ askerName: w.askerName, companyName: w.companyName, after: (w.after ?? 'OWNER') as AskerAfter })
      : ownerCardSays({ kind: w.kind, askerName: w.askerName, subjectName: w.subjectName, companyName: w.companyName, toRoleName: w.toRoleName ?? null, reason: w.reason, youAreSubject: w.youAreSubject })
  }
  const what = w.kind === 'PASS'
    ? `to take over ${w.companyName}’s ownership`
    : w.kind === 'REMOVE'
      ? `to remove ${w.subjectName} as an Owner of ${w.companyName}`
      : `to move ${w.subjectName} from Owner to ${w.toRoleName ?? 'another role'} at ${w.companyName}`
  if (reader === 'ASKER') {
    if (w.kind === 'PASS') {
      return `You asked ${w.subjectName} ${what}. Waiting for ${w.subjectName}’s yes. After it you will be ${afterWords((w.after ?? 'OWNER') as AskerAfter, w.companyName)}.`
    }
    return `You asked ${what}: ${clause(w.reason)}. Waiting for the yes of ${either(w.deciderNames)}.`
  }
  if (w.kind === 'PASS') {
    return `${w.askerName} asked ${w.subjectName} ${what}. Waiting for ${w.subjectName}’s yes; ${w.askerName} will then be ${afterWords((w.after ?? 'OWNER') as AskerAfter, w.companyName)}.`
  }
  return `${w.askerName} asked ${what}: ${clause(w.reason)}. Waiting for the yes of ${either(w.deciderNames)}.`
}

/** What the person saying yes becomes, in a word or two, or null where nothing changes for them. */
export function addresseeBecomes(w: Pick<AskWords, 'kind' | 'toRoleName' | 'youAreSubject' | 'companyName'>): string | null {
  if (w.kind === 'PASS') return OWNER_ROLE
  if (!w.youAreSubject) return null
  return w.kind === 'REMOVE' ? `No longer at ${w.companyName}` : (w.toRoleName ?? 'another role')
}

/** What the person saying yes can then do, in one sentence. */
export function addresseeCanThen(w: Pick<AskWords, 'kind' | 'toRoleName' | 'youAreSubject' | 'companyName' | 'subjectName'>): string {
  if (w.kind === 'PASS') {
    return `As an Owner you run ${w.companyName}’s business: you pay firms, sign agreements, change the type of company and how people sign in, give access by team or for the whole company, and add, pass or remove Owners with another Owner’s yes.`
  }
  if (!w.youAreSubject) {
    return w.kind === 'REMOVE'
      ? `${w.subjectName}’s seat at ${w.companyName} ends. Everything ${w.subjectName} did stays under that name.`
      : `${w.subjectName} holds what ${w.toRoleName ?? 'the new role'} holds and no Owner act.`
  }
  return w.kind === 'REMOVE'
    ? `Your seat at ${w.companyName} ends. Everything you did stays under your name.`
    : `You hold what ${w.toRoleName ?? 'the new role'} holds at ${w.companyName}. Owner acts are no longer yours.`
}
