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
 *  - Only for somebody with no account yet. A link that sets a password
 *    on an account somebody already holds is a way into that account, so
 *    a person with a password or a work-account sign-in gets no line.
 *  - Never a second record: the link is the password door's own
 *    one-time invitation link (`issueSetPassword`), which the person's
 *    first sign-in turns into their own seat.
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
  /** Already signs in: no line is drawn. */
  | 'HAS_ACCOUNT'
  /** A demo address: no password is ever set on it. */
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

export interface SignInFacts {
  state: SignInState
  name: string
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

const firstName = (name: string) => (name.trim().split(/\s+/)[0] || name.trim() || 'This person')

/** The exact sentence the founder asked for, kept as one constant so the screen and the tests agree. */
export function copySentence(name: string): string {
  return `No email can leave this deployment. Copy this sign-in link and send it to ${firstName(name)} yourself.`
}

/** What the row says, for each state. HAS_ACCOUNT draws nothing, so its words are never shown. */
export function signInLineSays(f: SignInFacts): SignInLine {
  const first = firstName(f.name)
  const cannot = `${first} cannot sign in to Etyme yet, so ${first} cannot file a timesheet.`
  switch (f.state) {
    case 'HAS_ACCOUNT':
      return { says: `${first} already signs in to Etyme.`, note: null, action: null }
    case 'DEMO':
      return {
        says: `${f.email} belongs to the Etyme demo, so no password can be set on it.`,
        note: 'A demo seat opens only from the demo page.',
        action: null,
      }
    case 'NONE_YET':
      return { says: cannot, note: 'No email can leave this deployment, so make a sign-in link and send it yourself.', action: 'Make a sign-in link' }
    case 'KEPT':
      return {
        says: copySentence(f.name),
        note: f.until ? `It works once, until ${formatDay(f.until)}, for ${f.email}.` : `It works once, for ${f.email}.`,
        action: 'Make a new link',
      }
    case 'RAN_OUT':
      return {
        says: cannot,
        note: f.at
          ? `The link made on ${formatDay(f.at)} has run out. Make a new one and send it to ${first} yourself.`
          : `The last link has run out. Make a new one and send it to ${first} yourself.`,
        action: 'Make a new link',
      }
    case 'SENT':
      return {
        says: f.at ? `${first} was sent a sign-in link on ${formatDay(f.at)}, to ${f.email}.` : `${first} was sent a sign-in link, to ${f.email}.`,
        note: `It works once, for ${SIGN_IN_LINK_HOURS} hours.`,
        action: 'Send again',
      }
    case 'FAILED':
      return {
        says: f.at ? `The sign-in link to ${f.email} did not go on ${formatDay(f.at)}.` : `The sign-in link to ${f.email} did not go.`,
        note: 'Check the address on the person, then send it again.',
        action: 'Send again',
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

/** The letter to the person. No pronouns: the record stores none. */
export function signInLetter(l: { name: string; firmName: string; loginUrl: string | null }): string[] {
  return [
    `Hello ${firstName(l.name)},`,
    `${l.firmName} uses Etyme for your work. You file your own timesheet there, each week.`,
    `Open the link below to choose a password. It works once, for ${SIGN_IN_LINK_HOURS} hours.`,
    l.loginUrl ? `After that, sign in at ${l.loginUrl} with this email address.` : 'After that, sign in with this email address.',
  ]
}

/**
 * The link kept on a notice where no email could leave (`recordedBody`
 * with NOT_CONFIGURED puts it on the last line). Null where none is kept.
 */
export function keptLinkIn(body: string): string | null {
  const last = body.trim().split('\n').pop()?.trim() ?? ''
  return /^https?:\/\/\S+\/reset\/[A-Za-z0-9_-]+$/.test(last) || /^\/reset\/[A-Za-z0-9_-]+$/.test(last) ? last : null
}

/** The token at the end of a kept link. */
export function tokenOf(link: string): string | null {
  const m = /\/reset\/([A-Za-z0-9_-]+)$/.exec(link)
  return m ? m[1] : null
}

/** The refusal a seat that may not invite reads. Who can, never the permission's code. */
export function mayNotHandOver(firmName: string): string {
  return `Only the account owner or an admin at ${firmName} can give somebody a way to sign in. Ask one of them.`
}

/** The refusal for somebody this firm neither employs nor lists. */
export function notYours(firmName: string): string {
  return `This person is not on ${firmName}'s books, so ${firmName} cannot give them a way to sign in.`
}
