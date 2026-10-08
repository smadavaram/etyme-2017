/**
 * Which way a notification should travel, and whether it actually left.
 *
 * Two populations, two channels. CLAUDE.md:
 *
 *   Business users (vendors, clients, MSPs, GSIs) → Microsoft Teams
 *   webhook on the company's channel, with email as the fallback.
 *
 *   Candidates → email only. They have no company channel to post into,
 *   and a consultant is not in anybody's Teams tenant.
 *
 * The other half of this file exists because of a quieter problem. A
 * notification was being written with channel "EMAIL" and nothing ever
 * sent it. Its status said UNREAD, which is indistinguishable from a
 * message that was delivered and ignored — so the system looked like it had
 * told somebody when it had not, and the only way to find out was to ask
 * the person whether they got it.
 *
 * So delivery is tracked apart from reading, and a channel with nowhere to
 * send is recorded as NOT_CONFIGURED rather than left looking sent.
 */

import { teamsLinkKind, RETIRED_LINK_ROUTE_REASON, TEAMS_WORKFLOWS_SENT_NOTE } from '@/lib/notify/teams-link'

export type Channel = 'IN_APP' | 'EMAIL' | 'TEAMS'
export type DeliveryState = 'PENDING' | 'SENT' | 'FAILED' | 'NOT_CONFIGURED'

export interface Recipient {
  /** A consultant has no company channel, whoever their bench is with. */
  isConsultant: boolean
  email: string | null
  /** The company's Teams webhook, when one has been set up. */
  teamsWebhookUrl: string | null
}

export interface Route {
  channel: Channel
  /** Why this way rather than another, for the delivery log. */
  reason: string
  /** Set when this route cannot actually carry anything. */
  blocked: string | null
  /**
   * The company's saved Teams link is the kind Microsoft switched off in
   * May 2026, and this route went round it. The reason on the route says
   * so, and is what the notification row records.
   */
  retiredTeamsLink?: boolean
}

/**
 * Where this notification should go.
 *
 * In-app is always written; this decides what else happens. Teams first for
 * business users because that is where they already are, email when there
 * is no channel, and nothing beyond in-app when there is no address either
 * — said out loud rather than silently dropped.
 */
export function routeFor(recipient: Recipient): Route {
  if (recipient.isConsultant) {
    return recipient.email
      ? { channel: 'EMAIL', reason: 'Consultants are reached by email', blocked: null }
      : {
          channel: 'IN_APP',
          reason: 'No email address on file',
          blocked: 'This person has no email address, so nothing can be sent to them.',
        }
  }

  // A retired Office 365 Connector link is never posted to: Microsoft
  // switched those off in Teams in May 2026, so a post would be lost or
  // refused. The message goes by email and the row says why, so nothing
  // is silently lost behind a link that only looks set up.
  if (recipient.teamsWebhookUrl && teamsLinkKind(recipient.teamsWebhookUrl) === 'RETIRED') {
    return recipient.email
      ? { channel: 'EMAIL', reason: RETIRED_LINK_ROUTE_REASON, blocked: null, retiredTeamsLink: true }
      : {
          channel: 'IN_APP',
          reason: RETIRED_LINK_ROUTE_REASON,
          blocked:
            'Nowhere to send this. This company’s Teams link is the kind Microsoft switched off in ' +
            'May 2026, and there is no email address. Save a Workflows link in Settings.',
          retiredTeamsLink: true,
        }
  }

  if (recipient.teamsWebhookUrl) {
    return { channel: 'TEAMS', reason: 'Posted to the company channel', blocked: null }
  }

  if (recipient.email) {
    return { channel: 'EMAIL', reason: 'No Teams channel set up, so email instead', blocked: null }
  }

  return {
    channel: 'IN_APP',
    reason: 'No Teams channel and no email address',
    blocked: 'Nowhere to send this. Add a Teams channel or an email address.',
  }
}

/** Why a notice to a demo address was kept and not sent. */
export const DEMO_ADDRESS_NOTE = 'demo address, nothing sent'

/**
 * The domains the seeds and the demo give their people. Nobody can own
 * one, so mail to them reaches nobody. One list, shared with the password
 * door, so the two rules cannot drift.
 *
 * `.test` is deliberately absent: the test suite and the release walks
 * use it as the stand-in for a real address, so it stays sendable.
 */
export const DEMO_EMAIL_DOMAINS = {
  /** A domain ending in one of these (RFC 2606 and 6761). */
  suffixes: ['.example', '.invalid', '.local'],
  /** These domains, and any name under them (RFC 2606). */
  domains: ['example.com', 'example.net', 'example.org'],
  /** A domain starting with one of these: the demo and seed worlds. */
  prefixes: ['demo.etyme.', 'seed.etyme.'],
} as const

/**
 * Whether an email address is a reserved demo address (DEMO_EMAIL_DOMAINS).
 *
 * Sign-up walk, round two, item 30: seeding and desk steps sent real
 * email to these. A message nobody can receive is a message nobody can
 * act on, and an attempt against the provider costs a bounce on the
 * sending domain's reputation.
 */
export function demoAddress(email: string | null | undefined): boolean {
  if (!email) return false
  const at = email.lastIndexOf('@')
  if (at < 0) return false
  const domain = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, '')
  if (!domain) return false
  const d = DEMO_EMAIL_DOMAINS
  return d.prefixes.some((p) => domain.startsWith(p))
    || d.suffixes.some((s) => domain.endsWith(s))
    || d.domains.some((x) => domain === x || domain.endsWith(`.${x}`))
}

/** What a sender can be asked to do. */
export interface Sender {
  channel: Channel
  /** `link` is the page in Etyme the notice is about, where there is one. */
  send(to: string, title: string, body: string, link?: string | null): Promise<void>
}

export interface DeliveryOutcome {
  state: DeliveryState
  note: string
  deliveredAt: Date | null
}

/**
 * Attempt delivery and report honestly what happened.
 *
 * With no sender configured for a channel the answer is NOT_CONFIGURED, not
 * SENT and not FAILED. Those three mean different things to whoever is
 * looking at why a manager never heard about a requisition:
 *
 *   FAILED          somebody tried; the address bounced or the hook is dead
 *   NOT_CONFIGURED  nobody has ever set this up
 *
 * Collapsing them loses the only fact that says what to do next.
 */
export async function attemptDelivery(
  route: Route,
  destination: string | null,
  title: string,
  body: string,
  senders: Sender[],
  now: Date,
  link?: string | null
): Promise<DeliveryOutcome> {
  // In-app is not sent anywhere. It is already written, and the person sees
  // it the moment they look.
  if (route.channel === 'IN_APP') {
    return {
      state: route.blocked ? 'NOT_CONFIGURED' : 'SENT',
      note: route.blocked ?? 'Shown in the app',
      deliveredAt: route.blocked ? null : now,
    }
  }

  if (!destination) {
    return { state: 'NOT_CONFIGURED', note: 'No address to send to', deliveredAt: null }
  }

  // A seeded or demo person has an address nobody can own. Nothing is
  // sent and the sender is never asked; the notice stays, with the reason.
  if (route.channel === 'EMAIL' && demoAddress(destination)) {
    return { state: 'NOT_CONFIGURED', note: DEMO_ADDRESS_NOTE, deliveredAt: null }
  }

  const sender = senders.find(s => s.channel === route.channel)
  if (!sender) {
    return {
      state: 'NOT_CONFIGURED',
      note: `Nothing is set up to send ${route.channel.toLowerCase()}. It is waiting in the app only.`,
      deliveredAt: null,
    }
  }

  try {
    await sender.send(destination, title, body, link)
    return {
      state: 'SENT',
      // A post a Workflows link accepted records the note /ready counts
      // as proof that Teams heard. A retired link never reaches here, and
      // an unrecognized one saved before the check keeps the plain reason
      // so it is never counted as proof.
      note:
        route.channel === 'TEAMS' && teamsLinkKind(destination) === 'WORKFLOWS'
          ? TEAMS_WORKFLOWS_SENT_NOTE
          : route.reason,
      deliveredAt: now,
    }
  } catch (err) {
    return {
      state: 'FAILED',
      note: err instanceof Error ? err.message.slice(0, 200) : 'Sending failed',
      deliveredAt: null,
    }
  }
}

/**
 * What is stuck, for whoever has to notice.
 *
 * A pile of NOT_CONFIGURED is a setup job — one Teams channel fixes all of
 * them. A pile of FAILED is a broken address or a dead webhook and needs
 * somebody to look. They are counted apart because they lead to different
 * work.
 */
export function deliverySummary(
  rows: { deliveryState: string }[]
): { sent: number; failed: number; notConfigured: number; pending: number; healthy: boolean } {
  const count = (s: string) => rows.filter(r => r.deliveryState === s).length
  const failed = count('FAILED')
  const notConfigured = count('NOT_CONFIGURED')
  return {
    sent: count('SENT'),
    failed,
    notConfigured,
    pending: count('PENDING'),
    healthy: failed === 0 && notConfigured === 0,
  }
}
