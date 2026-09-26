import { sign, read, baseUrl as sharedBaseUrl } from '@/lib/signed-link'
import type { Kind, Reply } from '@/lib/texts'

/**
 * One-click answers, because an email cannot be replied to with "1".
 *
 * The three messages used to go by SMS, where a person answers by typing
 * "1" and a webhook reads it. On email there is no webhook and no reply
 * to parse, so the answer travels the other way: every choice is a signed
 * link, and clicking one says exactly which answer was meant.
 *
 * That is strictly better than parsing free text. `readReply` exists
 * because "no im on a contract till march" had to be understood; a link
 * carries the answer itself, so UNCLEAR stops being a possible outcome.
 *
 * ── Why it is signed ─────────────────────────────────────────────────
 *
 * The link decides whether somebody is submitted to a client, and one of
 * the answers switches their messages off permanently. An unsigned link
 * would let anybody who guesses an id answer on somebody else's behalf.
 *
 * ── Why clicking does not act on its own ─────────────────────────────
 *
 * The link opens a page with a button; the button does the work. Email
 * security scanners follow every link in a message before the person
 * ever sees it, and a GET that opts somebody out would be triggered by
 * a spam filter rather than by them.
 */

export interface ReplyToken {
  personId: string
  /** What we asked, so the answer is read against the right question. */
  asked: Kind
  reply: Reply
}

/**
 * Signing moved to lib/signed-link, which every stranger-facing token
 * now shares. The `REPLY` prefix is what stops one of these being
 * posted to the endpoint that accepts a bench invitation — same secret,
 * same person, different meaning.
 */
export function signReply(t: ReplyToken): string {
  return sign('REPLY', [t.personId, t.asked, t.reply])
}

/** The token's contents, or null for anything that is not exactly ours. */
export function readReplyToken(token: string | undefined | null): ReplyToken | null {
  const parts = read('REPLY', token)
  if (!parts || parts.length < 3) return null
  const [personId, asked, reply] = parts
  if (!personId || !asked || !reply) return null
  return { personId, asked: asked as Kind, reply: reply as Reply }
}

/**
 * Where the links point.
 *
 * Absolute, because they are read in a mail client. Empty when nothing
 * says where this deployment lives, and the caller leaves the choices
 * out rather than sending somebody a broken link.
 */
export function baseUrl(): string {
  return sharedBaseUrl()
}

/** The answers offered for each question, in the order they are shown. */
export const CHOICES: Record<Kind, { label: string; reply: Reply }[]> = {
  FRESHNESS: [
    { label: 'Yes, all the same', reply: 'SAME' },
    { label: "Something's changed", reply: 'CHANGED' },
    { label: 'Stop emailing me', reply: 'STOP' },
  ],
  CONSENT: [
    { label: 'Yes, submit me', reply: 'YES' },
    { label: 'No, not this one', reply: 'NO' },
  ],
  // Nothing to answer. Told, not asked.
  OUTCOME: [],
}

/**
 * The answer buttons, as lines of text at the foot of a message.
 *
 * Plain text rather than markup, because the body written here is also
 * the body stored on the message row and shown on the vendor's screen.
 * One body, one record of what was actually sent.
 *
 * Empty where there is nothing to answer, and empty where the links
 * cannot be built — no signing secret, or nothing telling us where this
 * deployment lives. A message with no buttons is worse than one with
 * buttons; a message with buttons that go nowhere is worse than both.
 */
export function choicesBlock(personId: string, asked: Kind): string {
  const choices = CHOICES[asked] ?? []
  const base = baseUrl()
  if (choices.length === 0 || !base) return ''

  try {
    return choices
      .map((c) => `${c.label}: ${base}/reply/${signReply({ personId, asked, reply: c.reply })}`)
      .join('\n')
  } catch {
    return ''
  }
}

/** What the confirm page says we asked, above the button. */
export function questionFor(asked: Kind): string {
  switch (asked) {
    case 'FRESHNESS':
      return 'Are you still looking for your next contract?'
    case 'CONSENT':
      return 'Is it OK to put you forward for this role?'
    case 'OUTCOME':
      return ''
  }
}
