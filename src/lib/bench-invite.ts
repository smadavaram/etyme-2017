import { sign, read, baseUrl } from '@/lib/signed-link'

/**
 * The link a consultant opens to answer a vendor who wants to market
 * them.
 *
 * ── Why a link and not a login ───────────────────────────────────────
 *
 * A consultant on a vendor's bench has no seat. No `Context` row, no
 * password, nothing to sign in with — they are a record somebody else
 * created, not a user. That is fine and mostly correct: a working
 * contractor already has accounts on six vendor portals and adoption of
 * a seventh is close to zero.
 *
 * It stops being fine the moment their answer is required for anything.
 * `BenchListing.state` now starts at INVITED and only the consultant
 * moves it, and without a way to answer that is not consent — it is a
 * deadlock. Every new listing would be permanently unsubmittable.
 *
 * So the invitation carries its own authority, the way `/packet` and
 * `/reply` already do. One signed link, one question, no account.
 *
 * ── Why it does not act on the click ─────────────────────────────────
 *
 * The link opens a page with two buttons; the buttons do the work. Mail
 * security scanners follow every link in a message before the person
 * ever sees it, and a GET that accepted a bench listing on their behalf
 * would be triggered by a spam filter rather than by them — which is
 * precisely the fake consent this whole mechanism exists to prevent.
 */

export interface InviteToken {
  listingId: string
}

/** `BENCH_INVITE`, so a reply token cannot be posted here instead. */
const KIND = 'BENCH_INVITE'

export function signInvite(listingId: string): string {
  return sign(KIND, [listingId])
}

export function readInvite(token: string | undefined | null): InviteToken | null {
  const parts = read(KIND, token)
  if (!parts || !parts[0]) return null
  return { listingId: parts[0] }
}

/**
 * The link itself, or empty where it cannot be built.
 *
 * Empty rather than broken: no signing secret, or nothing saying where
 * this deployment lives. A message with a link to nowhere is worse than
 * one with no link, because the person tries it.
 */
export function inviteUrl(listingId: string): string {
  const base = baseUrl()
  if (!base) return ''
  try {
    return `${base}/bench-invite/${signInvite(listingId)}`
  } catch {
    return ''
  }
}

/**
 * What the vendor's invitation says.
 *
 * In the vendor's name, never ours — a consultant on two benches never
 * learns that from us, and the moment a vendor suspects
 * disintermediation the benches stop being uploaded.
 *
 * It says what being on a bench actually means, because most people
 * asked this question have no idea and the ones who do have been burned
 * by a vendor submitting them somewhere without asking. Saying "we will
 * ask you every time" is the whole offer.
 */
export function inviteText(o: {
  personName: string
  vendorName: string
  url: string
}): { subject: string; body: string } {
  const first = o.personName.trim().split(/\s+/)[0]
  return {
    subject: `${o.vendorName} would like to put you forward for contract work`,
    body:
      `Hi ${first} — ${o.vendorName} here.\n\n` +
      `We would like to add you to our bench, which means we can put you forward ` +
      `for contract roles. Nothing happens without you: we will ask you before every ` +
      `single submission, and you can take this back whenever you like.\n\n` +
      `Say yes or no here — no password, no account:\n${o.url}\n\n` +
      `If you would rather not, saying no is the end of it. We will not ask again.`,
  }
}
