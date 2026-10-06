import { PERMISSIONS, desksHolding, type Permission } from '@/lib/permissions'

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
  const desks = desksHolding(keys, opts.kind)
  if (desks.length === 0) {
    return `${what} is not part of your seat${company ? ` at ${company}` : ''}. Ask your company’s owner if you need it.`
  }
  return `${what} is for the ${orList(desks)} desk${company ? ` at ${company}` : ''}. Ask your company’s owner if you need it.`
}
