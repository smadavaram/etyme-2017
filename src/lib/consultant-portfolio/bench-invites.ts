/**
 * Invite candidates, several at once (Tapin's first week, 2026-11-14).
 *
 * The founder's plan for Tapin starts with "add invites to candidates":
 * a recruiter pastes the addresses of people she knows, presses once, and
 * each of them is asked onto the bench. The walk found only "Add
 * consultant", one person at a time, eleven fields.
 *
 * Every address goes through the one door a single add uses
 * (`askOntoBench`, ./bench-ask), from `POST /api/consultants/invite`, so
 * every rule holds as it does today: never a second record, a live ask or
 * a yes is not asked again, a no stands, and nobody is seated before her
 * own yes. Each address is answered on its own line.
 *
 * Pure: no database, safe in the browser. The page and the route read the
 * same parser, so what the box shows and what the route asks are the same.
 */

import { INVITE_LINK_KEPT_SAYS, type InviteMail } from '@/lib/bench-filter'
import { hasPermission } from '@/lib/permissions'
import { MAY_HAND_OVER } from '@/lib/notify/sign-in-link'

/** The most addresses one press takes, the same as inviting colleagues at once. */
export const MAX_INVITES_AT_ONCE = 20

/** One line of the box, read: an address with the name typed beside it, or text that is no address. */
export type InviteItem =
  | { kind: 'EMAIL'; email: string; name: string | null }
  | { kind: 'NOT_AN_EMAIL'; raw: string }

const ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Strip the marks people paste around a name or an address. */
function clean(s: string): string {
  return s.replace(/[<>"“”()]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * What the box holds, in the order typed. One person per line, or several
 * on a line separated by commas or semicolons. A name beside an address is
 * optional, before it or after it: "Ana Ruiz <ana@example.com>",
 * "Ana Ruiz, ana@example.com" and "ana@example.com" all read as Ana. An
 * address typed twice is asked once. Text that is no address is kept as
 * its own line, so it is said and never silently dropped.
 */
export function parseInviteList(raw: string): InviteItem[] {
  const items: InviteItem[] = []
  const seen = new Set<string>()
  for (const line of String(raw ?? '').split(/\r?\n/)) {
    const chunks = line.split(/[,;]/).map((c) => c.trim()).filter(Boolean)
    let pending: string | null = null
    let lastOnLine: { kind: 'EMAIL'; email: string; name: string | null } | null = null
    const said: InviteItem[] = []
    for (const chunk of chunks) {
      const words = clean(chunk).split(' ').filter(Boolean)
      const at = words.findIndex((w) => w.includes('@'))
      if (at < 0) {
        // A name on its own: it belongs to the next address on the line.
        if (pending) said.push({ kind: 'NOT_AN_EMAIL', raw: pending })
        pending = clean(chunk)
        continue
      }
      const email = words[at].toLowerCase().replace(/[.]+$/, '')
      const beside = clean(words.filter((_, i) => i !== at).join(' '))
      if (!ADDRESS.test(email)) {
        if (pending) { said.push({ kind: 'NOT_AN_EMAIL', raw: pending }); pending = null }
        said.push({ kind: 'NOT_AN_EMAIL', raw: clean(chunk) })
        continue
      }
      const name = beside || pending || null
      pending = null
      if (seen.has(email)) { lastOnLine = null; continue }
      seen.add(email)
      lastOnLine = { kind: 'EMAIL', email, name }
      said.push(lastOnLine)
    }
    // A name typed after the address it belongs to.
    if (pending) {
      if (lastOnLine && !lastOnLine.name) lastOnLine.name = pending
      else said.push({ kind: 'NOT_AN_EMAIL', raw: pending })
    }
    items.push(...said)
  }
  return items
}

/**
 * The name a new record carries where none was typed: the part of the
 * address before the @, as elsewhere on Etyme where only an address is
 * known. Somebody who already has a record keeps her own name either way.
 */
export function nameFor(item: { email: string; name: string | null }): string {
  const typed = item.name?.trim() ?? ''
  return typed.length >= 2 ? typed : item.email.split('@')[0]
}

/** What happened to one address. */
export type InviteLineState =
  | 'ASKED'
  | 'ASKED_ON_OWN_RECORD'
  | 'ASKED_AGAIN'
  | 'ALREADY_ON'
  | 'ALREADY_ASKED'
  | 'SAID_NO'
  | 'REFUSED'
  | 'RACED'
  | 'NOT_AN_EMAIL'
  | 'FAILED'

export interface InviteLine {
  /** The address, or the text typed where it was no address. */
  email: string
  /** Whether this address was asked by this press. */
  asked: boolean
  state: InviteLineState
  says: string
}

/** The sentence about the letter, after an ask was recorded. */
function mailSays(mail: InviteMail | null | undefined): string {
  if (mail === 'EMAILED') return 'The invitation went by email.'
  if (mail === 'KEPT') return 'Not emailed: the link is kept for staff to pass on.'
  return 'Nothing was sent yet. Use Resend on their row.'
}

/** One address's line, in a sentence a recruiter would say. */
export function inviteLineSays(o: { state: InviteLineState; mail?: InviteMail | null; refusal?: string | null; raw?: string }): string {
  switch (o.state) {
    case 'ASKED':
      return `Asked to join your bench. ${mailSays(o.mail)}`
    case 'ASKED_ON_OWN_RECORD':
      return `Already on Etyme, so asked on the record they have. ${mailSays(o.mail)}`
    case 'ASKED_AGAIN':
      return `Asked again to join your bench. ${mailSays(o.mail)}`
    case 'ALREADY_ON':
      return 'Already on your bench. Nothing was sent.'
    case 'ALREADY_ASKED':
      return 'Already asked, and not answered yet. Nothing new was sent. Use Resend on their row.'
    case 'SAID_NO':
      return 'Said no to your bench. Nothing was sent; only they can change that.'
    case 'REFUSED':
      return o.refusal ?? 'Not asked. Nothing was sent.'
    case 'RACED':
      return 'Asked a moment ago from another screen. Nothing new was sent.'
    case 'NOT_AN_EMAIL':
      return `“${o.raw ?? ''}” is not an email address. Nothing was sent.`
    case 'FAILED':
      return 'This one did not go through. Nothing was sent. Try it again.'
  }
}

/**
 * The one line over the answers: how many were asked, and, where no email
 * can leave (`mailLeaves`, read by the route), that nothing was emailed.
 * It never says an email went where none could.
 */
export function inviteSummarySays(lines: readonly InviteLine[], mailLeaves: boolean): string {
  const asked = lines.filter((l) => l.asked).length
  const notAsked = lines.length - asked
  const head =
    asked === 0
      ? 'Nobody new was asked.'
      : `${asked} ${asked === 1 ? 'person was' : 'people were'} asked to join your bench.`
  const rest = notAsked > 0 ? ` ${notAsked} ${notAsked === 1 ? 'line was' : 'lines were'} not asked; each says why.` : ''
  const mail = asked > 0 && !mailLeaves ? ` ${INVITE_LINK_KEPT_SAYS}` : ''
  return `${head}${rest}${mail} Nobody is on your bench until they say yes.`
}

/** The refusal for a box with more addresses than one press takes. */
export function tooManyInvitesSays(n: number): string {
  return `That is ${n} addresses. Invite at most ${MAX_INVITES_AT_ONCE} at a time, then the rest.`
}

/** The refusal for an empty box. */
export const NO_ADDRESSES_SAYS = 'Type the addresses, one per line or separated by commas.'

/** The body the page posts to `POST /api/consultants/invite`. */
export function inviteCandidatesBody(list: string): { list: string } {
  return { list }
}

/**
 * The listing a Candidates row may send again, or null: a row that reads
 * "Asked, not answered", on this firm's live listing, for a seat whose
 * route will take the send (`consultants.write`, the one permission
 * `POST /api/bench/listings/:id/nudge` asks for, like Add consultant).
 */
export function resendListingId(
  row: { standing?: string | null; listings?: readonly { id: string; consent?: string | null }[] | null },
  mayAdd: boolean
): string | null {
  if (!mayAdd || row.standing !== 'ASKED') return null
  const l = row.listings?.[0]
  return l && l.consent === 'INVITED' ? l.id : null
}

/**
 * Whether a bench row asks for the sign-in line at all
 * (`/api/notifications/sign-in-link`). That route refuses every seat
 * without the permission it asks for (`MAY_HAND_OVER`), so a page that
 * asked anyway sent one refused call per row that nobody saw (the Tapin
 * walk, 2026-11-14: three on HR's Bench page). A route the seat cannot
 * use is not called.
 */
export function drawsSignInLine(permissions: readonly string[] | null | undefined): boolean {
  return permissions != null && hasPermission(permissions, MAY_HAND_OVER)
}
