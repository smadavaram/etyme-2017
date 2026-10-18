import { PERMISSIONS, desksHolding, type Permission } from '@/lib/permissions'
import { rolesFor, type CompanyKind } from '@/lib/company-defaults'
import { readsOnlyOwnWork } from '@/lib/console-home'

/**
 * A refusal a person can read, whatever the route behind it wrote.
 *
 * Most routes now refuse in a sentence that names the desk (`askTheDesk`
 * in lib/permissions). Some still answer with the key itself —
 * "Requires invoices.issue permission", "payroll.read permission
 * required" — and a screen that prints the route's message prints the
 * key. A permission key is a code, and CLAUDE.md is plain: explain in a
 * sentence, not a code. The demo testers read "You need
 * consultants.read permission" three times on 2026-10-03.
 *
 * So the screens this file serves pass the message through here before
 * they show it. A message with no key in it is returned untouched: the
 * route's own sentence is always better than this one. A message with a
 * key is replaced by the desk that does it, read off the shipped roles
 * for this kind of company, so it stays true when the roles change.
 *
 * Pure: no database, no React. Safe on either side of the wire.
 */

function keysIn(message: string): Permission[] {
  return PERMISSIONS.filter((p) => {
    const at = message.indexOf(p)
    if (at < 0) return false
    // A whole key, not the front of a longer word or of a dotted path.
    const before = at === 0 ? '' : message[at - 1]
    const after = message[at + p.length] ?? ''
    return !/[\w.]/.test(before) && !/\w/.test(after) && !(after === '.' && /\w/.test(message[at + p.length + 1] ?? ''))
  })
}

/** True where the message names a permission key anywhere in it. */
export function namesAPermission(message: string | null | undefined): boolean {
  return !!message && keysIn(message).length > 0
}

function orList(xs: readonly string[]): string {
  const shown = xs.slice(0, 3)
  return shown.length <= 1 ? (shown[0] ?? '') : `${shown.slice(0, -1).join(', ')} or ${shown[shown.length - 1]}`
}

/**
 * The desks that hold a key and do something with it — never a seat
 * that reads only its holder's own work.
 *
 * Member (lib/company-defaults) holds `assignments.read` and
 * `timesheets.read`, but only over the holder's own work, so naming it
 * as "the desk" for reading hours would send somebody to a colleague
 * who can see nothing but their own week. Where Member was the only
 * name left — a one-person corporation, whose Owner is held by
 * construction and so not named — the list comes back empty and the
 * sentence says to ask the owner, which is the honest answer there.
 */
function desksThatAct(keys: readonly Permission[], kind: string): string[] {
  // An unknown kind reads the supplier set, the same fallback desksHolding uses.
  const roles = rolesFor(kind.toUpperCase() as CompanyKind)
  const ownWorkOnly = new Set(roles.filter((r) => readsOnlyOwnWork(r.permissions)).map((r) => r.name))
  return desksHolding(keys, kind).filter((d) => !ownWorkOnly.has(d))
}

/**
 * The message, or a sentence in its place where it carries a key.
 *
 * `what` is the subject — "This page" by default, "This" for a button.
 * `kind` is the reader's kind of company; without it no desk is named,
 * because naming a staffing firm's desks to a hospital is worse than
 * naming none.
 */
export function refusalSentence(
  message: string | null | undefined,
  opts: { kind?: string | null; company?: string | null; what?: string } = {}
): string {
  const said = (message ?? '').trim()
  const keys = keysIn(said)
  if (keys.length === 0) return said
  const what = opts.what ?? 'This page'
  const company = opts.company?.trim() || null
  if (!opts.kind) {
    return `${what} is not part of your seat${company ? ` at ${company}` : ''}. Ask your company’s owner if you need it.`
  }
  const desks = desksThatAct(keys, opts.kind)
  if (desks.length === 0) {
    return `${what} is not part of your seat${company ? ` at ${company}` : ''}. Ask your company’s owner if you need it.`
  }
  return `${what} is for the ${orList(desks)}${company ? ` at ${company}` : ''}. Ask your company’s owner if you need it.`
}

// ── The program manager's twin, refused ───────────────────────────────
//
// The twin is refused in the same kind of sentence a person is: what it
// tried, why it may not, and who does it instead. Pure, like the rest of
// this file; the twin's ledger (src/lib/twin/ledger.ts) writes the
// refusal down before the sentence is returned.

export type TwinRefusalWhy =
  /** The role contract puts this act in the never tier. */
  | 'NEVER'
  /** The name is not in the twin's vocabulary at all. */
  | 'UNKNOWN'
  /** The entity is not one this company is a party to. */
  | 'OTHER_COMPANY'
  /** The twin asked for this itself. */
  | 'OWN_DRAFT'
  /** The person whose authority the twin acts on asked for it. */
  | 'OWN_AUTHORITY'
  /** Nobody but the twin's own authority may say yes, so there is nobody to ask. */
  | 'NO_OTHER_APPROVER'

export function twinRefusal(args: {
  why: TwinRefusalWhy
  /** What it tried, as a phrase: "Release a payroll run." */
  doing: string
  /** The person whose authority it acts on, where there is one. */
  authorityName?: string | null
  /** Which twin. The program manager's unless said. */
  twin?: 'PROGRAM_MANAGER' | 'SUPPLIER'
  /** Where a person does it by hand, for NO_OTHER_APPROVER. */
  byHand?: string
}): string {
  const doing = args.doing.trim().replace(/\.$/, '')
  const lower = doing.charAt(0).toLowerCase() + doing.slice(1)
  // A supplier's twin is the firm's own assistant, and its people know it
  // as Ask Etyme (2026-10-18); a client's keeps the program manager's
  // twin, the name its Program twin page carries.
  const supplier = args.twin === 'SUPPLIER'
  const twin = supplier ? 'Ask Etyme' : 'The program manager\u2019s twin'
  const it = supplier ? 'Ask Etyme' : 'the twin'
  switch (args.why) {
    case 'NEVER':
      return `${twin} may not ${lower}. Its role contract keeps that with a person, so it is on their list instead.`
    case 'UNKNOWN':
      return `${twin} was asked to do something its role contract does not name (${doing}). Anything not named is refused.`
    case 'OTHER_COMPANY':
      return `${twin} works only on records its own company is a party to. This one belongs to another company, so it was not touched.`
    case 'OWN_DRAFT':
      return `${twin} asked for this itself, so it cannot be the one to approve it. The person who decides it does.`
    case 'OWN_AUTHORITY':
      return `${args.authorityName?.trim() || `The person ${it} acts for`} asked for this, and ${it} acts on their authority, so neither may approve it. Somebody else who may decide it does.`
    case 'NO_OTHER_APPROVER': {
      const who = args.authorityName?.trim() || `the person ${it} acts for`
      return `${twin} did not ask anybody to ${lower}: only ${who} may say yes here, and ${it} acts on their authority. ${args.byHand?.trim() || 'Do it by hand instead.'}`
    }
  }
}
