import { formatDay } from '@/lib/format-date'

/**
 * A sign-in link for somebody a firm employs or lists, said on the
 * person's row at that firm.
 *
 * ── The fault this closes ───────────────────────────────────────────
 *
 * The founder's retest of production, 2026-11-03: Rajesh Iyer was placed
 * (Brightmoor to Northbend) and had no way to sign in, so nobody could
 * file a timesheet on the placement; only the worker files the week.
 * Production has no email key, so no invitation ever left, and the link
 * kept for staff on the notice (2026-10-27) was somewhere the employer
 * never looks. So the employer reads it where it already looks for the
 * person: their row and their page.
 *
 * ── The rules ───────────────────────────────────────────────────────
 *
 *  - Drawn only for a seat that may invite somebody (`team.manage`, the
 *    gate of `POST /api/access/invite`), because a sign-in link lets a
 *    person in, which is the same decision as an invitation.
 *  - Only for a person this firm employs or lists: a seat here, a live
 *    bench listing here, or a pay line here that pays the person direct.
 *  - Never before her yes (`awaitsHerYes`): a person asked onto the bench
 *    and not answered gets no line, whatever her address, so the line
 *    never says whether an address has an account.
 *  - Never reads her account (2026-11-16, founder's yes). The line drew
 *    nothing for an address that already signs in anywhere, and "cannot
 *    sign in yet" for one that does not, so a firm that seated an address
 *    could read whether it has an account. CLAUDE.md: the page never says
 *    whether an address has an account. So the line reads only this
 *    firm's own facts: she came in here (`SIGNS_IN_HERE`: she acted on a
 *    seat here, or filed a week on this firm's work), and the fate of the
 *    link this firm made. Every other person reads the same line.
 *  - The link is the same for everybody, and the door decides at use
 *    (`/answer/sign-in/<token>`, `enterSignInDoor` in sign-in-link-door):
 *    a record anybody has ever used, by any door, is sent to the sign-in
 *    page (`everCameIn`), and only a record nobody has ever used is given
 *    the password door's own one-time link (`issueSetPassword`) to choose
 *    a first password. So the link the firm copies never sets a password
 *    on an account somebody has used, and it never shows which of the two
 *    it will do. Never a second record: the first sign-in turns the
 *    person's record into her seat.
 *  - The link works once (2026-11-16). The first Continue spends it,
 *    whichever way it sent her; a second press says it was used. Every
 *    press is logged with her as the subject, and no row holds a link.
 *  - Where no email can leave, the link is shown to copy. Where email can
 *    leave, the line says the link was sent, and offers "Send again".
 *
 * No database here: the words and the reading of a kept notice.
 */

/** Hours the link works for, the same as a colleague's invitation (`INVITE_LINK_HOURS`). */
export const SIGN_IN_LINK_HOURS = 72

/** The permission the invite route asks for, read by the route and the screen. */
export const MAY_HAND_OVER = 'team.manage' as const

export type SignInState =
  /**
   * Asked onto this firm's bench and not answered yes: no line is drawn,
   * whatever her address (`awaitsHerYes`). Checked before every other state.
   */
  | 'AWAITING_YES'
  /**
   * She came in here: she acted on a seat at this firm, or filed a week on
   * its work. This firm's own fact, never her account elsewhere. No line.
   */
  | 'SIGNS_IN_HERE'
  /** A sample address no mailbox uses: there is nothing to send. */
  | 'DEMO'
  /** No link made yet. */
  | 'NONE_YET'
  /** No email can leave, and a live link is kept on the notice to copy. */
  | 'KEPT'
  /** No email can leave, and the kept link has run out or was replaced. */
  | 'RAN_OUT'
  /** Email can leave, and the link was sent. */
  | 'SENT'
  /** Email can leave, and the last send failed. */
  | 'FAILED'
  /** The last link this firm made was opened, and she has not come in here yet. */
  | 'OPENED'

export interface SignInFacts {
  state: SignInState
  /**
   * The name the firm reads (`calledOnRow`): her own, or before her yes
   * the name the firm typed. Null where the firm typed none: the row says
   * "This person".
   */
  name: string | null
  email: string
  /** When the last link was made or sent. */
  at?: Date | string | null
  /** Until when a kept link works. */
  until?: Date | string | null
}

export interface SignInLine {
  says: string
  /** A second, smaller line, or null. */
  note: string | null
  /** The button, or null where there is nothing to press. */
  action: string | null
}

/** How a sentence opens on her: her first name, or "This person" where the firm typed no name. */
const firstName = (name: string | null) => (name?.trim().split(/\s+/)[0] || 'This person')
/** The same person said again later in the sentence. */
const again = (name: string | null) => (name?.trim() ? firstName(name) : 'they')
/** The same person as the one something is sent to. */
const toWhom = (name: string | null) => (name?.trim() ? firstName(name) : 'them')

/**
 * The name a firm reads on her row (batch five, the walk of 2026-11-16).
 * Before her yes, on a record whose words are not the firm's, the firm
 * reads only what it typed (`firmReadsAt` in lib/consultant-portfolio/
 * before-her-yes): the name it typed, or none, and then the row says
 * "This person". The sample-person line read her own first name off her
 * record. Otherwise her own name, as before. The letter she receives
 * keeps her own name: only she reads it. Pure.
 */
export function calledOnRow(o: { ownName: string; beforeHerYes: boolean; typedName: string | null }): string | null {
  if (!o.beforeHerYes) return o.ownName
  return o.typedName?.trim() || null
}

/**
 * Whether the firm's only tie to her is an ask she has not said yes to
 * (batch five, 2026-11-16). The line drew nothing for an address that
 * already signs in, and "cannot sign in yet" for one that does not. So a
 * firm that asked a stranger's address could read whether it has an
 * account off the line. CLAUDE.md: the page never says whether an
 * address has an account, and before her yes a firm reads only what it
 * typed.
 *
 * So before her yes the line is nothing, for everybody, and a press for a
 * link is refused in one sentence, for everybody. Her bench invitation is
 * the way in, and a sign-in link is not the firm's act until she answers.
 * The account is never read before this is decided.
 *
 * Keyed on the listing, not on `firmReadsAt`'s own answer: that answer
 * reads her record in full where every word on it is the firm's, which is
 * only where she has no account. Keyed on it, the line would still differ.
 *
 * After her yes, or where the firm employs her (a seat here, or a pay
 * line that pays her direct: the employment is the consent), as before.
 * Pure.
 */
export function awaitsHerYes(o: { seatHere: boolean; paysHerDirect: boolean; listingState: string | null }): boolean {
  if (o.seatHere || o.paysHerDirect) return false
  return o.listingState != null && o.listingState !== 'GRANTED'
}

/** Pressing for a link before her yes. No name, so it reads the same for every address. */
export function awaitingYesRefusal(): string {
  return 'This person has not said yes to your bench invitation, so there is no sign-in link to make. The invitation is their way in.'
}

/** The exact sentence the founder asked for, kept as one constant so the screen and the tests agree. */
export function copySentence(name: string | null): string {
  return `No email can leave this deployment. Copy this sign-in link and send it to ${toWhom(name)} yourself.`
}

/**
 * A person at an address no mailbox uses (`.example`, `.invalid`,
 * `.local`, a demo host). The office manager reading the row cannot act
 * on "the demo page", so the line says what is true for her: this is a
 * sample person, and there is nothing to send (fix list, layer five, g).
 * True on the seeded world and for a test person a firm typed in.
 */
export function sampleSays(name: string | null, email: string): string {
  return `${firstName(name)} is a sample person. No email can reach ${email}, so there is nothing to send.`
}

/** The same fact, said where somebody pressed for a link anyway. */
export function sampleRefusal(name: string | null, email: string): string {
  return `${firstName(name)} is a sample person. No email can reach ${email}, so no sign-in link can be sent.`
}

/** Pressing for a link for somebody who already comes in here (`SIGNS_IN_HERE`). */
export function alreadySignsInRefusal(name: string | null): string {
  return `${firstName(name)} already signs in to Etyme, so there is no link to make. ${name?.trim() ? firstName(name) : 'They'} can reset a forgotten password from the sign-in page.`
}

/**
 * The line for somebody who has not come in here yet. It claims nothing
 * about an account: the same words whether or not the address signs in
 * somewhere else.
 */
export function notHereYetSays(name: string | null): string {
  return `${firstName(name)} files timesheets in Etyme. If ${again(name)} cannot sign in yet, give ${toWhom(name)} a sign-in link.`
}

/** What the row says, for each state. AWAITING_YES and SIGNS_IN_HERE draw nothing, so their words are never shown. */
export function signInLineSays(f: SignInFacts): SignInLine {
  const first = firstName(f.name)
  const cannot = notHereYetSays(f.name)
  switch (f.state) {
    case 'AWAITING_YES':
      // Nothing, and no name: it must read the same for every address.
      return { says: '', note: null, action: null }
    case 'SIGNS_IN_HERE':
      return { says: `${first} already signs in to Etyme.`, note: null, action: null }
    case 'DEMO':
      return { says: sampleSays(f.name, f.email), note: null, action: null }
    case 'NONE_YET':
      return { says: cannot, note: 'No email can leave this deployment, so make a sign-in link and send it yourself.', action: 'Make a sign-in link' }
    case 'KEPT':
      return {
        says: copySentence(f.name),
        note: f.until ? `It works until ${formatDay(f.until)}, for ${f.email}.` : `It works only for ${f.email}.`,
        action: 'Make a new link',
      }
    case 'RAN_OUT':
      return {
        says: cannot,
        note: f.at
          ? `The link made on ${formatDay(f.at)} has run out. Make a new one and send it to ${toWhom(f.name)} yourself.`
          : `The last link has run out. Make a new one and send it to ${toWhom(f.name)} yourself.`,
        action: 'Make a new link',
      }
    case 'SENT':
      return {
        says: f.at ? `The sign-in link to ${f.email} was handed to the email service on ${formatDay(f.at)}.` : `The sign-in link to ${f.email} was handed to the email service.`,
        note: `Delivery is not confirmed yet. It works for ${SIGN_IN_LINK_HOURS} hours.`,
        action: 'Send again',
      }
    case 'FAILED':
      return {
        says: f.at ? `The sign-in link to ${f.email} did not go on ${formatDay(f.at)}.` : `The sign-in link to ${f.email} did not go.`,
        note: 'Check the address on the person, then send it again.',
        action: 'Send again',
      }
    case 'OPENED':
      return {
        says: f.at ? `${first} opened the sign-in link on ${formatDay(f.at)}.` : `${first} opened the sign-in link.`,
        note: `If ${again(f.name)} still cannot sign in, make a new link and send it to ${toWhom(f.name)} yourself.`,
        action: 'Make a new link',
      }
  }
}

/** Where email can leave and nothing has been sent: the first press sends it. */
export function sendFirstAction(): string {
  return 'Send a sign-in link'
}

/** The subject of the letter, which also marks the notice this firm wrote. */
export function signInSubject(firmName: string): string {
  return `${firmName} set up your Etyme sign-in`
}

/**
 * The letter to the person. No pronouns: the record stores none. One
 * letter for everybody: the link decides at use whether she signs in or
 * chooses a password, so the letter never says which.
 */
export function signInLetter(l: { name: string; firmName: string; loginUrl: string | null }): string[] {
  return [
    `Hello ${firstName(l.name)},`,
    `${l.firmName} uses Etyme for your work. You file your own timesheet there, each week.`,
    `Open the link below to sign in. If you have not used Etyme before, you choose a password there. The link works once, within ${SIGN_IN_LINK_HOURS} hours.`,
    l.loginUrl ? `After that, sign in at ${l.loginUrl} with this email address.` : 'After that, sign in with this email address.',
  ]
}

/**
 * The link kept on a notice where no email could leave (`recordedBody`
 * with NOT_CONFIGURED puts it on the last line). Null where none is kept.
 * A notice from before 2026-11-16 keeps the password door's own link
 * (`/reset/<token>`); one from after keeps the sign-in door's
 * (`/answer/sign-in/<token>`). Both are read, so a kept link loses nothing.
 */
export function keptLinkIn(body: string): string | null {
  const last = body.trim().split('\n').pop()?.trim() ?? ''
  const path = last.replace(/^https?:\/\/[^/\s]+/, '')
  return /^\/reset\/[A-Za-z0-9_-]+$/.test(path) || /^\/answer\/sign-in\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(path) ? last : null
}

/** The password door's token at the end of a kept link from before the sign-in door; null for a sign-in door link. */
export function tokenOf(link: string): string | null {
  const m = /\/reset\/([A-Za-z0-9_-]+)$/.exec(link)
  return m ? m[1] : null
}

/** Whether a kept link is the sign-in door's, which decides at use. */
export function isSignInDoorLink(link: string): boolean {
  return /\/answer\/sign-in\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(link)
}

/**
 * Whether a sign-in door link still works: made by this firm, the newest
 * it made for her, and younger than `SIGN_IN_LINK_HOURS`. Pure.
 */
export function signInDoorLive(o: { madeAt: Date; isNewest: boolean; now: Date }): boolean {
  return o.isNewest && o.now.getTime() < o.madeAt.getTime() + SIGN_IN_LINK_HOURS * 3_600_000
}

/** Until when a sign-in door link made at `madeAt` works. Pure. */
export function signInDoorUntil(madeAt: Date): Date {
  return new Date(madeAt.getTime() + SIGN_IN_LINK_HOURS * 3_600_000)
}

/**
 * Every trace the platform keeps of a person having used it, by any door
 * (2026-11-16). Read at the door's use by `cameInTraces` in
 * lib/notify/came-in, and nowhere else. Each is a count or a yes:
 *
 *  - `password`: a password on the record (`Person.passwordHash`).
 *  - `mailboxProved`: she proved the mailbox once, by a verify or reset
 *    link, a provider or a directory (`Person.emailVerifiedAt`).
 *  - `signInMethods`: a sign-in method on record, any provider: Google,
 *    Microsoft, an email link, SAML, a password (`Credential`).
 *  - `directoryIdentities`: a company's directory vouches for her
 *    (`ExternalIdentity`).
 *  - `sessionsEnded`: she ended her own sessions, by signing out
 *    everywhere or changing her password (`sessionsEndedAt`, with her as
 *    `sessionsEndedById`): there were sessions. Never a firm's act: a
 *    pause, an end or a withdrawn invitation ends sessions too, on a
 *    record nobody may have used, so `sessionVersion` is never read.
 *  - `oneTimeLinksUsed`: she opened a verify or set-password link
 *    (`EmailToken.usedAt`).
 *  - `seatsUsed`: a seat at any firm that a request of hers used
 *    (`Context.lastUsedAt`).
 *  - `ownSeats`: her own company-less seat (`Context` CONSULTANT with no
 *    company), which only her own session makes: her first sign-up by an
 *    email link or Google, her password sign-up, or her own work opening
 *    it on her first request. A first sign-in through an email link
 *    writes no Credential row, so this is often the only trace of it.
 *  - `actsAsActor`: any access-log row naming her as the actor, at any
 *    firm, refusals included: a sign-in by any door (LinkedIn writes only
 *    this), an invitation accepted, a read she made.
 *  - `ownWords`: her own Ask Etyme conversations, model prompts, Teams
 *    conversations, data requests she made, or her own page written or
 *    confirmed by her (`bioWrittenBy` PERSON, `confirmedAt`, `pageLiveAt`).
 *  - `answers`: a bench invitation she answered, either way, or terms she
 *    agreed (`BenchListing.respondedAt`, `termsAgreedAt`).
 *
 * Any one of them means somebody has used this record, and the firm's
 * link may only send her to sign in as usual. Pure.
 */
export interface CameInTraces {
  password: boolean
  mailboxProved: boolean
  signInMethods: number
  directoryIdentities: number
  sessionsEnded: boolean
  oneTimeLinksUsed: number
  seatsUsed: number
  ownSeats: number
  actsAsActor: number
  ownWords: number
  answers: number
}

export function everCameIn(t: CameInTraces): boolean {
  return t.password || t.mailboxProved || t.sessionsEnded ||
    t.signInMethods > 0 || t.directoryIdentities > 0 || t.oneTimeLinksUsed > 0 ||
    t.seatsUsed > 0 || t.ownSeats > 0 || t.actsAsActor > 0 || t.ownWords > 0 || t.answers > 0
}

/**
 * Where the sign-in door sends whoever presses Continue on a live link,
 * decided at use and never before (`enterSignInDoor`). A record anybody
 * has ever used, by any door (`everCameIn`), goes to the sign-in page
 * with its address filled, where she uses her own door: the link a firm
 * holds never sets a password on it. Only a record nobody has ever used
 * chooses a first password. Pure.
 */
export function signInDoorSends(o: { everCameIn: boolean }): 'SIGN_IN' | 'CHOOSE_PASSWORD' {
  return o.everCameIn ? 'SIGN_IN' : 'CHOOSE_PASSWORD'
}

/** The page the sign-in door link opens, in words. One for every address: it never says which way the door will go. */
export function signInDoorPage(firmName: string): { heading: string; says: string; button: string; after: string } {
  return {
    heading: 'Sign in to Etyme',
    says: `${firmName} uses Etyme for your work. You file your own timesheets there.`,
    button: 'Continue',
    after: 'If you have used Etyme before, you sign in as usual. If not, you choose a password. The link works once.',
  }
}

/**
 * The same page where the link was used already (2026-11-16). True
 * whichever way the first press went: she may have chosen a password, or
 * been sent to sign in as usual, or somebody else may have pressed it.
 */
export function signInDoorUsed(firmName: string): string {
  return `This sign-in link was already used, and it works only once. If you can sign in, sign in as usual. If not, ask ${firmName} for a new link.`
}

/**
 * What the access log says of a press on the door (2026-11-16). One
 * sentence whichever way the door sent her, so the row never says whether
 * she had used Etyme before. Never the link or its token. Pure.
 */
export function signInDoorPressed(firmName: string): string {
  return `Continue was pressed on the sign-in link ${firmName} made. The link is now used.`
}

/** Why a press on the door was refused, for the access log. Never the link or its token. Pure. */
export function signInDoorRefused(firmName: string, why: 'USED' | 'REPLACED_OR_RAN_OUT' | 'SAMPLE' | 'NOT_ON_BOOKS' | 'AWAITING_YES'): string {
  const because = {
    USED: 'it was already used',
    REPLACED_OR_RAN_OUT: 'it ran out or a newer one was made',
    SAMPLE: 'the address is a sample one',
    NOT_ON_BOOKS: `the person is no longer on ${firmName}'s books`,
    AWAITING_YES: 'the person has not said yes to the bench invitation',
  }[why]
  return `Refused Continue on the sign-in link ${firmName} made: ${because}.`
}

/** The same page where the link no longer works. */
export function signInDoorGone(firmName: string | null): string {
  return firmName
    ? `This sign-in link has run out or a newer one was made. Ask ${firmName} for a new link.`
    : 'This sign-in link is not valid. It may have been retyped or altered.'
}

/** The refusal a seat that may not invite reads. Who can, never the permission's code. */
export function mayNotHandOver(firmName: string): string {
  return `Only the account owner or an admin at ${firmName} can give somebody a way to sign in. Ask one of them.`
}

/** The refusal for somebody this firm neither employs nor lists. */
export function notYours(firmName: string): string {
  return `This person is not on ${firmName}'s books, so ${firmName} cannot give them a way to sign in.`
}
