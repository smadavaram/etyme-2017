/**
 * The account's own emails are not things to read in the bell.
 *
 * "Confirm your email for Etyme" and "Set your Etyme password" are
 * written down when they are sent, so a desk can see that the email
 * left. They were written as SYSTEM notices to the person, so the bell
 * showed them as unread, with "[the one-time link was in the email and
 * is not kept]" at the end — a notice with nothing to do on it
 * (sign-up walk, round one, item 16).
 *
 * The rule: nobody gets a message they cannot act on. A link that is not
 * kept cannot be acted on from the bell, and the person has already used
 * it to get here. So these rows are kept, and the bell never shows or
 * counts them.
 *
 * New rows carry the kind ACCOUNT_MAIL (the architect's password door
 * writes it). Rows written before that carry SYSTEM, and are known by
 * their subject or by the line that says the link was cut out.
 */

/** The kind a sign-up, confirm or reset email is recorded under. */
export const ACCOUNT_MAIL = 'ACCOUNT_MAIL'

/** The subjects the password door sent before ACCOUNT_MAIL existed. */
export const ACCOUNT_MAIL_SUBJECTS = ['Confirm your email for Etyme', 'Set your Etyme password'] as const

/** The line the door adds where it cut the one-time link out of the copy. */
export const LINK_NOT_KEPT = '[the one-time link was in the email and is not kept]'

/**
 * The line the door adds where no email provider is set up here, so the
 * link was kept on the row instead (onboarding walk, 2026-10-27): with no
 * email key the token is hashed and the link kept nowhere, so a sign-up
 * on a local walk or a first morning could not be rescued. Staff read the
 * row and pass the link on. Only there: where a provider is set up, the
 * link lives in the mailbox and nowhere else, sent or failed.
 */
export const LINK_KEPT = '[no email could be sent from here, so the one-time link is kept below for staff to pass on]'

/** How the send went, in the delivery states the account emails write. */
export type AccountMailState = 'SENT' | 'FAILED' | 'NOT_CONFIGURED'

/**
 * The body an account email is recorded with: the lines, and the link only
 * where no email provider is configured (`NOT_CONFIGURED`). Sent or failed,
 * the link is cut out and the row says so, exactly as before.
 */
export function recordedBody(lines: readonly string[], link: string | null, state: AccountMailState): string {
  const said = lines.join('\n')
  if (!link) return said
  return state === 'NOT_CONFIGURED' ? `${said}\n\n${LINK_KEPT}\n${link}` : `${said}\n\n${LINK_NOT_KEPT}`
}

export interface NoticeFacts {
  type: string
  title: string
  body: string
}

/** Whether a notice is an email about the account itself, which the bell hides. */
export function isAccountMail(n: NoticeFacts): boolean {
  if (n.type === ACCOUNT_MAIL) return true
  if (n.type !== 'SYSTEM') return false
  return (ACCOUNT_MAIL_SUBJECTS as readonly string[]).includes(n.title) || n.body.includes(LINK_NOT_KEPT) || n.body.includes(LINK_KEPT)
}

/**
 * The same rule as a database filter, for the list and for every count.
 * Spread it into a `where`: `{ personId, ...bellShows() }`.
 */
export function bellShows() {
  return {
    NOT: {
      OR: [
        { type: ACCOUNT_MAIL },
        { type: 'SYSTEM', title: { in: [...ACCOUNT_MAIL_SUBJECTS] } },
        { type: 'SYSTEM', body: { contains: LINK_NOT_KEPT } },
        // A kept link is for staff to pass on, never a line in anybody's list.
        { body: { contains: LINK_KEPT } },
      ],
    },
  }
}
