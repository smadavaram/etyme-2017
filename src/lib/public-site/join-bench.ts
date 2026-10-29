/**
 * "Join the bench", the one door a candidate has on a firm's public page
 * (founder, 2026-10-29: "Tapin gets agents, not a website").
 *
 * ── What it is ───────────────────────────────────────────────────────
 *
 * The bench ask that already exists, opened from the other end. A firm
 * asks a person onto its bench and nothing happens until the person says
 * yes from the link in the letter (`lib/bench-invite`, `lib/bench-consent`,
 * `/bench-invite/[token]`). Here the person asks first, by name and
 * email, and the firm's letter goes to that address. The yes is still
 * theirs, on the same page, and the same thank-you follows it.
 *
 * ── Why the yes is never on the public page ──────────────────────────
 *
 * Anybody can type any address into a box. A yes given on this page
 * would be a yes given by whoever typed it, which is the fake consent the
 * whole bench rule exists to prevent. So the page asks and the mailbox
 * answers: the letter proves the address is theirs, and only its link
 * moves the listing out of INVITED.
 *
 * ── Why the reply is the same sentence every time ────────────────────
 *
 * Whether an address already has an account, is already on this bench,
 * or once said no is that person's business. A stranger typing it learns
 * nothing: every path gets one reply.
 *
 * ── Who has the door ─────────────────────────────────────────────────
 *
 * A staffing or bench firm only. A client places nobody; an MSP places
 * nobody; an integrator's bench is its own employees, never strangers;
 * a one-person firm's only consultant is herself.
 *
 * No résumé, no rate and no promise on the public page. Nothing in here
 * touches the database.
 */

import { normalEmail, tidy } from '@/lib/public-site/leads'

/** Whether this kind of company's page offers "Join the bench". */
export function offersJoinBench(kind: string): boolean {
  return kind === 'VENDOR'
}

export const JOIN_BENCH_COPY = {
  heading: 'Join the bench',
  /** What joining means, in one line, said before anything is typed. */
  means:
    'You choose how long you stay. You leave every match when it ends. ' +
    'Nothing reaches past this firm until you say yes.',
  nameLabel: 'Your name',
  emailLabel: 'Your email',
  button: 'Join the bench',
  sending: 'Sending…',
} as const

/**
 * The one reply, whatever happened behind it.
 *
 * True on every path: a new ask sends the letter, and an address already
 * asked, already on or already answered is not written to again, which is
 * why it says "if" and never "we sent".
 */
export function joinReply(firm: string): string {
  return (
    `If ${firm} has not asked this address before, a letter is on its way to it. ` +
    'Open the link in it and say yes or no. Nothing happens until you do.'
  )
}

/**
 * The reply where no email can leave this deployment (the Tapin walk,
 * 2026-10-29: the page said a letter was on its way while the notice read
 * NOT_CONFIGURED). The letter that asks for the yes cannot go, so the page
 * never says it did; the firm holds the address and its notice keeps the
 * link for staff to pass on. Still one sentence for every address, because
 * whether email can leave is a fact about the deployment, not the person.
 */
export function joinReplyNoLetter(firm: string): string {
  return `${firm} has your address and will be in touch.`
}

/** Which of the two replies is true here, given whether email can leave. */
export function joinReplyFor(firm: string, letterCanLeave: boolean): string {
  return letterCanLeave ? joinReply(firm) : joinReplyNoLetter(firm)
}

/** Name and email, each quoted back where it is wrong. */
export function joinProblems(input: { name?: string | null; email?: string | null }): { field: 'name' | 'email'; says: string }[] {
  const out: { field: 'name' | 'email'; says: string }[] = []
  const name = tidy(input.name)
  if (!name || name.length < 2) {
    out.push({ field: 'name', says: 'Your name, so the firm knows who asked.' })
  } else if (name.length > 120) {
    out.push({ field: 'name', says: 'That name is longer than any name we can keep. Shorten it.' })
  }
  const email = normalEmail(input.email)
  if (!email) {
    out.push({ field: 'email', says: 'Your email. The letter that asks for your yes goes there.' })
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    out.push({ field: 'email', says: `“${input.email!.trim()}” is not an email address we can write to.` })
  }
  return out
}

/**
 * The line put above the firm's own invitation letter, so a person who
 * never typed their address into the page knows why it came and that
 * ignoring it does nothing.
 */
export function joinLetterLead(firm: string): string {
  return (
    `Somebody asked, from ${firm}’s page on Etyme, to join its bench with this address. ` +
    'If that was not you, ignore this letter. Nothing happens without your yes.\n\n'
  )
}

/**
 * How many asks one firm's page takes in an hour before it stops sending.
 * A person asks once; a page asked more often than this is being used to
 * send letters, and the firm's name is on every one.
 */
export const JOIN_ASKS_PER_HOUR = 30

export function tooManyAsks(lastHour: number): boolean {
  return lastHour >= JOIN_ASKS_PER_HOUR
}

export const TOO_MANY_SAYS =
  'This page has taken a lot of asks in the last hour, so nothing was sent. Try again in an hour.'
