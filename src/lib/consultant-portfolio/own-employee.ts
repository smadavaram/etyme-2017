import { inviteSays, type InviteMailState } from '@/lib/access-grant'

/**
 * Add consultant's "Our own W-2 employee" (decisions 102, item 2).
 *
 * A firm's own W2 is its employee, never somebody it asks onto a bench:
 * the employment is the consent, so there is no listing, and the
 * employee is told, not asked. The seat is the one the W2 import makes
 * (`employeeRole`, `isOwnEmployeeRow`); what this adds is the letter that
 * lets her in. Pure sentences and one rule; no database.
 */

export const OWN_EMPLOYEE_LABEL = 'Our own W-2 employee'

export const OWN_EMPLOYEE_HELP =
  'On your payroll. No bench listing is made, because working for you is the consent. ' +
  'They are told, not asked, and the invitation lets them sign in to their own page.'

/** Offered at every firm that employs people; never at a client, whose W2 are its suppliers' people. */
export function ownEmployeeOffered(kind: string | null | undefined): boolean {
  return kind != null && kind !== 'CLIENT'
}

export function clientHasNoEmployeesSays(companyName: string | null | undefined): string {
  const who = companyName?.trim() ? companyName.trim().replace(/\.$/, '') : 'Your company'
  return `${who} buys people from its suppliers, so nobody here is its own W-2 employee. Ask the supplier that employs them.`
}

export function alreadyHasAccountSays(email: string): string {
  return `${email} already has a record or an account on Etyme, so it cannot be made your own employee from here. Untick "${OWN_EMPLOYEE_LABEL}" to ask them onto your bench instead.`
}

export function alreadySeatedSays(name: string, firm: string): string {
  return `${name} already has a seat at ${firm}. Open them from your list.`
}

/** What adding her did, said from how the email went; "emailed" only where it left. */
export function ownEmployeeAddedSays(o: { name: string; email: string; mail: InviteMailState; why?: string | null }): string {
  const first = `${o.name} is on your payroll as your own employee, with no bench listing.`
  return `${first} ${inviteSays({ personName: o.name, email: o.email, roleName: 'Employee', mail: o.mail, reason: o.why ?? null })}`
}

/** Said right above the one button, so nobody presses it unsure what goes out. */
export function ownEmployeeSavingSays(name: string, mailOn: boolean): string {
  const who = name.trim() || 'this person'
  return mailOn
    ? `Saving adds ${who} to your payroll and emails them an invitation to sign in. No bench listing is made.`
    : `Saving adds ${who} to your payroll. No email can be sent from here yet, so Copy invitation appears and you send it yourself. No bench listing is made.`
}
