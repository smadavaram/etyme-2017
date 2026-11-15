/**
 * Whether the address typed on Add consultant is somebody this firm
 * already keeps, said beside the Email box before the rest is filled in
 * (fix list A4, 2026-11-14: the duplicate was told only after everything
 * was typed).
 *
 * It reads only the firm's own list, the rows the Candidates page has
 * already loaded. It never asks whether an address has an account on
 * Etyme: the page never says that (CLAUDE.md, "The page never says
 * whether an address has an account"). Where nothing on the firm's own
 * list matches, it says nothing, and the route decides at save, asking a
 * person who already has a record onto the bench on that record, never a
 * second one.
 *
 * The three cases that block are the route's own (`addPath`: ALREADY_ON,
 * ALREADY_ASKED, SAID_NO), so the form refuses exactly what the route
 * would refuse, before the press. Pure, and safe in a browser.
 */

export interface KeptRow {
  id: string
  name: string
  email: string
  standing?: string | null
  /** This firm's live listing for them, the first one only, as the list sends it. */
  listings?: readonly { id: string; consent?: string | null }[] | null
}

export type KeptAct = 'RESEND' | 'OPEN'

export interface KeptMatch<R extends KeptRow = KeptRow> {
  row: R
  /** Whether "Add and ask them" would ask nobody, so the form stops before the press. */
  blocks: boolean
  says: string
  /** The one act that moves it on: send the invitation again, or open their record. */
  act: KeptAct
  /** The listing Resend sends again, where the act is RESEND. */
  listingId: string | null
  actWords: string
}

/** An address as the route compares it: trimmed, lower case. */
export function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * The firm's own row for a typed address, and what to say about it, or
 * null where the address is not on the firm's list or is not a whole
 * address yet. `mayAdd` is whether this seat may send an invitation
 * again, the same gate the row's Resend reads.
 */
export function alreadyKept<R extends KeptRow>(typed: string, rows: readonly R[], mayAdd: boolean): KeptMatch<R> | null {
  const email = typed.trim()
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) return null
  const row = rows.find((r) => r.email && sameAddress(r.email, email))
  if (!row) return null

  const name = row.name?.trim() || 'This person'
  const consent = row.listings?.[0]?.consent ?? null
  const open = { act: 'OPEN' as const, listingId: null, actWords: `Open ${name}’s record` }

  if (consent === 'GRANTED') {
    return { row, blocks: true, says: `${name} is already on your bench. Nothing needs adding.`, ...open }
  }
  if (consent === 'DECLINED') {
    return {
      row,
      blocks: true,
      says: `${name} said no to your bench. Only ${name} can change that, from their own page.`,
      ...open,
    }
  }
  if (consent === 'INVITED') {
    const listingId = mayAdd && row.standing === 'ASKED' ? row.listings?.[0]?.id ?? null : null
    return listingId
      ? {
          row,
          blocks: true,
          says: `You already asked ${name} and are waiting on the answer. Send the invitation again instead.`,
          act: 'RESEND',
          listingId,
          actWords: 'Send the invitation again',
        }
      : {
          row,
          blocks: true,
          says: `You already asked ${name} and are waiting on the answer. Nothing new needs sending.`,
          ...open,
        }
  }
  // On the firm's list with no live listing here: an employee, or a
  // listing she took back. Saving asks her on the record she has.
  return {
    row,
    blocks: false,
    says: `${name} is already on your Candidates list. Saving asks them onto your bench on that same record, not a new one.`,
    ...open,
  }
}
