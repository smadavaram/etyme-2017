/**
 * Three messages, and why they are the most important thing here.
 *
 * A bench record says somebody is free, wants $78 an hour, and knows Java
 * and AWS. That was true three weeks ago. Since then they took a contract,
 * raised their rate, or learned Kubernetes — and nobody updated the record
 * because updating records is nobody's job.
 *
 * Every clever thing in this product sits on top of that record. The
 * filter, the scoring, the evidence check, the releasing-soon pool. If the
 * record is wrong, all of it produces confident nonsense faster than a
 * human could produce it slowly.
 *
 * Consultant engagement is not a feature. It is the data integrity layer
 * for the whole supply side.
 *
 * ── Why email, and not SMS ───────────────────────────────────────────
 *
 * These three went by text once. Email is now the only channel, which is
 * what CLAUDE.md said all along: candidates sign in with a consumer email
 * and are reached by email, business users are reached on Teams. Nobody
 * is reached on a phone number.
 *
 * That is a product decision and also a legal one. A phone number belongs
 * to a person rather than to a relationship, and an unsolicited text to
 * one carries statutory damages per message with no proof of harm
 * required. An unsolicited email carries an unsubscribe obligation we
 * meet anyway, in the "stop" answer below.
 *
 * The cost is real: a text is read in ninety seconds and an email is read
 * in a day. What is bought is a channel we can operate at scale without
 * an exposure that grows linearly with the bench.
 *
 * ── Why not a portal ─────────────────────────────────────────────────
 *
 * A working consultant already has accounts on Dice, LinkedIn, Monster and
 * six vendor portals. Adoption of a seventh is close to zero, and a portal
 * nobody uses is worse than no portal — it makes you believe the data is
 * fresh.
 *
 * We have built the portal. It is not wasted: it is the page a magic link
 * lands on. What was missing is the front door, which is one question and
 * one click, with no password in between.
 *
 * ── The three, and why the third one matters most ────────────────────
 *
 * The freshness ping keeps the bench honest. The consent ask stops blind
 * submissions, which is the thing that burns consultants and makes clients
 * reject two vendors at once.
 *
 * The outcome notice is why the other two get answered. Never hearing back
 * is the single most common complaint in this industry, and fixing it
 * costs nothing. Once your messages are the ones that actually tell
 * somebody something, they stop being ignored.
 *
 * ── The wall ─────────────────────────────────────────────────────────
 *
 * Every message goes out in the vendor's name. Never ours. A consultant on
 * two benches never learns that from us, and we never contact anybody
 * about a role from a different vendor. The moment a vendor suspects
 * disintermediation, benches stop being uploaded, and with no benches
 * there is nothing to score.
 */

export type Kind = 'FRESHNESS' | 'CONSENT' | 'OUTCOME'

/** How often to ask somebody on the bench whether anything has changed. */
export const PING_EVERY_DAYS = 14

/** After this many unanswered asks, stop and mark the record unconfirmed. */
export const GIVE_UP_AFTER = 2

export interface Person {
  name: string
  /** Where to write to them. Null means there is nowhere to send. */
  email: string | null
  /**
   * Set when they ask us to stop. Permanent, and it covers everything.
   *
   * The database column is still called `textsOffAt`, from when these
   * went by SMS. It means "no more of these messages", whatever channel
   * carries them; renaming a live column to say so is not worth a
   * migration, and the meaning has not changed.
   */
  textsOffAt: Date | null
  confirmedAt: Date | null
  askedAt: Date | null
  unanswered: number
  /** Whether they are on the bench right now. */
  onBench: boolean
}

export interface Verdict {
  ok: boolean
  reason: string
}

/**
 * May we write to this person at all.
 *
 * Stop is permanent and immediate, and there is no second channel to fall
 * back to — that was the point of removing the first one.
 */
export function mayMessage(p: Person): Verdict {
  if (p.textsOffAt) {
    return { ok: false, reason: 'They asked us to stop. Nothing further is sent.' }
  }
  if (!p.email) {
    return { ok: false, reason: 'No email address on file, so there is nowhere to send this.' }
  }
  return { ok: true, reason: 'Fine to write to them.' }
}

/**
 * Is this person due a freshness ping.
 *
 * Only while they are on the bench — writing to somebody every fortnight
 * during a twelve-month contract is how you teach them to ignore you.
 *
 * And only twice. A third ask after two silences is not going to work, and
 * the silence is itself the answer: the record goes down the ranking and
 * says so, rather than being deleted or believed.
 */
export function dueAPing(p: Person, now: Date): Verdict {
  const allowed = mayMessage(p)
  if (!allowed.ok) return allowed

  if (!p.onBench) {
    return { ok: false, reason: 'Working. Nothing to ask.' }
  }

  if (p.unanswered >= GIVE_UP_AFTER) {
    return {
      ok: false,
      reason: `Asked ${p.unanswered} times with no reply. The record is marked unconfirmed and ranks below people we have heard from.`,
    }
  }

  const last = p.askedAt ?? p.confirmedAt
  if (last) {
    const days = Math.floor((now.getTime() - last.getTime()) / 86400000)
    if (days < PING_EVERY_DAYS) {
      return { ok: false, reason: `Asked ${days} days ago. Next one in ${PING_EVERY_DAYS - days}.` }
    }
  }

  return { ok: true, reason: 'Due a check-in.' }
}

// ── What the messages actually say ────────────────────────────────────

/**
 * One message. A subject and a body, because that is what an email is.
 *
 * The answer buttons are not in here. They are signed links, they need a
 * person id and a deployment URL, and building them belongs to the thing
 * that sends rather than the thing that writes. See `lib/reply-link`.
 */
export interface Message {
  subject: string
  body: string
}

export interface Freshness {
  personName: string
  vendorName: string
  /** Cents per hour, as last recorded. */
  rateCents: number | null
}

/**
 * "Still looking? Still around $78?"
 *
 * One question and three answers, each of them a single click. No
 * password, no account, no form — a message that needs somebody to
 * remember a login is a message answered at the weekend or never.
 *
 * The rate is in it on purpose. It is the single field most likely to be
 * stale and the one somebody will correct without being asked twice.
 */
export function freshnessText(f: Freshness): Message {
  const rate = f.rateCents ? ` Still around $${Math.round(f.rateCents / 100)}/hr?` : ''
  return {
    subject: `${f.vendorName}: still looking for your next contract?`,
    body:
      `Hi ${firstName(f.personName)} — ${f.vendorName} here. ` +
      `Still looking for your next contract?${rate}`,
  }
}

export interface Consent {
  personName: string
  vendorName: string
  /** What can honestly be said about the client. Often not its name. */
  clientLabel: string
  title: string
  location: string | null
  rateCents: number | null
  startsOn: Date | null
}

/**
 * "OK for us to submit you?"
 *
 * The most valuable message on this list, and it solves three things at
 * once. It stops blind submissions, which is what burns consultants. It
 * stops the duplicate at source — "no, someone already put me forward
 * there" is the cheapest deduplication anybody will ever build. And it
 * leaves a timestamped consent trail that vendors need anyway.
 *
 * Enough detail to answer without a phone call. Not so much that it
 * becomes the advert.
 */
export function consentText(c: Consent): Message {
  const bits = [
    c.location,
    c.title,
    c.rateCents ? `$${Math.round(c.rateCents / 100)}/hr` : null,
    c.startsOn ? `starts ${c.startsOn.toISOString().slice(0, 10)}` : null,
    c.clientLabel,
  ].filter(Boolean)

  return {
    subject: `${c.vendorName}: OK to put you forward for ${c.title}?`,
    body: `${bits.join(' · ')}.\nOK for ${c.vendorName} to submit you?`,
  }
}

export interface Outcome {
  personName: string
  vendorName: string
  title: string
  location: string | null
  /** One of the reason codes, or null where the client never said. */
  reason: string | null
}

/**
 * "They went with someone at a lower rate."
 *
 * Always sent, especially when the answer is no. Never hearing back is the
 * single most common complaint in this business, and fixing it costs
 * nothing.
 *
 * This is why the other two messages get answered. Once your messages are
 * the ones that actually tell somebody something, they stop being ignored.
 *
 * The reason is said plainly and without blame. "Rate" becomes "they went
 * with someone at a lower rate", not "you were too expensive" — and never
 * a code.
 */
export function outcomeText(o: Outcome): Message {
  const role = o.location ? `the ${o.location} ${o.title} role` : `the ${o.title} role`

  const said: Record<string, string> = {
    RATE: 'they went with someone at a lower rate',
    SKILLS: 'they wanted someone with a different mix of experience',
    WORK_AUTH: 'they needed a different work authorisation',
    AVAILABILITY: 'they needed somebody who could start sooner',
    INTERVIEW: 'they went with another candidate after the interviews',
    TIMING: 'the role was filled before we got there',
    CANDIDATE_WITHDREW: 'we have taken you off it',
    NO_REPLY: 'we have not heard back and are treating it as closed',
  }

  const why = o.reason ? said[o.reason] ?? 'they went a different way' : 'they went a different way'

  return {
    subject: `Update on ${role} — ${o.vendorName}`,
    body:
      `Update on ${role} — ${why}.\n` +
      `Your profile stays active with ${o.vendorName}. We'll be in touch when something fits.`,
  }
}

/**
 * The one they get when they land the job.
 *
 * Worth its own message. A product that only writes to people with bad
 * news is a product people learn to dread.
 */
export function placedText(o: Omit<Outcome, 'reason'>): Message {
  const role = o.location ? `the ${o.location} ${o.title} role` : `the ${o.title} role`
  return {
    subject: `You got ${role}`,
    body:
      `You got ${role}. ${o.vendorName} will be in touch today with start details.\n` +
      `Congratulations.`,
  }
}

// ── Reading what comes back ───────────────────────────────────────────

export type Reply =
  /** Nothing has changed. Re-stamp the record. */
  | 'SAME'
  /** Something has changed. Clear the confirmation and get a person on it. */
  | 'CHANGED'
  /** Stop. Permanently. */
  | 'STOP'
  /** Yes, submit me. */
  | 'YES'
  /** No, do not. */
  | 'NO'
  /** Could not tell. */
  | 'UNCLEAR'

/**
 * What they meant.
 *
 * The buttons carry the answer, so this is not the main path any more —
 * a signed link says SAME or STOP without anybody having to interpret it,
 * and UNCLEAR cannot happen there at all.
 *
 * It still matters, because people reply to emails. Somebody who writes
 * back "no im on a contract till march" instead of clicking has answered
 * the question perfectly well, and treating that as silence is how a
 * responsive consultant gets pushed down the rankings for being polite.
 *
 * So: read generously, and where it genuinely cannot be told, say so and
 * let a person look — guessing NO on an unclear reply loses a placement,
 * and guessing YES on one submits somebody who said no.
 */
export function readReply(raw: string, asked: Kind): Reply {
  const t = raw.trim().toLowerCase()

  // The leading digit, where there is one.
  //
  // A numbered menu is a habit from the SMS era and people still use it,
  // because plenty of the messages they get elsewhere still work that
  // way. Reading "1 yes still looking thanks" as unintelligible meant the
  // loop asked the same person again a fortnight later and the bench
  // never got any fresher — the exact failure the whole thing exists to
  // prevent.
  const digit = t.match(/^([123])\b/)?.[1] ?? null

  // Stop always wins, wherever it appears and whatever was asked.
  if (digit === '3' || /\b(stop|unsubscribe|remove me|opt out|leave me alone)\b/.test(t)) {
    return 'STOP'
  }

  if (asked === 'CONSENT') {
    if (digit === '1' || /^(y|ya|yes|yep|yeah|ok|okay|sure|go ahead|please do)\b/.test(t)) return 'YES'
    if (digit === '2' || /^(n|no|nope|don'?t|do not|nah)\b/.test(t)) return 'NO'
    // A reply that names another vendor is the duplicate this message
    // exists to catch, and it is a no.
    if (/already (been )?(submitted|put forward)|someone else has me/.test(t)) return 'NO'
    return 'UNCLEAR'
  }

  if (digit === '1' || /^(y|yes|yep|yeah|same|still looking|no change|all the same)\b/.test(t)) {
    return 'SAME'
  }
  if (digit === '2' || /\b(changed|change|new rate|not looking|on a contract|started|took|higher)\b/.test(t)) {
    return 'CHANGED'
  }

  return 'UNCLEAR'
}

/**
 * What a reply does to the record.
 *
 * SAME re-stamps it as confirmed today, which is the whole point of the
 * loop. CHANGED does not guess at the new values — it clears the
 * confirmation, because a rate somebody has just said is wrong is worse
 * than a rate nobody has confirmed.
 *
 * CHANGED used to promise a link to a page where they could put the new
 * numbers in themselves. There is no such page. Saying so was harmless
 * over SMS, where the link arrived in a later message that was never
 * built either; on a screen the person is already looking at, an absent
 * link is visible. So it says what actually happens instead: the record
 * is marked unconfirmed, their vendor sees that, and a person follows
 * up. Self-service is worth building and is not this change.
 */
export function applyReply(
  reply: Reply,
  now: Date
): {
  confirmedAt: Date | null
  unanswered: number | null
  textsOffAt: Date | null
  /** Somebody has to go and ask them what changed. */
  needsFollowUp: boolean
  says: string
} {
  switch (reply) {
    case 'SAME':
      return {
        confirmedAt: now,
        unanswered: 0,
        textsOffAt: null,
        needsFollowUp: false,
        says: 'Thanks — we have got you down as still looking.',
      }

    case 'CHANGED':
      return {
        confirmedAt: null,
        unanswered: 0,
        textsOffAt: null,
        needsFollowUp: true,
        says: 'Thanks for saying so. We have marked your details as out of date so nobody puts you forward on the old ones, and somebody will be in touch to get them right.',
      }

    case 'STOP':
      return {
        confirmedAt: null,
        unanswered: 0,
        textsOffAt: now,
        // Nothing further, on any channel. There is no second channel to
        // offer them, which is the honest position now that email is the
        // only one.
        needsFollowUp: false,
        says: 'Done — you will not hear from us again.',
      }

    case 'YES':
      return {
        confirmedAt: now,
        unanswered: 0,
        textsOffAt: null,
        needsFollowUp: false,
        says: 'Thanks — putting you forward now.',
      }

    case 'NO':
      return {
        confirmedAt: now,
        unanswered: 0,
        textsOffAt: null,
        needsFollowUp: false,
        says: 'Understood, we will not submit you for this one.',
      }

    case 'UNCLEAR':
      return {
        confirmedAt: null,
        unanswered: 0,
        textsOffAt: null,
        needsFollowUp: true,
        says: 'Somebody will read this one.',
      }
  }
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0]
}
