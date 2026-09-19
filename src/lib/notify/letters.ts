/**
 * The shape of a letter, and which way it can travel.
 *
 * ── Why this is its own file ─────────────────────────────────────────
 *
 * Two things in this building are easy to get wrong in a way nobody
 * notices for weeks: who a message is allowed to reach, and how a date
 * is said out loud. Both are here, once, so a data-rights notice and a
 * breach notice cannot disagree about either.
 *
 * ── Two populations, two channels ────────────────────────────────────
 *
 * CLAUDE.md, and it is not a preference:
 *
 *   Business users — vendors, clients, MSPs, GSIs — are reachable on
 *   their company's Microsoft Teams channel, with email behind it.
 *
 *   Candidates are reachable on email only. A consultant is in nobody's
 *   Teams tenant, so a card addressed to one is a card sent nowhere.
 *
 * That is enforced by construction here rather than remembered at each
 * call site: `notice()` refuses to attach a Teams card to a person, and
 * a person's channel list has one entry in it.
 *
 * ── Why the words live in a library and not in a route ───────────────
 *
 * Because they are the part most likely to be wrong and the part easiest
 * to test. A route that builds its own strings gets them changed by
 * whoever is nearest, and nobody notices the day it starts saying
 * something worse — or the day it starts promising to delete something
 * the law says keep.
 */

import type { Channel } from '@/lib/notification-delivery'

/**
 * Who a letter is for.
 *
 * `business` is a person at a firm, reachable on that firm's channel.
 * `candidate` is a person in their own right — a consultant, or somebody
 * who once was one. The distinction is the channel, and it is also the
 * voice: a firm is told what its records do; a person is told what
 * happens to them.
 */
export type Audience = 'business' | 'candidate'

/** A Microsoft Teams message card, in the shape `lib/senders` posts. */
export interface TeamsCard {
  title: string
  /** One or two sentences. The specifics go in the facts. */
  text: string
  facts: { name: string; value: string }[]
  /** One action, because a card with three is a card nobody acts on. */
  action: { label: string; url: string } | null
}

/** One message, ready to hand to delivery. */
export interface Notice {
  audience: Audience
  /**
   * In order of preference. Teams first for a firm with email behind it;
   * email only for a person.
   */
  channels: Channel[]
  /**
   * The address this must go to, where the caller must not look one up —
   * an erasure completion goes to the address the person gave when they
   * asked, because the address on the account is about to be a marker.
   * Null means "route it the usual way".
   */
  to: string | null
  subject: string
  body: string
  /** Only ever set for a firm. */
  card: TeamsCard | null
}

/** Teams first for a firm, email behind it; email only for a person. */
export function channelsFor(audience: Audience): Channel[] {
  return audience === 'candidate' ? ['EMAIL'] : ['TEAMS', 'EMAIL']
}

/**
 * Build a letter, with the channel rule applied rather than trusted.
 *
 * A card handed in for a candidate is dropped, not sent and not thrown
 * over: the caller asking for one has misread who they are writing to,
 * and the message itself is still worth sending by email.
 */
export function notice(input: {
  audience: Audience
  subject: string
  body: string
  to?: string | null
  card?: TeamsCard | null
}): Notice {
  return {
    audience: input.audience,
    channels: channelsFor(input.audience),
    to: input.to ?? null,
    subject: input.subject,
    body: input.body,
    card: input.audience === 'candidate' ? null : (input.card ?? null),
  }
}

// ── Saying a date and a deadline out loud ─────────────────────────────

/**
 * A day, the way a US reader writes one: October 3, 2026.
 *
 * UTC unless the caller knows better. A date rendered in whatever zone
 * the server happens to run in is a date that moves between a test and a
 * deployment, and this one is on a legal notice.
 */
export function day(date: Date, timeZone = 'UTC'): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, month: 'long', day: 'numeric', year: 'numeric',
  }).format(date)
}

/** A day and the hour on it, for a deadline where the hour matters. */
export function moment(date: Date, timeZone = 'UTC'): string {
  const d = new Intl.DateTimeFormat('en-US', {
    timeZone, month: 'long', day: 'numeric', year: 'numeric',
  }).format(date)
  const t = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(date)
  return `${d} at ${t}`
}

export interface Remaining {
  /** Whether the deadline is ahead or behind. */
  state: 'LEFT' | 'LATE'
  /** Whole hours either side of it. */
  hours: number
  /** "18 hours left", "2 days late", "less than an hour left". */
  said: string
}

/**
 * How long is left, or how late it is.
 *
 * Hours while it is under a day, because "tomorrow" is not a number
 * somebody can act on at four in the afternoon, and days above that,
 * because "sixty-one hours" is not one either.
 */
export function remaining(now: Date, dueAt: Date): Remaining {
  const ms = dueAt.getTime() - now.getTime()
  const state: Remaining['state'] = ms >= 0 ? 'LEFT' : 'LATE'
  const abs = Math.abs(ms)
  const hours = Math.floor(abs / 3_600_000)
  const word = state === 'LEFT' ? 'left' : 'late'

  if (hours < 1) return { state, hours, said: `less than an hour ${word}` }
  if (hours < 24) return { state, hours, said: `${hours} ${hours === 1 ? 'hour' : 'hours'} ${word}` }
  const days = Math.floor(hours / 24)
  return { state, hours, said: `${days} ${days === 1 ? 'day' : 'days'} ${word}` }
}

// ── Small things every letter needs ───────────────────────────────────

/** "Priya," — or "Hello," where we do not have a name to use. */
export function hello(name: string | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0]
  return first ? `${first},` : 'Hello,'
}

/** Paragraphs, with the empty ones dropped. */
export function paragraphs(...parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join('\n\n')
}

/** A bulleted list, one item to a line. */
export function bullets(items: string[]): string {
  return items.map((i) => `  · ${i}`).join('\n')
}

/** "Northbend Athletic, Veritan Talent and Auralis Software" */
export function andList(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
