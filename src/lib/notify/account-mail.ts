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

export interface NoticeFacts {
  type: string
  title: string
  body: string
}

/** Whether a notice is an email about the account itself, which the bell hides. */
export function isAccountMail(n: NoticeFacts): boolean {
  if (n.type === ACCOUNT_MAIL) return true
  if (n.type !== 'SYSTEM') return false
  return (ACCOUNT_MAIL_SUBJECTS as readonly string[]).includes(n.title) || n.body.includes(LINK_NOT_KEPT)
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
      ],
    },
  }
}
